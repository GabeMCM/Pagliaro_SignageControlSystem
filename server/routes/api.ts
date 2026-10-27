import { Hono } from "hono";
import { db } from "../services/db.ts";
import { wsManager, detectDeviceType } from "../ws/manager.ts";
import { youtubeService } from "../services/youtube.ts";
import { executeSchedule, type ScheduleTask } from "../services/scheduler.ts";
import { roomEventQueue } from "../services/event-queue.ts";
import {
  getAdiauAsset,
  getAdiauData,
  parseAdiauParams,
  renderAdiauHtmlPage,
  warmAdiauUrl,
} from "../services/adiau.ts";

export const api = new Hono();

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ========================
// STATUS / DIAGNÓSTICO DO BANCO
// ========================
api.get("/status", async (c) => {
  return c.json(await db.getStatus());
});

// ========================
// SALAS (Rooms)
// ========================
api.get("/rooms", async (c) => {
  const rooms = await db.getRooms();
  const roomsWithStatus = rooms.map((r: any) => ({
    ...r,
    online: wsManager.isOnline(r.slug),
    clientsCount: wsManager.getClientCount(r.slug),
    maxClients: wsManager.getMaxClients(),
  }));
  return c.json(roomsWithStatus);
});

api.post("/rooms", async (c) => {
  try {
    const body = await c.req.json();
    const rooms = await db.getRooms();
    
    if (!body || !body.name || typeof body.name !== "string" || !body.name.trim()) {
      return c.json({ error: "O nome da sala é obrigatório." }, 400);
    }
    
    const targetSlug = body.slug ? slugify(body.slug) : slugify(body.name);
    
    if (!targetSlug) {
      return c.json({ error: "Slug inválido para a sala." }, 400);
    }

    // Impede nome ou slug duplicado
    if (rooms.some((r: any) => r.slug === targetSlug || (r.name && r.name.toLowerCase() === body.name.trim().toLowerCase()))) {
      return c.json({ error: "Já existe uma sala com este nome ou identificador (slug)." }, 400);
    }

    const newRoom = {
      id: crypto.randomUUID(),
      slug: targetSlug,
      name: body.name.trim(),
      description: body.description?.trim() || "",
      defaultSiteUrl: body.defaultSiteUrl?.trim() || "",
      defaultAudioStreamUrl: body.defaultAudioStreamUrl?.trim() || "",
    };
    
    rooms.push(newRoom);
    await db.saveRooms(rooms);

    // Se forneceu uma URL de site ou áudio inicial, já inicializa o estado da sala
    if (newRoom.defaultSiteUrl || newRoom.defaultAudioStreamUrl) {
      const state = await db.getState();
      state[targetSlug] = {
        playlist: null,
        audioPlaylist: null,
        audioStreamUrl: newRoom.defaultAudioStreamUrl || null,
        siteUrl: newRoom.defaultSiteUrl || null,
        mode: newRoom.defaultSiteUrl ? "site" : "playlist",
        visualStatus: newRoom.defaultSiteUrl ? "playing" : "idle",
        audioStatus: newRoom.defaultAudioStreamUrl ? "playing" : "idle",
        audioVolume: 0,
      };
      await db.saveState(state);
    }

    return c.json({ success: true, room: newRoom }, 201);
  } catch (err: any) {
    console.error("Erro no POST /rooms:", err);
    return c.json({ error: err.message || "Internal Server Error" }, 500);
  }
});

api.put("/rooms/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const rooms = await db.getRooms();
  const index = rooms.findIndex((r: any) => r.id === id);
  
  if (index === -1) return c.json({ error: "Sala não encontrada" }, 404);
  
  const oldRoom = rooms[index];
  const updatedRoom = {
    ...oldRoom,
    ...body,
    id, // Protege o ID original
  };

  // Se o slug mudou, migra o estado
  if (body.slug && slugify(body.slug) !== oldRoom.slug) {
    const newSlug = slugify(body.slug);
    if (rooms.some((r: any) => r.id !== id && r.slug === newSlug)) {
      return c.json({ error: "Novo slug já está em uso por outra sala." }, 400);
    }
    updatedRoom.slug = newSlug;

    const state = await db.getState();
    if (state[oldRoom.slug]) {
      state[newSlug] = state[oldRoom.slug];
      delete state[oldRoom.slug];
      await db.saveState(state);
    }
  }

  rooms[index] = updatedRoom;
  await db.saveRooms(rooms);
  return c.json({ success: true, room: rooms[index] });
});

api.delete("/rooms/:id", async (c) => {
  const id = c.req.param("id");
  let rooms = await db.getRooms();
  const room = rooms.find((r: any) => r.id === id);
  
  if (!room) return c.json({ error: "Sala não encontrada" }, 404);
  
  rooms = rooms.filter((r: any) => r.id !== id);
  await db.saveRooms(rooms);
  
  // Cascata: Remover do estado e notificar clientes
  const state = await db.getState();
  if (state[room.slug]) {
    delete state[room.slug];
    await db.saveState(state);
  }

  wsManager.broadcast(room.slug, JSON.stringify({ type: "roomDeleted" }));
  
  return c.json({ success: true });
});

// Lista dispositivos conectados a uma sala
api.get("/rooms/:slug/devices", (c) => {
  const room = c.req.param("slug");
  const devices = wsManager.getDevices(room);
  return c.json({
    success: true,
    room,
    count: devices.length,
    max: wsManager.getMaxClients(),
    devices,
  });
});

// Retira dispositivo(s) da sala enviando-os de volta ao lobby
api.post("/rooms/:slug/kick", async (c) => {
  const room = c.req.param("slug");
  let body: { clientId?: string; reason?: string } = {};
  try {
    body = await c.req.json();
  } catch (_e) {}

  const reason = body.reason || "Dispositivo retirado pelo administrador e enviado ao lobby.";

  if (body.clientId && body.clientId !== "all") {
    const success = wsManager.kickClient(room, body.clientId, reason);
    if (!success) {
      return c.json({ success: false, message: "Dispositivo não encontrado ou já desconectado." }, 404);
    }
    return c.json({ success: true, message: "Dispositivo retirado para o lobby com sucesso." });
  } else {
    const count = wsManager.kickAll(room, reason);
    return c.json({ success: true, count, message: `${count} dispositivo(s) retirado(s) para o lobby.` });
  }
});

// ========================
// PLAYLISTS
// ========================
api.get("/playlists", async (c) => {
  const playlists = await db.getPlaylists();
  return c.json(playlists);
});

api.post("/playlists", async (c) => {
  const body = await c.req.json();
  const playlists = await db.getPlaylists();
  
  const newPlaylist = {
    id: crypto.randomUUID(),
    name: body.name || "Untitled Playlist",
    type: body.type || "visual",
    items: body.items || [],
    loop: body.loop ?? true,
  };
  
  playlists.push(newPlaylist);
  await db.savePlaylists(playlists);
  return c.json({ success: true, playlist: newPlaylist }, 201);
});

api.put("/playlists/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const playlists = await db.getPlaylists();
  const index = playlists.findIndex((p: any) => p.id === id);
  
  if (index === -1) return c.json({ error: "Playlist não encontrada" }, 404);
  
  playlists[index] = { ...playlists[index], ...body, id };
  await db.savePlaylists(playlists);

  // Cascata de atualização em tempo real para as telas ativas
  const state = await db.getState();
  for (const [roomSlug, roomState] of Object.entries<any>(state)) {
    if (roomState && (roomState.playlist === id || roomState.audioPlaylist === id)) {
      wsManager.broadcast(roomSlug, JSON.stringify({
        type: "updateState",
        playlistId: id,
        updatedPlaylist: playlists[index],
      }));
    }
  }

  return c.json({ success: true, playlist: playlists[index] });
});

api.delete("/playlists/:id", async (c) => {
  const id = c.req.param("id");
  let playlists = await db.getPlaylists();
  
  if (!playlists.find((p: any) => p.id === id)) {
    return c.json({ error: "Playlist não encontrada" }, 404);
  }
  
  playlists = playlists.filter((p: any) => p.id !== id);
  await db.savePlaylists(playlists);

  // Cascata: Remove a playlist do estado de qualquer sala que a esteja usando
  const state = await db.getState();
  let stateChanged = false;
  for (const [roomSlug, roomState] of Object.entries<any>(state)) {
    if (!roomState) continue;
    let roomChanged = false;
    if (roomState.playlist === id) {
      roomState.playlist = null;
      if (!roomState.siteUrl || roomState.mode !== "site") {
        roomState.visualStatus = "idle";
      }
      roomChanged = true;
    }
    if (roomState.audioPlaylist === id) {
      roomState.audioPlaylist = null;
      if (!roomState.audioStreamUrl) {
        roomState.audioStatus = "idle";
      }
      roomChanged = true;
    }
    if (roomChanged) {
      stateChanged = true;
      wsManager.broadcast(roomSlug, JSON.stringify({ type: "updateState", state: roomState }));
    }
  }

  if (stateChanged) {
    await db.saveState(state);
  }

  return c.json({ success: true });
});

// ========================
// ESTADO E CONTROLE (State)
// ========================
api.get("/state", async (c) => {
  const state = await db.getState();
  return c.json(state);
});

api.get("/state/:roomSlug", async (c) => {
  const room = c.req.param("roomSlug");
  const roomState = await roomEventQueue.getAuthoritativeRoomState(room);
  if (roomState?.siteUrl) warmAdiauUrl(roomState.siteUrl);
  return c.json(roomState);
});

api.post("/state/:roomSlug", async (c) => {
  const room = c.req.param("roomSlug");
  const body = await c.req.json();
  const updatedState = await roomEventQueue.enqueueSetState(room, body);
  if (updatedState?.siteUrl) warmAdiauUrl(updatedState.siteUrl);
  return c.json({ success: true, state: updatedState, version: updatedState.version });
});

api.post("/reload/:roomSlug", async (c) => {
  const room = c.req.param("roomSlug");
  wsManager.broadcast(room, JSON.stringify({ type: "reload" }));
  return c.json({ success: true, message: `Reload emitido para a sala ${room}` });
});

api.post("/control/:roomSlug", async (c) => {
  const room = c.req.param("roomSlug");
  const body = await c.req.json();
  const result = await roomEventQueue.enqueueControl(room, body);
  if (result.ignored) {
    return c.json({ success: false, ignored: true, reason: result.reason, state: result.state });
  }
  return c.json({
    success: true,
    message: `Command ${body.command} processed in queue for ${body.target}`,
    state: result.state,
    version: result.state?.version,
  });
});

// ========================
// SYSTEM
// ========================
api.get("/system/ip", async (c) => {
  const interfaces = Deno.networkInterfaces();
  const ipv4 = interfaces.find(i => i.family === "IPv4" && !i.address.startsWith("127."));
  
  const host = c.req.header("x-forwarded-host") || c.req.header("host");
  const proto = c.req.header("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  const headerOrigin = host ? `${proto}://${host}` : null;

  const publicUrl = Deno.env.get("PUBLIC_URL") ||
    Deno.env.get("RENDER_EXTERNAL_URL") ||
    (headerOrigin && !headerOrigin.includes("localhost") && !headerOrigin.includes("127.0.0.1") ? headerOrigin : null);

  const dbStatus = await db.getStatus();

  return c.json({
    ip: ipv4?.address || "localhost",
    publicUrl: publicUrl || null,
    db: dbStatus,
  });
});

// ========================
// WEATHER (Uberaba - MG)
// ========================
let cachedWeather: {
  timestamp: number;
  data: any;
} | null = null;

const WEATHER_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos de cache

api.get("/weather/uberaba", async (c) => {
  const now = Date.now();
  if (cachedWeather && (now - cachedWeather.timestamp < WEATHER_CACHE_TTL_MS)) {
    return c.json(cachedWeather.data);
  }

  try {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=-19.7483&longitude=-47.9319&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=America%2FSao_Paulo&forecast_days=1";
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) {
      throw new Error(`Open-Meteo returned status ${res.status}`);
    }
    const raw = await res.json();

    const weatherData = {
      city: "Uberaba",
      state: "MG",
      temperature: Math.round(raw.current?.temperature_2m ?? 0),
      apparentTemperature: Math.round(raw.current?.apparent_temperature ?? 0),
      humidity: Math.round(raw.current?.relative_humidity_2m ?? 0),
      weatherCode: raw.current?.weather_code ?? 0,
      isDay: raw.current?.is_day ?? 1,
      tempMax: Math.round(raw.daily?.temperature_2m_max?.[0] ?? raw.current?.temperature_2m ?? 0),
      tempMin: Math.round(raw.daily?.temperature_2m_min?.[0] ?? raw.current?.temperature_2m ?? 0),
      precipitation: raw.current?.precipitation ?? 0,
      updatedAt: new Date().toISOString(),
    };

    cachedWeather = {
      timestamp: now,
      data: weatherData,
    };

    return c.json(weatherData);
  } catch (err: any) {
    console.error("Erro ao obter previsão do tempo de Uberaba:", err?.message || err);
    if (cachedWeather) {
      return c.json({ ...cachedWeather.data, stale: true });
    }
    return c.json({
      error: "Falha ao obter clima",
      city: "Uberaba",
      state: "MG",
      temperature: null,
    }, 500);
  }
});

// ========================
// DEVICES (Gestão Remota de Aparelhos / TVs)
// ========================

// 1. Registro e Heartbeat de Aparelho (chamado pela raiz /, /player, etc.)
api.post("/devices/register", async (c) => {
  try {
    const body = await c.req.json();
    const id = body.id;
    if (!id || typeof id !== "string") {
      return c.json({ error: "ID do aparelho é obrigatório." }, 400);
    }

    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
      c.req.header("cf-connecting-ip") ||
      "localhost";
    const userAgent = c.req.header("user-agent") || body.userAgent || "Navegador Web";
    const detectedLabel = detectDeviceType(userAgent);

    const existing = await db.getDevice(id);
    const rooms = await db.getRooms();
    const boundRoomSlug = existing?.assignedRoomSlug || body.assignedRoomSlug || null;
    const assignedRoom = rooms.find((r: any) => r.slug === boundRoomSlug);

    const device = {
      id,
      name: existing?.name || body.name || `${detectedLabel} (${id.slice(-4)})`,
      detectedLabel,
      userAgent,
      ip,
      screenResolution: body.screenResolution || existing?.screenResolution || "",
      assignedRoomSlug: boundRoomSlug,
      assignedRoomName: assignedRoom?.name || null,
      currentPath: body.path || existing?.currentPath || "/",
      lastSeenAt: Date.now(),
      firstSeenAt: existing?.firstSeenAt || Date.now(),
    };

    await db.saveDevice(device);
    wsManager.broadcastDevicesUpdate();

    return c.json({
      success: true,
      device: {
        ...device,
        online: wsManager.isDeviceOnline(id),
      },
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Erro ao registrar aparelho" }, 500);
  }
});

// 2. Lista todos os aparelhos cadastrados com status online em tempo real
api.get("/devices", async (c) => {
  const devices = await db.getDevices();
  const rooms = await db.getRooms();

  const enriched = devices.map((d: any) => {
    const room = rooms.find((r: any) => r.slug === d.assignedRoomSlug);
    return {
      ...d,
      assignedRoomName: room?.name || d.assignedRoomName || null,
      online: wsManager.isDeviceOnline(d.id),
    };
  });

  // Ordena: primeiro os online, depois por último visto mais recente
  enriched.sort((a: any, b: any) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    return (b.lastSeenAt || 0) - (a.lastSeenAt || 0);
  });

  return c.json(enriched);
});

// 3. Detalhes de um aparelho
api.get("/devices/:id", async (c) => {
  const id = c.req.param("id");
  const device = await db.getDevice(id);
  if (!device) {
    return c.json({ error: "Aparelho não encontrado" }, 404);
  }
  return c.json({
    ...device,
    online: wsManager.isDeviceOnline(id),
  });
});

// 4. Atualizar nome ou vincular sala
api.patch("/devices/:id", async (c) => {
  const id = c.req.param("id");
  const device = await db.getDevice(id);
  if (!device) {
    return c.json({ error: "Aparelho não encontrado" }, 404);
  }

  const body = await c.req.json();
  if (body.name !== undefined && typeof body.name === "string") {
    device.name = body.name.trim() || device.detectedLabel;
  }

  if (body.assignedRoomSlug !== undefined) {
    const targetRoomSlug = body.assignedRoomSlug ? String(body.assignedRoomSlug).trim() : null;
    await wsManager.bindDeviceToRoom(id, targetRoomSlug);
    device.assignedRoomSlug = targetRoomSlug;
    const rooms = await db.getRooms();
    const assignedRoom = rooms.find((r: any) => r.slug === targetRoomSlug);
    device.assignedRoomName = assignedRoom?.name || null;
  }

  await db.saveDevice(device);
  wsManager.broadcastDevicesUpdate();

  return c.json({
    success: true,
    device: {
      ...device,
      online: wsManager.isDeviceOnline(id),
    },
  });
});

// 5. Identificar aparelho visualmente (piscar tela / banner na TV)
api.post("/devices/:id/identify", async (c) => {
  const id = c.req.param("id");
  const device = await db.getDevice(id);
  const body = await c.req.json().catch(() => ({}));

  const sent = wsManager.identifyDevice(id, {
    duration: body.duration || 15,
    message: body.message,
    name: device?.name,
    room: device?.assignedRoomSlug,
  });

  return c.json({
    success: sent,
    message: sent
      ? "Sinal de identificação enviado para a tela do aparelho com sucesso!"
      : "Aparelho não está conectado no momento. O sinal não pôde ser entregue.",
  });
});

// 6. Recarregar tela do aparelho remotamente
api.post("/devices/:id/reload", (c) => {
  const id = c.req.param("id");
  const sent = wsManager.reloadDevice(id);
  return c.json({
    success: sent,
    message: sent ? "Comando de recarregamento enviado à tela." : "Aparelho offline.",
  });
});

// 7. Limpar todos os aparelhos desconectados (faxina de testes / inativos)
api.post("/devices/clean-offline", async (c) => {
  try {
    const devices = await db.getDevices();
    let deletedCount = 0;
    for (const d of devices) {
      if (!wsManager.isDeviceOnline(d.id)) {
        await db.deleteDevice(d.id);
        deletedCount++;
      }
    }
    wsManager.broadcastDevicesUpdate();
    return c.json({
      success: true,
      deletedCount,
      message: `${deletedCount} aparelho(s) desconectado(s) removido(s) com sucesso.`,
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Erro ao limpar aparelhos" }, 500);
  }
});

// 8. Excluir aparelho individual
api.delete("/devices/:id", async (c) => {
  const id = c.req.param("id");
  await db.deleteDevice(id);
  wsManager.broadcastDevicesUpdate();
  return c.json({ success: true, message: "Aparelho removido com sucesso." });
});

// ========================
// YOUTUBE & STREAMING AUDIO (Zero Storage & Ad-Free)
// ========================

// 1. Pesquisa rápida no YouTube (títulos, artistas, hinos)
api.get("/youtube/search", async (c) => {
  const q = c.req.query("q") || "";
  const limit = Math.min(30, Math.max(1, Number(c.req.query("limit")) || 15));
  if (!q.trim()) {
    return c.json({ success: true, results: [] });
  }
  try {
    const results = await youtubeService.search(q, limit);
    return c.json({ success: true, results });
  } catch (err: any) {
    return c.json({ success: false, error: err.message || "Erro ao pesquisar no YouTube" }, 500);
  }
});

// 2. Extrai faixas de uma Playlist do YouTube
api.get("/youtube/playlist", async (c) => {
  const url = c.req.query("url") || c.req.query("id") || "";
  if (!url.trim()) {
    return c.json({ success: false, error: "URL ou ID da playlist é obrigatório." }, 400);
  }
  try {
    const playlist = await youtubeService.getPlaylist(url);
    return c.json({ success: true, playlist });
  } catch (err: any) {
    return c.json({ success: false, error: err.message || "Erro ao carregar playlist do YouTube." }, 400);
  }
});

// 3. Extrai informações de um único vídeo
api.get("/youtube/video", async (c) => {
  const url = c.req.query("url") || c.req.query("id") || "";
  if (!url.trim()) {
    return c.json({ success: false, error: "URL ou ID do vídeo é obrigatório." }, 400);
  }
  try {
    const video = await youtubeService.getVideo(url);
    return c.json({ success: true, video });
  } catch (err: any) {
    return c.json({ success: false, error: err.message || "Erro ao carregar vídeo do YouTube." }, 400);
  }
});

// 4. Proxy de Streaming Direto de Áudio (AAC/MP4 sem anúncios e com Zero Storage)
api.options("/youtube/stream/:videoId", (c) => {
  return c.text("", 204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, User-Agent, Content-Type",
  });
});

api.get("/youtube/stream/:videoId", async (c) => {
  const rawId = c.req.param("videoId");
  const videoId = youtubeService.extractVideoId(rawId);
  if (!videoId) {
    return c.text("ID de vídeo do YouTube inválido.", 400);
  }

  const range = c.req.header("range");
  const userAgent = c.req.header("user-agent") || "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

  const fetchStream = async (bypassCache = false) => {
    const { url, mimeType } = await youtubeService.getAudioStreamUrl(videoId, bypassCache);
    const headers: Record<string, string> = {
      "User-Agent": userAgent,
    };
    if (range) {
      headers["Range"] = range;
    }
    const res = await fetch(url, { headers });
    return { res, mimeType };
  };

  try {
    const { res, mimeType } = await fetchStream(false);

    if (!res.ok && res.status !== 206) {
      youtubeService.invalidateCache(videoId);
      return c.text(`Erro ao buscar áudio do YouTube (${res.status})`, res.status as any);
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", res.headers.get("content-type") || mimeType || "audio/mp4");
    responseHeaders.set("Accept-Ranges", "bytes");
    responseHeaders.set("Cache-Control", "public, max-age=3600");
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "Range, User-Agent, Content-Type");

    const contentRange = res.headers.get("content-range");
    if (contentRange) responseHeaders.set("Content-Range", contentRange);

    const contentLength = res.headers.get("content-length");
    if (contentLength) responseHeaders.set("Content-Length", contentLength);

    if (c.req.method === "HEAD") {
      return new Response(null, {
        status: res.status,
        headers: responseHeaders,
      });
    }

    return new Response(res.body, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch (err: any) {
    console.warn(`[YouTube Stream Fail] Vídeo ${videoId}: ${err.message}`);
    return c.json({
      error: "Stream do YouTube indisponível via datacenter em nuvem.",
      code: "STREAM_UNAVAILABLE",
    }, 503);
  }
});

// ========================
// AGENDAMENTOS E AUTOMAÇÕES (Timeline de Cerimônias e Velórios)
// ========================

// 1. Lista agendamentos (filtro opcional por sala: ?room=slug)
api.get("/schedules", async (c) => {
  const room = c.req.query("room");
  const schedules = await db.getSchedules(room);
  return c.json(schedules);
});

// 2. Detalhes de um agendamento
api.get("/schedules/:id", async (c) => {
  const id = c.req.param("id");
  const schedule = await db.getSchedule(id);
  if (!schedule) {
    return c.json({ error: "Agendamento não encontrado" }, 404);
  }
  return c.json(schedule);
});

// 3. Criar novo agendamento
api.post("/schedules", async (c) => {
  try {
    const body = await c.req.json();
    if (!body || !body.roomSlug || !body.title || !body.scheduledAt) {
      return c.json({ error: "Sala, título e data/hora são obrigatórios." }, 400);
    }

    const newSchedule: ScheduleTask = {
      id: crypto.randomUUID(),
      roomSlug: String(body.roomSlug).trim(),
      title: String(body.title).trim(),
      scheduledAt: String(body.scheduledAt).trim(),
      enabled: body.enabled !== false,
      executed: false,
      executedAt: null,
      createdAt: Date.now(),
      actions: body.actions || {},
    };

    await db.saveSchedule(newSchedule);
    return c.json({ success: true, schedule: newSchedule }, 201);
  } catch (err: any) {
    return c.json({ error: err.message || "Erro ao salvar agendamento" }, 500);
  }
});

// 4. Atualizar agendamento existente
api.put("/schedules/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await db.getSchedule(id);
  if (!existing) {
    return c.json({ error: "Agendamento não encontrado" }, 404);
  }

  const body = await c.req.json();
  const updated: ScheduleTask = {
    ...existing,
    ...body,
    id, // Protege ID
  };

  await db.saveSchedule(updated);
  return c.json({ success: true, schedule: updated });
});

// 5. Excluir agendamento
api.delete("/schedules/:id", async (c) => {
  const id = c.req.param("id");
  const deleted = await db.deleteSchedule(id);
  return c.json({ success: deleted });
});

// 6. Ativar / Desativar (Pausar) agendamento
api.post("/schedules/:id/toggle", async (c) => {
  const id = c.req.param("id");
  const schedule = await db.getSchedule(id);
  if (!schedule) {
    return c.json({ error: "Agendamento não encontrado" }, 404);
  }
  schedule.enabled = !schedule.enabled;
  await db.saveSchedule(schedule);
  return c.json({ success: true, enabled: schedule.enabled, schedule });
});

// 7. Testar / Executar Imediatamente
api.post("/schedules/:id/run", async (c) => {
  const id = c.req.param("id");
  const schedule = await db.getSchedule(id);
  if (!schedule) {
    return c.json({ error: "Agendamento não encontrado" }, 404);
  }
  const executed = await executeSchedule(schedule, false);
  return c.json({ success: executed, message: "Ação executada na tela da sala com sucesso!" });
});

// ========================
// PROXY E RENDERIZADOR ULTRA-LEVE ADIAŬ (Para TVs simples / Fire Stick / Hisense)
// ========================
api.get("/adiau/render", async (c) => {
  const query = c.req.query();
  const params = parseAdiauParams(query);
  if (!params) {
    return c.html(
      `<!DOCTYPE html><html><body style="background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><h2>Parâmetros da cerimônia inválidos (hash ausente).</h2></body></html>`,
      400,
    );
  }

  // Tenta obter do cache em até 1.5s; se ainda estiver baixando do Adiaŭ, entrega o HTML imediatamente e faz poll
  const res = await getAdiauData(params, 1500);
  const html = renderAdiauHtmlPage(params, res.ready ? res.data : { pending: true });
  c.header("Cache-Control", "no-store, no-cache, must-revalidate");
  return c.html(html);
});

api.get("/adiau/data", async (c) => {
  const query = c.req.query();
  const params = parseAdiauParams(query);
  if (!params) {
    return c.json({ status: false, error: "Parâmetros inválidos" }, 400);
  }

  const res = await getAdiauData(params, 6000);
  c.header("Cache-Control", "no-store, no-cache, must-revalidate");
  if (!res.ready) {
    return c.json({ pending: true });
  }
  return c.json(res.data);
});

api.get("/adiau/asset/:id", (c) => {
  const id = c.req.param("id");
  const asset = getAdiauAsset(id);
  if (!asset) {
    return c.text("Asset not found", 404);
  }
  return new Response(asset.bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": asset.mimeType,
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
});




