import { db } from "./db.ts";

export interface DropboxConfig {
  accessToken?: string;
  refreshToken?: string;
  appKey?: string;
  appSecret?: string;
  musicFolder?: string;
  updatedAt?: number;
}

export interface DropboxTrack {
  id: string;
  name: string;
  title: string;
  path: string;
  folder: string;
  size: number;
  sizeFormatted: string;
  duration?: number;
  durationFormatted?: string;
  streamUrl: string;
  extension: string;
}

export interface DropboxStatus {
  configured: boolean;
  folder: string;
  accountName?: string;
  email?: string;
  totalTracks?: number;
  error?: string;
  hasRefreshToken?: boolean;
}

const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".m4a",
  ".wav",
  ".aac",
  ".flac",
  ".ogg",
  ".wma",
  ".opus",
]);

function normalizeDropboxPath(p?: string): string {
  if (!p) return "";
  let clean = p.trim();
  if (clean === "/" || clean === "") return "";
  if (!clean.startsWith("/")) clean = "/" + clean;
  if (clean.endsWith("/")) clean = clean.slice(0, -1);
  return clean;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function cleanTrackTitle(filename: string): string {
  let title = filename.replace(/\.[a-zA-Z0-9]+$/, "").trim();
  const withoutPrefix = title.replace(/^(\d{1,3}[\s._-]+)+/, "").trim();
  return withoutPrefix || title;
}

class DropboxService {
  private activeAccessToken: string | null = null;
  private tokenExpiresAt = 0;

  private cachedTracks: DropboxTrack[] | null = null;
  private cachedTracksAt = 0;
  private cachedTracksFolder = "";
  private tracksCacheTtlMs = 10 * 60 * 1000; // 10 minutos

  private linkCache = new Map<string, { url: string; expiresAt: number }>();

  /**
   * Obtém a configuração unificada do Dropbox (Variáveis de Ambiente têm prioridade máxima sobre o DB)
   */
  async getConfig(): Promise<DropboxConfig> {
    const fromDb = (await db.getSetting<DropboxConfig>("dropbox_config", {})) || {};

    const refreshToken =
      Deno.env.get("DROPBOX_REFRESH_TOKEN")?.trim() ||
      fromDb.refreshToken?.trim() ||
      "";
    const appKey =
      Deno.env.get("DROPBOX_APP_KEY")?.trim() ||
      fromDb.appKey?.trim() ||
      "";
    const appSecret =
      Deno.env.get("DROPBOX_APP_SECRET")?.trim() ||
      fromDb.appSecret?.trim() ||
      "";
    const accessToken =
      Deno.env.get("DROPBOX_ACCESS_TOKEN")?.trim() ||
      fromDb.accessToken?.trim() ||
      "";
    const musicFolder =
      Deno.env.get("DROPBOX_MUSIC_FOLDER")?.trim() ||
      (fromDb.musicFolder !== undefined ? fromDb.musicFolder.trim() : "") ||
      "/Músicas";

    return {
      accessToken,
      refreshToken,
      appKey,
      appSecret,
      musicFolder: normalizeDropboxPath(musicFolder),
      updatedAt: fromDb.updatedAt,
    };
  }

  /**
   * Troca um código de autorização OAuth2 do Dropbox por um Refresh Token perpétuo
   */
  async exchangeAuthorizationCode(
    code: string,
    appKey?: string,
    appSecret?: string
  ): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
    const cfg = await this.getConfig();
    const finalKey = (appKey || cfg.appKey)?.trim();
    const finalSecret = (appSecret || cfg.appSecret)?.trim();
    if (!finalKey || !finalSecret) {
      throw new Error("App Key e App Secret são necessários para trocar o código.");
    }
    const cleanCode = code.trim();
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: cleanCode,
      client_id: finalKey,
      client_secret: finalSecret,
    });
    const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Falha ao obter refresh token (${res.status}): ${err}`);
    }
    const data = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in || 14400,
    };
  }

  /**
   * Salva a configuração no banco de dados e limpa os caches
   */
  async saveConfig(config: Partial<DropboxConfig>): Promise<boolean> {
    const current = await this.getConfig();
    const updated: DropboxConfig = {
      accessToken: config.accessToken !== undefined ? config.accessToken.trim().replace(/[\r\n\t\s]/g, "") : current.accessToken,
      refreshToken: config.refreshToken !== undefined ? config.refreshToken.trim().replace(/[\r\n\t\s]/g, "") : current.refreshToken,
      appKey: config.appKey !== undefined ? config.appKey.trim().replace(/[\r\n\t\s]/g, "") : current.appKey,
      appSecret: config.appSecret !== undefined ? config.appSecret.trim().replace(/[\r\n\t\s]/g, "") : current.appSecret,
      musicFolder:
        config.musicFolder !== undefined
          ? normalizeDropboxPath(config.musicFolder)
          : current.musicFolder,
      updatedAt: Date.now(),
    };

    const saved = await db.saveSetting("dropbox_config", updated);
    this.invalidateCache();
    return saved;
  }

  /**
   * Limpa os caches em memória
   */
  invalidateCache() {
    this.activeAccessToken = null;
    this.tokenExpiresAt = 0;
    this.cachedTracks = null;
    this.cachedTracksAt = 0;
    this.cachedTracksFolder = "";
    this.linkCache.clear();
  }

  /**
   * Obtém um token de acesso válido, renovando automaticamente se configurado
   */
  async getValidToken(): Promise<string> {
    const now = Date.now();
    if (this.activeAccessToken && this.tokenExpiresAt > now + 60 * 1000) {
      return this.activeAccessToken;
    }

    const cfg = await this.getConfig();

    // Se temos refresh token e app key / secret, renova automaticamente
    if (cfg.refreshToken && cfg.appKey && cfg.appSecret) {
      try {
        const body = new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: cfg.refreshToken,
          client_id: cfg.appKey,
          client_secret: cfg.appSecret,
        });

        const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });

        if (res.ok) {
          const data = await res.json();
          if (typeof data.access_token === "string" && data.access_token) {
            const token: string = data.access_token;
            this.activeAccessToken = token;
            const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 14400;
            this.tokenExpiresAt = now + expiresIn * 1000;
            return token;
          }
        } else {
          const errText = await res.text();
          console.warn("[Dropbox] Falha ao renovar token OAuth:", res.status, errText);
        }
      } catch (err) {
        console.error("[Dropbox] Erro de rede ao renovar token:", err);
      }
    }

    // Se possui access token estático
    if (cfg.accessToken) {
      const token: string = cfg.accessToken;
      this.activeAccessToken = token;
      // Assume validade de 2 horas caso não saibamos o tempo de expiração
      this.tokenExpiresAt = now + 2 * 3600 * 1000;
      return token;
    }

    throw new Error(
      "Dropbox não configurado. Por favor, insira o token de acesso ou refresh token nas configurações do sistema."
    );
  }

  /**
   * Verifica o status da conta Dropbox conectada
   */
  async checkStatus(): Promise<DropboxStatus> {
    const cfg = await this.getConfig();
    if (!cfg.accessToken && !cfg.refreshToken) {
      return {
        configured: false,
        folder: cfg.musicFolder || "/",
        error: "Nenhum token do Dropbox configurado.",
      };
    }

    try {
      const token = await this.getValidToken();
      const res = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const errText = await res.text();
        return {
          configured: false,
          folder: cfg.musicFolder || "/",
          hasRefreshToken: Boolean(cfg.refreshToken),
          error: `Token inválido ou expirado (${res.status}): ${errText}`,
        };
      }

      const acc = await res.json();
      return {
        configured: true,
        folder: cfg.musicFolder || "/",
        accountName: acc.name?.display_name || "Conta Dropbox",
        email: acc.email || "",
        hasRefreshToken: Boolean(cfg.refreshToken),
      };
    } catch (err: any) {
      return {
        configured: false,
        folder: cfg.musicFolder || "/",
        hasRefreshToken: Boolean(cfg.refreshToken),
        error: err.message || "Erro de conexão com o Dropbox.",
      };
    }
  }

  /**
   * Lista todas as faixas de áudio na pasta do Dropbox com cache em memória
   */
  async listTracks(folderOverride?: string, forceRefresh = false): Promise<DropboxTrack[]> {
    const cfg = await this.getConfig();
    const targetFolder =
      folderOverride !== undefined
        ? normalizeDropboxPath(folderOverride)
        : cfg.musicFolder || "";

    const now = Date.now();
    if (
      !forceRefresh &&
      this.cachedTracks &&
      this.cachedTracksFolder === targetFolder &&
      now - this.cachedTracksAt < this.tracksCacheTtlMs
    ) {
      return this.cachedTracks;
    }

    const token = await this.getValidToken();
    let entries: any[] = [];
    let hasMore = true;
    let cursor: string | null = null;

    // 1. Chamada inicial list_folder
    const initialRes = await fetch("https://api.dropboxapi.com/2/files/list_folder", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: targetFolder,
        recursive: true,
        include_media_info: true,
        limit: 2000,
      }),
    });

    if (!initialRes.ok) {
      const errText = await initialRes.text();
      throw new Error(`Erro ao listar pasta do Dropbox (${initialRes.status}): ${errText}`);
    }

    const initialData = await initialRes.json();
    entries = initialData.entries || [];
    hasMore = Boolean(initialData.has_more);
    cursor = initialData.cursor || null;

    // 2. Paginação caso existam mais de 2000 arquivos
    let pageCount = 1;
    while (hasMore && cursor && pageCount < 5) {
      pageCount++;
      const contRes = await fetch("https://api.dropboxapi.com/2/files/list_folder/continue", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cursor }),
      });

      if (!contRes.ok) break;
      const contData = await contRes.json();
      entries = entries.concat(contData.entries || []);
      hasMore = Boolean(contData.has_more);
      cursor = contData.cursor || null;
    }

    // 3. Filtra apenas arquivos de áudio
    const tracks: DropboxTrack[] = [];
    for (const entry of entries) {
      if (entry[".tag"] !== "file") continue;
      const name = entry.name || "";
      const dotIdx = name.lastIndexOf(".");
      if (dotIdx === -1) continue;
      const ext = name.slice(dotIdx).toLowerCase();
      if (!SUPPORTED_AUDIO_EXTENSIONS.has(ext)) continue;

      const pathDisplay = entry.path_display || entry.path_lower || "";
      const parts = pathDisplay.split("/").filter(Boolean);
      const parentFolder = parts.length > 1 ? parts[parts.length - 2] : "Raiz";

      let durationSec: number | undefined;
      if (entry.media_info?.metadata?.duration) {
        durationSec = Math.round(Number(entry.media_info.metadata.duration) / 1000);
      }

      tracks.push({
        id: entry.id,
        name,
        title: cleanTrackTitle(name),
        path: pathDisplay,
        folder: parentFolder,
        size: entry.size || 0,
        sizeFormatted: formatBytes(entry.size || 0),
        duration: durationSec,
        durationFormatted: durationSec ? formatSeconds(durationSec) : undefined,
        streamUrl: `/api/dropbox/stream?path=${encodeURIComponent(pathDisplay)}`,
        extension: ext.replace(".", "").toUpperCase(),
      });
    }

    // Ordena alfabeticamente por título
    tracks.sort((a, b) => a.title.localeCompare(b.title, "pt-BR", { sensitivity: "base" }));

    this.cachedTracks = tracks;
    this.cachedTracksAt = now;
    this.cachedTracksFolder = targetFolder;

    return tracks;
  }

  /**
   * Pesquisa faixas por nome, artista, título ou subpasta
   */
  async searchTracks(query: string, folder?: string): Promise<DropboxTrack[]> {
    const q = query.trim().toLowerCase();
    const allTracks = await this.listTracks(folder);

    if (!q) {
      return allTracks;
    }

    const qNormalized = q.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    return allTracks.filter((t) => {
      const titleNorm = t.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const nameNorm = t.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const folderNorm = t.folder.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

      return (
        titleNorm.includes(qNormalized) ||
        nameNorm.includes(qNormalized) ||
        folderNorm.includes(qNormalized)
      );
    });
  }

  /**
   * Obtém as subpastas encontradas dentro da pasta de músicas para filtro
   */
  async getFolders(): Promise<string[]> {
    const tracks = await this.listTracks();
    const set = new Set<string>();
    for (const t of tracks) {
      if (t.folder) set.add(t.folder);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  /**
   * Obtém ou gera um link temporário direto de streaming (válido por 4 horas no Dropbox)
   */
  async getStreamUrl(pathOrId: string): Promise<string> {
    const now = Date.now();
    const cached = this.linkCache.get(pathOrId);
    if (cached && cached.expiresAt > now + 15 * 60 * 1000) {
      return cached.url;
    }

    const token = await this.getValidToken();
    const res = await fetch("https://api.dropboxapi.com/2/files/get_temporary_link", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: pathOrId,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Falha ao obter link de streaming (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const directLink = data.link;
    if (!directLink) {
      throw new Error("Dropbox não retornou link direto para o arquivo.");
    }

    // Cacheia por 3 horas e 30 minutos (Dropbox expira em 4 horas)
    this.linkCache.set(pathOrId, {
      url: directLink,
      expiresAt: now + 3.5 * 3600 * 1000,
    });

    return directLink;
  }
}

export const dropboxService = new DropboxService();
