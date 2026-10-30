import { Ytdl, parsePlaylistId, parseVideoId } from "@distube/ytdl-core";

export interface YoutubeTrack {
  id: string;
  title: string;
  author?: string;
  durationSeconds: number;
  durationFormatted: string;
  thumbnailUrl?: string;
  url: string;
}

export interface YoutubePlaylistResult {
  id: string;
  title: string;
  videoCount: number;
  videos: YoutubeTrack[];
}

function formatDuration(sec: number): string {
  if (!sec || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

interface StreamCacheEntry {
  url: string;
  mimeType: string;
  durationSeconds: number;
  contentLength?: number;
  expiresAt: number;
}

// Helper de Timeout para proteger o processo do Deno de bloqueios longos
function promiseTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, ms);

    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// Fallback de Busca via raspagem de ytInitialData (resiliente em datacenters em nuvem como Render)
async function scrapeSearch(query: string, limit = 15): Promise<YoutubeTrack[]> {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query.trim())}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const match = html.match(/ytInitialData\s*=\s*({.+?});<\/script>/);
  if (!match) return [];
  const data = JSON.parse(match[1]);
  const contents =
    data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]
      ?.itemSectionRenderer?.contents || [];

  const results: YoutubeTrack[] = [];
  for (const item of contents) {
    const v = item.videoRenderer;
    if (!v || !v.videoId) continue;
    const durationText = v.lengthText?.simpleText || "";
    let durationSeconds = 0;
    if (durationText) {
      const parts = durationText.split(":").map(Number);
      if (parts.length === 2) durationSeconds = parts[0] * 60 + parts[1];
      else if (parts.length === 3) durationSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    const title = v.title?.runs?.map((r: any) => r.text).join("") || v.title?.simpleText || "Sem título";
    const author =
      v.ownerText?.runs?.map((r: any) => r.text).join("") ||
      v.shortBylineText?.runs?.map((r: any) => r.text).join("") ||
      undefined;
    const thumb = v.thumbnail?.thumbnails?.[0]?.url;

    results.push({
      id: v.videoId,
      title,
      author,
      durationSeconds,
      durationFormatted: durationText || formatDuration(durationSeconds),
      thumbnailUrl: thumb,
      url: `https://www.youtube.com/watch?v=${v.videoId}`,
    });
    if (results.length >= limit) break;
  }
  return results;
}

// Fallback de Metadados de Vídeo via oEmbed oficial do Google (nunca bloqueado em nuvem)
async function fetchOEmbed(videoId: string): Promise<YoutubeTrack> {
  const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  const res = await fetch(oembedUrl);
  if (!res.ok) throw new Error(`oEmbed HTTP ${res.status}`);
  const data = await res.json();
  return {
    id: videoId,
    title: data.title || "Vídeo do YouTube",
    author: data.author_name || undefined,
    durationSeconds: 0,
    durationFormatted: "YouTube",
    thumbnailUrl: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

// Fallback de Playlist via raspagem de ytInitialData
async function scrapePlaylist(playlistId: string): Promise<YoutubePlaylistResult> {
  const url = `https://www.youtube.com/playlist?list=${playlistId}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const match = html.match(/ytInitialData\s*=\s*({.+?});<\/script>/);
  if (!match) throw new Error("Não foi possível carregar dados da playlist.");
  const data = JSON.parse(match[1]);
  const plTitle = data.metadata?.playlistMetadataRenderer?.title || "Playlist do YouTube";
  const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
  const contents =
    tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents?.[0]
      ?.playlistVideoListRenderer?.contents || [];

  const videos: YoutubeTrack[] = [];
  for (const item of contents) {
    const v = item.playlistVideoRenderer;
    if (!v || !v.videoId) continue;
    const durSec = Number(v.lengthSeconds) || 0;
    const title = v.title?.runs?.map((r: any) => r.text).join("") || v.title?.simpleText || "Sem título";
    const author = v.shortBylineText?.runs?.map((r: any) => r.text).join("") || undefined;
    const thumb = v.thumbnail?.thumbnails?.[0]?.url;

    videos.push({
      id: v.videoId,
      title,
      author,
      durationSeconds: durSec,
      durationFormatted: formatDuration(durSec),
      thumbnailUrl: thumb,
      url: `https://www.youtube.com/watch?v=${v.videoId}`,
    });
  }

  return {
    id: playlistId,
    title: plTitle,
    videoCount: videos.length,
    videos,
  };
}

class YoutubeService {
  private ytdl: Ytdl;
  private streamCache = new Map<string, StreamCacheEntry>();

  constructor() {
    const cookie = Deno.env.get("YOUTUBE_COOKIE");
    if (cookie) {
      try {
        this.ytdl = new Ytdl({ cookie });
        console.log("[YoutubeService] Ytdl inicializado com YOUTUBE_COOKIE fornecido");
      } catch (e: any) {
        console.warn("[YoutubeService] Falha ao inicializar com cookie, usando padrão:", e?.message);
        this.ytdl = new Ytdl();
      }
    } else {
      this.ytdl = new Ytdl();
    }
  }

  /**
   * Extrai ID limpo de vídeo ou URL
   */
  public extractVideoId(input: string): string | null {
    if (!input) return null;
    const clean = input.trim();
    // Suporte direto para formato interno "youtube:ID"
    if (clean.startsWith("youtube:")) {
      const id = clean.replace("youtube:", "").trim();
      return id.length === 11 ? id : null;
    }
    const parsed = parseVideoId(clean);
    if (parsed) return parsed;
    // Regex de contingência para URLs curtas / embed
    const match = clean.match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|[?&]v=)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  }

  /**
   * Extrai ID limpo de playlist ou URL
   */
  public extractPlaylistId(input: string): string | null {
    if (!input) return null;
    const clean = input.trim();
    const parsed = parsePlaylistId(clean);
    if (parsed) return parsed;
    const match = clean.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }

  /**
   * Pesquisa vídeos no YouTube (com fallback de raspagem se o datacenter for bloqueado)
   */
  public async search(query: string, limit = 15): Promise<YoutubeTrack[]> {
    if (!query || !query.trim()) return [];

    // 1. Tenta API do Ytdl
    try {
      const searchRes: any = await promiseTimeout(
        this.ytdl.search(query.trim(), { limit }),
        5000,
        "Timeout ytdl search"
      );
      if (Array.isArray(searchRes) && searchRes.length > 0) {
        return searchRes
          .filter((item: any) => item && item.id)
          .map((item: any): YoutubeTrack => {
            const durationSec = Number(item.lengthSeconds) || 0;
            return {
              id: item.id,
              title: item.title || "Sem título",
              author: item.author?.name || undefined,
              durationSeconds: durationSec,
              durationFormatted: formatDuration(durationSec),
              thumbnailUrl: item.thumbnails?.[0]?.url || undefined,
              url: `https://www.youtube.com/watch?v=${item.id}`,
            };
          });
      }
    } catch (err: any) {
      console.warn("[YoutubeService] ytdl.search indisponível em datacenter, acionando fallback de raspagem:", err?.message);
    }

    // 2. Fallback resiliente: raspagem direta de ytInitialData (nunca falha no Render)
    try {
      const scraped = await scrapeSearch(query.trim(), limit);
      if (scraped.length > 0) return scraped;
    } catch (scrapeErr: any) {
      console.error("[YoutubeService] Erro no fallback de raspagem de busca:", scrapeErr?.message);
    }

    return [];
  }

  /**
   * Obtém detalhes e lista completa de faixas de uma Playlist
   */
  public async getPlaylist(playlistUrlOrId: string): Promise<YoutubePlaylistResult> {
    const playlistId = this.extractPlaylistId(playlistUrlOrId);
    if (!playlistId) {
      throw new Error("URL ou ID de playlist do YouTube inválido.");
    }

    try {
      const pl: any = await promiseTimeout(
        this.ytdl.getPlaylist(playlistId),
        6000,
        "Timeout ytdl getPlaylist"
      );
      const rawVideos = Array.isArray(pl.videos) ? pl.videos : [];

      const videos: YoutubeTrack[] = rawVideos
        .filter((v: any) => v && v.id)
        .map((v: any): YoutubeTrack => {
          const durationSec = Number(v.lengthSeconds) || 0;
          return {
            id: v.id,
            title: v.title || "Sem título",
            author: v.author?.name || undefined,
            durationSeconds: durationSec,
            durationFormatted: formatDuration(durationSec),
            thumbnailUrl: v.thumbnails?.[0]?.url || undefined,
            url: `https://www.youtube.com/watch?v=${v.id}`,
          };
        });

      if (videos.length > 0) {
        return {
          id: pl.id || playlistId,
          title: pl.title || "Playlist do YouTube",
          videoCount: videos.length,
          videos,
        };
      }
    } catch (err: any) {
      console.warn("[YoutubeService] ytdl.getPlaylist indisponível, acionando fallback de playlist:", err?.message);
    }

    // Fallback: raspagem de playlist
    try {
      return await scrapePlaylist(playlistId);
    } catch (scrapeErr: any) {
      console.error("[YoutubeService] Erro no fallback de playlist:", scrapeErr?.message);
      throw new Error("Não foi possível carregar a playlist do YouTube.");
    }
  }

  /**
   * Obtém informações de um único vídeo (com fallback de oEmbed oficial)
   */
  public async getVideo(videoUrlOrId: string): Promise<YoutubeTrack> {
    const videoId = this.extractVideoId(videoUrlOrId);
    if (!videoId) {
      throw new Error("URL ou ID de vídeo do YouTube inválido.");
    }

    // 1. Tenta ytdl getInfo
    try {
      const info = await promiseTimeout(this.ytdl.getInfo(videoId), 4000, "Timeout ytdl getInfo");
      const details = info.videoDetails;
      const durationSec = Number(details.lengthSeconds) || 0;

      return {
        id: videoId,
        title: details.title || "Vídeo do YouTube",
        author: details.author?.name || undefined,
        durationSeconds: durationSec,
        durationFormatted: formatDuration(durationSec),
        thumbnailUrl: details.thumbnails?.[0]?.url || undefined,
        url: `https://www.youtube.com/watch?v=${videoId}`,
      };
    } catch (err: any) {
      console.warn(`[YoutubeService] ytdl.getInfo indisponível para ${videoId} (${err?.message}), acionando oEmbed`);
    }

    // 2. Fallback de alta disponibilidade: oEmbed oficial do Google (100% livre de bloqueio em datacenter)
    try {
      return await fetchOEmbed(videoId);
    } catch (oembedErr: any) {
      console.error(`[YoutubeService] Falha no fallback de oEmbed para ${videoId}:`, oembedErr?.message);
      return {
        id: videoId,
        title: `YouTube: ${videoId}`,
        durationSeconds: 0,
        durationFormatted: "YouTube",
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        url: `https://www.youtube.com/watch?v=${videoId}`,
      };
    }
  }

  /**
   * Obtém a URL do stream direto de áudio AAC com cache em memória
   */
  public async getAudioStreamUrl(
    videoId: string,
    bypassCache = false
  ): Promise<{ url: string; mimeType: string; contentLength: number; durationSeconds: number }> {
    const now = Date.now();
    const cached = this.streamCache.get(videoId);

    if (!bypassCache && cached && cached.expiresAt > now) {
      return {
        url: cached.url,
        mimeType: cached.mimeType,
        contentLength: cached.contentLength || 0,
        durationSeconds: cached.durationSeconds,
      };
    }

    let info: any;
    try {
      info = await promiseTimeout(
        this.ytdl.getInfo(videoId),
        8000,
        "Tempo limite excedido ao consultar YouTube (proteção anti-travamento do servidor)"
      );
    } catch (err: any) {
      this.streamCache.delete(videoId);
      throw new Error(err.message || "Falha ao resolver áudio do YouTube.");
    }
    // Prioriza itag 140 (AAC 128k, áudio universal HTML5 — suportado por TODAS as TVs),
    // depois qualquer áudio MP4/AAC, e só então outros formatos (WebM/Opus não toca em TVs antigas)
    const formats: any[] = Array.isArray(info.formats) ? info.formats.filter((f: any) => f && f.url) : [];
    const isMp4 = (f: any) => /audio\/mp4|mp4a/i.test(String(f.mimeType || ""));
    const format =
      formats.find((f: any) => f.itag === 140) ||
      formats.find((f: any) => f.hasAudio && !f.hasVideo && isMp4(f)) ||
      formats.find((f: any) => f.itag === 18) ||
      formats.find((f: any) => f.hasAudio && !f.hasVideo) ||
      formats.find((f: any) => f.hasAudio);

    if (!format || !format.url) {
      throw new Error("Nenhum formato de áudio disponível para este vídeo.");
    }

    const mimeType = String(format.mimeType || "audio/mp4").split(";")[0].trim() || "audio/mp4";
    const durationSeconds = Number(info.videoDetails.lengthSeconds) || 0;
    const contentLength = Number(format.contentLength) || 0;

    // Cache por 3 horas (URLs do Google expiram em ~6h)
    this.streamCache.set(videoId, {
      url: format.url,
      mimeType,
      durationSeconds,
      contentLength,
      expiresAt: now + 3 * 60 * 60 * 1000,
    });

    return { url: format.url, mimeType, contentLength, durationSeconds };
  }

  public invalidateCache(videoId: string) {
    this.streamCache.delete(videoId);
  }
}

export const youtubeService = new YoutubeService();
