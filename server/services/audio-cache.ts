/**
 * Cache de Áudio em Disco (YouTube -> arquivo .m4a local)
 *
 * Por que existe:
 *  - O proxy "ao vivo" do googlevideo é instável: o Google limita velocidade de requisições
 *    longas sem Range, as URLs expiram e TVs (Silk, VIDAA, Tizen, webOS) abortam o <audio>
 *    ao menor engasgo. Resultado: "hora toca, hora não".
 *  - Aqui baixamos o áudio UMA vez, em blocos pequenos (rápido e sem throttling), salvamos em
 *    disco e servimos como arquivo estático com suporte completo a Range/206 — o formato que
 *    qualquer navegador de TV toca de forma confiável, inclusive ao recarregar a página.
 */
import { youtubeService } from "./youtube.ts";
import { db } from "./db.ts";

const CACHE_DIR = Deno.env.get("AUDIO_CACHE_DIR") || "./media/audio-cache";
const MAX_CACHE_BYTES = (Number(Deno.env.get("AUDIO_CACHE_MAX_MB")) || 4000) * 1024 * 1024;
const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB por bloco (abaixo do limite de throttling do Google)
const MAX_PARALLEL_DOWNLOADS = 2;
const FAILURE_COOLDOWN_MS = 2 * 60 * 1000;
const DOWNLOAD_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface CachedAudio {
  path: string;
  size: number;
  mimeType: string;
}

const inflight = new Map<string, Promise<CachedAudio>>();
const lastFailure = new Map<string, number>();
let activeDownloads = 0;
const waitQueue: Array<() => void> = [];

function extFor(mime: string): string {
  if (/webm/i.test(mime)) return "webm";
  if (/video\/mp4/i.test(mime)) return "mp4";
  return "m4a";
}

function mimeForExt(ext: string): string {
  if (ext === "webm") return "audio/webm";
  if (ext === "mp4") return "video/mp4";
  return "audio/mp4";
}

function isValidId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{11}$/.test(id);
}

/** Extrai o ID de vídeo do YouTube de qualquer formato usado nas playlists. */
export function extractYoutubeIdFromAny(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/\/api\/youtube\/stream\/([a-zA-Z0-9_-]{11})/);
  if (m) return m[1];
  try {
    return youtubeService.extractVideoId(s);
  } catch {
    return null;
  }
}

/** Retorna o arquivo em cache (se existir e estiver completo). */
export async function getCachedAudio(videoId: string): Promise<CachedAudio | null> {
  if (!isValidId(videoId)) return null;
  for (const ext of ["m4a", "mp4", "webm"]) {
    const path = `${CACHE_DIR}/${videoId}.${ext}`;
    try {
      const st = await Deno.stat(path);
      if (st.isFile && st.size > 1024) {
        return { path, size: st.size, mimeType: mimeForExt(ext) };
      }
    } catch {
      // não existe
    }
  }
  return null;
}

async function acquireSlot(): Promise<void> {
  if (activeDownloads < MAX_PARALLEL_DOWNLOADS) {
    activeDownloads++;
    return;
  }
  await new Promise<void>((resolve) => waitQueue.push(resolve));
  activeDownloads++;
}

function releaseSlot() {
  activeDownloads = Math.max(0, activeDownloads - 1);
  const next = waitQueue.shift();
  if (next) next();
}

async function writeAll(file: Deno.FsFile, data: Uint8Array) {
  let off = 0;
  while (off < data.length) {
    off += await file.write(data.subarray(off));
  }
}

async function downloadChunked(url: string, dest: string, knownLength: number): Promise<number> {
  const file = await Deno.open(dest, { write: true, create: true, truncate: true });
  let written = 0;
  let total = knownLength || 0;
  try {
    while (true) {
      const end = written + CHUNK_SIZE - 1;
      let buf: Uint8Array | null = null;
      let status = 0;
      let lastErr: unknown = null;

      // Até 3 tentativas por bloco
      for (let attempt = 0; attempt < 3 && !buf; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 30000);
        try {
          const res = await fetch(url, {
            headers: { "User-Agent": DOWNLOAD_UA, Range: `bytes=${written}-${end}` },
            signal: ctrl.signal,
          });
          status = res.status;
          if (status !== 200 && status !== 206) {
            await res.body?.cancel().catch(() => {});
            throw new Error(`HTTP ${status}`);
          }
          if (!total) {
            const cr = res.headers.get("content-range");
            const m = cr && cr.match(/\/(\d+)\s*$/);
            if (m) total = Number(m[1]);
          }
          buf = new Uint8Array(await res.arrayBuffer());
        } catch (e) {
          lastErr = e;
          if (status === 403 || status === 404 || status === 410) break; // URL expirada
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        } finally {
          clearTimeout(timer);
        }
      }

      if (!buf) throw lastErr || new Error("Falha ao baixar bloco de áudio");
      if (buf.length === 0) break;
      await writeAll(file, buf);
      written += buf.length;

      if (status === 200) break; // servidor ignorou Range e entregou tudo
      if (total && written >= total) break;
      if (buf.length < CHUNK_SIZE) break;
    }
  } finally {
    try {
      file.close();
    } catch {
      // já fechado
    }
  }
  if (written < 1024) throw new Error("Download de áudio vazio");
  if (total && written < total) throw new Error(`Download incompleto (${written}/${total})`);
  return written;
}

async function pruneCache() {
  try {
    const entries: Array<{ path: string; size: number; mtime: number }> = [];
    let totalSize = 0;
    for await (const e of Deno.readDir(CACHE_DIR)) {
      if (!e.isFile) continue;
      const path = `${CACHE_DIR}/${e.name}`;
      try {
        const st = await Deno.stat(path);
        // Remove temporários órfãos com mais de 1h
        if (e.name.endsWith(".part")) {
          if (Date.now() - (st.mtime?.getTime() || 0) > 3600_000) await Deno.remove(path).catch(() => {});
          continue;
        }
        entries.push({ path, size: st.size, mtime: st.mtime?.getTime() || 0 });
        totalSize += st.size;
      } catch {
        // ignora
      }
    }
    if (totalSize <= MAX_CACHE_BYTES) return;
    entries.sort((a, b) => a.mtime - b.mtime);
    for (const e of entries) {
      if (totalSize <= MAX_CACHE_BYTES * 0.85) break;
      await Deno.remove(e.path).catch(() => {});
      totalSize -= e.size;
    }
  } catch {
    // diretório inexistente
  }
}

/**
 * Garante que o áudio do vídeo esteja em disco. Deduplica downloads simultâneos.
 */
export function ensureAudioCached(videoId: string): Promise<CachedAudio> {
  if (!isValidId(videoId)) return Promise.reject(new Error("ID inválido"));
  const existing = inflight.get(videoId);
  if (existing) return existing;

  const p = (async (): Promise<CachedAudio> => {
    const hit = await getCachedAudio(videoId);
    if (hit) return hit;

    const failedAt = lastFailure.get(videoId) || 0;
    if (Date.now() - failedAt < FAILURE_COOLDOWN_MS) {
      throw new Error("Falha recente ao baixar este áudio (aguardando nova tentativa)");
    }

    await Deno.mkdir(CACHE_DIR, { recursive: true }).catch(() => {});
    await acquireSlot();
    try {
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const tmp = `${CACHE_DIR}/${videoId}.${Date.now()}.part`;
        try {
          const info = await youtubeService.getAudioStreamUrl(videoId, attempt > 0);
          const ext = extFor(info.mimeType);
          const finalPath = `${CACHE_DIR}/${videoId}.${ext}`;
          const started = Date.now();
          const size = await downloadChunked(info.url, tmp, info.contentLength);
          await Deno.rename(tmp, finalPath);
          console.log(
            `[AudioCache] ✔ ${videoId} salvo (${(size / 1024 / 1024).toFixed(1)} MB em ${Date.now() - started}ms)`
          );
          lastFailure.delete(videoId);
          pruneCache();
          return { path: finalPath, size, mimeType: mimeForExt(ext) };
        } catch (e) {
          lastErr = e;
          youtubeService.invalidateCache(videoId);
          await Deno.remove(tmp).catch(() => {});
          console.warn(`[AudioCache] Tentativa ${attempt + 1} falhou para ${videoId}: ${(e as Error)?.message}`);
        }
      }
      lastFailure.set(videoId, Date.now());
      throw lastErr || new Error("Falha ao baixar áudio");
    } finally {
      releaseSlot();
    }
  })();

  inflight.set(videoId, p);
  p.catch(() => {}).finally(() => inflight.delete(videoId));
  return p;
}

/** Dispara download em segundo plano (sem aguardar). */
export function prefetchAudio(videoId: string | null | undefined) {
  if (!videoId || !isValidId(videoId)) return;
  ensureAudioCached(videoId).catch(() => {});
}

/**
 * Pré-baixa a faixa atual e as próximas da sala (chamado a cada mudança de estado).
 */
export async function prefetchRoomAudio(roomState: any, lookahead = 3) {
  try {
    if (!roomState) return;
    if (roomState.audioStreamUrl) {
      prefetchAudio(extractYoutubeIdFromAny(roomState.audioStreamUrl));
      return;
    }
    if (!roomState.audioPlaylist) return;
    const playlists = await db.getPlaylists();
    const pl = playlists.find((p: any) => p && p.id === roomState.audioPlaylist);
    const items: any[] = Array.isArray(pl?.items) ? pl.items : [];
    if (items.length === 0) return;
    const start = Math.max(0, Number(roomState.currentAudioIndex) || 0);
    for (let i = 0; i < Math.min(lookahead, items.length); i++) {
      const item = items[(start + i) % items.length];
      const raw = typeof item === "string" ? item : item?.url;
      prefetchAudio(extractYoutubeIdFromAny(raw));
    }
  } catch (e) {
    console.warn("[AudioCache] Erro no pré-download da sala:", (e as Error)?.message);
  }
}

/** Corpo de resposta que lê apenas [start, start+length) do arquivo. */
function fileRangeStream(file: Deno.FsFile, length: number): ReadableStream<Uint8Array> {
  let remaining = length;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    try {
      file.close();
    } catch {
      // já fechado
    }
  };
  return new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      try {
        if (remaining <= 0) {
          close();
          ctrl.close();
          return;
        }
        const buf = new Uint8Array(Math.min(64 * 1024, remaining));
        const n = await file.read(buf);
        if (n === null || n === 0) {
          close();
          ctrl.close();
          return;
        }
        remaining -= n;
        ctrl.enqueue(buf.subarray(0, n));
      } catch (e) {
        close();
        ctrl.error(e);
      }
    },
    cancel() {
      close();
    },
  });
}

/** Serve o arquivo em cache com suporte completo a Range (206) e HEAD. */
export async function serveCachedAudio(
  method: string,
  rangeHeader: string | undefined,
  cached: CachedAudio
): Promise<Response> {
  const size = cached.size;
  const headers = new Headers({
    "Content-Type": cached.mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=86400",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, User-Agent, Content-Type",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
  });

  let start = 0;
  let end = size - 1;
  let status = 200;

  if (rangeHeader) {
    const m = /bytes=(\d*)-(\d*)/i.exec(rangeHeader);
    if (m) {
      if (m[1] === "" && m[2] !== "") {
        // sufixo: últimos N bytes
        const n = Number(m[2]);
        start = Math.max(0, size - n);
      } else {
        start = Number(m[1] || 0);
        if (m[2] !== "") end = Math.min(Number(m[2]), size - 1);
      }
      if (isNaN(start) || isNaN(end) || start > end || start >= size) {
        headers.set("Content-Range", `bytes */${size}`);
        return new Response(null, { status: 416, headers });
      }
      status = 206;
      headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    }
  }

  const length = end - start + 1;
  headers.set("Content-Length", String(length));

  if (method === "HEAD") {
    return new Response(null, { status, headers });
  }

  const file = await Deno.open(cached.path, { read: true });
  if (start > 0) await file.seek(start, Deno.SeekMode.Start);
  return new Response(fileRangeStream(file, length), { status, headers });
}

/** Status resumido para diagnóstico. */
export function getAudioCacheStatus() {
  return {
    dir: CACHE_DIR,
    activeDownloads,
    queued: waitQueue.length,
    inflight: Array.from(inflight.keys()),
  };
}

// Limpeza inicial
pruneCache();
