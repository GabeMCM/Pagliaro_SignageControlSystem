import * as path from "jsr:@std/path";

export interface LocalTrack {
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

export interface LocalMusicStatus {
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

const MIME_MAP: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".opus": "audio/opus",
  ".wma": "audio/x-ms-wma",
};

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function cleanTrackTitle(filename: string): string {
  let title = filename.replace(/\.[a-zA-Z0-9]+$/, "").trim();
  const withoutPrefix = title.replace(/^(\d{1,3}[\s._-]+)+/, "").trim();
  return withoutPrefix || title;
}

function computeId(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `track_${Math.abs(hash).toString(36)}`;
}

export class LocalMusicService {
  private cachedTracks: LocalTrack[] | null = null;
  private cachedFolders: string[] | null = null;
  private cachedAt = 0;
  private cacheTtlMs = 10 * 60 * 1000; // 10 minutos de cache

  /**
   * Resolve o diretório raiz das músicas locais (dentro do container Docker ou no host)
   */
  public getBaseDir(): string {
    const envDir = Deno.env.get("MUSIC_LOCAL_DIR")?.trim();
    if (envDir) {
      try {
        if (Deno.statSync(envDir).isDirectory) return envDir;
      } catch {}
    }

    // 1. Caminho mapeado dentro do container Docker
    try {
      if (Deno.statSync("/app/musicas").isDirectory) {
        return "/app/musicas";
      }
    } catch {}

    // 2. Caminho padrão no host Linux
    try {
      if (Deno.statSync("/home/capgestec/Músicas/signage").isDirectory) {
        return "/home/capgestec/Músicas/signage";
      }
    } catch {}

    // 3. Fallback pasta local do projeto
    try {
      if (Deno.statSync("./musicas").isDirectory) {
        return "./musicas";
      }
    } catch {}

    return "/home/capgestec/Músicas/signage";
  }

  /**
   * Status do serviço de músicas locais
   */
  public async checkStatus(): Promise<LocalMusicStatus> {
    const baseDir = this.getBaseDir();
    try {
      const stat = await Deno.stat(baseDir);
      if (!stat.isDirectory) {
        return {
          configured: false,
          folder: baseDir,
          error: "O caminho especificado não é uma pasta válida.",
        };
      }

      const tracks = await this.listTracks(undefined, false);
      return {
        configured: true,
        folder: baseDir,
        accountName: "Músicas Locais (Servidor)",
        totalTracks: tracks.length,
        hasRefreshToken: true,
      };
    } catch (err: any) {
      return {
        configured: false,
        folder: baseDir,
        error: `Pasta não encontrada (${err.message || err})`,
      };
    }
  }

  /**
   * Varre recursivamente o diretório em busca de arquivos de áudio
   */
  public async listTracks(filterFolder?: string, forceRefresh = false): Promise<LocalTrack[]> {
    const now = Date.now();
    if (!forceRefresh && this.cachedTracks && now - this.cachedAt < this.cacheTtlMs) {
      return this.filterByFolder(this.cachedTracks, filterFolder);
    }

    const baseDir = this.getBaseDir();
    const tracks: LocalTrack[] = [];
    const foldersSet = new Set<string>();

    try {
      await this.scanDirectory(baseDir, "", tracks, foldersSet);
    } catch (err) {
      console.error("[LocalMusic] Erro ao varrer pasta de músicas:", err);
    }

    // Ordena as faixas alfabeticamente por título
    tracks.sort((a, b) => a.title.localeCompare(b.title, "pt-BR", { numeric: true, sensitivity: "base" }));

    this.cachedTracks = tracks;
    this.cachedFolders = Array.from(foldersSet).sort((a, b) =>
      a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" })
    );
    this.cachedAt = now;

    console.log(`[LocalMusic] Varredura concluída: ${tracks.length} faixas em ${this.cachedFolders.length} subpastas.`);
    return this.filterByFolder(tracks, filterFolder);
  }

  private filterByFolder(list: LocalTrack[], folder?: string): LocalTrack[] {
    if (!folder || !folder.trim() || folder === "/" || folder === "Todas") {
      return list;
    }
    const clean = folder.trim().toLowerCase();
    return list.filter((t) => t.folder.toLowerCase() === clean);
  }

  private async scanDirectory(
    currentDir: string,
    relativeDir: string,
    tracks: LocalTrack[],
    foldersSet: Set<string>
  ): Promise<void> {
    for await (const entry of Deno.readDir(currentDir)) {
      if (entry.name.startsWith(".")) continue; // Ignora arquivos ocultos (.DS_Store, etc.)
      const fullPath = path.join(currentDir, entry.name);
      const relPath = relativeDir ? path.join(relativeDir, entry.name) : entry.name;

      if (entry.isDirectory) {
        foldersSet.add(relPath);
        await this.scanDirectory(fullPath, relPath, tracks, foldersSet);
      } else if (entry.isFile) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_AUDIO_EXTENSIONS.has(ext)) {
          try {
            const stat = await Deno.stat(fullPath);
            const folderName = relativeDir ? relativeDir.split(path.SEPARATOR)[0] : "Raiz";
            const id = computeId(relPath);

            // Gera streamUrl suportando tanto a rota /api/music/stream quanto a retrocompatível /api/dropbox/stream
            const streamUrl = `/api/music/stream?path=${encodeURIComponent(relPath)}`;

            tracks.push({
              id,
              name: entry.name,
              title: cleanTrackTitle(entry.name),
              path: relPath,
              folder: folderName,
              size: stat.size,
              sizeFormatted: formatBytes(stat.size),
              streamUrl,
              extension: ext,
            });
          } catch (_e) {}
        }
      }
    }
  }

  /**
   * Retorna todas as subpastas da biblioteca
   */
  public async getFolders(): Promise<string[]> {
    if (!this.cachedFolders || Date.now() - this.cachedAt >= this.cacheTtlMs) {
      await this.listTracks(undefined, false);
    }
    return this.cachedFolders || [];
  }

  /**
   * Busca faixas por texto (nome ou pasta)
   */
  public async searchTracks(query: string, folder?: string): Promise<LocalTrack[]> {
    const all = await this.listTracks(folder, false);
    const q = query.trim().toLowerCase();
    if (!q) return all;

    return all.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.folder.toLowerCase().includes(q)
    );
  }

  /**
   * Streaming de arquivo local de áudio com suporte completo a Range HTTP 206
   */
  public async proxyStream(filePathOrRel: string, rangeHeader?: string | null): Promise<Response> {
    const baseDir = this.getBaseDir();
    const cleanRel = decodeURIComponent(filePathOrRel).replace(/^(\.\.[\/\\])+/, "").replace(/^\/+/, "");
    const fullPath = path.resolve(baseDir, cleanRel);

    // Proteção de path traversal (garante que o arquivo está estritamente dentro da pasta de músicas)
    if (!fullPath.startsWith(path.resolve(baseDir))) {
      return new Response("Acesso negado", { status: 403 });
    }

    let stat: Deno.FileInfo;
    try {
      stat = await Deno.stat(fullPath);
      if (!stat.isFile) {
        return new Response("Arquivo de áudio não encontrado", { status: 404 });
      }
    } catch {
      return new Response("Arquivo de áudio não encontrado no disco", { status: 404 });
    }

    const fileSize = stat.size;
    const ext = path.extname(fullPath).toLowerCase();
    const contentType = MIME_MAP[ext] || "audio/mpeg";

    // Se a TV/Navegador não enviou Range, entrega o arquivo completo
    if (!rangeHeader) {
      const file = await Deno.open(fullPath, { read: true });
      return new Response(file.readable, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(fileSize),
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=86400",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Processamento do cabeçalho Range (ex: "bytes=1048576-" ou "bytes=0-1024")
    const matches = rangeHeader.match(/bytes=(\d+)-(\d+)?/);
    if (!matches) {
      return new Response("Range Inválido", {
        status: 416,
        headers: { "Content-Range": `bytes */${fileSize}` },
      });
    }

    const start = parseInt(matches[1], 10);
    const end = matches[2] ? parseInt(matches[2], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize || start > end) {
      return new Response("Range Requisitado Não Atendível", {
        status: 416,
        headers: { "Content-Range": `bytes */${fileSize}` },
      });
    }

    const chunkSize = end - start + 1;
    const file = await Deno.open(fullPath, { read: true });
    await file.seek(start, Deno.SeekMode.Start);

    let bytesRemaining = chunkSize;
    const limitedStream = file.readable.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          if (bytesRemaining <= 0) {
            controller.terminate();
            return;
          }
          if (chunk.length <= bytesRemaining) {
            bytesRemaining -= chunk.length;
            controller.enqueue(chunk);
          } else {
            controller.enqueue(chunk.subarray(0, bytesRemaining));
            bytesRemaining = 0;
            controller.terminate();
          }
        },
      })
    );

    return new Response(limitedStream, {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Content-Length": String(chunkSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}

export const localMusicService = new LocalMusicService();
