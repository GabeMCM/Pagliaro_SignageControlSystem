import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import { cors } from "hono/cors";
import { api } from "./routes/api.ts";
import { mediaRoute } from "./routes/media.ts";
import { wsRoute } from "./ws/index.ts";

const app = new Hono();

// Logger simples
app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${c.req.method} ${c.req.url} - ${c.res.status} - ${ms}ms`);
});

// Habilita CORS configurável por variável de ambiente
const corsOrigin = Deno.env.get("CORS_ORIGIN") || "*";
app.use("/api/*", cors({ origin: corsOrigin }));

// Rotas da API REST
app.route("/api", api);

// Rotas de Mídia (Upload e Gestão)
app.route("/api/media", mediaRoute);

// Rotas WebSocket
app.route("/ws", wsRoute);

// Rota estática para servir a mídia (vídeos e imagens) para os Players
app.use("/media/*", serveStatic({ root: "./" }));

// Rota estática para o Kiosk Player
app.get("/player", (c) => c.redirect("/player/index.html"));
app.use("/player/*", serveStatic({ root: "./public" }));

// Rotas estáticas para o frontend do Admin (Vite Build SPA)
app.use("/*", serveStatic({ root: "./front/dist" }));

// Fallback SPA (Single Page Application): Qualquer rota não encontrada vai para o index.html
app.get("*", async (c) => {
  try {
    const html = await Deno.readTextFile("./front/dist/index.html");
    return c.html(html);
  } catch {
    return c.text("Frontend não compilado. Execute 'deno task build:front' primeiro.", 404);
  }
});

const PORT = Number(Deno.env.get("PORT") || 8001);
console.log(`Server running on port ${PORT} (env: ${Deno.env.get("NODE_ENV") || "development"})`);

Deno.serve({ port: PORT }, app.fetch);
