import { Hono } from "hono";
import { join } from "@std/path";
import { db } from "../services/db.ts";

export const mediaRoute = new Hono();
const UPLOADS_DIR = "./media/uploads";

mediaRoute.get("/", async (c) => {
  const files = [];
  try {
    for await (const entry of Deno.readDir(UPLOADS_DIR)) {
      if (entry.isFile) {
        files.push(entry.name);
      }
    }
  } catch (error) {
    console.error("Erro ao ler diretório de uploads:", error);
  }
  return c.json(files);
});

mediaRoute.post("/upload", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];
  
  if (file && file instanceof File) {
    const arrBuffer = await file.arrayBuffer();
    const uint8Arr = new Uint8Array(arrBuffer);
    const filename = file.name.replace(/\s+/g, "_");
    
    // Assegura que o diretório existe
    try {
      await Deno.mkdir(UPLOADS_DIR, { recursive: true });
    } catch {
      // Ignora erro se já existir
    }
    
    await Deno.writeFile(join(UPLOADS_DIR, filename), uint8Arr);
    return c.json({ success: true, filename });
  }
  return c.json({ error: "Nenhum arquivo enviado" }, 400);
});

mediaRoute.delete("/:filename", async (c) => {
  const filename = c.req.param("filename");
  try {
    await Deno.remove(join(UPLOADS_DIR, filename));
    
    // Cascata: Remover de todas as playlists
    const playlists = await db.getPlaylists();
    let changed = false;
    
    for (const pl of playlists) {
      if (pl.items && Array.isArray(pl.items)) {
        const initialLen = pl.items.length;
        pl.items = pl.items.filter((item: string) => item !== filename);
        if (pl.items.length !== initialLen) {
          changed = true;
        }
      }
    }
    
    if (changed) {
      await db.savePlaylists(playlists);
    }
    
    return c.json({ success: true });
  } catch (_e) {
    return c.json({ error: "Arquivo não encontrado ou erro ao deletar" }, 404);
  }
});
