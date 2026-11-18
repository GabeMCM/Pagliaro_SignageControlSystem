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
  room?: string;
  orientation?: string;
  rotation?: number;
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
  let room = (query.room || query.roomSlug || "").trim();
  let orientation = (query.orientation || query.mode || "auto").trim();
  let rotation = Number(query.rotation || query.rot || 0) || 0;

  const rawUrl = (query.url || "").trim();
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      hash = hash || (parsed.searchParams.get("hash") || parsed.searchParams.get("hashcode") || "").trim();
      transmission = transmission || (parsed.searchParams.get("transmission") || "").trim();
      infoCode = infoCode || (parsed.searchParams.get("infoCode") || parsed.searchParams.get("clientId") || "").trim();
      code = (parsed.searchParams.get("code") || code || "pt-br").trim();
      screenName = screenName || (parsed.searchParams.get("screenName") || "").trim();
      clientModel = clientModel || (parsed.searchParams.get("clientModel") || "").trim();
      room = room || (parsed.searchParams.get("room") || parsed.searchParams.get("roomSlug") || "").trim();
      orientation = orientation !== "auto" ? orientation : (parsed.searchParams.get("orientation") || parsed.searchParams.get("mode") || "auto").trim();
      rotation = rotation || Number(parsed.searchParams.get("rotation") || parsed.searchParams.get("rot") || 0) || 0;
    } catch {
      // Fallback regex parsing caso a URL tenha formato parcial
      const mHash = rawUrl.match(/[?&]hash=([^&#]+)/i);
      const mTrans = rawUrl.match(/[?&]transmission=([^&#]+)/i);
      const mInfo = rawUrl.match(/[?&](?:infoCode|clientId)=([^&#]+)/i);
      const mCode = rawUrl.match(/[?&]code=([^&#]+)/i);
      const mScreen = rawUrl.match(/[?&]screenName=([^&#]+)/i);
      const mModel = rawUrl.match(/[?&]clientModel=([^&#]+)/i);
      const mRoom = rawUrl.match(/[?&](?:room|roomSlug)=([^&#]+)/i);
      const mOrient = rawUrl.match(/[?&](?:orientation|mode)=([^&#]+)/i);
      const mRot = rawUrl.match(/[?&](?:rotation|rot)=([^&#]+)/i);
      if (mHash) hash = hash || decodeURIComponent(mHash[1]);
      if (mTrans) transmission = transmission || decodeURIComponent(mTrans[1]);
      if (mInfo) infoCode = infoCode || decodeURIComponent(mInfo[1]);
      if (mCode) code = decodeURIComponent(mCode[1]);
      if (mScreen) screenName = screenName || decodeURIComponent(mScreen[1]);
      if (mModel) clientModel = clientModel || decodeURIComponent(mModel[1]);
      if (mRoom) room = room || decodeURIComponent(mRoom[1]);
      if (mOrient) orientation = orientation || decodeURIComponent(mOrient[1]);
      if (mRot) rotation = rotation || Number(decodeURIComponent(mRot[1])) || 0;
    }
  }

  if (!hash) {
    hash = (Deno.env.get("ADIAU_HASH") || "").trim();
  }
  if (!screenName) {
    screenName = (Deno.env.get("ADIAU_SCREEN_NAME") || "Flores").trim();
  }

  if (!hash) return null;

  return {
    hash,
    transmission,
    infoCode,
    code: code || "pt-br",
    screenName,
    clientModel,
    room,
    orientation,
    rotation,
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
/**
 * Gera a nova tela nativa de informação (ultra-leve, vertical nativa, responsiva,
 * com animação contínua acelerada por GPU para prevenir modo repouso/sleep da TV)
 */
export function renderAdiauHtmlPage(params: AdiauQueryParams, initialData: any | null): string {
  const serializedParams = JSON.stringify(params);
  const serializedInitialData = initialData ? JSON.stringify(initialData) : "null";

  return `<!DOCTYPE html>
<html lang="${params.code || "pt-br"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Informações da Cerimônia • Pagliaro Serviços Sociais</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;800&family=Inter:wght@400;600;700&display=swap">
  <style>
    :root {
      --bg-deep: #05070a;
      --bg-panel: rgba(13, 17, 26, 0.78);
      --border-gold: rgba(226, 186, 98, 0.32);
      --gold-primary: #e2ba62;
      --gold-light: #f7ebc6;
      --gold-dark: #b8913b;
      --text-white: #ffffff;
      --text-secondary: #cbd5e1;
      --text-muted: #94a3b8;
      --live-green: #34d399;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: var(--bg-deep);
      color: var(--text-white);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      -webkit-font-smoothing: antialiased;
      user-select: none;
    }

    /* Canvas animado para GPU manter o Fire Stick 100% acordado */
    #ambientCanvas {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1;
    }

    .bg-glow-radial {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: radial-gradient(circle at 50% 28%, rgba(28, 40, 62, 0.5) 0%, rgba(8, 11, 16, 0.88) 65%, #030407 100%);
      z-index: 2;
      pointer-events: none;
      -webkit-animation: ambientGlowPulse 14s ease-in-out infinite alternate;
      animation: ambientGlowPulse 14s ease-in-out infinite alternate;
    }
    @-webkit-keyframes ambientGlowPulse {
      0% { opacity: 0.82; -webkit-transform: scale(1.0); }
      100% { opacity: 1.0; -webkit-transform: scale(1.03); }
    }
    @keyframes ambientGlowPulse {
      0% { opacity: 0.82; transform: scale(1.0); }
      100% { opacity: 1.0; transform: scale(1.03); }
    }

    /* Container mestre */
    .screen-container {
      position: relative;
      z-index: 10;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 3.5vh 4.5vw;
      box-sizing: border-box;
      transition: transform 0.3s ease;
    }

    /* Rotações via query param para TVs montadas em suportes especiais */
    .rot-90 {
      transform: rotate(90deg);
      transform-origin: center center;
      width: 100vh;
      height: 100vw;
      position: absolute;
      top: calc((100vh - 100vw) / 2);
      left: calc((100vw - 100vh) / 2);
    }
    .rot-270 {
      transform: rotate(270deg);
      transform-origin: center center;
      width: 100vh;
      height: 100vw;
      position: absolute;
      top: calc((100vh - 100vw) / 2);
      left: calc((100vw - 100vh) / 2);
    }
    .rot-180 {
      transform: rotate(180deg);
      transform-origin: center center;
    }

    /* CABEÇALHO */
    .header-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      padding-bottom: 2vh;
      border-bottom: 1px solid rgba(226, 186, 98, 0.22);
      gap: 16px;
    }
    .brand-wrap {
      display: flex;
      align-items: center;
      gap: 16px;
      min-width: 0;
    }
    .brand-name {
      font-family: 'Cinzel', serif;
      font-size: clamp(18px, 2.5vw, 26px);
      font-weight: 800;
      letter-spacing: 0.22em;
      color: var(--gold-primary);
      text-transform: uppercase;
      text-shadow: 0 2px 12px rgba(226, 186, 98, 0.3);
    }
    .room-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 18px;
      border-radius: 9999px;
      background: rgba(226, 186, 98, 0.12);
      border: 1px solid rgba(226, 186, 98, 0.38);
      color: var(--gold-light);
      font-family: 'Cinzel', serif;
      font-size: clamp(11px, 1.3vw, 14px);
      font-weight: 700;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .clock-wrap {
      text-align: right;
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
    }
    .clock-time {
      font-size: clamp(22px, 3.2vw, 34px);
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.05em;
    }
    .clock-colon {
      color: var(--gold-primary);
    }
    .clock-secs {
      font-size: 0.7em;
      color: var(--gold-light);
      opacity: 0.9;
    }
    .clock-date {
      font-size: clamp(11px, 1.2vw, 13px);
      color: var(--text-muted);
      text-transform: capitalize;
      margin-top: 2px;
    }

    /* CORPO PRINCIPAL */
    .content-columns {
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      flex: 1;
      margin: 1vh 0;
      gap: 2vh;
      overflow-y: auto;
    }

    .hero-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 3vh 1vw 2vh;
      flex-shrink: 0;
    }

    .solene-tag {
      display: inline-flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 1.8vh;
    }
    .solene-line {
      width: clamp(28px, 4vw, 54px);
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--gold-primary));
    }
    .solene-line.right {
      background: linear-gradient(90deg, var(--gold-primary), transparent);
    }
    .solene-text {
      font-family: 'Cinzel', serif;
      font-size: clamp(11px, 1.4vw, 14px);
      letter-spacing: 0.28em;
      color: var(--gold-primary);
      text-transform: uppercase;
      font-weight: 600;
    }

    .memorial-flame {
      width: clamp(34px, 4.5vh, 48px);
      height: clamp(34px, 4.5vh, 48px);
      margin-bottom: 1.4vh;
      animation: flamePulse 3.5s ease-in-out infinite;
    }

    .deceased-name {
      font-family: 'Cormorant Garamond', 'Cinzel', Georgia, serif;
      font-size: clamp(2.2rem, 5.8vw, 4.2rem);
      font-weight: 700;
      line-height: 1.15;
      letter-spacing: 0.02em;
      color: #ffffff;
      text-transform: uppercase;
      text-shadow: 0 4px 24px rgba(0,0,0,0.85), 0 0 35px rgba(226, 186, 98, 0.25);
      max-width: 95%;
      word-break: break-word;
      margin-bottom: 1.6vh;
    }

    .life-dates {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: 14px;
      padding: 8px 22px;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.12);
      font-size: clamp(14px, 2vw, 19px);
      color: var(--text-secondary);
    }
    .life-dates .symbol {
      color: var(--gold-primary);
      margin-right: 4px;
      font-size: 1.1em;
    }
    .life-dates .date-sep {
      color: rgba(226, 186, 98, 0.45);
    }
    .age-badge {
      color: var(--gold-light);
      font-size: clamp(12px, 1.4vw, 14px);
      font-weight: 500;
      margin-left: 4px;
    }

    /* CARDS DA CERIMÔNIA */
    .cards-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1.8vh;
      width: 100%;
      max-width: 860px;
      margin: 0 auto;
    }

    .ceremony-card {
      background: var(--bg-panel);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--border-gold);
      border-radius: 16px;
      padding: 2vh 2.5vw;
      box-shadow: 0 16px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06);
      animation: cardBreathe 8s ease-in-out infinite;
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.2vh;
      padding-bottom: 1vh;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .card-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: 'Cinzel', serif;
      font-size: clamp(13px, 1.6vw, 16px);
      font-weight: 700;
      letter-spacing: 0.15em;
      color: var(--gold-primary);
      text-transform: uppercase;
    }
    .card-title svg {
      width: 18px;
      height: 18px;
      fill: none;
      stroke: var(--gold-primary);
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 9999px;
      background: rgba(52, 211, 153, 0.12);
      border: 1px solid rgba(52, 211, 153, 0.35);
      color: var(--live-green);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background-color: var(--live-green);
      box-shadow: 0 0 8px var(--live-green);
      animation: dotPulse 2s infinite;
    }

    .card-body {
      display: flex;
      flex-direction: column;
      gap: 0.9vh;
    }
    .card-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      font-size: clamp(14px, 1.8vw, 18px);
    }
    .card-label {
      color: var(--text-muted);
      font-size: clamp(12px, 1.4vw, 14px);
      font-weight: 500;
      flex-shrink: 0;
    }
    .card-val {
      color: #ffffff;
      font-weight: 600;
      text-align: right;
    }
    .card-val.highlight {
      color: var(--gold-light);
      font-weight: 700;
    }

    /* RODAPÉ */
    .footer-bar {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 0.6vh;
      padding-top: 1.8vh;
      border-top: 1px solid rgba(226, 186, 98, 0.18);
      color: var(--text-muted);
    }
    .condolence-msg {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-style: italic;
      font-size: clamp(14px, 1.8vw, 19px);
      color: var(--text-secondary);
      max-width: 800px;
    }
    .support-info {
      font-size: clamp(11px, 1.3vw, 13px);
      letter-spacing: 0.08em;
      color: rgba(226, 186, 98, 0.88);
      font-weight: 500;
    }

    /* ESTADO DE ESPERA / CARREGAMENTO */
    .loading-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: var(--bg-deep);
      z-index: 100;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 20px;
      transition: opacity 0.4s ease;
    }
    .loading-spinner {
      width: 48px;
      height: 48px;
      border: 3px solid rgba(226, 186, 98, 0.2);
      border-top-color: var(--gold-primary);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    /* MODO HORIZONTAL (LANDSCAPE) — mantém layout vertical centralizado */
    @media (min-width: 1024px) and (orientation: landscape) {
      .hero-section {
        padding: 2vh 1vw 1.5vh;
      }
      .cards-grid {
        grid-template-columns: 1fr 1fr;
        max-width: 100%;
      }
    }

    /* ANIMAÇÕES LEVES */
    @keyframes flamePulse {
      0%, 100% {
        transform: scale(1);
        filter: drop-shadow(0 0 10px rgba(226, 186, 98, 0.55));
      }
      50% {
        transform: scale(1.08);
        filter: drop-shadow(0 0 22px rgba(247, 235, 198, 0.85));
      }
    }

    @keyframes cardBreathe {
      0%, 100% {
        border-color: rgba(226, 186, 98, 0.28);
        box-shadow: 0 16px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(226,186,98,0.06);
      }
      50% {
        border-color: rgba(226, 186, 98, 0.48);
        box-shadow: 0 20px 48px rgba(0,0,0,0.7), 0 0 18px rgba(226,186,98,0.18);
      }
    }

    @keyframes dotPulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.85); }
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <!-- Canvas de partículas leves animadas para GPU manter a TV 100% acordada -->
  <canvas id="ambientCanvas"></canvas>
  <!-- Vídeo invisível em loop contínuo garantindo FLAG_KEEP_SCREEN_ON no Fire OS / Silk Browser -->
  <video id="adiau-keep-awake-video" src="/player/keep-awake.mp4" autoplay loop muted playsinline webkit-playsinline preload="auto" style="position:fixed;bottom:2px;right:2px;width:12px;height:12px;opacity:0.04;pointer-events:none;z-index:999999;"></video>
  <div class="bg-glow-radial"></div>

  <!-- Overlay de Carregamento Suave -->
  <div id="loadingOverlay" class="loading-overlay" style="display: none;">
    <div class="loading-spinner"></div>
    <div style="font-family:'Cinzel', serif; font-size:14px; letter-spacing:0.15em; color:var(--gold-primary);">
      CARREGANDO CERIMÔNIA...
    </div>
  </div>

  <main id="mainContainer" class="screen-container">
    <!-- Cabeçalho -->
    <header class="header-bar">
      <div class="brand-wrap">
        <div class="brand-name">PAGLIARO</div>
        <div id="roomBadge" class="room-badge">
          CERIMONIAL PAGLIARO
        </div>
      </div>

      <div class="clock-wrap">
        <div class="clock-time">
          <span id="clockHours">14</span><span class="clock-colon">:</span><span id="clockMins">35</span><span id="clockSecs" class="clock-secs">:22</span>
        </div>
        <div id="clockDate" class="clock-date">
          Sexta-feira, 13 de Novembro de 2026
        </div>
      </div>
    </header>

    <!-- Corpo com Hero e Cards -->
    <div class="content-columns">
      <!-- Seção do Falecido -->
      <section class="hero-section">
        <div class="solene-tag">
          <div class="solene-line"></div>
          <span class="solene-text">HOMENAGEM PÓSTUMA</span>
          <div class="solene-line right"></div>
        </div>

        <!-- Chama memorial sutilmente animada -->
        <svg class="memorial-flame" viewBox="0 0 24 24" fill="none">
          <path d="M12 2C10 5.5 8 7.5 8 11C8 14.31 10.69 17 14 17C14.7 17 15.37 16.88 16 16.66C15.5 18.6 13.9 20 12 20C9.24 20 7 17.76 7 15C7 12.8 8.4 10.2 10.5 8.5C10.5 6 12 3 12 2Z" fill="url(#flameGrad)" />
          <path d="M13.5 10C13.5 12.21 11.71 14 9.5 14C9.15 14 8.81 13.95 8.5 13.87C9.1 15.11 10.45 16 12 16C13.66 16 15 14.66 15 13C15 11.8 14.4 10.8 13.5 10Z" fill="#FDF3CF" opacity="0.9" />
          <defs>
            <linearGradient id="flameGrad" x1="12" y1="2" x2="12" y2="20" gradientUnits="userSpaceOnUse">
              <stop stop-color="#FFF3C4" />
              <stop offset="0.4" stop-color="#E2BA62" />
              <stop offset="1" stop-color="#B87333" />
            </linearGradient>
          </defs>
        </svg>

        <h1 id="deceasedName" class="deceased-name">
          HOMENAGEM PÓSTUMA
        </h1>

        <div id="lifeDatesBlock" class="life-dates" style="display: none;">
          <span id="birthDateSpan" style="display: none;">
            <span class="symbol">★</span><span id="birthDateVal"></span>
          </span>
          <span id="dateSep" class="date-sep" style="display: none;">•</span>
          <span id="deathDateSpan" style="display: none;">
            <span class="symbol">✝</span><span id="deathDateVal"></span>
          </span>
          <span id="ageSpan" class="age-badge" style="display: none;"></span>
        </div>
      </section>

      <!-- Grade dos Cards da Cerimônia -->
      <section class="cards-grid">
        <!-- Card 1: Velório -->
        <article class="ceremony-card">
          <div class="card-header">
            <h2 class="card-title">
              <svg viewBox="0 0 24 24"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
              <span>VELÓRIO E HOMENAGENS</span>
            </h2>
            <div id="wakeStatusBadge" class="status-pill">
              <span class="status-dot"></span>
              <span id="wakeStatusText">EM ANDAMENTO</span>
            </div>
          </div>
          <div class="card-body">
            <div class="card-row">
              <span class="card-label">Horário de Celebração:</span>
              <span id="wakeScheduleVal" class="card-val highlight">—</span>
            </div>
            <div class="card-row">
              <span class="card-label">Local:</span>
              <span id="wakeLocationVal" class="card-val">Pagliaro Serviços Sociais</span>
            </div>
          </div>
        </article>

        <!-- Card 2: Sepultamento ou Cremação -->
        <article class="ceremony-card">
          <div class="card-header">
            <h2 class="card-title">
              <svg viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4 21l3.39-.97C8.93 20.26 10.88 21 12 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zM12 7v5l3 3" /></svg>
              <span id="burialCardTitle">SEPULTAMENTO</span>
            </h2>
          </div>
          <div class="card-body">
            <div class="card-row">
              <span class="card-label">Destino:</span>
              <span id="burialPlaceVal" class="card-val highlight">Pagliaro</span>
            </div>
            <div class="card-row">
              <span class="card-label">Saída / Cerimônia:</span>
              <span id="burialScheduleVal" class="card-val">Horário a definir</span>
            </div>
          </div>
        </article>
      </section>
    </div>

    <!-- Rodapé -->
    <footer class="footer-bar">
      <p class="condolence-msg">
        “Aos familiares e amigos, nossos mais sinceros sentimentos de carinho e respeito.”
      </p>
      <div class="support-info">
        PAGLIARO SERVIÇOS SOCIAIS • ATENDIMENTO 24H: (34) 3334-6700
      </div>
    </footer>
  </main>

  <script>
    (function() {
      var PARAMS = ${serializedParams};
      var INITIAL_DATA = ${serializedInitialData};

      // Detecta se a página está renderizada dentro do iframe do player ou diretamente
      var isInsideIframe = false;
      try {
        isInsideIframe = (window.self !== window.top);
      } catch (e) {
        isInsideIframe = true;
      }

      // Aplica rotação APENAS se acessado diretamente no navegador.
      // Se estiver dentro do player da TV (iframe), a rotação já é executada pelo container pai (#player-viewport).
      // Evita dupla rotação (540°) e esgotamento de textura GPU no Fire Stick.
      var rot = Number(PARAMS.rotation) || 0;
      if (!isInsideIframe && (rot === 90 || rot === 270 || rot === 180)) {
        var container = document.getElementById('mainContainer');
        if (container) container.className += ' rot-' + rot;
      }

      // --- MOTOR 1: PARTICULAS AMBIENTAIS ULTRA-LEVES (GPU & MEMORY OPTIMIZED) ---
      var isSilkOrLowEnd = Boolean(/Silk|AFT|Tizen 5|VIDAA/i.test(navigator.userAgent));
      var canvas = document.getElementById('ambientCanvas');
      var ctx = canvas ? canvas.getContext('2d') : null;
      var particles = [];
      var PARTICLE_COUNT = isSilkOrLowEnd ? 8 : 16;

      function resizeCanvas() {
        if (!canvas) return;
        canvas.width = window.innerWidth || 1920;
        canvas.height = window.innerHeight || 1080;
      }

      function initParticles() {
        if (!canvas || !ctx) return;
        resizeCanvas();
        particles = [];
        var w = canvas.width;
        var h = canvas.height;
        for (var i = 0; i < PARTICLE_COUNT; i++) {
          particles.push({
            x: Math.random() * w,
            y: Math.random() * h,
            r: Math.random() * 2.0 + 0.8,
            vx: (Math.random() - 0.5) * 0.25,
            vy: -(Math.random() * 0.35 + 0.2),
            pulse: Math.random() * Math.PI,
            pulseSpeed: Math.random() * 0.02 + 0.01
          });
        }
      }

      function drawParticles() {
        if (!ctx || !canvas) return;
        var w = canvas.width;
        var h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        ctx.fillStyle = 'rgba(226, 186, 98, 0.36)';
        for (var i = 0; i < particles.length; i++) {
          var p = particles[i];
          p.y += p.vy;
          p.x += p.vx + Math.sin(p.pulse) * 0.12;
          p.pulse += p.pulseSpeed;

          if (p.y < -10) {
            p.y = h + 10;
            p.x = Math.random() * w;
          }
          if (p.x < -10) p.x = w + 10;
          if (p.x > w + 10) p.x = -10;

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }

        // Taxa suave limitada a 30 FPS para manter CPU e bateria/aquecimento do Fire Stick frios
        setTimeout(drawParticles, 33);
      }

      if (canvas && ctx) {
        window.addEventListener('resize', resizeCanvas);
        initParticles();
        drawParticles();
      }

      // --- MOTOR 2: RELÓGIO ATIVO EM TEMPO REAL ---
      function pad2(n) { return (n < 10 ? '0' : '') + n; }

      var DAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
      var MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

      function updateClock() {
        var now = new Date();
        var hEl = document.getElementById('clockHours');
        var mEl = document.getElementById('clockMins');
        var sEl = document.getElementById('clockSecs');
        var dEl = document.getElementById('clockDate');

        if (hEl) hEl.textContent = pad2(now.getHours());
        if (mEl) mEl.textContent = pad2(now.getMinutes());
        if (sEl) sEl.textContent = ':' + pad2(now.getSeconds());
        if (dEl) {
          dEl.textContent = DAYS[now.getDay()] + ', ' + now.getDate() + ' de ' + MONTHS[now.getMonth()] + ' de ' + now.getFullYear();
        }
      }
      setInterval(updateClock, 1000);
      updateClock();

      // --- MOTOR 3: KEEP-AWAKE ENGINE (VIDEO & WAKE LOCK) ---
      (function initAdiauKeepAwake() {
        var v = document.getElementById('adiau-keep-awake-video');
        if (v) {
          v.muted = true;
          try { v.setAttribute('muted', ''); } catch (e) {}
          try { v.setAttribute('playsinline', ''); } catch (e) {}
          try { v.setAttribute('webkit-playsinline', ''); } catch (e) {}
          var playVideo = function() {
            try {
              if (v.paused) {
                var p = v.play();
                if (p && typeof p.catch === 'function') p.catch(function() {});
              }
            } catch (e) {}
          };
          playVideo();
          document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible') playVideo();
          });
          setInterval(playVideo, 12000);
          var gestures = ['click', 'touchstart', 'keydown'];
          var onG = function() {
            playVideo();
            for (var i = 0; i < gestures.length; i++) {
              try { document.removeEventListener(gestures[i], onG, true); } catch (e) {}
            }
          };
          for (var i = 0; i < gestures.length; i++) {
            try { document.addEventListener(gestures[i], onG, true); } catch (e) {}
          }
        }
        if ('wakeLock' in navigator && navigator.wakeLock.request) {
          var lock = null;
          function acquire() {
            navigator.wakeLock.request('screen').then(function(l) { lock = l; }).catch(function() {});
          }
          acquire();
          document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible') acquire();
          });
        }
      })();

      // --- MOTOR 4: FORMATAÇÃO DE DATAS DA CERIMÔNIA ---
      function formatDateBR(raw) {
        if (!raw) return '';
        var str = String(raw).trim();
        var m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) {
          return m[3] + '/' + m[2] + '/' + m[1];
        }
        return str;
      }

      function formatTimeOnly(raw) {
        if (!raw) return '';
        var str = String(raw).trim();
        var m = str.match(/(?:\s|T)(\d{2}):(\d{2})/);
        if (m) return m[1] + ':' + m[2];
        return str;
      }

      function calculateYears(birthStr, deathStr) {
        if (!birthStr || !deathStr) return null;
        var b = new Date(birthStr);
        var d = new Date(deathStr);
        if (isNaN(b.getTime()) || isNaN(d.getTime())) return null;
        var diff = d.getFullYear() - b.getFullYear();
        var mDiff = d.getMonth() - b.getMonth();
        if (mDiff < 0 || (mDiff === 0 && d.getDate() < b.getDate())) {
          diff--;
        }
        return diff > 0 ? diff : null;
      }

      // --- MOTOR 5: RENDERIZAÇÃO DOS DADOS ---
      function applyData(response) {
        if (!response) return;
        var overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.style.display = 'none';

        var svc = response.services || {};
        var item = svc;

        // Se response for lista (múltiplas), pega a transmissão indicada ou a primeira
        if (svc.attendances && Array.isArray(svc.attendances)) {
          if (PARAMS.transmission) {
            for (var i = 0; i < svc.attendances.length; i++) {
              if (String(svc.attendances[i].id) === String(PARAMS.transmission)) {
                item = svc.attendances[i];
                break;
              }
            }
          }
          if (!item.deceasedName && svc.attendances.length > 0) {
            item = svc.attendances[0];
          }
        }

        // 1. Logo
        var logoImg = document.getElementById('brandLogo');
        var logoSrc = response.clientLogo || (svc.client && svc.client.logoUrl);
        if (logoImg && logoSrc) {
          logoImg.src = logoSrc;
          logoImg.style.display = 'block';
        }

        // 2. Badge de Local (usa o nome do local da Adiaŭ, não o screenName)
        var roomBadge = document.getElementById('roomBadge');
        if (roomBadge) {
          var locLabel = (item.location && item.location.name) || '';
          if (!locLabel && item.burialPlace) locLabel = item.burialPlace;
          if (!locLabel) locLabel = (svc.client && svc.client.fantasyName) || 'CERIMONIAL PAGLIARO';
          roomBadge.textContent = locLabel.toUpperCase();
        }

        // 3. Nome do Falecido
        var nameEl = document.getElementById('deceasedName');
        var name = item.deceasedName || item.name || '';
        if (nameEl) {
          if (name) {
            nameEl.textContent = name;
            // Ajusta tamanho caso o nome seja muito longo
            if (name.length > 32) {
              nameEl.style.fontSize = 'clamp(1.8rem, 4.2vw, 3rem)';
            } else if (name.length > 24) {
              nameEl.style.fontSize = 'clamp(2rem, 4.8vw, 3.6rem)';
            } else {
              nameEl.style.fontSize = '';
            }
          } else {
            nameEl.textContent = 'SALA DISPONÍVEL';
          }
        }

        // 4. Datas de Vida
        var birthDate = item.deceasedBirthDate;
        var deathDate = item.deceasedDeathDate;
        var datesBlock = document.getElementById('lifeDatesBlock');
        var bSpan = document.getElementById('birthDateSpan');
        var bVal = document.getElementById('birthDateVal');
        var dSpan = document.getElementById('deathDateSpan');
        var dVal = document.getElementById('deathDateVal');
        var sep = document.getElementById('dateSep');
        var ageSpan = document.getElementById('ageSpan');

        if (birthDate || deathDate) {
          if (datesBlock) datesBlock.style.display = 'inline-flex';

          if (birthDate && bSpan && bVal) {
            bVal.textContent = formatDateBR(birthDate);
            bSpan.style.display = 'inline';
          } else if (bSpan) {
            bSpan.style.display = 'none';
          }

          if (deathDate && dSpan && dVal) {
            dVal.textContent = formatDateBR(deathDate);
            dSpan.style.display = 'inline';
          } else if (dSpan) {
            dSpan.style.display = 'none';
          }

          if (birthDate && deathDate && sep) {
            sep.style.display = 'inline';
          } else if (sep) {
            sep.style.display = 'none';
          }

          var years = calculateYears(birthDate, deathDate);
          if (years && ageSpan) {
            ageSpan.textContent = '(' + years + ' anos)';
            ageSpan.style.display = 'inline';
          } else if (ageSpan) {
            ageSpan.style.display = 'none';
          }
        } else if (datesBlock) {
          datesBlock.style.display = 'none';
        }

        // 5. Horários de Velório
        var start = item.attendanceStartDate;
        var end = item.attendanceEndDate;
        var wakeSched = document.getElementById('wakeScheduleVal');
        if (wakeSched) {
          var sTime = formatTimeOnly(start);
          var eTime = formatTimeOnly(end);
          if (sTime && eTime) {
            wakeSched.textContent = sTime + ' às ' + eTime;
          } else if (sTime || eTime) {
            wakeSched.textContent = (sTime || eTime);
          } else {
            wakeSched.textContent = 'Horário em andamento';
          }
        }

        // Status do velório
        var statusBadge = document.getElementById('wakeStatusBadge');
        var statusText = document.getElementById('wakeStatusText');
        if (end) {
          var endTimestamp = new Date(end.replace(' ', 'T') + ':00-03:00').getTime();
          if (!isNaN(endTimestamp) && Date.now() > endTimestamp) {
            if (statusBadge) {
              statusBadge.style.borderColor = 'rgba(148, 163, 184, 0.4)';
              statusBadge.style.color = '#94a3b8';
              statusBadge.style.background = 'rgba(148, 163, 184, 0.1)';
            }
            if (statusText) statusText.textContent = 'ENCERRADO';
          }
        }

        // Local do velório
        var wakeLoc = document.getElementById('wakeLocationVal');
        if (wakeLoc) {
          var locName = (item.location && item.location.name) || 'Pagliaro Serviços Sociais';
          wakeLoc.textContent = locName;
        }

        // 6. Sepultamento ou Cremação
        var isCremation = (item.eventType === 'CREMATION');
        var burialTitle = document.getElementById('burialCardTitle');
        if (burialTitle) {
          burialTitle.textContent = isCremation ? 'CREMAÇÃO' : 'SEPULTAMENTO';
        }

        var burialPlace = document.getElementById('burialPlaceVal');
        if (burialPlace) {
          burialPlace.textContent = item.burialPlace || 'A definir';
        }

        var burialSched = document.getElementById('burialScheduleVal');
        if (burialSched) {
          var bDate = item.burialDate;
          if (bDate) {
            var bTime = formatTimeOnly(bDate);
            burialSched.textContent = 'Saída prevista às ' + bTime;
          } else if (item.toBeDefined) {
            burialSched.textContent = 'Horário a definir pela família';
          } else if (end) {
            burialSched.textContent = 'Saída prevista às ' + formatTimeOnly(end);
          } else {
            burialSched.textContent = 'Horário a confirmar';
          }
        }
      }

      // --- MOTOR 6: ATUALIZAÇÃO AUTOMÁTICA EM SEGUNDO PLANO ---
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
        xhr.timeout = 15000;
        xhr.onreadystatechange = function() {
          if (xhr.readyState !== 4) return;
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              var res = JSON.parse(xhr.responseText);
              if (res && res.pending) {
                setTimeout(function() { pollData(true); }, 2000);
                return;
              }
              applyData(res);
            } catch (e) {
              if (isInitial) setTimeout(function() { pollData(true); }, 3000);
            }
          } else if (isInitial) {
            setTimeout(function() { pollData(true); }, 3000);
          }
        };
        xhr.send();
      }

      // Inicia imediatamente com dados do SSR se disponíveis
      if (INITIAL_DATA && !INITIAL_DATA.pending) {
        applyData(INITIAL_DATA);
      } else {
        var overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.style.display = 'flex';
        pollData(true);
      }

      // Atualiza a cada 30 segundos sem recarregar a tela
      setInterval(function() {
        pollData(false);
      }, 30000);
    })();
  </script>
</body>
</html>`;
}
