import { Hono } from "hono";
import { upgradeWebSocket } from "hono/deno";
import { wsManager } from "./manager.ts";

export const wsRoute = new Hono();

wsRoute.get(
  "/:room",
  upgradeWebSocket((c) => {
    const room = c.req.param("room") as string;
    const roleQuery = c.req.query("role") || c.req.query("type");
    const role: "player" | "admin" = roleQuery === "admin" ? "admin" : "player";

    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
      c.req.header("cf-connecting-ip") ||
      "localhost";
    const userAgent = c.req.header("user-agent") || "Navegador Web";

    return {
      onOpen(_event, ws) {
        wsManager.add(room, ws, { ip, userAgent, role });
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
