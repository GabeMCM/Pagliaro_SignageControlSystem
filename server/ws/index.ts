import { Hono } from "hono";
import { upgradeWebSocket } from "hono/deno";
import { wsManager } from "./manager.ts";

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
      onOpen(_event, ws) {
        wsManager.add(room, ws, { ip, userAgent, role: "admin" });
      },
      onClose(_event, ws) {
        wsManager.remove(room, ws);
      },
    };
  })
);

// Rota WebSocket para TVs conectadas a uma sala específica
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
      onOpen(_event, ws) {
        wsManager.add(room, ws, { ip, userAgent, role, deviceId, path: `/player/index.html?room=${room}` });
      },
      onMessage(event, _ws) {
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
