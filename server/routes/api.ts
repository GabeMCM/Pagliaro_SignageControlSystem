import { Hono } from "hono";
import { db } from "../services/db.ts";
import { wsManager } from "../ws/manager.ts";

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
        audioVolume: 100,
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
  const state = await db.getState();
  let roomState = state[room];
  if (typeof roomState === "string") {
    roomState = { playlist: roomState, audioPlaylist: null };
  }
  const defaultState = {
    playlist: null,
    audioPlaylist: null,
    audioStreamUrl: null,
    siteUrl: null,
    mode: "playlist", // "playlist" ou "site"
    visualStatus: "idle",
    audioStatus: "idle",
    audioVolume: 100,
    audioLoopMode: "all",
    audioShuffle: false,
    currentAudioIndex: 0,
  };
  return c.json({ ...defaultState, ...(roomState || {}) });
});

api.post("/state/:roomSlug", async (c) => {
  const room = c.req.param("roomSlug");
  const body = await c.req.json();
  
  const state = await db.getState();
  if (typeof state[room] === "string") {
    state[room] = { playlist: state[room], audioPlaylist: null };
  } else if (!state[room]) {
    state[room] = {
      playlist: null,
      audioPlaylist: null,
      audioStreamUrl: null,
      siteUrl: null,
      mode: "playlist",
      visualStatus: "idle",
      audioStatus: "idle",
      audioVolume: 100,
      audioLoopMode: "all",
      audioShuffle: false,
      currentAudioIndex: 0,
    };
  }

  // Atualização da URL de Site
  if (body.siteUrl !== undefined) {
    state[room].siteUrl = body.siteUrl ? String(body.siteUrl).trim() : null;
    if (state[room].siteUrl) {
      state[room].mode = "site";
      state[room].visualStatus = "playing";
    } else {
      state[room].mode = "playlist";
      if (!state[room].playlist) {
        state[room].visualStatus = "idle";
      }
    }
  }

  if (body.mode !== undefined) {
    state[room].mode = body.mode;
  }

  // Atualização de URL Direta de Stream de Áudio (ex: Zeno.FM, Web Radio, MP3)
  if (body.audioStreamUrl !== undefined) {
    state[room].audioStreamUrl = body.audioStreamUrl ? String(body.audioStreamUrl).trim() : null;
    if (state[room].audioStreamUrl) {
      state[room].audioStatus = "playing";
    } else {
      if (!state[room].audioPlaylist) {
        state[room].audioStatus = "idle";
      }
    }
  }

  // Atualização de Playlist Visual
  if (body.playlist !== undefined) {
    state[room].playlist = body.playlist;
    if (body.playlist) {
      state[room].visualStatus = "playing";
      if (body.mode === undefined && !body.siteUrl) {
        state[room].mode = "playlist";
      }
    } else {
      if (!state[room].siteUrl || state[room].mode !== "site") {
        state[room].visualStatus = "idle";
      }
    }
  }

  // Atualização de Playlist de Áudio
  if (body.audioPlaylist !== undefined) {
    state[room].audioPlaylist = body.audioPlaylist;
    if (body.audioPlaylist) {
      state[room].audioStatus = "playing";
    } else {
      if (!state[room].audioStreamUrl) {
        state[room].audioStatus = "idle";
      }
    }
  }

  // Atualização de Volume de Áudio Remoto
  if (body.audioVolume !== undefined) {
    state[room].audioVolume = Math.max(0, Math.min(100, Number(body.audioVolume)));
  }

  // Atualização de Modo de Repetição e Shuffle
  if (body.audioLoopMode !== undefined) state[room].audioLoopMode = body.audioLoopMode;
  if (body.audioShuffle !== undefined) state[room].audioShuffle = Boolean(body.audioShuffle);
  if (body.currentAudioIndex !== undefined) state[room].currentAudioIndex = Number(body.currentAudioIndex);

  // Standby / Blackout Virtual
  if (body.standby !== undefined) {
    state[room].standby = Boolean(body.standby);
  }

  // Atualização manual de status
  if (body.visualStatus !== undefined) state[room].visualStatus = body.visualStatus;
  if (body.audioStatus !== undefined) state[room].audioStatus = body.audioStatus;

  await db.saveState(state);
  
  // Emite evento para os Kiosks/Players conectados
  wsManager.broadcast(room, JSON.stringify({ type: "updateState", state: state[room] }));
  
  return c.json({ success: true, state: state[room] });
});

api.post("/reload/:roomSlug", async (c) => {
  const room = c.req.param("roomSlug");
  wsManager.broadcast(room, JSON.stringify({ type: "reload" }));
  return c.json({ success: true, message: `Reload emitido para a sala ${room}` });
});

api.post("/control/:roomSlug", async (c) => {
  const room = c.req.param("roomSlug");
  const body = await c.req.json();
  
  const state = await db.getState();
  if (typeof state[room] === "string") {
    state[room] = { playlist: state[room], audioPlaylist: null };
  } else if (!state[room]) {
    state[room] = {
      playlist: null,
      audioPlaylist: null,
      audioStreamUrl: null,
      siteUrl: null,
      mode: "playlist",
      visualStatus: "idle",
      audioStatus: "idle",
      audioVolume: 100,
      audioLoopMode: "all",
      audioShuffle: false,
      currentAudioIndex: 0,
    };
  }

  if (body.target === "site") {
    if (body.command === "reload") {
      wsManager.broadcast(room, JSON.stringify({ type: "reloadSite" }));
      return c.json({ success: true, message: `Reload de site emitido para ${room}` });
    }
  } else if (body.target === "visual") {
    if (body.command === "play" || body.command === "next" || body.command === "prev") {
      state[room].visualStatus = "playing";
    } else if (body.command === "pause") {
      state[room].visualStatus = "paused";
    }
  } else if (body.target === "audio") {
    if (body.command === "play" || body.command === "next" || body.command === "prev") {
      state[room].audioStatus = "playing";
    } else if (body.command === "pause") {
      state[room].audioStatus = "paused";
    } else if (body.command === "setVolume") {
      state[room].audioVolume = Math.max(0, Math.min(100, Number(body.value ?? 100)));
    } else if (body.command === "setLoopMode") {
      state[room].audioLoopMode = body.value;
    } else if (body.command === "setShuffle") {
      state[room].audioShuffle = Boolean(body.value);
    } else if (body.command === "setTrackIndex" || body.command === "trackChanged") {
      state[room].currentAudioIndex = Number(body.value ?? 0);
    }
  } else if (body.target === "room") {
    if (body.command === "setStandby") {
      state[room].standby = Boolean(body.value);
    }
  }
  
  await db.saveState(state);
  wsManager.broadcast(room, JSON.stringify({
    type: "control",
    target: body.target,
    command: body.command,
    value: body.value,
  }));
  
  return c.json({ success: true, message: `Command ${body.command} broadcasted to ${body.target}`, state: state[room] });
});

// ========================
// SYSTEM
// ========================
api.get("/system/ip", (c) => {
  const interfaces = Deno.networkInterfaces();
  const ipv4 = interfaces.find(i => i.family === "IPv4" && !i.address.startsWith("127."));
  
  const host = c.req.header("x-forwarded-host") || c.req.header("host");
  const proto = c.req.header("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  const headerOrigin = host ? `${proto}://${host}` : null;

  const publicUrl = Deno.env.get("PUBLIC_URL") ||
    Deno.env.get("RENDER_EXTERNAL_URL") ||
    (headerOrigin && !headerOrigin.includes("localhost") && !headerOrigin.includes("127.0.0.1") ? headerOrigin : null);

  return c.json({
    ip: ipv4?.address || "localhost",
    publicUrl: publicUrl || null,
    db: db.getStatus(),
  });
});
