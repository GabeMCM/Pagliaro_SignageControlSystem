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

class YoutubeService {
  private ytdl: Ytdl;
  private streamCache = new Map<string, StreamCacheEntry>();

  constructor() {
    this.ytdl = new Ytdl();
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
   * Pesquisa vídeos no YouTube
   */
  public async search(query: string, limit = 15): Promise<YoutubeTrack[]> {
    if (!query || !query.trim()) return [];
    try {
      const searchRes: any = await this.ytdl.search(query.trim(), { limit });
      if (!Array.isArray(searchRes)) return [];

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
    } catch (err) {
      console.error("[YoutubeService] Erro na busca:", err);
      throw err;
    }
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
      const pl: any = await this.ytdl.getPlaylist(playlistId);
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

      return {
        id: pl.id || playlistId,
        title: pl.title || "Playlist do YouTube",
        videoCount: videos.length,
        videos,
      };
    } catch (err: any) {
      console.error("[YoutubeService] Erro ao carregar playlist:", err);
      throw new Error(err.message || "Não foi possível carregar a playlist do YouTube.");
    }
  }

  /**
   * Obtém informações de um único vídeo
   */
  public async getVideo(videoUrlOrId: string): Promise<YoutubeTrack> {
    const videoId = this.extractVideoId(videoUrlOrId);
    if (!videoId) {
      throw new Error("URL ou ID de vídeo do YouTube inválido.");
    }

    try {
      const info = await this.ytdl.getInfo(videoId);
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
      console.error("[YoutubeService] Erro ao obter vídeo:", err);
      throw new Error(err.message || "Não foi possível obter informações do vídeo.");
    }
  }

  /**
   * Obtém a URL do stream direto de áudio AAC com cache em memória
   */
  public async getAudioStreamUrl(videoId: string, bypassCache = false): Promise<{ url: string; mimeType: string }> {
    const now = Date.now();
    const cached = this.streamCache.get(videoId);

    if (!bypassCache && cached && cached.expiresAt > now) {
      return { url: cached.url, mimeType: cached.mimeType };
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
    // Prioriza itag 140 (AAC 128k, áudio universal HTML5) ou qualquer formato apenas de áudio
    const format =
      info.formats.find((f: any) => f.itag === 140) ||
      info.formats.find((f: any) => f.hasAudio && !f.hasVideo) ||
      info.formats.find((f: any) => f.hasAudio);

    if (!format || !format.url) {
      throw new Error("Nenhum formato de áudio disponível para este vídeo.");
    }

    const mimeType = format.mimeType || "audio/mp4";
    const durationSeconds = Number(info.videoDetails.lengthSeconds) || 0;

    // Cache por 3 horas (URLs do Google expiram em ~6h)
    this.streamCache.set(videoId, {
      url: format.url,
      mimeType,
      durationSeconds,
      expiresAt: now + 3 * 60 * 60 * 1000,
    });

    return { url: format.url, mimeType };
  }

  public invalidateCache(videoId: string) {
    this.streamCache.delete(videoId);
  }
}

export const youtubeService = new YoutubeService();
