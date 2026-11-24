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

/**
 * Config padrão sem hash — será preenchida ao vivo via /api/adiau/config
 * Para não expor credenciais no código-fonte.
 */
export const DEFAULT_ADIAU_CONFIG: AdiauConfig = {
  homenagemBaseUrl: "",
  informacaoBaseUrl: "",
  screenNames: ["Flores"],
  selectedScreenName: "Flores",
};

/** Cache em memória da configuração vinda do servidor */
let _serverAdiauConfig: AdiauConfig | null = null;

/**
 * Busca o hash e URLs da Adiaŭ do backend (que lê do .env).
 * Resultado é cacheado em memória para evitar múltiplas chamadas.
 */
export async function fetchAdiauServerConfig(): Promise<AdiauConfig> {
  if (_serverAdiauConfig) return _serverAdiauConfig;
  try {
    const res = await fetch("/api/adiau/config");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.configured && data.homenagemBaseUrl) {
      _serverAdiauConfig = {
        homenagemBaseUrl: data.homenagemBaseUrl,
        informacaoBaseUrl: data.informacaoBaseUrl,
        screenNames: [data.screenName || "Flores"],
        selectedScreenName: data.screenName || "Flores",
      };
      return _serverAdiauConfig;
    }
  } catch (_e) {
    console.warn("[Adiaŭ] Não foi possível carregar config do servidor:", _e);
  }
  return DEFAULT_ADIAU_CONFIG;
}

/** Invalida o cache (use após salvar nova configuração de hash) */
export function invalidateAdiauServerConfig(): void {
  _serverAdiauConfig = null;
}

const STORAGE_KEY = "pagliaro_adiau_config_v1";

export function getAdiauConfig(): AdiauConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.homenagemBaseUrl && parsed.homenagemBaseUrl.includes("hash=")) {
        return {
          homenagemBaseUrl: parsed.homenagemBaseUrl,
          informacaoBaseUrl: parsed.informacaoBaseUrl || DEFAULT_ADIAU_CONFIG.informacaoBaseUrl,
          screenNames:
            Array.isArray(parsed.screenNames) && parsed.screenNames.length > 0
              ? parsed.screenNames
              : DEFAULT_ADIAU_CONFIG.screenNames,
          selectedScreenName: parsed.selectedScreenName || DEFAULT_ADIAU_CONFIG.selectedScreenName,
        };
      }
    }
    if (_serverAdiauConfig && _serverAdiauConfig.homenagemBaseUrl) {
      return _serverAdiauConfig;
    }
    return DEFAULT_ADIAU_CONFIG;
  } catch (_e) {
    return _serverAdiauConfig || DEFAULT_ADIAU_CONFIG;
  }
}

// Inicializa a configuração do servidor imediatamente em segundo plano
if (typeof window !== "undefined") {
  fetchAdiauServerConfig().then((cfg) => {
    if (cfg && cfg.homenagemBaseUrl) {
      const current = localStorage.getItem(STORAGE_KEY);
      if (!current || !current.includes("hash=")) {
        saveAdiauConfig(cfg);
      }
    }
  }).catch(() => {});
}

export function saveAdiauConfig(config: AdiauConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    invalidateAdiauServerConfig(); // limpa cache ao salvar nova config
  } catch (e) {
    console.error("Erro ao salvar configurações do Adiaŭ:", e);
  }
}

/**
 * Carrega a config com fallback: localStorage → servidor → vazio.
 * Use este em componentes React para garantir que o hash vem do .env do servidor.
 */
export async function getAdiauConfigWithServerFallback(): Promise<AdiauConfig> {
  const local = getAdiauConfig();
  if (local.homenagemBaseUrl && local.homenagemBaseUrl.includes("hash=")) {
    return local;
  }
  return fetchAdiauServerConfig();
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
      hash: mHash ? decodeURIComponent(mHash[1]) : "",
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
  let baseUrl = type === "homenagem" ? config.homenagemBaseUrl : config.informacaoBaseUrl;
  let parsed = parseBaseAdiauUrl(baseUrl);
  let hash = parsed.hash;

  // 1. Fallback: se o config passado não tiver hash, busca automaticamente do backend
  if (!hash) {
    const serverCfg = await fetchAdiauServerConfig();
    if (serverCfg && serverCfg.homenagemBaseUrl) {
      baseUrl = type === "homenagem" ? serverCfg.homenagemBaseUrl : serverCfg.informacaoBaseUrl;
      parsed = parseBaseAdiauUrl(baseUrl);
      hash = parsed.hash;
      try {
        saveAdiauConfig(serverCfg);
      } catch (_e) {}
    }
  }

  // 2. Se mesmo assim não houver hash, retorna vazio de forma graciosa sem quebrar a tela
  if (!hash) {
    console.warn("[Adiau] Hash da Adiau não configurado no servidor (.env) ou no cliente.");
    return { attendances: [], client: null, clientLogo: null };
  }

  const screenName = overrideScreenName || config.selectedScreenName || parsed.screenName || "Flores";

  // Endpoints PHP da Adiaŭ (suportam CORS livre *)
  const endpoint =
    type === "homenagem"
      ? `https://www.adiau.com.br/v2/messages/messages-v2.php?action=getAttendances&hashcode=${encodeURIComponent(hash)}&screenName=${encodeURIComponent(screenName)}`
      : `https://www.adiau.com.br/v2/information/information-v2.php?action=getAttendances&hashcode=${encodeURIComponent(hash)}&screenName=${encodeURIComponent(screenName)}`;

  try {
    const res = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      console.warn(`[Adiau] Servidor Adiaŭ retornou erro HTTP ${res.status}`);
      return { attendances: [], client: null, clientLogo: null };
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
  } catch (err: any) {
    console.error("[Adiau] Erro ao buscar dados da Adiau:", err);
    return { attendances: [], client: null, clientLogo: null };
  }
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

/**
 * Converte data/hora da Adiaŭ (ex: "2026-11-11 17:00" ou "2026-11-11 17:00:00")
 * em timestamp UTC considerando fuso de Brasília (-03:00)
 */
export function parseAdiauEndTimestamp(dateStr?: string | null): number | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const clean = dateStr.trim();
  const m = clean.match(/^(\d{4})-(\d{2})-(\d{2})[\sT](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const [, y, mo, d, h, mi, s] = m;
    const sec = s || "00";
    const iso = `${y}-${mo}-${d}T${h}:${mi}:${sec}-03:00`;
    const ts = new Date(iso).getTime();
    if (!isNaN(ts)) return ts;
  }
  const fallback = new Date(clean).getTime();
  return isNaN(fallback) ? null : fallback;
}
