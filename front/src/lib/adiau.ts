/**
 * Módulo de Integração com Adiaŭ (Homenagens & Informações)
 * Suporte a captura de cerimônias ativas via API pública da Adiaŭ (CORS habilitado)
 * e geração automática de URLs para o Signage Player.
 */

export interface AdiauAttendance {
  id: number | string;
  deceasedName: string;
  attendanceStartDate?: string;
  attendanceEndDate?: string;
  burialPlace?: string;
  burialDate?: string;
  location?: {
    id?: number | null;
    name?: string;
    city?: { code?: number; name?: string };
  };
  eventType?: string;
  attendanceType?: string;
  toBeDefined?: boolean;
}

export interface AdiauClientInfo {
  id?: number | string;
  model?: string;
  fantasyName?: string;
  socialReason?: string;
  timeFormat?: string;
  logoUrl?: string;
}

export interface AdiauConfig {
  homenagemBaseUrl: string;
  informacaoBaseUrl: string;
  screenNames: string[];
  selectedScreenName: string;
}

export const DEFAULT_ADIAU_CONFIG: AdiauConfig = {
  homenagemBaseUrl:
    "https://www.adiau.com.br/v2/messages/?hash=pLwCBfBbbtbxAB3SON1JldHP&code=pt-br&screenName=Flores",
  informacaoBaseUrl:
    "https://www.adiau.com.br/v2/information/?hash=pLwCBfBbbtbxAB3SON1JldHP&code=pt-br&screenName=Flores",
  screenNames: ["Flores"],
  selectedScreenName: "Flores",
};

const STORAGE_KEY = "pagliaro_adiau_config_v1";

export function getAdiauConfig(): AdiauConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ADIAU_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      homenagemBaseUrl: parsed.homenagemBaseUrl || DEFAULT_ADIAU_CONFIG.homenagemBaseUrl,
      informacaoBaseUrl: parsed.informacaoBaseUrl || DEFAULT_ADIAU_CONFIG.informacaoBaseUrl,
      screenNames:
        Array.isArray(parsed.screenNames) && parsed.screenNames.length > 0
          ? parsed.screenNames
          : DEFAULT_ADIAU_CONFIG.screenNames,
      selectedScreenName: parsed.selectedScreenName || DEFAULT_ADIAU_CONFIG.selectedScreenName,
    };
  } catch (_e) {
    return DEFAULT_ADIAU_CONFIG;
  }
}

export function saveAdiauConfig(config: AdiauConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error("Erro ao salvar configurações do Adiaŭ:", e);
  }
}

/**
 * Extrai os parâmetros base da URL fornecida (hash, code, screenName)
 */
export function parseBaseAdiauUrl(url: string): {
  hash: string;
  code: string;
  screenName: string;
} {
  const clean = (url || "").trim();
  try {
    const u = new URL(clean);
    const hash = u.searchParams.get("hash") || u.searchParams.get("hashcode") || "";
    const code = u.searchParams.get("code") || "pt-br";
    const screenName = u.searchParams.get("screenName") || "Flores";
    return { hash, code, screenName };
  } catch {
    const mHash = clean.match(/[?&]hash(?:code)?=([^&#]+)/i);
    const mCode = clean.match(/[?&]code=([^&#]+)/i);
    const mScreen = clean.match(/[?&]screenName=([^&#]+)/i);
    return {
      hash: mHash ? decodeURIComponent(mHash[1]) : "pLwCBfBbbtbxAB3SON1JldHP",
      code: mCode ? decodeURIComponent(mCode[1]) : "pt-br",
      screenName: mScreen ? decodeURIComponent(mScreen[1]) : "Flores",
    };
  }
}

/**
 * Consulta a API da Adiaŭ para listar cerimônias ativas
 */
export async function fetchAdiauAttendances(
  type: "homenagem" | "informacao",
  config: AdiauConfig,
  overrideScreenName?: string
): Promise<{
  attendances: AdiauAttendance[];
  client: AdiauClientInfo | null;
  clientLogo?: string | null;
}> {
  const baseUrl = type === "homenagem" ? config.homenagemBaseUrl : config.informacaoBaseUrl;
  const parsed = parseBaseAdiauUrl(baseUrl);
  const screenName = overrideScreenName || config.selectedScreenName || parsed.screenName;
  const hash = parsed.hash;

  if (!hash) {
    throw new Error("Hash do Adiaŭ não encontrado na URL configurada.");
  }

  // Endpoints PHP da Adiaŭ (suportam CORS livre *)
  const endpoint =
    type === "homenagem"
      ? `https://www.adiau.com.br/v2/messages/messages-v2.php?action=getAttendances&hashcode=${encodeURIComponent(hash)}&screenName=${encodeURIComponent(screenName)}`
      : `https://www.adiau.com.br/v2/information/information-v2.php?action=getAttendances&hashcode=${encodeURIComponent(hash)}&screenName=${encodeURIComponent(screenName)}`;

  const res = await fetch(endpoint, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Servidor Adiaŭ retornou erro HTTP ${res.status}`);
  }

  const data = await res.json();
  if (!data || data.status !== true || !data.services) {
    return { attendances: [], client: null, clientLogo: null };
  }

  const svc = data.services;
  const rawList = svc.attendances || svc.data || svc.transmissions || svc.items || [];
  const attendances: AdiauAttendance[] = Array.isArray(rawList) ? rawList : [];
  const client: AdiauClientInfo | null = svc.client || null;
  const clientLogo: string | null = data.clientLogo || svc.logoUrl || null;

  return { attendances, client, clientLogo };
}

/**
 * Constrói a URL final da cerimônia para exibição no player
 */
export function buildAdiauTransmissionUrl(
  type: "homenagem" | "informacao",
  config: AdiauConfig,
  attendance: AdiauAttendance,
  client?: AdiauClientInfo | null,
  overrideScreenName?: string
): string {
  const baseUrl = type === "homenagem" ? config.homenagemBaseUrl : config.informacaoBaseUrl;
  const parsed = parseBaseAdiauUrl(baseUrl);
  const screenName = overrideScreenName || config.selectedScreenName || parsed.screenName;
  const hash = parsed.hash;
  const code = parsed.code || "pt-br";
  const tid = String(attendance.id);
  const model = client?.model || "SCROLL";
  const clientId = client?.id ? String(client.id) : "5052";

  if (type === "homenagem") {
    const parts = [
      `hash=${encodeURIComponent(hash)}`,
      `transmission=${encodeURIComponent(tid)}`,
      `code=${encodeURIComponent(code)}`,
      `screenName=${encodeURIComponent(screenName)}`,
      `clientModel=${encodeURIComponent(model)}`,
      `clientId=${encodeURIComponent(clientId)}`,
    ];
    return `https://www.adiau.com.br/v2/messages/?${parts.join("&")}`;
  } else {
    const parts = [
      `hash=${encodeURIComponent(hash)}`,
      `transmission=${encodeURIComponent(tid)}`,
      `infoCode=${encodeURIComponent(clientId)}`,
      `code=${encodeURIComponent(code)}`,
      `screenName=${encodeURIComponent(screenName)}`,
      `clientModel=${encodeURIComponent(model)}`,
    ];
    return `https://www.adiau.com.br/v2/information/?${parts.join("&")}`;
  }
}

/**
 * Formata datas ISO (YYYY-MM-DD HH:MM) para exibição amigável em PT-BR
 */
export function formatAdiauDateTime(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const parts = dateStr.trim().split(" ");
    if (parts.length === 2) {
      const [ymd, hm] = parts;
      const [year, month, day] = ymd.split("-");
      if (year && month && day) {
        return `${day}/${month} às ${hm}`;
      }
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      return `${day}/${month} às ${hours}:${minutes}`;
    }
  } catch (_e) {}
  return dateStr;
}

export function formatAdiauSchedule(start?: string, end?: string): string {
  if (!start && !end) return "";
  const fStart = formatAdiauDateTime(start);
  const fEnd = formatAdiauDateTime(end);
  if (fStart && fEnd) return `${fStart} até ${fEnd}`;
  return fStart || fEnd;
}
