import { WSContext } from "hono/ws";
import { db } from "../services/db.ts";

export interface ConnectedClient {
  id: string;
  room: string;
  ws: WSContext;
  connectedAt: number;
  ip: string;
  userAgent: string;
  deviceLabel: string;
  deviceId?: string;
}

export interface DeviceInfo {
  id: string;
  room: string;
  connectedAt: number;
  ip: string;
  userAgent: string;
  deviceLabel: string;
}

export interface DeviceSession {
  deviceId: string;
  ws: WSContext;
  ip: string;
  userAgent: string;
  currentRoom: string | null;
  currentPath: string;
  connectedAt: number;
  lastSeenAt: number;
  deviceLabel: string;
}

export const MAX_CLIENTS_PER_ROOM = 2;

// Mapa de salas para clientes TV (Players): Map<roomSlug, Map<clientId, ConnectedClient>>
const roomClients = new Map<string, Map<string, ConnectedClient>>();

// Mapa de salas para observadores do Painel Admin (não ocupam vagas de TV): Map<roomSlug, Set<WSContext>>
const roomAdmins = new Map<string, Set<WSContext>>();

// Mapa global de aparelhos conectados: Map<deviceId, DeviceSession>
const deviceSessions = new Map<string, DeviceSession>();

// Conjunto de observadores da tela de Aparelhos do Painel Admin: Set<WSContext>
const adminDevicesListeners = new Set<WSContext>();

export function detectDeviceType(userAgent: string): string {
  if (/aft|silk|vega|amazon/i.test(userAgent)) return "Amazon Fire Stick (Vega OS / Silk)";
  if (/vidaa|hisense/i.test(userAgent)) return "Smart TV Hisense (VIDAA)";
  if (/tizen/i.test(userAgent)) return "Smart TV Samsung (Tizen)";
  if (/webos|web0s|netcast/i.test(userAgent)) return "Smart TV LG (webOS)";
  if (/android.*tv|google.*tv|bravia/i.test(userAgent)) return "Android TV";
  if (/smart-tv|smarttv|hbbtv|viera|philips|opera tv|roku/i.test(userAgent)) return "Smart TV";
  if (/android/i.test(userAgent)) return "Dispositivo Android";
  if (/ipad/i.test(userAgent)) return "Apple iPad";
  if (/iphone/i.test(userAgent)) return "Apple iPhone";
  if (/windows/i.test(userAgent)) return "Computador Windows";
  if (/macintosh|mac os/i.test(userAgent)) return "Apple Mac";
  if (/linux/i.test(userAgent)) return "Dispositivo Linux";
  return "Navegador Web";
}

function getFriendlyDeviceLabel(userAgent: string, currentCount: number): string {
  const base = detectDeviceType(userAgent);
  let browser = "";
  if (/silk/i.test(userAgent)) browser = " (Silk)";
  else if (/edg/i.test(userAgent)) browser = " (Edge)";
  else if (/chrome/i.test(userAgent)) browser = " (Chrome)";
  else if (/firefox/i.test(userAgent)) browser = " (Firefox)";
  else if (/safari/i.test(userAgent)) browser = " (Safari)";

  return `${base} #${currentCount}${browser}`;
}

export const wsManager = {
  /**
   * Adiciona um novo cliente à sala respeitando o limite de 2 acessos para TVs
   */
  add(
    room: string,
    ws: WSContext,
    meta?: {
      ip?: string;
      userAgent?: string;
      role?: "player" | "admin";
      deviceId?: string;
      path?: string;
    }
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

    // Se o mesmo aparelho (mesmo deviceId) já possuir uma conexão nesta sala (ex: recarregou ou oscilou),
    // substitui a conexão anterior para não consumir duas vagas com a mesma TV!
    if (meta?.deviceId) {
      for (const [existingClientId, existingClient] of Array.from(clients.entries())) {
        if (existingClient.deviceId === meta.deviceId) {
          console.log(`[WS] Aparelho '${meta.deviceId}' reconectou à sala '${room}'. Substituindo sessão antiga [${existingClientId}].`);
          try {
            existingClient.ws.close(1000, "Reconnected with new session");
          } catch (_e) {}
          clients.delete(existingClientId);
          break;
        }
      }
    }

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
      deviceId: meta?.deviceId,
    };

    clients.set(clientId, client);
    console.log(`[WS] Dispositivo conectado à sala '${room}': ${deviceLabel} [ID: ${clientId}] (Total: ${clients.size}/${MAX_CLIENTS_PER_ROOM})`);

    // Se possui deviceId persistente, registra/atualiza também no mapa global de aparelhos
    if (meta?.deviceId) {
      this.registerDeviceSession(meta.deviceId, ws, {
        ip,
        userAgent,
        room,
        path: meta.path || `/player/index.html?room=${room}`,
      });
    }

    // Notifica o próprio cliente recém-conectado com suas credenciais de sessão
    try {
      ws.send(JSON.stringify({
        type: "clientAssigned",
        clientId,
        deviceId: meta?.deviceId,
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
        if (client.deviceId) {
          this.removeDeviceSession(client.deviceId, ws);
        }
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

  // ==========================================
  // GESTÃO GLOBAL DE APARELHOS (DEVICES HUB)
  // ==========================================

  /**
   * Registra ou atualiza uma sessão de aparelho conectado
   */
  async registerDeviceSession(
    deviceId: string,
    ws: WSContext,
    meta?: {
      ip?: string;
      userAgent?: string;
      room?: string | null;
      path?: string;
      screenResolution?: string;
    }
  ) {
    if (!deviceId) return;
    const ip = meta?.ip || "localhost";
    const userAgent = meta?.userAgent || "Navegador Web";
    const detectedLabel = detectDeviceType(userAgent);
    const room = meta?.room || null;
    const path = meta?.path || "/";

    const session: DeviceSession = {
      deviceId,
      ws,
      ip,
      userAgent,
      currentRoom: room,
      currentPath: path,
      connectedAt: Date.now(),
      lastSeenAt: Date.now(),
      deviceLabel: detectedLabel,
    };

    deviceSessions.set(deviceId, session);
    console.log(`[WS] Aparelho [${deviceId}] registrado globalmente (IP: ${ip}, Local: ${path}, Sala: ${room || "Nenhuma"})`);

    try {
      const existing = await db.getDevice(deviceId);
      const rooms = await db.getRooms();
      const boundRoomSlug = existing?.assignedRoomSlug || room;
      const assignedRoom = rooms.find((r: any) => r.slug === boundRoomSlug);

      const deviceRecord = {
        id: deviceId,
        name: existing?.name || `${detectedLabel} (${deviceId.slice(-4)})`,
        detectedLabel,
        userAgent,
        ip,
        screenResolution: meta?.screenResolution || existing?.screenResolution || "",
        assignedRoomSlug: boundRoomSlug || null,
        assignedRoomName: assignedRoom?.name || null,
        currentPath: path,
        lastSeenAt: Date.now(),
        firstSeenAt: existing?.firstSeenAt || Date.now(),
      };

      await db.saveDevice(deviceRecord);

      // Notifica o aparelho com suas configurações salvas
      try {
        ws.send(JSON.stringify({
          type: "deviceRegistered",
          deviceId,
          name: deviceRecord.name,
          assignedRoomSlug: deviceRecord.assignedRoomSlug,
          assignedRoomName: deviceRecord.assignedRoomName,
        }));
      } catch (_e) {}

      this.broadcastDevicesUpdate();
    } catch (e) {
      console.error("[WS] Erro ao sincronizar aparelho com o banco:", e);
    }
  },

  /**
   * Remove sessão de aparelho quando o socket desconecta
   */
  removeDeviceSession(deviceId: string, ws: WSContext) {
    const existing = deviceSessions.get(deviceId);
    if (existing && existing.ws === ws) {
      deviceSessions.delete(deviceId);
      console.log(`[WS] Aparelho [${deviceId}] desconectou do hub global.`);
      this.broadcastDevicesUpdate();
    }
  },

  isDeviceOnline(deviceId: string): boolean {
    return deviceSessions.has(deviceId);
  },

  sendToDevice(deviceId: string, message: any): boolean {
    const session = deviceSessions.get(deviceId);
    if (!session) return false;
    try {
      session.ws.send(typeof message === "string" ? message : JSON.stringify(message));
      return true;
    } catch (_e) {
      return false;
    }
  },

  /**
   * Envia sinal de identificação visual para a tela do aparelho
   */
  identifyDevice(
    deviceId: string,
    info?: { duration?: number; message?: string; name?: string; room?: string }
  ): boolean {
    const session = deviceSessions.get(deviceId);
    if (!session) return false;
    const duration = info?.duration || 15;
    try {
      session.ws.send(JSON.stringify({
        type: "identify",
        deviceId,
        duration,
        name: info?.name || session.deviceLabel,
        room: info?.room || session.currentRoom,
        ip: session.ip,
        message: info?.message || `Aparelho Identificado: ${session.deviceLabel}`,
      }));
      return true;
    } catch (_e) {
      return false;
    }
  },

  /**
   * Vincula ou desvincula uma sala para o aparelho e comanda a TV em tempo real
   */
  async bindDeviceToRoom(deviceId: string, roomSlug: string | null): Promise<boolean> {
    const existing = await db.getDevice(deviceId);
    const rooms = await db.getRooms();
    const assignedRoom = rooms.find((r: any) => r.slug === roomSlug);

    if (existing) {
      existing.assignedRoomSlug = roomSlug;
      existing.assignedRoomName = assignedRoom?.name || null;
      await db.saveDevice(existing);
    }

    const session = deviceSessions.get(deviceId);
    if (session) {
      session.currentRoom = roomSlug;
      try {
        session.ws.send(JSON.stringify({
          type: "bindRoom",
          deviceId,
          roomSlug,
          roomName: assignedRoom?.name || null,
        }));
      } catch (_e) {}
    }

    this.broadcastDevicesUpdate();
    return true;
  },

  /**
   * Força recarregamento remoto na tela do aparelho
   */
  reloadDevice(deviceId: string): boolean {
    const session = deviceSessions.get(deviceId);
    if (!session) return false;
    try {
      session.ws.send(JSON.stringify({
        type: "reload",
        deviceId,
      }));
      return true;
    } catch (_e) {
      return false;
    }
  },

  /**
   * Assina atualizações ao vivo da lista de aparelhos para o Painel Admin
   */
  async subscribeAdminDevices(ws: WSContext) {
    adminDevicesListeners.add(ws);
    try {
      const dbDevices = await db.getDevices();
      const enriched = dbDevices.map((d: any) => ({
        ...d,
        online: deviceSessions.has(d.id),
      }));
      ws.send(JSON.stringify({
        type: "devicesList",
        devices: enriched,
      }));
    } catch (_e) {}
  },

  unsubscribeAdminDevices(ws: WSContext) {
    adminDevicesListeners.delete(ws);
  },

  async broadcastDevicesUpdate() {
    if (adminDevicesListeners.size === 0) return;
    try {
      const dbDevices = await db.getDevices();
      const enriched = dbDevices.map((d: any) => ({
        ...d,
        online: deviceSessions.has(d.id),
      }));
      const payload = JSON.stringify({
        type: "devicesUpdate",
        devices: enriched,
      });
      for (const ws of adminDevicesListeners) {
        try {
          ws.send(payload);
        } catch (_e) {}
      }
    } catch (e) {
      console.error("[WS] Erro ao transmitir atualização de dispositivos:", e);
    }
  },
};
