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

// Habilita CORS para todas as rotas /api permitindo o acesso local do front-end
app.use("/api/*", cors());

// Rotas da API REST
app.route("/api", api);

// Rotas de Mídia (Upload e Gestão)
app.route("/api/media", mediaRoute);

// Rotas WebSocket
app.route("/ws", wsRoute);

// Rota estática para servir a mídia (vídeos e imagens) para os Players
app.use("/media/*", serveStatic({ root: "./" }));

// Rota estática para o Kiosk Player
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

console.log("Server running on http://localhost:8000");

Deno.serve({ port: 8000 }, app.fetch);
