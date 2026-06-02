import { join } from "@std/path";

const CONFIG_DIR = "./config";

async function readJson(filename: string) {
  try {
    const data = await Deno.readTextFile(join(CONFIG_DIR, filename));
    return JSON.parse(data);
  } catch (error) {
    // Se o arquivo não existir ou for inválido
    console.error(`Erro ao ler ${filename}:`, error);
    return null;
  }
}

async function writeJson(filename: string, data: any) {
  try {
    await Deno.writeTextFile(join(CONFIG_DIR, filename), JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Erro ao escrever ${filename}:`, error);
    return false;
  }
}

export const db = {
  getRooms: async () => (await readJson("rooms.json")) || [],
  saveRooms: async (data: any) => writeJson("rooms.json", data),
  
  getPlaylists: async () => (await readJson("playlists.json")) || [],
  savePlaylists: async (data: any) => writeJson("playlists.json", data),
  
  getState: async () => (await readJson("state.json")) || {},
  saveState: async (data: any) => writeJson("state.json", data),
};
