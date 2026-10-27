import { Hono } from "hono";
import { upgradeWebSocket } from "hono/deno";
import { wsManager } from "./manager.ts";
import { roomEventQueue } from "../services/event-queue.ts";

export const wsRoute = new Hono();

// Rota WebSocket do Hub Global de Aparelhos (para dispositivos na raiz / ou no lobby)
wsRoute.get(
  "/hub",
  upgradeWebSocket((c) => {
    const deviceId = c.req.query("deviceId") || c.req.query("id") || "";
    const path = c.req.query("path") || "/";
    const screenResolution = c.req.query("res") || "";
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
      c.req.header("cf-connecting-ip") ||
      "localhost";
    const userAgent = c.req.header("user-agent") || "Navegador Web";

    return {
      onOpen(_event, ws) {
        if (deviceId) {
          wsManager.registerDeviceSession(deviceId, ws, {
            ip,
            userAgent,
            path,
            screenResolution,
          });
        }
      },
      onMessage(event, ws) {
        try {
          const data = JSON.parse(String(event.data));
          if (data.type === "ping" && deviceId) {
            ws.send(JSON.stringify({ type: "pong", time: Date.now() }));
          }
        } catch (_e) {}
      },
      onClose(_event, ws) {
        if (deviceId) {
          wsManager.removeDeviceSession(deviceId, ws);
        }
      },
    };
  })
);

// Rota WebSocket para assinatura ao vivo da tela de Aparelhos no Painel Admin
wsRoute.get(
  "/admin/devices",
  upgradeWebSocket((_c) => {
    return {
      onOpen(_event, ws) {
        wsManager.subscribeAdminDevices(ws);
      },
      onClose(_event, ws) {
        wsManager.unsubscribeAdminDevices(ws);
      },
    };
  })
);

// Rota WebSocket para observadores de sala no Admin
wsRoute.get(
  "/admin/:room",
  upgradeWebSocket((c) => {
    const room = c.req.param("room") as string;
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
      c.req.header("cf-connecting-ip") ||
      "localhost";
    const userAgent = c.req.header("user-agent") || "Admin Panel";

    return {
      async onOpen(_event, ws) {
        wsManager.add(room, ws, { ip, userAgent, role: "admin" });
        try {
          const authState = await roomEventQueue.getAuthoritativeRoomState(room);
          ws.send(JSON.stringify({ type: "stateSync", state: authState, version: authState.version }));
        } catch (_e) {}
      },
      onMessage(event, ws) {
        try {
          const data = JSON.parse(String(event.data));
          if (data.type === "ping") {
            ws.send(JSON.stringify({ type: "pong", time: Date.now() }));
            return;
          }
          if (data.type === "control" && data.target && data.command) {
            roomEventQueue.enqueueControl(room, {
              target: data.target,
              command: data.command,
              value: data.value,
            }).catch(() => {});
            return;
          }
          if (data.type === "setState" && data.updates) {
            roomEventQueue.enqueueSetState(room, data.updates).catch(() => {});
            return;
          }
        } catch (_e) {}
      },
      onClose(_event, ws) {
        wsManager.remove(room, ws);
      },
    };
  })
);

// Rota WebSocket para TVs e Painéis conectados a uma sala específica
wsRoute.get(
  "/:room",
  upgradeWebSocket((c) => {
    const room = c.req.param("room") as string;
    const roleQuery = c.req.query("role") || c.req.query("type");
    const role: "player" | "admin" = roleQuery === "admin" ? "admin" : "player";
    const deviceId = c.req.query("deviceId") || c.req.query("id");

    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
      c.req.header("cf-connecting-ip") ||
      "localhost";
    const userAgent = c.req.header("user-agent") || "Navegador Web";

    return {
      async onOpen(_event, ws) {
        wsManager.add(room, ws, { ip, userAgent, role, deviceId, path: `/player/index.html?room=${room}` });
        try {
          const authState = await roomEventQueue.getAuthoritativeRoomState(room);
          ws.send(JSON.stringify({ type: "stateSync", state: authState, version: authState.version }));
        } catch (_e) {}
      },
      onMessage(event, ws) {
        try {
          const data = JSON.parse(String(event.data));
          if (data.type === "ping") {
            ws.send(JSON.stringify({ type: "pong", time: Date.now() }));
            return;
          }
          if (data.type === "control" && data.target && data.command) {
            roomEventQueue.enqueueControl(room, {
              target: data.target,
              command: data.command,
              value: data.value,
            }).catch(() => {});
            return;
          }
          if (data.type === "setState" && data.updates) {
            roomEventQueue.enqueueSetState(room, data.updates).catch(() => {});
            return;
          }
          if (data.type === "audioState") {
            wsManager.setClientAudioState(room, ws, {
              state: String(data.state || "unknown"),
              detail: data.detail ? String(data.detail).slice(0, 200) : "",
              track: data.track !== undefined ? Number(data.track) : null,
            });
            return;
          }
        } catch (_e) {}
        console.log(`[WS][${role}] Mensagem da sala ${room}:`, event.data);
      },
      onClose(_event, ws) {
        wsManager.remove(room, ws);
      },
    };
  })
);

// Fallback para conexão na raiz /ws (redireciona logicamente para o hub)
wsRoute.get(
  "/",
  upgradeWebSocket((c) => {
    const deviceId = c.req.query("deviceId") || c.req.query("id") || "";
    const path = c.req.query("path") || "/";
    const screenResolution = c.req.query("res") || "";
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
      c.req.header("cf-connecting-ip") ||
      "localhost";
    const userAgent = c.req.header("user-agent") || "Navegador Web";

    return {
      onOpen(_event, ws) {
        if (deviceId) {
          wsManager.registerDeviceSession(deviceId, ws, {
            ip,
            userAgent,
            path,
            screenResolution,
          });
        }
      },
      onClose(_event, ws) {
        if (deviceId) {
          wsManager.removeDeviceSession(deviceId, ws);
        }
      },
    };
  })
);
