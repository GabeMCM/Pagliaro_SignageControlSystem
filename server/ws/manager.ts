import { WSContext } from "hono/ws";

const rooms = new Map<string, Set<WSContext>>();

export const wsManager = {
  add(room: string, ws: WSContext) {
    if (!rooms.has(room)) {
      rooms.set(room, new Set());
    }
    rooms.get(room)!.add(ws);
    console.log(`[WS] Cliente conectado à sala: ${room} (Total: ${rooms.get(room)!.size})`);
  },
  remove(room: string, ws: WSContext) {
    const set = rooms.get(room);
    if (set) {
      set.delete(ws);
      console.log(`[WS] Cliente desconectado da sala: ${room} (Restantes: ${set.size})`);
      if (set.size === 0) {
        rooms.delete(room);
      }
    }
  },
  broadcast(room: string, message: string) {
    const set = rooms.get(room);
    if (set) {
      for (const ws of set) {
        ws.send(message);
      }
      console.log(`[WS] Broadcast enviado para a sala ${room}: ${message}`);
    }
  }
};
