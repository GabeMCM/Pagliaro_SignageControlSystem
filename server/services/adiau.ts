// ============================================================================
// SERVIÇO DE PROXY E RENDERIZAÇÃO ULTRA-LEVE ADIAŬ PARA SMART TVS / FIRE STICK
// ============================================================================
// Resolve os gargalos graves do link original (adiau.com.br/v2/information/):
// 1. O JSON original do Adiaŭ tem ~3.8 MB por requisição (contendo imagens PNG
//    em base64 duplicadas em backgroundLayers[].value e originalValue).
// 2. Este serviço busca os dados no servidor, extrai todas as imagens base64
//    para binários servidos via /api/adiau/asset/:id (reduzindo o JSON de
//    3.800 KB para ~4 KB — redução de 99,8%!), mantém cache em memória com
//    stale-while-revalidate e entrega um HTML 100% ES5 compatível com
//    Fire Stick (Vega OS), Hisense (VIDAA), Tizen, webOS e navegadores antigos.
// ============================================================================

export interface AdiauQueryParams {
  hash: string;
  transmission: string;
  infoCode: string;
  code: string;
  screenName: string;
  clientModel: string;
}

interface BinaryAsset {
  mimeType: string;
  bytes: Uint8Array;
  updatedAt: number;
}

interface CacheEntry {
  key: string;
  params: AdiauQueryParams;
  action: "getAttendance" | "getAttendances";
  data: any;
  updatedAt: number;
}

const ADIAU_PHP_ENDPOINT = "https://www.adiau.com.br/v2/information/information-v2.php";
const FRESH_TTL_MS = 60 * 1000; // 60s considerado fresco
const MAX_STALE_MS = 24 * 60 * 60 * 1000; // 24h stale-while-revalidate
const MAX_ASSETS = 150;

const assetStore = new Map<string, BinaryAsset>();
const dataCache = new Map<string, CacheEntry>();
const inFlightFetches = new Map<string, Promise<any>>();

/**
 * Extrai os parâmetros do link do Adiaŭ (seja via ?url=... ou query direta)
 */
export function parseAdiauParams(query: Record<string, string | undefined>): AdiauQueryParams | null {
  let hash = (query.hash || query.hashcode || "").trim();
  let transmission = (query.transmission || "").trim();
  let infoCode = (query.infoCode || "").trim();
  let code = (query.code || "pt-br").trim();
  let screenName = (query.screenName || "").trim();
  let clientModel = (query.clientModel || "").trim();

  const rawUrl = (query.url || "").trim();
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      hash = hash || (parsed.searchParams.get("hash") || parsed.searchParams.get("hashcode") || "").trim();
      transmission = transmission || (parsed.searchParams.get("transmission") || "").trim();
      infoCode = infoCode || (parsed.searchParams.get("infoCode") || "").trim();
      code = (parsed.searchParams.get("code") || code || "pt-br").trim();
      screenName = screenName || (parsed.searchParams.get("screenName") || "").trim();
      clientModel = clientModel || (parsed.searchParams.get("clientModel") || "").trim();
    } catch {
      // Fallback regex parsing caso a URL tenha formato parcial
      const mHash = rawUrl.match(/[?&]hash=([^&#]+)/i);
      const mTrans = rawUrl.match(/[?&]transmission=([^&#]+)/i);
      const mInfo = rawUrl.match(/[?&]infoCode=([^&#]+)/i);
      const mCode = rawUrl.match(/[?&]code=([^&#]+)/i);
      const mScreen = rawUrl.match(/[?&]screenName=([^&#]+)/i);
      const mModel = rawUrl.match(/[?&]clientModel=([^&#]+)/i);
      if (mHash) hash = hash || decodeURIComponent(mHash[1]);
      if (mTrans) transmission = transmission || decodeURIComponent(mTrans[1]);
      if (mInfo) infoCode = infoCode || decodeURIComponent(mInfo[1]);
      if (mCode) code = decodeURIComponent(mCode[1]);
      if (mScreen) screenName = screenName || decodeURIComponent(mScreen[1]);
      if (mModel) clientModel = clientModel || decodeURIComponent(mModel[1]);
    }
  }

  if (!hash) return null;

  return {
    hash,
    transmission,
    infoCode,
    code: code || "pt-br",
    screenName,
    clientModel,
  };
}

export function isAdiauUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  return /adiau\.com\.br\/v2\/information/i.test(url);
}

/**
 * Gera um identificador determinístico rápido para uma string base64
 */
function computeFastHash(input: string): string {
  const len = input.length;
  const sample =
    input.slice(0, 96) +
    input.slice(Math.floor(len / 3), Math.floor(len / 3) + 96) +
    input.slice(Math.floor((len * 2) / 3), Math.floor((len * 2) / 3) + 96) +
    input.slice(Math.max(0, len - 96));

  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c;
    h2 = Math.imul(h2, 0x811c9dc5);
  }
  return `img_${len}_${(h1 >>> 0).toString(16)}_${(h2 >>> 0).toString(16)}`;
}

/**
 * Converte data:image/...;base64,... em um asset binário em memória e retorna a URL curta local
 */
function registerBase64Asset(dataUri: string): string {
  const match = dataUri.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);
  if (!match) return dataUri;

  const mimeType = match[1].toLowerCase();
  const base64Body = match[2].replace(/\s+/g, "");
  const assetId = computeFastHash(base64Body);

  const existing = assetStore.get(assetId);
  if (existing) {
    existing.updatedAt = Date.now();
    return `/api/adiau/asset/${assetId}`;
  }

  try {
    const binaryStr = atob(base64Body);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Limita tamanho máximo do cache de imagens em memória
    if (assetStore.size >= MAX_ASSETS) {
      let oldestKey = "";
      let oldestTime = Infinity;
      for (const [k, v] of assetStore.entries()) {
        if (v.updatedAt < oldestTime) {
          oldestTime = v.updatedAt;
          oldestKey = k;
        }
      }
      if (oldestKey) assetStore.delete(oldestKey);
    }

    assetStore.set(assetId, {
      mimeType,
      bytes,
      updatedAt: Date.now(),
    });

    return `/api/adiau/asset/${assetId}`;
  } catch (err) {
    console.error("⚠️ [AdiauProxy] Falha ao decodificar base64:", err);
    return dataUri;
  }
}

export function getAdiauAsset(assetId: string): BinaryAsset | null {
  const asset = assetStore.get(assetId);
  if (asset) {
    asset.updatedAt = Date.now();
  }
  return asset || null;
}

/**
 * Otimiza o payload gigante do Adiaŭ (de ~3.8 MB para ~4 KB):
 * - Remove duplicatas originalValue e thumbnails pesados
 * - Converte todas as imagens data:image/...;base64 em URLs binárias /api/adiau/asset/:id
 * - Remove páginas vazias de outros dispositivos quando a página 'tv' está presente
 */
function optimizeAdiauPayload(rawPayload: any): any {
  if (!rawPayload || typeof rawPayload !== "object") return rawPayload;

  const clone = structuredClone(rawPayload);

  function transformValue(val: any): any {
    if (typeof val === "string") {
      if (val.startsWith("data:image/")) {
        return registerBase64Asset(val);
      }
      if (val === "../../assets/img/messages/5.png" || val === "assets/img/messages/5.png") {
        return "/player/adiau-default-photo.png";
      }
      if (val.startsWith("../../assets/")) {
        return "https://www.adiau.com.br/" + val.replace(/^(\.\.\/)+/, "");
      }
      return val;
    }
    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        val[i] = transformValue(val[i]);
      }
      return val;
    }
    if (val && typeof val === "object") {
      delete val.originalValue;
      delete val.thumbnail;
      delete val.i18n;

      // Se for componente de layout com pages.tv preenchido, remove páginas vazias desnecessárias
      if (val.pages && typeof val.pages === "object" && val.pages.tv) {
        for (const k of Object.keys(val.pages)) {
          if (k !== "tv") {
            const p = val.pages[k];
            const hasElements = (Array.isArray(p?.elements) && p.elements.length > 0) || Boolean(p?.sections);
            if (!hasElements) {
              delete val.pages[k];
            }
          }
        }
      }

      for (const k of Object.keys(val)) {
        val[k] = transformValue(val[k]);
      }
      return val;
    }
    return val;
  }

  return transformValue(clone);
}

function buildCacheKey(params: AdiauQueryParams): { key: string; action: "getAttendance" | "getAttendances" } {
  if (params.transmission && params.infoCode) {
    return {
      key: `att:${params.hash}:${params.transmission}:${params.infoCode}:${params.screenName.toLowerCase()}`,
      action: "getAttendance",
    };
  }
  return {
    key: `list:${params.hash}:${params.screenName.toLowerCase()}`,
    action: "getAttendances",
  };
}

/**
 * Executa a busca real no endpoint PHP do Adiaŭ e atualiza o cache otimizado
 */
async function fetchFromUpstream(params: AdiauQueryParams): Promise<any> {
  const { key, action } = buildCacheKey(params);

  const existingPromise = inFlightFetches.get(key);
  if (existingPromise) return existingPromise;

  const promise = (async () => {
    try {
      const url = new URL(ADIAU_PHP_ENDPOINT);
      url.searchParams.set("action", action);
      url.searchParams.set("hashcode", params.hash);
      if (action === "getAttendance") {
        url.searchParams.set("transmission", params.transmission);
        url.searchParams.set("infoCode", params.infoCode);
      }
      url.searchParams.set("screenName", params.screenName || "");

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);

      try {
        const res = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "Accept": "application/json, text/plain, */*",
            "User-Agent": "Mozilla/5.0 (SmartTV; Linux) AppleWebKit/537.36 SignageProxy/1.0",
          },
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const rawJson = await res.json();
        const optimized = optimizeAdiauPayload(rawJson);

        dataCache.set(key, {
          key,
          params,
          action,
          data: optimized,
          updatedAt: Date.now(),
        });

        return optimized;
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      console.error(`⚠️ [AdiauProxy] Erro ao consultar Adiaŭ (${key}):`, err);
      const cached = dataCache.get(key);
      if (cached) return cached.data;
      throw err;
    } finally {
      inFlightFetches.delete(key);
    }
  })();

  inFlightFetches.set(key, promise);
  return promise;
}

/**
 * Obtém os dados otimizados do Adiaŭ (usando cache imediato ou aguardando até maxWaitMs)
 */
export async function getAdiauData(
  params: AdiauQueryParams,
  maxWaitMs = 4000,
): Promise<{ ready: boolean; data?: any; cachedAt?: number }> {
  const { key } = buildCacheKey(params);
  const now = Date.now();
  const cached = dataCache.get(key);

  if (cached) {
    const age = now - cached.updatedAt;
    if (age >= FRESH_TTL_MS) {
      // Dispara atualização em background (stale-while-revalidate)
      fetchFromUpstream(params).catch(() => {});
    }
    if (age <= MAX_STALE_MS) {
      return { ready: true, data: cached.data, cachedAt: cached.updatedAt };
    }
  }

  // Sem cache válido: inicia busca e aguarda até maxWaitMs
  const upstreamPromise = fetchFromUpstream(params);

  if (maxWaitMs <= 0) {
    upstreamPromise.catch(() => {});
    return { ready: false };
  }

  let timeoutId: any;
  const timeoutPromise = new Promise<{ timeout: true }>((resolve) => {
    timeoutId = setTimeout(() => resolve({ timeout: true }), maxWaitMs);
  });

  try {
    const raceResult = await Promise.race([
      upstreamPromise.then((data) => ({ timeout: false as const, data })),
      timeoutPromise,
    ]);

    if (timeoutId !== undefined) clearTimeout(timeoutId);

    if (raceResult.timeout) {
      return { ready: false };
    }
    return { ready: true, data: raceResult.data, cachedAt: Date.now() };
  } catch {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    if (cached) {
      return { ready: true, data: cached.data, cachedAt: cached.updatedAt };
    }
    return { ready: false };
  }
}

/**
 * Pré-aquece o cache para um link do Adiaŭ em segundo plano
 */
export function warmAdiauUrl(rawUrl: string | null | undefined): void {
  if (!isAdiauUrl(rawUrl)) return;
  const params = parseAdiauParams({ url: rawUrl || "" });
  if (!params) return;
  getAdiauData(params, 0).catch(() => {});
}

/**
 * Gera a página HTML 100% compatível com ES5 (Fire Stick Vega OS, Hisense VIDAA, Tizen, webOS)
 */
export function renderAdiauHtmlPage(params: AdiauQueryParams, initialData: any | null): string {
  const serializedParams = JSON.stringify(params);
  const serializedInitialData = initialData ? JSON.stringify(initialData) : "null";

  return `<!DOCTYPE html>
<html lang="${params.code || "pt-br"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Informações da Cerimônia - Adiaŭ</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap">
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #FFFFFF;
      font-family: 'Poppins', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
      color: #0A0A0A;
      -webkit-font-smoothing: antialiased;
      user-select: none;
    }

    /* Spinner leve compatível com GPUs básicas */
    .tvf__spinner {
      width: 52px;
      height: 52px;
      border: 4px solid rgba(23, 125, 220, 0.18);
      border-top-color: #177DDC;
      border-radius: 50%;
      -webkit-animation: tvf-spin 1s linear infinite;
      animation: tvf-spin 1s linear infinite;
    }
    @-webkit-keyframes tvf-spin { to { -webkit-transform: rotate(360deg); transform: rotate(360deg); } }
    @keyframes tvf-spin { to { -webkit-transform: rotate(360deg); transform: rotate(360deg); } }

    .info-page-loading {
      position: fixed;
      top: 0; right: 0; bottom: 0; left: 0;
      width: 100%;
      height: 100%;
      background: #FFFFFF;
      display: -webkit-flex;
      display: flex;
      -webkit-flex-direction: column;
      flex-direction: column;
      -webkit-align-items: center;
      align-items: center;
      -webkit-justify-content: center;
      justify-content: center;
      z-index: 200;
    }
    .info-page-loading__text {
      margin: 14px 0 0 0;
      font-size: 22px;
      font-weight: 500;
      color: #475569;
    }

    /* Layout Principal do Player */
    .info__layout {
      width: 100%;
      height: 100%;
      table-layout: fixed;
      border-collapse: separate;
      border-spacing: 0;
      padding: 0;
      box-sizing: border-box;
    }
    .info__row-title, .info__row-footer { display: none; }
    .info__row-card { height: 100%; }
    .info__card-cell { vertical-align: middle; padding: 0; }
    .info__card-wrap {
      position: fixed;
      top: 0; right: 0; bottom: 0; left: 0;
      width: 100%;
      height: 100%;
      background: #FFFFFF;
      overflow: hidden;
      z-index: 50;
    }
    .info__canvas-host {
      position: absolute;
      top: 0; right: 0; bottom: 0; left: 0;
      width: 100%;
      height: 100%;
    }

    /* Stage 1920x1080 escalado via CSS Transform 2D */
    .tvf-canvas {
      position: absolute;
      top: 0; right: 0; bottom: 0; left: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #FFFFFF;
    }
    .tvf-canvas__stage {
      position: absolute;
      top: 0;
      left: 0;
      -webkit-transform-origin: top left;
      transform-origin: top left;
      overflow: hidden;
    }
    .tvf-canvas__layer {
      position: absolute;
      top: 0; right: 0; bottom: 0; left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    }
    .tvf-canvas__bg-img {
      position: absolute;
      top: 0; left: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      pointer-events: none;
    }
    .tvf-canvas__el {
      position: absolute;
      -webkit-transform-origin: center center;
      transform-origin: center center;
      overflow: visible;
    }
    .tvf-canvas__shape {
      width: 100%;
      height: 100%;
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    }
    .tvf-canvas__shape--circle { border-radius: 50%; }
    .tvf-canvas__shape--rect   { border-radius: 4px; }
    .tvf-canvas__image,
    .tvf-canvas__image-placeholder {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .tvf-canvas__image-placeholder {
      background: #cbd5e1;
    }
    .tvf-canvas__text {
      width: 100%;
      height: 100%;
      line-height: 1.2;
      overflow: hidden;
      word-wrap: break-word;
      white-space: pre-wrap;
      display: -webkit-flex;
      display: flex;
      -webkit-align-items: flex-start;
      align-items: flex-start;
      pointer-events: none;
      font-family: 'Poppins', 'Inter', sans-serif;
    }
    .tvf-canvas__text--center {
      -webkit-justify-content: center;
      justify-content: center;
      text-align: center;
    }
    .tvf-canvas__text--right {
      -webkit-justify-content: flex-end;
      justify-content: flex-end;
      text-align: right;
    }

    /* Mensagem de Vazio / Erro */
    .info__empty {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: #FFFFFF;
      text-align: center;
      width: 100%;
      height: 100%;
      z-index: 10;
      display: none;
    }
    .info__empty-inner {
      display: table-cell;
      vertical-align: middle;
      padding: 24px;
    }
    .info__empty-text {
      margin: 0;
      color: #0A0A0A;
      font-size: 28px;
      font-weight: 500;
    }

    /* Modo Lista de Cerimônias (quando transmission/infoCode não estão na URL) */
    .info-lst {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: #F8FAFF;
      display: none;
      -webkit-flex-direction: column;
      flex-direction: column;
      overflow: hidden;
      z-index: 100;
    }
    .info-lst__header {
      display: -webkit-flex;
      display: flex;
      -webkit-align-items: center;
      align-items: center;
      -webkit-justify-content: space-between;
      justify-content: space-between;
      padding: 20px 36px;
      background: #FFFFFF;
      border-bottom: 1px solid #E2E8F0;
    }
    .info-lst__title {
      margin: 0;
      color: #0B5EB3;
      font-size: 36px;
      font-weight: 600;
    }
    .info-lst__logo {
      height: 44px;
      object-fit: contain;
    }
    .info-lst__body {
      -webkit-flex: 1;
      flex: 1;
      overflow-y: auto;
      padding: 28px 36px;
    }
    .info-lst__cards {
      display: -webkit-flex;
      display: flex;
      -webkit-flex-direction: column;
      flex-direction: column;
    }
    .info-lst__card {
      display: -webkit-flex;
      display: flex;
      -webkit-align-items: center;
      align-items: center;
      padding: 22px 28px;
      margin-bottom: 16px;
      background: #FFFFFF;
      border: 2px solid #E2E8F0;
      border-radius: 14px;
      cursor: pointer;
      outline: none;
    }
    .info-lst__card:hover,
    .info-lst__card:focus,
    .info-lst__card.dpad-focus {
      background: #F0F7FF;
      border-color: #0B5EB3;
      box-shadow: 0 0 0 4px rgba(11, 94, 179, 0.25);
    }
    .info-lst__card-info {
      -webkit-flex: 1;
      flex: 1;
      min-width: 0;
      margin: 0 20px;
    }
    .info-lst__card-name {
      margin: 0 0 6px 0;
      font-size: 28px;
      font-weight: 600;
      color: #1f2937;
    }
    .info-lst__card-details {
      margin: 0;
      font-size: 20px;
      color: #475569;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="info-page-loading" id="infoPageLoading">
    <div class="tvf__spinner"></div>
    <p class="info-page-loading__text" id="infoPageLoadingText">Carregando cerimônia...</p>
  </div>

  <div class="info-lst" id="infoListSection">
    <div class="info-lst__header">
      <h1 class="info-lst__title" id="infoListTitle">Informações da Cerimônia</h1>
      <img class="info-lst__logo" id="infoListLogo" src="" alt="" style="display:none;">
    </div>
    <div class="info-lst__body">
      <div class="info-lst__cards" id="infoListCards"></div>
      <div class="info__empty" id="infoListEmpty" style="position:relative;background:transparent;">
        <div class="info__empty-inner">
          <p class="info__empty-text" id="infoListEmptyText">Não há cerimônias disponíveis</p>
        </div>
      </div>
    </div>
  </div>

  <table class="info__layout" cellspacing="0" cellpadding="0" border="0" role="presentation">
    <tr class="info__row-card">
      <td class="info__card-cell">
        <div class="info__card-wrap" id="infoCardWrap">
          <div class="info__canvas-host" id="infoCanvasHost"></div>
          <div class="info__empty" id="infoEmpty">
            <div class="info__empty-inner">
              <p class="info__empty-text" id="infoEmptyText">Não foi possível carregar as informações</p>
            </div>
          </div>
        </div>
      </td>
    </tr>
  </table>

  <script>
    (function() {
      var PARAMS = ${serializedParams};
      var INITIAL_DATA = ${serializedInitialData};

      var state = {
        service: null,
        layoutConfig: null,
        clientLogo: null,
        lastSig: '',
        mode: (PARAMS.transmission && PARAMS.infoCode) ? 'player' : 'listing',
        focusedCardIdx: 0
      };

      var DEFAULT_ICON_COLOR = '#1d4ed8';

      function translateText(text) {
        var lang = (PARAMS.code || 'pt-br').toLowerCase();
        if (lang === 'pt-br') return text;
        var en = {
          'Informações da Cerimônia': 'Ceremony Information',
          'Carregando...': 'Loading...',
          'Não foi possível carregar as informações': 'Could not load information',
          'Não há cerimônias disponíveis': 'No ceremonies available',
          'Transmissão, hash ou algum outro dado inválido(s)': 'Invalid transmission or hash',
          'Sepultamento': 'Burial',
          'Cremação': 'Cremation',
          'Local': 'Location',
          'Data e hora': 'Date and time',
          'às': 'at',
          'A definir': 'To be defined',
          'Hoje': 'Today',
          'Amanhã': 'Tomorrow',
          'Domingo': 'Sunday', 'Segunda': 'Monday', 'Terça': 'Tuesday',
          'Quarta': 'Wednesday', 'Quinta': 'Thursday', 'Sexta': 'Friday', 'Sábado': 'Saturday',
          'DOM': 'SUN', 'SEG': 'MON', 'TER': 'TUE', 'QUA': 'WED', 'QUI': 'THU', 'SEX': 'FRI', 'SAB': 'SAT'
        };
        var es = {
          'Informações da Cerimônia': 'Información de la Ceremonia',
          'Carregando...': 'Cargando...',
          'Não foi possível carregar as informações': 'No se pudo cargar la información',
          'Não há cerimônias disponíveis': 'No hay ceremonias disponibles',
          'Sepultamento': 'Entierro',
          'Cremação': 'Cremación',
          'Local': 'Ubicación',
          'Data e hora': 'Fecha y hora',
          'às': 'a las',
          'A definir': 'Por determinar',
          'Hoje': 'Hoy',
          'Amanhã': 'Mañana',
          'Domingo': 'Domingo', 'Segunda': 'Lunes', 'Terça': 'Martes',
          'Quarta': 'Miércoles', 'Quinta': 'Jueves', 'Sexta': 'Viernes', 'Sábado': 'Sábado'
        };
        var dict = lang === 'en-us' ? en : (lang === 'es-es' ? es : {});
        return dict[text] || text;
      }

      function escapeHtml(s) {
        if (s == null) return '';
        return String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      function escapeAttr(s) {
        if (s == null) return '';
        return String(s).replace(/'/g, '%27').replace(/"/g, '&quot;');
      }

      function buildInformativeIconDataUri(key, color) {
        var c = encodeURIComponent(color || DEFAULT_ICON_COLOR);
        if (key === 'iconStar') {
          return "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='" + c + "' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polygon points='12 2 14.9 8.6 22 9.3 16.5 14 18.2 21 12 17.3 5.8 21 7.5 14 2 9.3 9.1 8.6'/></svg>";
        }
        if (key === 'iconRibbon') {
          return "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 468.453 468.453' fill='" + c + "'><path d='M290.517,0h-30h-52.581h-30v30v69.021H77.139h-30v30v52.583v30h30h100.797v226.849v30h30h52.581h30v-30V211.604h100.798h30v-30v-52.583v-30h-30H290.517V30V0L290.517,0z'/></svg>";
        }
        if (key === 'iconCalendar') {
          return "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='" + c + "' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='5' width='18' height='16' rx='2'/><path d='M3 10 L21 10'/><path d='M8 3 L8 7'/><path d='M16 3 L16 7'/></svg>";
        }
        if (key === 'iconPin') {
          return "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='" + c + "' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M12 22 C 6 15, 4 12, 4 9 C 4 4.6, 7.6 1, 12 1 C 16.4 1, 20 4.6, 20 9 C 20 12, 18 15, 12 22 Z'/><circle cx='12' cy='9' r='3'/></svg>";
        }
        return null;
      }

      function isInformativeIconKey(key) {
        return key === 'iconStar' || key === 'iconRibbon' || key === 'iconCalendar' || key === 'iconPin';
      }

      function resolveImage(value) {
        if (!value || typeof value !== 'string') return null;
        if (value.indexOf('bundled:') === 0) {
          var name = value.substring('bundled:'.length);
          return 'https://www.adiau.com.br/assets/images/obituary/' + name;
        }
        if (value === '../../assets/img/messages/5.png' || value === 'assets/img/messages/5.png') {
          return '/player/adiau-default-photo.png';
        }
        if (value.indexOf('../../assets/') === 0) {
          return 'https://www.adiau.com.br/' + value.replace(/^(\.\.\/)+/, '');
        }
        return value;
      }

      function formatDate(isoDate) {
        if (!isoDate) return '';
        var parts = String(isoDate).split('-');
        if (parts.length !== 3) return isoDate;
        if ((PARAMS.code || '').toLowerCase() === 'en-us') {
          return parts[1] + '/' + parts[2] + '/' + parts[0];
        }
        return parts[2] + '/' + parts[1] + '/' + parts[0];
      }

      function parseDate(value) {
        if (!value) return null;
        var str = String(value);
        // Compatibilidade total ES5 para Safari/WebKit/Blink antigos: YYYY-MM-DD HH:mm -> YYYY/MM/DD HH:mm:00
        var m = str.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{1,2}):(\d{1,2})/);
        if (m) {
          return new Date(
            parseInt(m[1], 10),
            parseInt(m[2], 10) - 1,
            parseInt(m[3], 10),
            parseInt(m[4], 10),
            parseInt(m[5], 10),
            0
          );
        }
        var d = new Date(str.indexOf('T') !== -1 ? str : str.replace(' ', 'T'));
        return isNaN(d.getTime()) ? null : d;
      }

      function formatTime(date, timeFormat) {
        function pad(n) { return n < 10 ? '0' + n : '' + n; }
        if (timeFormat === 'H12') {
          var h12 = date.getHours() % 12 || 12;
          var ampm = date.getHours() >= 12 ? 'PM' : 'AM';
          return pad(h12) + ':' + pad(date.getMinutes()) + ' ' + ampm;
        }
        return pad(date.getHours()) + ':' + pad(date.getMinutes());
      }

      function getDayLabel(date) {
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var target = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
        var diff = Math.round((target.getTime() - today.getTime()) / 86400000);
        if (diff === 0) return translateText('Hoje');
        if (diff === 1) return translateText('Amanhã');
        var names = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
        return translateText(names[date.getDay()]);
      }

      function buildDeceasedDates(s) {
        var birth = s.deceasedBirthDate ? formatDate(s.deceasedBirthDate) : '';
        var death = s.deceasedDeathDate ? formatDate(s.deceasedDeathDate) : '';
        if (birth && death) return '✦ ' + birth + '    ✝ ' + death;
        if (death) return '✝ ' + death;
        if (birth) return '✦ ' + birth;
        return '';
      }

      function buildEventLine(s) {
        var label = s.eventType === 'CREMATION' ? translateText('Cremação') : translateText('Sepultamento');
        if (!s.burialDate || s.burialDate === '1500-01-01 00:00') {
          return label + ': ' + translateText('A definir');
        }
        var d = parseDate(s.burialDate);
        if (!d) return label;
        var tf = (s.client && s.client.timeFormat) || 'H24';
        return label + ': ' + getDayLabel(d) + ' ' + translateText('às') + ' ' + formatTime(d, tf);
      }

      function buildLocationLine(s) {
        var loc = s.burialPlace || (s.location && s.location.name) || '';
        if (!loc) return '';
        return translateText('Local') + ': ' + loc;
      }

      function substituteElementVariables(el, values) {
        if (!el) return;
        if (el.fillImageVariableKey && values.hasOwnProperty(el.fillImageVariableKey) && values[el.fillImageVariableKey]) {
          el.fillImageSrc = values[el.fillImageVariableKey];
        }
        if (el.variableKey) {
          if (!values.hasOwnProperty(el.variableKey)) return;
          var v = values[el.variableKey];
          if (el.type === 'image' || el.kind === 'image') {
            el.src = v;
            el.value = v;
          } else {
            el.text = v;
          }
          return;
        }
        if (el.text && typeof el.text === 'string' && el.text.indexOf('{{') !== -1) {
          el.text = el.text.replace(/\{\{(\w+)\}\}/g, function(m, k) {
            return values.hasOwnProperty(k) ? values[k] : m;
          });
        }
        if (el.text && typeof el.text === 'string') {
          el.text = translateText(el.text);
        }
      }

      function buildLayoutWithVariables(lc, service) {
        if (!lc) return null;
        var copy = JSON.parse(JSON.stringify(lc));
        if (!copy.components || !copy.components.length) return copy;

        var client = service.client || {};
        var clientQr = client.qrCode || client.urlQr || client.qr || client.qrUrl || '';
        var clientImg = state.clientLogo || client.image || client.logo || client.urlImage || '';
        var clientNameVal = client.fantasyName || client.name || client.socialReason || '';
        var locationNameVal = (service.location && service.location.name) || service.burialPlace || '';
        var photoVal = service.file64Photo || service.photo || '/player/adiau-default-photo.png';
        var eventTypeLabel = service.eventType === 'CREMATION' ? translateText('Cremação') : translateText('Sepultamento');

        var attendanceDateVal = '';
        var burialDateVal = '';
        if (service.burialDate && service.burialDate !== '1500-01-01 00:00') {
          var ad = parseDate(service.burialDate);
          if (ad) {
            var tf = client.timeFormat || 'H24';
            attendanceDateVal = getDayLabel(ad) + ' ' + translateText('às') + ' ' + formatTime(ad, tf);
            burialDateVal = attendanceDateVal;
          }
        }

        var values = {
          deceasedName: service.deceasedName || '',
          deceasedDates: buildDeceasedDates(service),
          eventLine: buildEventLine(service),
          locationLine: buildLocationLine(service),
          locationName: locationNameVal,
          eventType: eventTypeLabel,
          deceasedPhoto: photoVal,
          photo: photoVal,
          file64Photo: photoVal,
          clientImage: clientImg,
          clientLogo: clientImg,
          clientQrCode: clientQr,
          qrCode: clientQr,
          clientQr: clientQr,
          clientName: clientNameVal,
          clientUrl: client.url || '',
          deceasedBirthDate: formatDate(service.deceasedBirthDate || ''),
          deceasedDeathDate: formatDate(service.deceasedDeathDate || ''),
          burialPlace: service.burialPlace || locationNameVal,
          burialDate: burialDateVal,
          attendanceStartDate: attendanceDateVal && attendanceDateVal.length > 0 ? attendanceDateVal : translateText('A definir'),
          attendanceEndDate: (function() {
            if (!service.attendanceEndDate) return '';
            var ed = parseDate(service.attendanceEndDate);
            if (!ed) return '';
            var tf3 = client.timeFormat || 'H24';
            return getDayLabel(ed) + ' ' + translateText('às') + ' ' + formatTime(ed, tf3);
          })()
        };

        var birthVal = values.deceasedBirthDate;
        var deathVal = values.deceasedDeathDate;

        function shiftDateTexts(elements) {
          for (var i = 0; i < elements.length; i++) {
            var el = elements[i];
            var t = (el.type || '').toLowerCase();
            if (el.fillImageVariableKey === 'iconCalendar') {
              el.y -= 4;
              continue;
            }
            if (t !== 'text' && t !== 'variable') continue;
            var isDate = el.variableKey === 'deceasedBirthDate' ||
                         el.variableKey === 'deceasedDeathDate' ||
                         (birthVal && el.text === birthVal) ||
                         (deathVal && el.text === deathVal);
            if (isDate) el.y += 4;
          }
        }

        for (var c = 0; c < copy.components.length; c++) {
          var comp = copy.components[c];
          if (!comp || !comp.pages) continue;
          var dKeys = Object.keys(comp.pages);
          for (var d = 0; d < dKeys.length; d++) {
            var page = comp.pages[dKeys[d]];
            if (!page) continue;
            if (page.elements) {
              for (var i = 0; i < page.elements.length; i++) {
                substituteElementVariables(page.elements[i], values);
              }
              shiftDateTexts(page.elements);
            }
            if (page.sections) {
              var sKeys = Object.keys(page.sections);
              for (var sIdx = 0; sIdx < sKeys.length; sIdx++) {
                var sec = page.sections[sKeys[sIdx]];
                if (!sec || !sec.elements) continue;
                for (var j = 0; j < sec.elements.length; j++) {
                  substituteElementVariables(sec.elements[j], values);
                }
                shiftDateTexts(sec.elements);
              }
            }
          }
        }

        return copy;
      }

      function flattenSections(page) {
        if (!page || !page.sections) return null;
        var DW = 600, DH = 800;
        var SX = (page.width || 1920) / DW;
        var SY = (page.height || 1080) / DH;
        var SF = Math.min(SX, SY);
        var result = [];
        var names = ['header', 'body', 'footer'];
        for (var n = 0; n < names.length; n++) {
          var sec = page.sections[names[n]];
          if (!sec || !sec.elements) continue;
          var els = sec.elements;
          for (var i = 0; i < els.length; i++) {
            var el = els[i];
            if (!el) continue;
            result.push({
              id: el.id,
              type: el.type,
              kind: el.kind,
              role: el.role,
              order: el.order != null ? el.order : 9999,
              x: Math.round(el.x * SX),
              y: Math.round(el.y * SY),
              width: Math.round(el.width * SX),
              height: Math.round(el.height * SY),
              fill: el.fill,
              opacity: el.opacity,
              fillImageVariableKey: el.fillImageVariableKey,
              fillImageFit: el.fillImageFit,
              fillImageSrc: el.fillImageSrc,
              stroke: el.stroke,
              strokeWidth: el.strokeWidth,
              cornerRadius: el.cornerRadius,
              borderRadius: el.cornerRadius != null ? el.cornerRadius : el.borderRadius,
              fillImage: el.fillImage,
              fillImageAnchor: el.fillImageAnchor,
              fillOverlay: el.fillOverlay,
              src: el.src,
              value: el.value,
              objectFit: el.objectFit,
              variableKey: el.variableKey,
              text: el.text,
              fontFamily: el.fontFamily,
              fontSize: el.fontSize ? Math.round(el.fontSize * SF) : undefined,
              fontStyle: el.fontStyle,
              fontWeight: el.fontWeight,
              textAlign: el.textAlign,
              lineHeight: el.lineHeight,
              letterSpacing: el.letterSpacing,
              backgroundColor: el.backgroundColor,
              padding: el.padding,
              paddingX: el.paddingX,
              paddingY: el.paddingY,
              borderColor: el.borderColor,
              borderWidth: el.borderWidth,
              verticalAlign: el.verticalAlign
            });
          }
        }
        result.sort(function(a, b) { return a.order - b.order; });
        return result;
      }

      function extractRgbaAlpha(fill) {
        if (!fill || typeof fill !== 'string') return null;
        var m = fill.match(/^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)$/i);
        if (!m) return null;
        var alpha = parseFloat(m[1]);
        return (alpha >= 0 && alpha < 1) ? alpha : null;
      }

      function buildBackgroundHtml(page) {
        var layers = (page && page.backgroundLayers) || [];
        if (!layers.length) return '';

        var imageLayer = null;
        var colorLayer = null;
        for (var i = 0; i < layers.length; i++) {
          var l = layers[i];
          if (!l || !l.value) continue;
          if (l.type === 'image') imageLayer = l;
          else if (l.type === 'color') colorLayer = l;
        }

        var html = '';
        if (imageLayer && imageLayer.value) {
          var src = resolveImage(imageLayer.value);
          if (src) {
            var op = imageLayer.opacity != null ? 'opacity:' + imageLayer.opacity + ';' : '';
            html += '<img class="tvf-canvas__bg-img" src="' + escapeAttr(src) + '" alt="" style="' + op + '">';
          }
        }
        if (colorLayer && colorLayer.value) {
          var cStyle = 'background-color:' + escapeAttr(colorLayer.value) + ';';
          if (colorLayer.opacity != null) cStyle += 'opacity:' + colorLayer.opacity + ';';
          html += '<div class="tvf-canvas__layer" style="' + cStyle + '"></div>';
        }
        return html;
      }

      function buildElementHtml(el) {
        var type = (el.type || '').toLowerCase();
        var kind = (el.kind || '').toLowerCase();
        var x = el.x || 0;
        var y = el.y || 0;
        var w = el.width || 0;
        var h = el.height || 0;

        var style = 'left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px;';
        if (el.rotation) {
          style += '-webkit-transform:rotate(' + el.rotation + 'deg);transform:rotate(' + el.rotation + 'deg);';
        }

        var elOpacity = el.opacity != null ? el.opacity : extractRgbaAlpha(el.fill);
        if (elOpacity != null) style += 'opacity:' + elOpacity + ';';

        var inner = '';

        if (type === 'circle') {
          var img = !el.fillImageVariableKey ? resolveImage(el.src || el.value) : null;
          var s = 'background-color:' + (el.fill || 'transparent') + ';';
          if ((el.strokeWidth || 0) > 0) s += 'border:' + el.strokeWidth + 'px solid ' + (el.stroke || 'transparent') + ';';
          if (img) s += 'background-image:url(\\'' + escapeAttr(img) + '\\');';
          inner = '<div class="tvf-canvas__shape tvf-canvas__shape--circle" style="' + s + '"></div>';
        } else if (type === 'rect' || type === 'rectangle') {
          var rectFill = el.fill || 'transparent';
          if (elOpacity != null && rectFill !== 'transparent') {
            rectFill = rectFill.replace(/^rgba(\([^)]+),\s*[\d.]+\)$/i, 'rgb$1)');
          }

          var rectImg = null;
          if (el.fillImage) rectImg = resolveImage(el.fillImage);
          else if (el.fillImageSrc) rectImg = resolveImage(el.fillImageSrc);
          else if (el.fillImageVariableKey) {
            if (isInformativeIconKey(el.fillImageVariableKey)) {
              var iconColor = (el.fill && el.fill !== 'transparent') ? el.fill : DEFAULT_ICON_COLOR;
              rectImg = buildInformativeIconDataUri(el.fillImageVariableKey, iconColor);
            }
          }

          var radius = el.borderRadius != null ? el.borderRadius : (el.cornerRadius != null ? el.cornerRadius : null);
          var sr = 'position:relative;overflow:hidden;';
          if ((el.strokeWidth || 0) > 0) sr += 'border:' + el.strokeWidth + 'px solid ' + (el.stroke || 'transparent') + ';';
          if (radius != null) sr += 'border-radius:' + radius + 'px;';

          if (rectImg) {
            var fit = el.fillImageFit === 'contain' ? 'contain' : 'cover';
            var imgTagStyle = 'width:100%;height:100%;display:block;object-fit:' + fit + ';';
            if (radius != null) imgTagStyle += 'border-radius:' + radius + 'px;';
            var overlayHtml = '';
            if (el.fillOverlay && rectFill && rectFill !== 'transparent') {
              var ov = 'position:absolute;top:0;right:0;bottom:0;left:0;background-color:' + rectFill + ';pointer-events:none;';
              if (radius != null) ov += 'border-radius:' + radius + 'px;';
              overlayHtml = '<div style="' + ov + '"></div>';
            }
            inner = '<div class="tvf-canvas__shape tvf-canvas__shape--rect" style="' + sr + '"><img src="' + escapeAttr(rectImg) + '" alt="" style="' + imgTagStyle + '">' + overlayHtml + '</div>';
          } else {
            sr += 'background-color:' + rectFill + ';';
            inner = '<div class="tvf-canvas__shape tvf-canvas__shape--rect" style="' + sr + '"></div>';
          }
        } else if (type === 'image' || (type === 'variable' && kind === 'image')) {
          var url = resolveImage(el.src || el.value);
          var imgStyle = '';
          if (el.borderRadius != null) imgStyle += 'border-radius:' + el.borderRadius + 'px;';
          if (el.objectFit) imgStyle += 'object-fit:' + el.objectFit + ';';
          inner = url
            ? '<img class="tvf-canvas__image" src="' + escapeAttr(url) + '" alt="" style="' + imgStyle + '">'
            : '<div class="tvf-canvas__image-placeholder" style="' + imgStyle + '"></div>';
        } else if (type === 'text' || (type === 'variable' && (kind === 'text' || !kind))) {
          var text = el.text || el.displayName || '';
          var align = el.textAlign === 'center' ? ' tvf-canvas__text--center' : (el.textAlign === 'right' ? ' tvf-canvas__text--right' : '');
          var ts = 'color:' + (el.fill || '#000') + ';';
          ts += 'font-size:' + (el.fontSize || 16) + 'px;';
          ts += 'font-family:\\'' + (el.fontFamily || 'Poppins') + '\\', sans-serif;';
          if (el.fontWeight) ts += 'font-weight:' + el.fontWeight + ';';
          if (el.fontStyle) {
            var fsRaw = String(el.fontStyle).toLowerCase();
            if (fsRaw.indexOf('bold') !== -1) ts += 'font-weight:bold;';
            if (fsRaw.indexOf('italic') !== -1) ts += 'font-style:italic;';
          }
          if (el.lineHeight != null) {
            var lh = typeof el.lineHeight === 'number' && el.lineHeight <= 5 ? el.lineHeight : el.lineHeight + 'px';
            ts += 'line-height:' + lh + ';';
          }
          if (el.letterSpacing != null) ts += 'letter-spacing:' + el.letterSpacing + 'px;';
          if (el.backgroundColor) ts += 'background-color:' + el.backgroundColor + ';';
          if (el.borderRadius != null) ts += 'border-radius:' + el.borderRadius + 'px;';
          if (el.padding != null) ts += 'padding:' + el.padding + 'px;';
          if (el.verticalAlign === 'middle') {
            var jc = el.textAlign === 'center' ? 'center' : (el.textAlign === 'right' ? 'flex-end' : 'flex-start');
            ts += 'display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;-webkit-justify-content:' + jc + ';justify-content:' + jc + ';';
          }
          inner = '<div class="tvf-canvas__text' + align + '" style="' + ts + '"><span>' + escapeHtml(text) + '</span></div>';
        }

        return '<div class="tvf-canvas__el" style="' + style + '">' + inner + '</div>';
      }

      var currentStage = null;
      var currentPageW = 1920;
      var currentPageH = 1080;

      function updateStageScale() {
        var host = document.getElementById('infoCanvasHost');
        if (!currentStage || !host) return;
        var w = host.clientWidth || window.innerWidth || 1920;
        var h = host.clientHeight || window.innerHeight || 1080;
        var sx = w / currentPageW;
        var sy = h / currentPageH;
        var scaleCss = 'scale(' + sx + ', ' + sy + ')';
        currentStage.style.webkitTransform = scaleCss;
        currentStage.style.transform = scaleCss;
      }

      window.addEventListener('resize', updateStageScale);

      function renderCanvas() {
        var host = document.getElementById('infoCanvasHost');
        if (!host || !state.service || !state.layoutConfig) return;

        var resolved = buildLayoutWithVariables(state.layoutConfig, state.service);
        if (!resolved || !resolved.components || !resolved.components.length) return;

        var comp = resolved.components[0];
        var pages = (comp && comp.pages) || {};
        var page = pages.tv || pages.desktop || pages[Object.keys(pages)[0]];
        if (!page) return;

        currentPageW = page.width || 1920;
        currentPageH = page.height || 1080;

        var els = flattenSections(page) || page.elements || [];
        var elementsHtml = '';
        for (var i = 0; i < els.length; i++) {
          elementsHtml += buildElementHtml(els[i]);
        }

        host.innerHTML =
          '<div class="tvf-canvas">' +
            '<div class="tvf-canvas__stage" id="adiauStage" style="width:' + currentPageW + 'px;height:' + currentPageH + 'px;background-color:#ffffff;">' +
              buildBackgroundHtml(page) +
              elementsHtml +
            '</div>' +
          '</div>';

        currentStage = document.getElementById('adiauStage');
        updateStageScale();
        setTimeout(updateStageScale, 50);
      }

      function hidePageLoading() {
        var el = document.getElementById('infoPageLoading');
        if (el) el.style.display = 'none';
      }

      function showEmpty(msg) {
        hidePageLoading();
        var empty = document.getElementById('infoEmpty');
        if (empty) {
          empty.style.display = 'table';
          var t = document.getElementById('infoEmptyText');
          if (t && msg) t.textContent = msg;
        }
      }

      function hideEmpty() {
        var empty = document.getElementById('infoEmpty');
        if (empty) empty.style.display = 'none';
      }

      function serviceSig(s) {
        if (!s) return '';
        var c = s.client || {};
        return [
          s.deceasedName || '',
          s.deceasedBirthDate || '',
          s.deceasedDeathDate || '',
          s.burialDate || '',
          s.burialPlace || '',
          s.eventType || '',
          c.image || ''
        ].join('::');
      }

      function renderListingMode(response) {
        hidePageLoading();
        var listSec = document.getElementById('infoListSection');
        if (listSec) listSec.style.display = 'flex';

        var svc = (response && response.services) || {};
        var attendances = svc.attendances || svc.data || svc.transmissions || svc.items || svc.list || (Array.isArray(svc) ? svc : []);
        var client = svc.client || {};
        var logoImg = document.getElementById('infoListLogo');
        var logoSrc = response.clientLogo || client.image;
        if (logoImg && logoSrc) {
          logoImg.src = logoSrc;
          logoImg.style.display = 'block';
        }

        var container = document.getElementById('infoListCards');
        var emptyEl = document.getElementById('infoListEmpty');
        if (!attendances || !attendances.length) {
          if (container) container.style.display = 'none';
          if (emptyEl) emptyEl.style.display = 'table';
          return;
        }
        if (emptyEl) emptyEl.style.display = 'none';

        var html = '';
        for (var i = 0; i < attendances.length; i++) {
          var att = attendances[i];
          var name = escapeHtml(att.deceasedName || '—');
          var loc = escapeHtml((att.location && att.location.name) || att.city || '');
          var tid = escapeAttr(String(att.id || ''));
          var cid = escapeAttr(String(client.id || PARAMS.infoCode || ''));
          var model = escapeAttr(String(client.model || PARAMS.clientModel || 'SCROLL'));

          html += '<div class="info-lst__card" tabindex="0" data-idx="' + i + '" data-tid="' + tid + '" data-cid="' + cid + '" data-model="' + model + '">';
          html += '  <div class="info-lst__card-info">';
          html += '    <h2 class="info-lst__card-name">' + name + '</h2>';
          html += '    <p class="info-lst__card-details">' + loc + '</p>';
          html += '  </div>';
          html += '</div>';
        }
        container.innerHTML = html;

        var cards = container.querySelectorAll('.info-lst__card');
        for (var j = 0; j < cards.length; j++) {
          cards[j].onclick = function() {
            var tid = this.getAttribute('data-tid');
            var cid = this.getAttribute('data-cid');
            var model = this.getAttribute('data-model');
            window.location.href = '/api/adiau/render?hash=' + encodeURIComponent(PARAMS.hash) +
              '&transmission=' + encodeURIComponent(tid) +
              '&infoCode=' + encodeURIComponent(cid) +
              '&code=' + encodeURIComponent(PARAMS.code || 'pt-br') +
              '&screenName=' + encodeURIComponent(PARAMS.screenName || '') +
              '&clientModel=' + encodeURIComponent(model || '');
          };
        }
        if (cards.length > 0) {
          cards[0].className += ' dpad-focus';
          try { cards[0].focus(); } catch (e) {}
        }
      }

      function applyResponse(response) {
        if (!response || response.pending) return false;
        if (state.mode === 'listing') {
          renderListingMode(response);
          return true;
        }

        hidePageLoading();
        if (response.status !== true || !response.services) {
          showEmpty(translateText('Transmissão, hash ou algum outro dado inválido(s)'));
          return true;
        }

        if (response.layoutConfig) {
          state.layoutConfig = response.layoutConfig;
        }
        if (response.clientLogo) {
          state.clientLogo = response.clientLogo;
        }

        var sig = serviceSig(response.services);
        var changed = sig !== state.lastSig || !state.service;
        state.service = response.services;
        state.lastSig = sig;

        if (changed) {
          renderCanvas();
        }
        hideEmpty();
        return true;
      }

      function pollData(isInitial) {
        var qs = 'hash=' + encodeURIComponent(PARAMS.hash || '') +
                 '&transmission=' + encodeURIComponent(PARAMS.transmission || '') +
                 '&infoCode=' + encodeURIComponent(PARAMS.infoCode || '') +
                 '&code=' + encodeURIComponent(PARAMS.code || 'pt-br') +
                 '&screenName=' + encodeURIComponent(PARAMS.screenName || '') +
                 '&clientModel=' + encodeURIComponent(PARAMS.clientModel || '') +
                 '&_t=' + new Date().getTime();

        var xhr = new XMLHttpRequest();
        xhr.open('GET', '/api/adiau/data?' + qs, true);
        xhr.timeout = 20000;
        xhr.onreadystatechange = function() {
          if (xhr.readyState !== 4) return;
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              var res = JSON.parse(xhr.responseText);
              if (res && res.pending) {
                setTimeout(function() { pollData(true); }, 2000);
                return;
              }
              applyResponse(res);
            } catch (e) {
              if (isInitial && !state.service) {
                setTimeout(function() { pollData(true); }, 3000);
              }
            }
          } else if (isInitial && !state.service) {
            setTimeout(function() { pollData(true); }, 3000);
          }
        };
        xhr.send();
      }

      // Inicialização imediata
      if (INITIAL_DATA && !INITIAL_DATA.pending) {
        applyResponse(INITIAL_DATA);
      } else {
        pollData(true);
      }

      // Atualização periódica leve a cada 60s
      setInterval(function() {
        pollData(false);
      }, 60000);
    })();
  </script>
</body>
</html>`;
}
