import { WSContext } from "hono/ws";

export interface ConnectedClient {
  id: string;
  room: string;
  ws: WSContext;
  connectedAt: number;
  ip: string;
  userAgent: string;
  deviceLabel: string;
}

export interface DeviceInfo {
  id: string;
  room: string;
  connectedAt: number;
  ip: string;
  userAgent: string;
  deviceLabel: string;
}

export const MAX_CLIENTS_PER_ROOM = 2;

// Mapa de salas para clientes TV (Players): Map<roomSlug, Map<clientId, ConnectedClient>>
const roomClients = new Map<string, Map<string, ConnectedClient>>();

// Mapa de salas para observadores do Painel Admin (não ocupam vagas de TV): Map<roomSlug, Set<WSContext>>
const roomAdmins = new Map<string, Set<WSContext>>();

function getFriendlyDeviceLabel(userAgent: string, currentCount: number): string {
  let device = "Tela";
  if (/smart-tv|tizen|webos|viera|bravia|netcast/i.test(userAgent)) {
    device = "Smart TV";
  } else if (/android/i.test(userAgent)) {
    device = "Android TV / Tablet";
  } else if (/ipad|iphone/i.test(userAgent)) {
    device = "iPad / iPhone";
  } else if (/windows/i.test(userAgent)) {
    device = "PC Windows";
  } else if (/macintosh|mac os/i.test(userAgent)) {
    device = "Mac";
  } else if (/linux/i.test(userAgent)) {
    device = "Dispositivo Linux";
  }

  let browser = "";
  if (/edg/i.test(userAgent)) browser = " (Edge)";
  else if (/chrome/i.test(userAgent)) browser = " (Chrome)";
  else if (/firefox/i.test(userAgent)) browser = " (Firefox)";
  else if (/safari/i.test(userAgent)) browser = " (Safari)";

  return `${device} #${currentCount}${browser}`;
}

export const wsManager = {
  /**
   * Adiciona um novo cliente à sala respeitando o limite de 2 acessos para TVs
   */
  add(
    room: string,
    ws: WSContext,
    meta?: { ip?: string; userAgent?: string; role?: "player" | "admin" }
  ): { success: boolean; client?: ConnectedClient; error?: string } {
    const role = meta?.role || "player";

    // Conexão do Painel Admin: registrada apenas como observador, NUNCA ocupa vaga de TV
    if (role === "admin") {
      if (!roomAdmins.has(room)) {
        roomAdmins.set(room, new Set());
      }
      roomAdmins.get(room)!.add(ws);
      console.log(`[WS] Painel Admin conectado como observador na sala '${room}'. (Telas ativas: ${this.getClientCount(room)}/${MAX_CLIENTS_PER_ROOM})`);

      try {
        ws.send(JSON.stringify({
          type: "adminAssigned",
          room,
          online: this.isOnline(room),
          clients: this.getClientCount(room),
          maxClients: MAX_CLIENTS_PER_ROOM,
          devices: this.getDevices(room),
        }));
      } catch (_e) {}

      return { success: true };
    }

    // Conexão de TV / Player Kiosk
    if (!roomClients.has(room)) {
      roomClients.set(room, new Map());
    }

    const clients = roomClients.get(room)!;

    // 1. Limite rigoroso de 2 acessos simultâneos por sala para telas
    if (clients.size >= MAX_CLIENTS_PER_ROOM) {
      console.warn(`[WS] Conexão de TV recusada para sala '${room}': limite máximo de ${MAX_CLIENTS_PER_ROOM} telas atingido.`);
      try {
        ws.send(JSON.stringify({
          type: "roomFull",
          room,
          max: MAX_CLIENTS_PER_ROOM,
          message: `Esta sala já atingiu o limite de ${MAX_CLIENTS_PER_ROOM} telas conectadas. Retorne ao lobby ou aguarde uma vaga.`,
        }));
        // Fecha o WebSocket com código 4002 (Room Full)
        ws.close(4002, "Room is full");
      } catch (_e) {}
      return { success: false, error: "room_full" };
    }

    // 2. Registra o cliente com ID único e metadados
    const clientId = "tv_" + Math.random().toString(36).substring(2, 9);
    const ip = meta?.ip || "localhost";
    const userAgent = meta?.userAgent || "Navegador Web";
    const deviceLabel = getFriendlyDeviceLabel(userAgent, clients.size + 1);

    const client: ConnectedClient = {
      id: clientId,
      room,
      ws,
      connectedAt: Date.now(),
      ip,
      userAgent,
      deviceLabel,
    };

    clients.set(clientId, client);
    console.log(`[WS] Dispositivo conectado à sala '${room}': ${deviceLabel} [ID: ${clientId}] (Total: ${clients.size}/${MAX_CLIENTS_PER_ROOM})`);

    // Notifica o próprio cliente recém-conectado com suas credenciais de sessão
    try {
      ws.send(JSON.stringify({
        type: "clientAssigned",
        clientId,
        room,
        deviceLabel,
        maxClients: MAX_CLIENTS_PER_ROOM,
      }));
    } catch (_e) {}

    // Notifica presença atualizada para todos na sala (TVs e Admin)
    this.broadcastPresence(room);

    return { success: true, client };
  },

  /**
   * Remove o cliente desconectado (TV ou Admin)
   */
  remove(room: string, ws: WSContext) {
    // 1. Se era um Admin observador
    const admins = roomAdmins.get(room);
    if (admins && admins.has(ws)) {
      admins.delete(ws);
      if (admins.size === 0) {
        roomAdmins.delete(room);
      }
      console.log(`[WS] Painel Admin desconectado da sala '${room}'.`);
      return;
    }

    // 2. Se era uma TV / Player
    const clients = roomClients.get(room);
    if (!clients) return;

    for (const [id, client] of clients) {
      if (client.ws === ws) {
        clients.delete(id);
        console.log(`[WS] Dispositivo desconectado da sala '${room}': ${client.deviceLabel} (Restantes: ${clients.size}/${MAX_CLIENTS_PER_ROOM})`);
        break;
      }
    }

    if (clients.size === 0) {
      roomClients.delete(room);
    }

    this.broadcastPresence(room);
  },

  /**
   * Retira um dispositivo específico da sala e o envia ao lobby
   */
  kickClient(room: string, clientId: string, reason?: string): boolean {
    const clients = roomClients.get(room);
    if (!clients) return false;

    const client = clients.get(clientId);
    if (!client) return false;

    console.log(`[WS] Retirando dispositivo ${client.deviceLabel} [${clientId}] da sala '${room}' para o lobby...`);

    try {
      client.ws.send(JSON.stringify({
        type: "kickToLobby",
        room,
        reason: reason || "Você foi retirado da sala pelo administrador e enviado ao lobby.",
      }));
      // Código 4001: Kicked to Lobby
      client.ws.close(4001, "Kicked to lobby");
    } catch (_e) {}

    clients.delete(clientId);
    if (clients.size === 0) {
      roomClients.delete(room);
    }

    this.broadcastPresence(room);
    return true;
  },

  /**
   * Retira TODOS os dispositivos da sala e os envia ao lobby
   */
  kickAll(room: string, reason?: string): number {
    const clients = roomClients.get(room);
    if (!clients) return 0;

    const count = clients.size;
    console.log(`[WS] Retirando TODOS os ${count} dispositivos da sala '${room}' para o lobby...`);

    for (const [_id, client] of clients) {
      try {
        client.ws.send(JSON.stringify({
          type: "kickToLobby",
          room,
          reason: reason || "Todos os dispositivos desta sala foram retirados pelo administrador e enviados ao lobby.",
        }));
        client.ws.close(4001, "Kicked to lobby");
      } catch (_e) {}
    }

    roomClients.delete(room);
    this.broadcastPresence(room);
    return count;
  },

  /**
   * Retorna os metadados de todos os dispositivos conectados na sala
   */
  getDevices(room: string): DeviceInfo[] {
    const clients = roomClients.get(room);
    if (!clients) return [];
    const list: DeviceInfo[] = [];
    for (const client of clients.values()) {
      list.push({
        id: client.id,
        room: client.room,
        connectedAt: client.connectedAt,
        ip: client.ip,
        userAgent: client.userAgent,
        deviceLabel: client.deviceLabel,
      });
    }
    return list;
  },

  isOnline(room: string): boolean {
    const clients = roomClients.get(room);
    return Boolean(clients && clients.size > 0);
  },

  getClientCount(room: string): number {
    return roomClients.get(room)?.size ?? 0;
  },

  getMaxClients(): number {
    return MAX_CLIENTS_PER_ROOM;
  },

  /**
   * Envia atualização de presença para todos os clientes da sala
   */
  broadcastPresence(room: string) {
    const devices = this.getDevices(room);
    const online = devices.length > 0;
    this.broadcast(room, JSON.stringify({
      type: "presence",
      room,
      online,
      clients: devices.length,
      maxClients: MAX_CLIENTS_PER_ROOM,
      devices,
    }));
  },

  broadcast(room: string, message: string) {
    const clients = roomClients.get(room);
    if (clients) {
      for (const client of clients.values()) {
        try {
          client.ws.send(message);
        } catch (_e) {
          // Socket já fechado
        }
      }
    }

    const admins = roomAdmins.get(room);
    if (admins) {
      for (const adminWs of admins) {
        try {
          adminWs.send(message);
        } catch (_e) {
          // Socket já fechado
        }
      }
    }

    console.log(`[WS] Broadcast para sala '${room}': ${message.substring(0, 80)}...`);
  },

  broadcastAll(message: string) {
    for (const clients of roomClients.values()) {
      for (const client of clients.values()) {
        try {
          client.ws.send(message);
        } catch (_e) {}
      }
    }
    for (const admins of roomAdmins.values()) {
      for (const adminWs of admins) {
        try {
          adminWs.send(message);
        } catch (_e) {}
      }
    }
  },
};
