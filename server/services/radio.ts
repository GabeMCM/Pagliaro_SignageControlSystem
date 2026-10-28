/**
 * Serviço de Web Rádio:
 * 1. Proxy Universal de Streams (/api/radio/stream):
 *    - Resolve problemas de Mixed Content (rádios http:// em páginas https://)
 *    - Resolve portas bloqueadas ou certificados SSL antigos em Smart TVs (:7004, :9165, :27142, etc.)
 *    - Converte MIME types não padronizados ("audio/aacp" -> "audio/aac", "application/octet-stream" -> "audio/mpeg")
 *      que fazem navegadores de TV (Silk, VIDAA, Tizen, webOS, Safari) recusarem a reprodução
 *    - Desativa metadados ICY ("Icy-MetaData: 0") no stream para não corromper o decoder de áudio das TVs
 * 2. Resolvedor Inteligente de Links:
 *    - Extrai o stream real de arquivos .pls e .m3u
 *    - Extrai o stream real de páginas do Zeno.fm (https://zeno.fm/radio/...)
 *    - Detecta servidores Shoutcast raiz (http://ip:porta/) e adiciona "/;stream.mp3" ou "/stream" automaticamente
 * 3. Catálogo Verificado de Web Rádios Gospel 24h + Busca ao Vivo (Radio-Browser API)
 */

export interface RadioPreset {
  id: string;
  name: string;
  category: "Instrumental & Paz" | "Louvor & Adoração" | "Gospel FM 24h";
  description: string;
  url: string;
  streamUrl: string;
  codec: string;
  bitrate: number;
  country: string;
}

export const PRESET_GOSPEL_RADIOS: RadioPreset[] = [
  {
    id: "instrumental-gospel",
    name: "Rádio Instrumental Gospel 24h",
    category: "Instrumental & Paz",
    description: "Hinos e louvores suaves apenas instrumentais (ideal para velórios e homenagens)",
    url: "http://live8.livemus.com.br:27142/stream",
    streamUrl: "http://live8.livemus.com.br:27142/stream",
    codec: "AAC",
    bitrate: 64,
    country: "BR",
  },
  {
    id: "shekinah-so-louvor",
    name: "Rádio Shekinah Só Louvor 24h",
    category: "Louvor & Adoração",
    description: "Louvores e adoração contínua sem locução comercial longa",
    url: "https://player.voxpainel.com.br/proxy/7076",
    streamUrl: "https://player.voxpainel.com.br/proxy/7076",
    codec: "AAC",
    bitrate: 128,
    country: "BR",
  },
  {
    id: "doce-louvor",
    name: "Rádio Doce Louvor 24h",
    category: "Louvor & Adoração",
    description: "Seleção contínua de hinos, adoração e música cristã tranquila",
    url: "https://servidor28-2.brlogic.com:7204/live",
    streamUrl: "https://servidor28-2.brlogic.com:7204/live",
    codec: "AAC",
    bitrate: 64,
    country: "BR",
  },
  {
    id: "novas-de-paz",
    name: "Rádio Novas de Paz 24h",
    category: "Instrumental & Paz",
    description: "Louvores tradicionais e mensagens de paz em MP3 de alta compatibilidade",
    url: "https://radio.saopaulo01.com.br/8304/stream",
    streamUrl: "https://radio.saopaulo01.com.br/8304/stream",
    codec: "MP3",
    bitrate: 128,
    country: "BR",
  },
  {
    id: "melodia-fm-975",
    name: "Rádio Melodia 97.5 FM (RJ)",
    category: "Gospel FM 24h",
    description: "Programação gospel 24h de uma das maiores rádios cristãs do Brasil",
    url: "https://26573.live.streamtheworld.com/MELODIAFMAAC.aac",
    streamUrl: "https://26573.live.streamtheworld.com/MELODIAFMAAC.aac",
    codec: "AAC",
    bitrate: 64,
    country: "BR",
  },
  {
    id: "gospel-fm-24h",
    name: "Gospel FM 24h",
    category: "Gospel FM 24h",
    description: "Transmissão gospel 24h em MP3 padrão (alta estabilidade em TVs)",
    url: "https://stream3.svrdedicado.org/8070/stream",
    streamUrl: "https://stream3.svrdedicado.org/8070/stream",
    codec: "MP3",
    bitrate: 128,
    country: "BR",
  },
  {
    id: "gospel-life",
    name: "Rádio Gospel Life 24h",
    category: "Louvor & Adoração",
    description: "Louvores contemporâneos e clássicos gospel 24 horas em MP3",
    url: "https://s11.maxcast.com.br:9165/live",
    streamUrl: "https://s11.maxcast.com.br:9165/live",
    codec: "MP3",
    bitrate: 128,
    country: "BR",
  },
  {
    id: "gospel-louvores-mg",
    name: "Rádio Gospel Louvores 24h",
    category: "Louvor & Adoração",
    description: "Hinos e louvores evangélicos 24 horas no ar",
    url: "https://stm1.radioipbr.com.br:7004/live",
    streamUrl: "https://stm1.radioipbr.com.br:7004/live",
    codec: "AAC",
    bitrate: 96,
    country: "BR",
  },
  {
    id: "gospel-hits",
    name: "Rádio Gospel Hits 24h",
    category: "Gospel FM 24h",
    description: "Sucessos da música gospel nacional 24 horas",
    url: "https://webradio.bsoundradio.com.br/listen/gospelhits/live",
    streamUrl: "https://webradio.bsoundradio.com.br/listen/gospelhits/live",
    codec: "AAC",
    bitrate: 64,
    country: "BR",
  },
  {
    id: "mgt-gospel",
    name: "MGT Rádio Gospel 24h",
    category: "Gospel FM 24h",
    description: "Canal 100% música gospel 24 horas sem interrupções",
    url: "https://cast.mgtradio.net/radio/8040/aac",
    streamUrl: "https://cast.mgtradio.net/radio/8040/aac",
    codec: "AAC",
    bitrate: 64,
    country: "BR",
  },
];

const RADIO_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const resolvedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Normaliza MIME types de servidores Shoutcast/Icecast para formatos aceitos por 100% das Smart TVs.
 */
export function normalizeRadioContentType(rawType: string | null | undefined, url = ""): string {
  const ct = String(rawType || "").toLowerCase().split(";")[0].trim();
  if (ct === "audio/aacp" || ct === "audio/x-hx-aac-adts" || ct === "audio/aac") {
    return "audio/aac";
  }
  if (ct === "audio/mpeg" || ct === "audio/mp3" || ct === "audio/x-mp3" || ct === "audio/mpeg3") {
    return "audio/mpeg";
  }
  if (ct === "audio/ogg" || ct === "application/ogg") {
    return "audio/ogg";
  }
  if (/\.aac(\?|$)/i.test(url) || /\/aac(\?|$)/i.test(url)) {
    return "audio/aac";
  }
  return "audio/mpeg";
}

/**
 * Extrai a URL real de áudio caso o usuário tenha colado um arquivo .pls, .m3u,
 * página do Zeno.fm ou endereço raiz de servidor Shoutcast.
 */
export async function resolveRadioStreamUrl(rawInput: string): Promise<string> {
  let url = String(rawInput || "").trim();
  if (!url) throw new Error("URL de rádio vazia.");
  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }

  const now = Date.now();
  const cached = resolvedUrlCache.get(url);
  if (cached && cached.expiresAt > now) {
    return cached.url;
  }

  // 1. Página de estação do Zeno.fm (ex: https://zeno.fm/radio/nome-da-radio/)
  const zenoPageMatch = url.match(/^https?:\/\/(?:www\.)?zeno\.fm\/(?:[a-z]{2}\/)?radio\/([^/?#]+)/i);
  if (zenoPageMatch) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const pageRes = await fetch(url, { headers: { "User-Agent": RADIO_UA }, signal: ctrl.signal });
      clearTimeout(timer);
      const html = await pageRes.text();
      const streamMatch =
        html.match(/https?:\/\/stream\.zeno\.fm\/[a-zA-Z0-9_-]+/) ||
        html.match(/"streamUrl"\s*:\s*"(https?:\/\/[^"]+)"/);
      if (streamMatch) {
        const resolved = streamMatch[1] || streamMatch[0];
        resolvedUrlCache.set(url, { url: resolved, expiresAt: now + 3600_000 });
        return resolved;
      }
    } catch {
      // segue tentativa padrão
    }
  }

  // 2. Arquivos de playlist .pls ou .m3u
  if (/\.(pls|m3u)(\?.*)?$/i.test(url)) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(url, { headers: { "User-Agent": RADIO_UA }, signal: ctrl.signal });
      clearTimeout(timer);
      const text = await res.text();
      const lineMatch =
        text.match(/File\d+\s*=\s*(https?:\/\/[^\s\r\n]+)/i) ||
        text.match(/^(https?:\/\/[^\s\r\n#]+)/m);
      if (lineMatch && lineMatch[1]) {
        const resolved = lineMatch[1].trim();
        resolvedUrlCache.set(url, { url: resolved, expiresAt: now + 3600_000 });
        return resolved;
      }
    } catch {
      // segue tentativa padrão
    }
  }

  return url;
}

/**
 * Abre conexão com a Web Rádio (tentando sufixos Shoutcast/Icecast caso a URL raiz retorne HTML).
 */
async function openUpstreamRadio(
  targetUrl: string
): Promise<{ res: Response; finalUrl: string; abort: () => void }> {
  const candidates = [targetUrl];
  try {
    const parsed = new URL(targetUrl);
    if (parsed.pathname === "/" || parsed.pathname === "") {
      const base = `${parsed.protocol}//${parsed.host}`;
      candidates.push(`${base}/stream`, `${base}/live`, `${base}/;stream.mp3`, `${base}/;`);
    }
  } catch {
    // URL inválida
  }

  let lastErr: unknown = null;
  for (const candidate of candidates) {
    const ctrl = new AbortController();
    const connectTimer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(candidate, {
        headers: {
          "User-Agent": RADIO_UA,
          "Accept": "audio/*, */*;q=0.8",
          "Icy-MetaData": "0",
          "Connection": "keep-alive",
        },
        redirect: "follow",
        signal: ctrl.signal,
      });
      clearTimeout(connectTimer);

      const ct = (res.headers.get("content-type") || "").toLowerCase();
      // Se retornou página HTML (painel Shoutcast) ou playlist texto em vez de áudio, tenta o próximo candidato
      if (ct.includes("text/html")) {
        try { ctrl.abort(); } catch {}
        continue;
      }
      if (ct.includes("audio/x-scpls") || ct.includes("audio/x-mpegurl") || ct.includes("application/pls")) {
        const text = await res.text().catch(() => "");
        const m =
          text.match(/File\d+\s*=\s*(https?:\/\/[^\s\r\n]+)/i) ||
          text.match(/^(https?:\/\/[^\s\r\n#]+)/m);
        if (m && m[1]) {
          candidates.push(m[1].trim());
        }
        continue;
      }
      if (res.ok || res.status === 206) {
        return { res, finalUrl: candidate, abort: () => { try { ctrl.abort(); } catch {} } };
      }
      try { ctrl.abort(); } catch {}
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      clearTimeout(connectTimer);
      lastErr = e;
    }
  }

  throw lastErr || new Error("Não foi possível conectar ao stream da Web Rádio.");
}

/**
 * Faz o proxy do stream contínuo da Web Rádio para o Player / TV.
 */
export async function proxyRadioStream(rawUrl: string, method = "GET"): Promise<Response> {
  try {
    const resolved = await resolveRadioStreamUrl(rawUrl);
    const { res, finalUrl, abort } = await openUpstreamRadio(resolved);

    if (finalUrl !== rawUrl) {
      resolvedUrlCache.set(rawUrl, { url: finalUrl, expiresAt: Date.now() + 3600_000 });
    }

    const contentType = normalizeRadioContentType(res.headers.get("content-type"), finalUrl);
    const headers = new Headers({
      "Content-Type": contentType,
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "X-Accel-Buffering": "no",
    });

    if (method === "HEAD") {
      abort();
      return new Response(null, { status: 200, headers });
    }

    return new Response(res.body, { status: 200, headers });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || "Estação indisponível" }), {
      status: 502,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}

/**
 * Testa se uma URL de Web Rádio está online e retorna informações sobre o formato.
 */
export async function probeRadioStream(rawUrl: string): Promise<{
  ok: boolean;
  resolvedUrl?: string;
  contentType?: string;
  icyName?: string;
  stationName?: string;
  error?: string;
}> {
  try {
    const resolved = await resolveRadioStreamUrl(rawUrl);
    const { res, finalUrl, abort } = await openUpstreamRadio(resolved);
    const contentType = normalizeRadioContentType(res.headers.get("content-type"), finalUrl);
    const icyName = res.headers.get("icy-name") || undefined;
    abort();
    return {
      ok: true,
      resolvedUrl: finalUrl,
      contentType,
      icyName,
      stationName: icyName,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "Estação offline ou formato incompatível.",
    };
  }
}

export interface RadioSearchResult {
  id: string;
  name: string;
  category: string;
  description: string;
  url: string;
  streamUrl: string;
  country: string;
  state?: string;
  codec: string;
  bitrate: number;
  tags?: string;
  favicon?: string;
}

/**
 * Pesquisa rádios online no diretório Radio-Browser (filtrando apenas MP3/AAC compatíveis com TVs).
 */
export async function searchRadioStations(query: string, limit = 20): Promise<RadioSearchResult[]> {
  const q = String(query || "").trim();
  if (!q) return [];

  const endpoints = [
    "https://de1.api.radio-browser.info",
    "https://fi1.api.radio-browser.info",
    "https://at1.api.radio-browser.info",
  ];

  for (const base of endpoints) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const apiUrl =
        `${base}/json/stations/search?name=${encodeURIComponent(q)}` +
        `&hidebroken=true&order=clickcount&reverse=true&limit=${limit * 2}`;
      const res = await fetch(apiUrl, {
        headers: { "User-Agent": "PagliaroSignage/1.0" },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const raw = await res.json();
      if (!Array.isArray(raw)) continue;

      const results: RadioSearchResult[] = [];
      const seenUrls = new Set<string>();

      for (const s of raw) {
        const streamUrl = String(s.url_resolved || s.url || "").trim();
        if (!streamUrl) continue;
        // Ignora streams HLS (.m3u8) pois o elemento <audio> nativo de TVs não reproduz HLS sem MSE
        if (/\.m3u8(\?|$)/i.test(streamUrl) || Number(s.hls) === 1) continue;
        const codec = String(s.codec || "MP3").toUpperCase();
        if (codec && !/MP3|AAC|OGG|UNKNOWN/i.test(codec)) continue;
        if (seenUrls.has(streamUrl)) continue;
        seenUrls.add(streamUrl);

        results.push({
          id: s.stationuuid || streamUrl,
          name: String(s.name || "Web Rádio").trim(),
          category: "Ao Vivo",
          description: s.tags ? String(s.tags) : "Web Rádio 24h",
          url: streamUrl,
          streamUrl,
          country: String(s.countrycode || s.country || "BR"),
          state: s.state ? String(s.state) : undefined,
          codec: codec.includes("AAC") ? "AAC" : "MP3",
          bitrate: Number(s.bitrate) || 64,
          tags: s.tags ? String(s.tags) : undefined,
          favicon: s.favicon ? String(s.favicon) : undefined,
        });
        if (results.length >= limit) break;
      }
      return results;
    } catch {
      clearTimeout(timer);
    }
  }

  return [];
}
