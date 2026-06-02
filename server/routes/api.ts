import { Hono } from "hono";
import { db } from "../services/db.ts";
import { wsManager } from "../ws/manager.ts";

export const api = new Hono();

// ========================
// SALAS (Rooms)
// ========================
api.get("/rooms", async (c) => {
  const rooms = await db.getRooms();
  return c.json(rooms);
});

api.post("/rooms", async (c) => {
  try {
    const body = await c.req.json();
    const rooms = await db.getRooms();
    
    if (!body || !body.name || typeof body.name !== "string") {
      return c.json({ error: "O nome da sala é obrigatório e deve ser um texto." }, 400);
    }
    
    const targetSlug = body.slug || body.name.toLowerCase().replace(/\s+/g, '-');
    
    // Impede nome ou slug duplicado
    if (rooms.some((r: any) => r.slug === targetSlug || (r.name && r.name.toLowerCase() === body.name.toLowerCase()))) {
      return c.json({ error: "Já existe uma sala com este nome ou slug." }, 400);
    }

    const newRoom = {
      id: crypto.randomUUID(),
      slug: targetSlug,
      name: body.name,
      description: body.description || ""
    };
    
    rooms.push(newRoom);
    await db.saveRooms(rooms);
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
  
  rooms[index] = { ...rooms[index], ...body, id }; // Protege o ID
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
  
  // Cascata: Remover do estado
  const state = await db.getState();
  if (state[room.slug]) {
    delete state[room.slug];
    await db.saveState(state);
  }
  
  return c.json({ success: true });
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
    name: body.name,
    type: body.type || "visual",
    items: body.items || [],
    loop: body.loop ?? true
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
  if (typeof roomState === 'string') {
    roomState = { playlist: roomState, audioPlaylist: null };
  }
  return c.json(roomState || { playlist: null, audioPlaylist: null });
});

api.post("/state/:roomSlug", async (c) => {
  const room = c.req.param("roomSlug");
  const body = await c.req.json(); // { playlist?: string | null, audioPlaylist?: string | null }
  
  const state = await db.getState();
  if (typeof state[room] === 'string') {
    state[room] = { playlist: state[room], audioPlaylist: null };
  } else if (!state[room]) {
    state[room] = { playlist: null, audioPlaylist: null };
  }
  
  if (body.playlist !== undefined) state[room].visualStatus = "playing";
  if (body.audioPlaylist !== undefined) state[room].audioStatus = "playing";

  state[room] = { ...state[room], ...body };
  await db.saveState(state);
  
  // Emite evento de hot-reload para as TVs conectadas àquela sala
  wsManager.broadcast(room, JSON.stringify({ type: "updateState" }));
  
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
  if (typeof state[room] === 'string') {
    state[room] = { playlist: state[room], audioPlaylist: null };
  } else if (!state[room]) {
    state[room] = { playlist: null, audioPlaylist: null };
  }

  if (body.target === "visual") {
    if (body.command === "play") state[room].visualStatus = "playing";
    if (body.command === "pause") state[room].visualStatus = "paused";
  } else if (body.target === "audio") {
    if (body.command === "play") state[room].audioStatus = "playing";
    if (body.command === "pause") state[room].audioStatus = "paused";
  }
  
  await db.saveState(state);
  wsManager.broadcast(room, JSON.stringify({ type: "control", target: body.target, command: body.command }));
  return c.json({ success: true, message: `Command ${body.command} broadcasted to ${body.target}` });
});

// ========================
// SYSTEM
// ========================
api.get("/system/ip", (c) => {
  const interfaces = Deno.networkInterfaces();
  const ipv4 = interfaces.find(i => i.family === "IPv4" && !i.address.startsWith("127."));
  return c.json({ ip: ipv4?.address || "localhost" });
});
