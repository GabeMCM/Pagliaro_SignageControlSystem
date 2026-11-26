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

function ssrEscapeHtml(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function ssrFormatDateBR(raw?: string | null): string {
  if (!raw) return "";
  const m = String(raw).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(raw);
}

function ssrFormatTime(raw?: string | null): string {
  if (!raw) return "";
  const m = String(raw).trim().match(/(?:\s|T)(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : String(raw);
}

function ssrSubtractMinutes(raw: string | null | undefined, mins: number): string {
  if (!raw) return "";
  const str = String(raw).trim();
  const mFull = str.match(/(\d{4})[-/](\d{2})[-/](\d{2})[\sT](\d{2}):(\d{2})/);
  if (mFull) {
    const [, y, mo, d, h, mi] = mFull;
    const date = new Date(parseInt(y, 10), parseInt(mo, 10) - 1, parseInt(d, 10), parseInt(h, 10), parseInt(mi, 10));
    date.setMinutes(date.getMinutes() - mins);
    const rh = String(date.getHours()).padStart(2, "0");
    const rm = String(date.getMinutes()).padStart(2, "0");
    return `${rh}:${rm}`;
  }
  const mTime = str.match(/(\d{2}):(\d{2})/);
  if (mTime) {
    let total = parseInt(mTime[1], 10) * 60 + parseInt(mTime[2], 10) - mins;
    if (total < 0) total += 24 * 60;
    const rh = String(Math.floor(total / 60) % 24).padStart(2, "0");
    const rm = String(total % 60).padStart(2, "0");
    return `${rh}:${rm}`;
  }
  return str;
}

function ssrCalculateYears(birthStr?: string | null, deathStr?: string | null): number | null {
  if (!birthStr || !deathStr) return null;
  const b = new Date(birthStr);
  const d = new Date(deathStr);
  if (isNaN(b.getTime()) || isNaN(d.getTime())) return null;
  let diff = d.getFullYear() - b.getFullYear();
  const mDiff = d.getMonth() - b.getMonth();
  if (mDiff < 0 || (mDiff === 0 && d.getDate() < b.getDate())) {
    diff--;
  }
  return diff > 0 ? diff : null;
}

/**
 * Gera a nova tela nativa de informação (ultra-leve, vertical nativa, responsiva,
 * com animação contínua acelerada por GPU para prevenir modo repouso/sleep da TV)
 */
export function renderAdiauHtmlPage(params: AdiauQueryParams, initialData: any | null): string {
  const serializedParams = JSON.stringify(params);
  const serializedInitialData = initialData ? JSON.stringify(initialData) : "null";

  // Extração SSR dos dados da cerimônia para entrega instantânea no HTML
  let ssrItem: any = null;
  if (initialData && !initialData.pending) {
    const svc = initialData.services || initialData;
    if (svc.attendances && Array.isArray(svc.attendances)) {
      if (params.transmission) {
        ssrItem = svc.attendances.find((a: any) => String(a.id) === String(params.transmission));
      }
      if (!ssrItem) ssrItem = svc.attendances[0] || null;
    } else if (svc.deceasedName || svc.id || svc.burialDate) {
      ssrItem = svc;
    }
  }

  const ssrDeceasedName = ssrItem?.deceasedName || ssrItem?.name || "HOMENAGEM PÓSTUMA";
  const ssrBirthDate = ssrItem?.deceasedBirthDate ? ssrFormatDateBR(ssrItem.deceasedBirthDate) : "";
  const ssrDeathDate = ssrItem?.deceasedDeathDate ? ssrFormatDateBR(ssrItem.deceasedDeathDate) : "";
  const ssrYears = (ssrItem?.deceasedBirthDate && ssrItem?.deceasedDeathDate)
    ? ssrCalculateYears(ssrItem.deceasedBirthDate, ssrItem.deceasedDeathDate)
    : null;

  const ssrIsCremation = (ssrItem?.eventType === "CREMATION");
  const ssrBurialTitle = ssrIsCremation ? "CREMAÇÃO" : "SEPULTAMENTO";
  const ssrBurialTimeLabel = ssrIsCremation ? "Horário da Cremação:" : "Horário do Sepultamento:";
  const ssrBurialPlace = ssrItem?.burialPlace || (ssrIsCremation ? "Crematório" : (ssrItem ? "A definir" : "A definir"));

  const ssrBurialRaw = ssrItem?.burialDate || ssrItem?.attendanceEndDate || "";
  let ssrBurialTimeVal = "Horário a definir";
  let ssrDepartureTimeVal = "—";
  let ssrDepartureTimeStr = "";

  if (ssrItem?.toBeDefined || (!ssrBurialRaw && !ssrItem?.burialDate)) {
    ssrBurialTimeVal = "Horário a definir pela família";
    ssrDepartureTimeVal = "Horário a definir";
  } else if (ssrBurialRaw) {
    const bTime = ssrFormatTime(ssrBurialRaw);
    ssrDepartureTimeStr = ssrSubtractMinutes(ssrBurialRaw, 40);
    ssrBurialTimeVal = bTime ? `Às ${bTime}` : "Horário a confirmar";
    ssrDepartureTimeVal = ssrDepartureTimeStr ? `Às ${ssrDepartureTimeStr}` : (bTime ? `Às ${bTime}` : "—");
  }

  const ssrWakeStart = ssrFormatTime(ssrItem?.attendanceStartDate);
  const ssrWakeEnd = ssrDepartureTimeStr || ssrFormatTime(ssrItem?.attendanceEndDate);
  let ssrWakeSched = "—";
  if (ssrWakeStart && ssrWakeEnd) {
    ssrWakeSched = `${ssrWakeStart} às ${ssrWakeEnd}`;
  } else if (ssrWakeEnd) {
    ssrWakeSched = `Até às ${ssrWakeEnd}`;
  } else if (ssrWakeStart) {
    ssrWakeSched = `A partir das ${ssrWakeStart}`;
  }

  const ssrWakeLocation = (ssrItem?.location && ssrItem.location.name) || "Pagliaro Serviços Sociais";
  const ssrRoomBadge = (ssrItem?.location && ssrItem.location.name) || (ssrItem?.burialPlace) || "CERIMONIAL PAGLIARO";

  return `<!DOCTYPE html>
<html lang="${params.code || "pt-br"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Informações da Cerimônia • Pagliaro Serviços Sociais</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,400;1,600&family=Inter:wght@300;400;500;600;700&display=swap">
  <style>
    :root {
      --bg-base: #090a0d;
      --bg-radial: radial-gradient(ellipse at 50% 22%, #141722 0%, #090a0d 68%, #050608 100%);
      --panel-bg: rgba(16, 19, 26, 0.78);
      --panel-border: rgba(197, 160, 89, 0.22);
      --panel-border-soft: rgba(255, 255, 255, 0.08);
      --panel-shadow: 0 16px 36px rgba(0, 0, 0, 0.55);
      --gold-noble: #c5a059;
      --gold-champagne: #ecdcb9;
      --gold-subtle: rgba(197, 160, 89, 0.35);
      --gold-tint: rgba(197, 160, 89, 0.08);
      --text-pure: #ffffff;
      --text-secondary: #e2e8f0;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: var(--bg-base);
      background-image: var(--bg-radial);
      color: var(--text-pure);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      -webkit-font-smoothing: antialiased;
      user-select: none;
    }

    /* Partículas sutis estilo poeira de luz dourada (mantém GPU e painel acordados sem distração) */
    #ambientCanvas {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1;
    }

    /* Moldura memorial clássica e discreta */
    .memorial-frame {
      position: fixed;
      top: 1.8vh;
      left: 2.2vw;
      right: 2.2vw;
      bottom: 1.8vh;
      border: 1px solid rgba(197, 160, 89, 0.16);
      pointer-events: none;
      z-index: 5;
    }
    .memorial-frame::before, .memorial-frame::after {
      content: "";
      position: absolute;
      width: 14px;
      height: 14px;
      border-color: rgba(197, 160, 89, 0.45);
      pointer-events: none;
    }
    .memorial-frame::before {
      top: -1px; left: -1px;
      border-top: 2px solid; border-left: 2px solid;
    }
    .memorial-frame::after {
      bottom: -1px; right: -1px;
      border-bottom: 2px solid; border-right: 2px solid;
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
      padding: 3.8vh 4.5vw;
      box-sizing: border-box;
      transition: transform 0.3s ease;
    }

    /* Rotações via query param caso a TV esteja montada em suporte rotacionado */
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
      border-bottom: 1px solid rgba(197, 160, 89, 0.18);
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
      font-size: clamp(20px, 2.6vw, 28px);
      font-weight: 700;
      letter-spacing: 0.24em;
      color: var(--gold-noble);
      text-transform: uppercase;
    }
    .room-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 16px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(197, 160, 89, 0.28);
      color: var(--gold-champagne);
      font-family: 'Cinzel', serif;
      font-size: clamp(11px, 1.3vw, 13px);
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .clock-wrap {
      text-align: right;
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
    }
    .clock-time {
      font-family: 'Cinzel', 'Inter', serif;
      font-size: clamp(22px, 3.2vw, 34px);
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.04em;
    }
    .clock-colon {
      color: var(--gold-noble);
      opacity: 0.85;
    }
    .clock-secs {
      font-size: 0.65em;
      color: var(--gold-champagne);
      opacity: 0.8;
      font-weight: 500;
    }
    .clock-date {
      font-size: clamp(11px, 1.2vw, 13px);
      color: var(--text-muted);
      text-transform: capitalize;
      margin-top: 2px;
      letter-spacing: 0.02em;
    }

    /* CORPO PRINCIPAL */
    .content-columns {
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      flex: 1;
      margin: 1.5vh 0;
      gap: 2.5vh;
      overflow-y: auto;
    }

    /* SEÇÃO DO FALECIDO (HERO MEMORIAL) */
    .hero-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 2.5vh 1vw 1.5vh;
      flex-shrink: 0;
    }

    .solene-tag {
      display: inline-flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 1.6vh;
    }
    .solene-line {
      width: clamp(28px, 4.5vw, 60px);
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--gold-noble));
    }
    .solene-line.right {
      background: linear-gradient(90deg, var(--gold-noble), transparent);
    }
    .solene-text {
      font-family: 'Cinzel', serif;
      font-size: clamp(11px, 1.3vw, 13px);
      letter-spacing: 0.26em;
      color: var(--gold-noble);
      text-transform: uppercase;
      font-weight: 600;
    }

    .memorial-symbol {
      width: clamp(30px, 4.2vh, 42px);
      height: clamp(30px, 4.2vh, 42px);
      margin-bottom: 1.2vh;
      opacity: 0.92;
    }

    .deceased-name {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: clamp(2.4rem, 6.2vw, 4.5rem);
      font-weight: 700;
      line-height: 1.14;
      letter-spacing: 0.02em;
      color: #ffffff;
      text-transform: uppercase;
      text-shadow: 0 2px 14px rgba(0, 0, 0, 0.85);
      max-width: 95%;
      word-break: break-word;
      margin-bottom: 1.4vh;
    }

    .life-dates {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: 12px;
      padding: 6px 20px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.09);
      font-size: clamp(14px, 1.8vw, 18px);
      color: var(--text-secondary);
      letter-spacing: 0.03em;
    }
    .life-dates .symbol {
      color: var(--gold-noble);
      margin-right: 5px;
      font-size: 0.95em;
    }
    .life-dates .date-sep {
      color: rgba(197, 160, 89, 0.45);
    }
    .age-badge {
      color: var(--gold-champagne);
      font-size: clamp(12px, 1.3vw, 14px);
      font-weight: 500;
      margin-left: 4px;
    }

    /* PAINÉIS DE INFORMAÇÕES DA CERIMÔNIA (CARDS SÓBRIOS) */
    .cards-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 2vh;
      width: 100%;
      max-width: 880px;
      margin: 0 auto;
    }

    .ceremony-card {
      background: var(--panel-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--panel-border);
      border-radius: 10px;
      padding: 2.2vh 2.6vw;
      box-shadow: var(--panel-shadow);
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.4vh;
      padding-bottom: 1vh;
      border-bottom: 1px solid var(--panel-border-soft);
    }
    .card-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: 'Cinzel', serif;
      font-size: clamp(13px, 1.5vw, 16px);
      font-weight: 600;
      letter-spacing: 0.16em;
      color: var(--gold-noble);
      text-transform: uppercase;
    }
    .card-title svg {
      width: 18px;
      height: 18px;
      fill: none;
      stroke: var(--gold-noble);
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
      opacity: 0.95;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 10px;
      border-radius: 4px;
      background: rgba(197, 160, 89, 0.08);
      border: 1px solid rgba(197, 160, 89, 0.28);
      color: var(--gold-champagne);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: var(--gold-noble);
      opacity: 0.9;
    }

    .card-body {
      display: flex;
      flex-direction: column;
      gap: 1.1vh;
    }
    .card-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 14px;
      font-size: clamp(14px, 1.7vw, 18px);
    }
    .card-label {
      color: var(--text-muted);
      font-size: clamp(12px, 1.3vw, 14px);
      font-weight: 400;
      letter-spacing: 0.02em;
      flex-shrink: 0;
    }
    .card-val {
      color: #ffffff;
      font-weight: 500;
      text-align: right;
    }
    .card-val.highlight {
      color: var(--gold-champagne);
      font-weight: 600;
      letter-spacing: 0.02em;
    }

    /* DESTAQUE DE SAÍDA PREVISTA (~40 min antes) */
    .departure-highlight-box {
      margin-top: 0.6vh;
      padding: 1vh 1.4vw;
      background: rgba(197, 160, 89, 0.07);
      border: 1px solid rgba(197, 160, 89, 0.26);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .departure-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: 'Cinzel', serif;
      font-size: clamp(11px, 1.25vw, 13px);
      letter-spacing: 0.14em;
      color: var(--gold-noble);
      text-transform: uppercase;
      font-weight: 600;
    }
    .departure-label svg {
      width: 15px;
      height: 15px;
      fill: none;
      stroke: var(--gold-noble);
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .departure-time {
      font-family: 'Inter', sans-serif;
      font-size: clamp(16px, 2.1vw, 22px);
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.04em;
    }
    .departure-badge-tag {
      font-size: clamp(10px, 1.1vw, 12px);
      color: var(--gold-champagne);
      opacity: 0.85;
      font-weight: 400;
    }

    /* RODAPÉ */
    .footer-bar {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 0.6vh;
      padding-top: 2vh;
      border-top: 1px solid rgba(197, 160, 89, 0.16);
      color: var(--text-muted);
    }
    .condolence-msg {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-style: italic;
      font-size: clamp(15px, 1.9vw, 20px);
      color: var(--text-secondary);
      max-width: 820px;
      line-height: 1.35;
    }
    .support-info {
      font-size: clamp(11px, 1.2vw, 12px);
      letter-spacing: 0.12em;
      color: var(--gold-noble);
      font-weight: 500;
      opacity: 0.9;
      text-transform: uppercase;
      margin-top: 2px;
    }

    /* OVERLAY DE CARREGAMENTO */
    .loading-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: var(--bg-base);
      z-index: 100;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 18px;
      transition: opacity 0.4s ease;
    }
    .loading-spinner {
      width: 44px;
      height: 44px;
      border: 2px solid rgba(197, 160, 89, 0.2);
      border-top-color: var(--gold-noble);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    /* MODO HORIZONTAL (LANDSCAPE) — mantém centralização nobre */
    @media (min-width: 1024px) and (orientation: landscape) {
      .hero-section {
        padding: 1.5vh 1vw 1.2vh;
      }
      .cards-grid {
        grid-template-columns: 1fr 1fr;
        max-width: 100%;
        gap: 2.2vw;
      }
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <!-- Canvas de partículas leves animadas para GPU manter a TV 100% acordada -->
  <canvas id="ambientCanvas"></canvas>

  <!-- Moldura memorial clássica de respeito -->
  <div class="memorial-frame"></div>

  <!-- Vídeo invisível garantindo FLAG_KEEP_SCREEN_ON no Fire OS / Silk Browser / Hisense -->
  <video id="adiau-keep-awake-video" src="/player/keep-awake.mp4" autoplay loop muted playsinline webkit-playsinline preload="auto" style="position:fixed;bottom:2px;right:2px;width:12px;height:12px;opacity:0.04;pointer-events:none;z-index:999999;"></video>

  <!-- Overlay de Carregamento Suave -->
  <div id="loadingOverlay" class="loading-overlay" style="display: none;">
    <div class="loading-spinner"></div>
    <div style="font-family:'Cinzel', serif; font-size:13px; letter-spacing:0.18em; color:var(--gold-noble);">
      CARREGANDO INFORMAÇÕES DA CERIMÔNIA...
    </div>
  </div>

  <main id="mainContainer" class="screen-container">
    <!-- Cabeçalho -->
    <header class="header-bar">
      <div class="brand-wrap">
        <div class="brand-name">PAGLIARO</div>
        <div id="roomBadge" class="room-badge">
          ${ssrEscapeHtml(ssrRoomBadge.toUpperCase())}
        </div>
      </div>

      <div class="clock-wrap">
        <div class="clock-time">
          <span id="clockHours">14</span><span class="clock-colon">:</span><span id="clockMins">35</span><span id="clockSecs" class="clock-secs">:22</span>
        </div>
        <div id="clockDate" class="clock-date">
          Quinta-feira, 26 de Novembro de 2026
        </div>
      </div>
    </header>

    <!-- Corpo com Hero e Cards -->
    <div class="content-columns">
      <!-- Seção do Falecido -->
      <section class="hero-section">
        <div class="solene-tag">
          <div class="solene-line"></div>
          <span class="solene-text">EM MEMÓRIA E HOMENAGEM</span>
          <div class="solene-line right"></div>
        </div>

        <!-- Chama memorial sutil em vetor nobre -->
        <svg class="memorial-symbol" viewBox="0 0 24 24" fill="none">
          <path d="M12 2.5C10.2 5.5 8.5 7.6 8.5 10.8C8.5 13.9 10.8 16.5 13.8 16.5C14.4 16.5 15 16.4 15.6 16.2C15.1 18 13.7 19.3 12 19.3C9.5 19.3 7.5 17.3 7.5 14.8C7.5 12.8 8.7 10.5 10.6 8.9C10.6 6.7 12 3.8 12 2.5Z" fill="url(#candleFlameGrad)" />
          <path d="M13.2 9.8C13.2 11.8 11.6 13.4 9.6 13.4C9.3 13.4 9 13.35 8.7 13.28C9.2 14.4 10.4 15.2 11.8 15.2C13.3 15.2 14.5 14 14.5 12.5C14.5 11.4 14 10.5 13.2 9.8Z" fill="#FFF9EA" opacity="0.92" />
          <defs>
            <linearGradient id="candleFlameGrad" x1="12" y1="2.5" x2="12" y2="19.3" gradientUnits="userSpaceOnUse">
              <stop stop-color="#FFF5D6" />
              <stop offset="0.45" stop-color="#C5A059" />
              <stop offset="1" stop-color="#8C682A" />
            </linearGradient>
          </defs>
        </svg>

        <h1 id="deceasedName" class="deceased-name">
          ${ssrEscapeHtml(ssrDeceasedName)}
        </h1>

        <div id="lifeDatesBlock" class="life-dates" style="${(ssrBirthDate || ssrDeathDate) ? 'display: inline-flex;' : 'display: none;'}">
          <span id="birthDateSpan" style="${ssrBirthDate ? 'display: inline;' : 'display: none;'}">
            <span class="symbol">★</span><span id="birthDateVal">${ssrEscapeHtml(ssrBirthDate)}</span>
          </span>
          <span id="dateSep" class="date-sep" style="${(ssrBirthDate && ssrDeathDate) ? 'display: inline;' : 'display: none;'}">•</span>
          <span id="deathDateSpan" style="${ssrDeathDate ? 'display: inline;' : 'display: none;'}">
            <span class="symbol">✝</span><span id="deathDateVal">${ssrEscapeHtml(ssrDeathDate)}</span>
          </span>
          <span id="ageSpan" class="age-badge" style="${ssrYears ? 'display: inline;' : 'display: none;'}">${ssrYears ? `(${ssrYears} anos)` : ''}</span>
        </div>
      </section>

      <!-- Grade dos Cards da Cerimônia -->
      <section class="cards-grid">
        <!-- Card 1: Velório -->
        <article class="ceremony-card">
          <div class="card-header">
            <h2 class="card-title">
              <svg viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M5 12H1M23 12h-4M6.3 6.3l2.8 2.8M17.7 17.7l2.8 2.8M6.3 17.7l2.8-2.8M17.7 6.3l2.8 2.8" /></svg>
              <span>VELÓRIO E HOMENAGENS</span>
            </h2>
            <div id="wakeStatusBadge" class="status-pill">
              <span class="status-dot"></span>
              <span id="wakeStatusText">EM ANDAMENTO</span>
            </div>
          </div>
          <div class="card-body">
            <div class="card-row">
              <span class="card-label">Período de Despedida:</span>
              <span id="wakeScheduleVal" class="card-val highlight">${ssrEscapeHtml(ssrWakeSched)}</span>
            </div>
            <div class="card-row">
              <span class="card-label">Local:</span>
              <span id="wakeLocationVal" class="card-val">${ssrEscapeHtml(ssrWakeLocation)}</span>
            </div>
          </div>
        </article>

        <!-- Card 2: Sepultamento ou Cremação -->
        <article class="ceremony-card">
          <div class="card-header">
            <h2 class="card-title">
              <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" /></svg>
              <span id="burialCardTitle">${ssrEscapeHtml(ssrBurialTitle)}</span>
            </h2>
          </div>
          <div class="card-body">
            <div class="card-row">
              <span class="card-label">Destino / Local:</span>
              <span id="burialPlaceVal" class="card-val highlight">${ssrEscapeHtml(ssrBurialPlace)}</span>
            </div>
            <div class="card-row">
              <span class="card-label" id="burialTimeLabel">${ssrEscapeHtml(ssrBurialTimeLabel)}</span>
              <span id="burialTimeVal" class="card-val">${ssrEscapeHtml(ssrBurialTimeVal)}</span>
            </div>

            <!-- Caixa de Destaque Acolhedor: Saída Prevista (~40 min antes) -->
            <div id="departureBox" class="departure-highlight-box" style="${ssrItem ? 'opacity: 1;' : 'opacity: 0.75;'}">
              <div class="departure-label">
                <svg viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                <span>Saída Prevista</span>
                <span class="departure-badge-tag">(Cortejo)</span>
              </div>
              <div id="departureTimeVal" class="departure-time">
                ${ssrEscapeHtml(ssrDepartureTimeVal)}
              </div>
            </div>
          </div>
        </article>
      </section>
    </div>

    <!-- Rodapé -->
    <footer class="footer-bar">
      <p class="condolence-msg">
        “Com profundo respeito e carinho, nos unimos aos familiares e amigos neste momento de despedida e homenagem.”
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

      // Aplica rotação se acessado diretamente (fora do iframe)
      var rot = Number(PARAMS.rotation) || 0;
      if (!isInsideIframe && (rot === 90 || rot === 270 || rot === 180)) {
        var container = document.getElementById('mainContainer');
        if (container) container.className += ' rot-' + rot;
      }

      // --- MOTOR 1: POEIRA DE LUZ SERENA (GPU & MEMORY OPTIMIZED) ---
      var isLowEnd = Boolean(/Silk|AFT|Tizen 5|VIDAA/i.test(navigator.userAgent));
      var canvas = document.getElementById('ambientCanvas');
      var ctx = canvas ? canvas.getContext('2d') : null;
      var particles = [];
      var PARTICLE_COUNT = isLowEnd ? 7 : 14;

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
            r: Math.random() * 1.8 + 0.6,
            vx: (Math.random() - 0.5) * 0.18,
            vy: -(Math.random() * 0.25 + 0.12),
            pulse: Math.random() * Math.PI,
            pulseSpeed: Math.random() * 0.015 + 0.008
          });
        }
      }

      function drawParticles() {
        if (!ctx || !canvas) return;
        var w = canvas.width;
        var h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        ctx.fillStyle = 'rgba(197, 160, 89, 0.22)';
        for (var i = 0; i < particles.length; i++) {
          var p = particles[i];
          p.y += p.vy;
          p.x += p.vx + Math.sin(p.pulse) * 0.08;
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

        setTimeout(drawParticles, 33); // 30 FPS para manter o Fire Stick e TV frios
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

      // --- MOTOR 3: KEEP-AWAKE (VÍDEO E WAKE LOCK) ---
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
        try {
          if ('wakeLock' in navigator && navigator.wakeLock.request) {
            var lock = null;
            function acquire() {
              try {
                navigator.wakeLock.request('screen').then(function(l) { lock = l; }).catch(function() {});
              } catch (e) {}
            }
            acquire();
            document.addEventListener('visibilitychange', function() {
              if (document.visibilityState === 'visible') acquire();
            });
          }
        } catch (e) {}
      })();

      // --- MOTOR 4: UTILITÁRIOS DE HORÁRIOS & SUBTRAÇÃO DE 40 MINUTOS ---
      function formatDateBR(raw) {
        if (!raw) return '';
        var str = String(raw).trim();
        var m = str.match(/^(\\d{4})-(\\d{2})-(\\d{2})/);
        if (m) {
          return m[3] + '/' + m[2] + '/' + m[1];
        }
        return str;
      }

      function formatTimeOnly(raw) {
        if (!raw) return '';
        var str = String(raw).trim();
        var m = str.match(/(?:\\s|T)(\\d{2}):(\\d{2})/);
        if (m) return m[1] + ':' + m[2];
        var mSimple = str.match(/^(\\d{2}):(\\d{2})/);
        if (mSimple) return mSimple[1] + ':' + mSimple[2];
        return str;
      }

      /**
       * Subtrai minutos de uma data/hora no formato 'YYYY-MM-DD HH:mm' ou 'HH:mm'
       * Regra de negócio: a saída para o sepultamento é sempre ~40 minutos antes!
       */
      function subtractMinutesFromTime(raw, minsToSub) {
        if (!raw) return '';
        var str = String(raw).trim();
        var mFull = str.match(/(\\d{4})[-/](\\d{2})[-/](\\d{2})[\\sT](\\d{2}):(\\d{2})/);
        if (mFull) {
          var y = parseInt(mFull[1], 10);
          var mo = parseInt(mFull[2], 10) - 1;
          var day = parseInt(mFull[3], 10);
          var h = parseInt(mFull[4], 10);
          var mi = parseInt(mFull[5], 10);
          var d = new Date(y, mo, day, h, mi);
          d.setMinutes(d.getMinutes() - minsToSub);
          return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
        }
        var mTime = str.match(/(\\d{2}):(\\d{2})/);
        if (mTime) {
          var total = parseInt(mTime[1], 10) * 60 + parseInt(mTime[2], 10) - minsToSub;
          if (total < 0) total += 24 * 60;
          var resH = Math.floor(total / 60) % 24;
          var resM = total % 60;
          return pad2(resH) + ':' + pad2(resM);
        }
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

      // --- MOTOR 5: APLICAÇÃO DOS DADOS NA TELA ---
      function applyData(response) {
        if (!response) return;
        var overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.style.display = 'none';

        var svc = response.services || {};
        var item = svc;

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

        // 1. Badge de Local / Sala
        var roomBadge = document.getElementById('roomBadge');
        if (roomBadge) {
          var locLabel = (item.location && item.location.name) || '';
          if (!locLabel && item.burialPlace) locLabel = item.burialPlace;
          if (!locLabel) locLabel = (svc.client && svc.client.fantasyName) || 'CERIMONIAL PAGLIARO';
          roomBadge.textContent = locLabel.toUpperCase();
        }

        // 2. Nome do Falecido
        var nameEl = document.getElementById('deceasedName');
        var name = item.deceasedName || item.name || '';
        if (nameEl) {
          if (name) {
            nameEl.textContent = name;
            if (name.length > 34) {
              nameEl.style.fontSize = 'clamp(1.9rem, 4.2vw, 3.2rem)';
            } else if (name.length > 24) {
              nameEl.style.fontSize = 'clamp(2.1rem, 5vw, 3.8rem)';
            } else {
              nameEl.style.fontSize = '';
            }
          } else {
            nameEl.textContent = 'SALA DISPONÍVEL';
          }
        }

        // 3. Datas de Vida
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

        // 4. Cálculo do Sepultamento e Saída Prevista (~40 min antes)
        var isCremation = (item.eventType === 'CREMATION');
        var burialTitle = document.getElementById('burialCardTitle');
        if (burialTitle) {
          burialTitle.textContent = isCremation ? 'CREMAÇÃO' : 'SEPULTAMENTO';
        }

        var burialTimeLabel = document.getElementById('burialTimeLabel');
        if (burialTimeLabel) {
          burialTimeLabel.textContent = isCremation ? 'Horário da Cremação:' : 'Horário do Sepultamento:';
        }

        var burialPlace = document.getElementById('burialPlaceVal');
        if (burialPlace) {
          burialPlace.textContent = item.burialPlace || (isCremation ? 'Crematório' : 'A definir');
        }

        // Horário registrado na Adiaŭ para o sepultamento/cremação
        var burialRaw = item.burialDate || item.attendanceEndDate;
        var burialTimeVal = document.getElementById('burialTimeVal');
        var departureTimeVal = document.getElementById('departureTimeVal');
        var departureBox = document.getElementById('departureBox');

        var departureTimeStr = '';

        if (item.toBeDefined || (!burialRaw && !item.burialDate)) {
          if (burialTimeVal) burialTimeVal.textContent = 'Horário a definir pela família';
          if (departureTimeVal) departureTimeVal.textContent = 'Horário a definir';
          if (departureBox) departureBox.style.opacity = '0.75';
        } else if (burialRaw) {
          var bTime = formatTimeOnly(burialRaw);
          departureTimeStr = subtractMinutesFromTime(burialRaw, 40); // Ex: 13:00 -> 12:20 | 15:00 -> 14:20

          if (burialTimeVal) {
            burialTimeVal.textContent = bTime ? ('Às ' + bTime) : 'Horário a confirmar';
          }
          if (departureTimeVal) {
            departureTimeVal.textContent = departureTimeStr ? ('Às ' + departureTimeStr) : ('Às ' + bTime);
          }
          if (departureBox) departureBox.style.opacity = '1';
        }

        // 5. Horários de Velório e Homenagens
        // O velório na sala se encerra quando o cortejo sai (exatamente no horário da saída prevista!)
        var wakeStart = formatTimeOnly(item.attendanceStartDate);
        var wakeEnd = departureTimeStr || formatTimeOnly(item.attendanceEndDate);
        var wakeSched = document.getElementById('wakeScheduleVal');

        if (wakeSched) {
          if (wakeStart && wakeEnd) {
            wakeSched.textContent = wakeStart + ' às ' + wakeEnd;
          } else if (wakeEnd) {
            wakeSched.textContent = 'Até às ' + wakeEnd;
          } else if (wakeStart) {
            wakeSched.textContent = 'A partir das ' + wakeStart;
          } else {
            wakeSched.textContent = 'Horário em andamento';
          }
        }

        // Status do velório
        var statusBadge = document.getElementById('wakeStatusBadge');
        var statusText = document.getElementById('wakeStatusText');
        var endForStatus = item.attendanceEndDate || burialRaw;
        if (endForStatus) {
          var endTimestamp = new Date(endForStatus.replace(' ', 'T') + ':00-03:00').getTime();
          if (!isNaN(endTimestamp) && Date.now() > endTimestamp) {
            if (statusBadge) {
              statusBadge.style.borderColor = 'rgba(148, 163, 184, 0.3)';
              statusBadge.style.color = '#94a3b8';
              statusBadge.style.background = 'rgba(148, 163, 184, 0.08)';
            }
            if (statusText) statusText.textContent = 'ENCERRADO';
          } else {
            if (statusBadge) {
              statusBadge.style.borderColor = 'rgba(197, 160, 89, 0.28)';
              statusBadge.style.color = 'var(--gold-champagne)';
              statusBadge.style.background = 'rgba(197, 160, 89, 0.08)';
            }
            if (statusText) statusText.textContent = 'EM ANDAMENTO';
          }
        }

        // Local do velório
        var wakeLoc = document.getElementById('wakeLocationVal');
        if (wakeLoc) {
          var locName = (item.location && item.location.name) || 'Pagliaro Serviços Sociais';
          wakeLoc.textContent = locName;
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
      try {
        if (INITIAL_DATA && !INITIAL_DATA.pending) {
          applyData(INITIAL_DATA);
        } else {
          var overlay = document.getElementById('loadingOverlay');
          if (overlay) overlay.style.display = 'flex';
          pollData(true);
        }
      } catch (e) {
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
