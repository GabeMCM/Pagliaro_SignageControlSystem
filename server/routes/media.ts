import { Hono } from "hono";
import { join } from "@std/path";
import { db } from "../services/db.ts";
import { wsManager } from "../ws/manager.ts";

export const mediaRoute = new Hono();
const UPLOADS_DIR = "./media/uploads";

mediaRoute.get("/", async (c) => {
  const files: string[] = [];
  try {
    // Garante que o diretório existe
    await Deno.mkdir(UPLOADS_DIR, { recursive: true }).catch(() => {});
    for await (const entry of Deno.readDir(UPLOADS_DIR)) {
      if (entry.isFile && !entry.name.startsWith(".")) {
        files.push(entry.name);
      }
    }
    files.sort((a, b) => a.localeCompare(b));
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
    
    // Sanitiza o nome do arquivo
    const cleanName = file.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    
    try {
      await Deno.mkdir(UPLOADS_DIR, { recursive: true });
    } catch {
      // Ignora erro se já existir
    }
    
    await Deno.writeFile(join(UPLOADS_DIR, cleanName), uint8Arr);
    return c.json({ success: true, filename: cleanName });
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
        pl.items = pl.items.filter((item: any) => {
          if (typeof item === "string") return item !== filename;
          if (item && item.url) {
            return !item.url.endsWith("/" + filename) && item.url !== filename;
          }
          return true;
        });
        if (pl.items.length !== initialLen) {
          changed = true;
        }
      }
    }
    
    if (changed) {
      await db.savePlaylists(playlists);
      // Notifica as salas ativas
      wsManager.broadcastAll(JSON.stringify({ type: "updateState" }));
    }
    
    return c.json({ success: true });
  } catch (_e) {
    return c.json({ error: "Arquivo não encontrado ou erro ao deletar" }, 404);
  }
});
