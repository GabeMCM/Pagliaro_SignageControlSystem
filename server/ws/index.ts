import { Hono } from "hono";
import { upgradeWebSocket } from "hono/deno";
import { wsManager } from "./manager.ts";

export const wsRoute = new Hono();

wsRoute.get(
  "/:room",
  upgradeWebSocket((c) => {
    const room = c.req.param("room") as string;
    
    return {
      onOpen(_event, ws) {
        wsManager.add(room, ws);
      },
      onMessage(event, _ws) {
        // Os players são passivos, mas podem enviar pings/status
        console.log(`[WS] Mensagem da sala ${room}:`, event.data);
      },
      onClose(_event, ws) {
        wsManager.remove(room, ws);
      },
    };
  })
);
