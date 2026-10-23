import { join } from "@std/path";
import { MongoClient, type Db } from "npm:mongodb";

// Carrega arquivo .env local caso exista
try {
  const envContent = await Deno.readTextFile(".env");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!Deno.env.get(key)) {
        Deno.env.set(key, val);
      }
    }
  }
} catch {
  // Ignora se o arquivo .env não existir (comum em produção no Render onde as vars vêm do painel)
}

const CONFIG_DIR = "./config";
const MONGODB_URI = Deno.env.get("MONGODB_URI");
const MONGODB_DB_NAME = Deno.env.get("MONGODB_DB_NAME") || "signage_control";

let mongoClient: MongoClient | null = null;
let mongoDb: Db | null = null;
let isConnectedToMongo = false;

// Funções para manipulação de arquivos JSON locais (fallback ou modo dev offline)
async function readJson(filename: string) {
  try {
    const data = await Deno.readTextFile(join(CONFIG_DIR, filename));
    return JSON.parse(data);
  } catch (_error) {
    return null;
  }
}

async function writeJson(filename: string, data: any) {
  try {
    await Deno.mkdir(CONFIG_DIR, { recursive: true });
    await Deno.writeTextFile(join(CONFIG_DIR, filename), JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Erro ao escrever ${filename}:`, error);
    return false;
  }
}

// Migração automática de dados locais para o MongoDB na primeira inicialização
async function migrateLocalDataIfEmpty() {
  if (!mongoDb) return;
  try {
    // 1. Migra Salas se a coleção estiver vazia
    const roomsCol = mongoDb.collection("rooms");
    const roomsCount = await roomsCol.countDocuments();
    if (roomsCount === 0) {
      const localRooms = (await readJson("rooms.json")) || [];
      if (localRooms.length > 0) {
        console.log(`[MongoDB] Migrando ${localRooms.length} salas locais para o MongoDB Atlas...`);
        const clean = localRooms.map((r: any) => {
          const { _id, ...rest } = r;
          return rest;
        });
        await roomsCol.insertMany(clean);
      }
    }

    // 2. Migra Playlists se a coleção estiver vazia
    const plCol = mongoDb.collection("playlists");
    const plCount = await plCol.countDocuments();
    if (plCount === 0) {
      const localPlaylists = (await readJson("playlists.json")) || [];
      if (localPlaylists.length > 0) {
        console.log(`[MongoDB] Migrando ${localPlaylists.length} playlists locais para o MongoDB Atlas...`);
        const clean = localPlaylists.map((p: any) => {
          const { _id, ...rest } = p;
          return rest;
        });
        await plCol.insertMany(clean);
      }
    }

    // 3. Migra Estados das Salas se a coleção estiver vazia
    const stateCol = mongoDb.collection("state");
    const stateCount = await stateCol.countDocuments();
    if (stateCount === 0) {
      const localState = (await readJson("state.json")) || {};
      const entries = Object.entries(localState);
      if (entries.length > 0) {
        console.log(`[MongoDB] Migrando estados de salas locais para o MongoDB Atlas...`);
        for (const [slug, roomState] of entries) {
          if (roomState) {
            await stateCol.updateOne(
              { slug },
              { $set: { slug, ...(typeof roomState === "object" ? roomState : { playlist: roomState }) } },
              { upsert: true }
            );
          }
        }
      }
    }

    // 4. Migra Dispositivos se a coleção estiver vazia
    const devCol = mongoDb.collection("devices");
    const devCount = await devCol.countDocuments();
    if (devCount === 0) {
      const localDevs = (await readJson("devices.json")) || [];
      if (localDevs.length > 0) {
        console.log(`[MongoDB] Migrando ${localDevs.length} dispositivos locais para o MongoDB Atlas...`);
        const clean = localDevs.map((d: any) => {
          const { _id, ...rest } = d;
          return rest;
        });
        await devCol.insertMany(clean);
      }
    }

    // 5. Migra Agendamentos/Automações se a coleção estiver vazia
    const schedCol = mongoDb.collection("schedules");
    const schedCount = await schedCol.countDocuments();
    if (schedCount === 0) {
      const localScheds = (await readJson("schedules.json")) || [];
      if (localScheds.length > 0) {
        console.log(`[MongoDB] Migrando ${localScheds.length} agendamentos locais para o MongoDB Atlas...`);
        const clean = localScheds.map((s: any) => {
          const { _id, ...rest } = s;
          return rest;
        });
        await schedCol.insertMany(clean);
      }
    }
  } catch (e) {
    console.warn("[MongoDB] Aviso durante migração inicial de dados:", e);
  }
}

let mongoConnectionError: string | null = null;
let connectPromise: Promise<boolean> | null = null;

export async function tryConnectMongo(): Promise<boolean> {
  const currentUri = Deno.env.get("MONGODB_URI") || MONGODB_URI;
  if (!currentUri) {
    mongoConnectionError = "Variável MONGODB_URI não configurada no servidor (Render).";
    return false;
  }
  if (isConnectedToMongo && mongoDb) return true;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    try {
      console.log("[Database] Conectando ao MongoDB Atlas...");
      mongoClient = new MongoClient(currentUri, {
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 10000,
      });
      await mongoClient.connect();
      const currentDbName = Deno.env.get("MONGODB_DB_NAME") || MONGODB_DB_NAME;
      mongoDb = mongoClient.db(currentDbName);
      isConnectedToMongo = true;
      mongoConnectionError = null;
      console.log(`[MongoDB Atlas] Conectado com sucesso ao banco '${currentDbName}'!`);

      // Limpa os caches em memória para garantir dados frescos do MongoDB Atlas
      roomsCache = null;
      playlistsCache = null;
      stateCache = null;

      await migrateLocalDataIfEmpty();
      return true;
    } catch (err: any) {
      mongoConnectionError = err?.message || String(err);
      console.error("⚠️ [MongoDB Atlas] Falha ao conectar ao banco:", mongoConnectionError);
      isConnectedToMongo = false;
      return false;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

// Inicializa a conexão com o MongoDB Atlas na inicialização
if (MONGODB_URI) {
  tryConnectMongo().catch(() => {});
} else {
  mongoConnectionError = "Variável MONGODB_URI não configurada no servidor (Render).";
  console.log("ℹ️ [Database] MONGODB_URI não configurada. Usando armazenamento local em arquivos JSON (./config/).");
}

async function ensureMongoConnected() {
  const currentUri = Deno.env.get("MONGODB_URI") || MONGODB_URI;
  if (currentUri && (!isConnectedToMongo || !mongoDb)) {
    await tryConnectMongo();
  }
}

// Caches em memória para acelerar respostas para 0ms e evitar latência de rede no Render
let roomsCache: any[] | null = null;
let playlistsCache: any[] | null = null;
let stateCache: Record<string, any> | null = null;

export const db = {
  /**
   * Retorna a lista de todas as salas cadastradas
   */
  getRooms: async (): Promise<any[]> => {
    await ensureMongoConnected();
    if (roomsCache) return roomsCache;
    if (isConnectedToMongo && mongoDb) {
      try {
        const rooms = await mongoDb.collection("rooms").find({}, { projection: { _id: 0 } }).toArray();
        roomsCache = rooms;
        return rooms;
      } catch (e) {
        console.error("[MongoDB] Erro ao buscar salas:", e);
      }
    }
    const currentUri = Deno.env.get("MONGODB_URI") || MONGODB_URI;
    if (!currentUri) {
      const local = (await readJson("rooms.json")) || [];
      roomsCache = local;
      return local;
    }
    return roomsCache || [];
  },

  /**
   * Salva/atualiza a lista completa de salas
   */
  saveRooms: async (rooms: any[]): Promise<boolean> => {
    roomsCache = rooms;
    if (isConnectedToMongo && mongoDb) {
      try {
        const col = mongoDb.collection("rooms");
        await col.deleteMany({});
        if (rooms.length > 0) {
          const docs = rooms.map((r) => {
            const { _id, ...rest } = r;
            return rest;
          });
          await col.insertMany(docs);
        }
        return true;
      } catch (e) {
        console.error("[MongoDB] Erro ao salvar salas:", e);
        return false;
      }
    }
    return writeJson("rooms.json", rooms);
  },

  /**
   * Retorna a lista de todas as playlists
   */
  getPlaylists: async (): Promise<any[]> => {
    await ensureMongoConnected();
    if (playlistsCache) return playlistsCache;
    if (isConnectedToMongo && mongoDb) {
      try {
        const playlists = await mongoDb.collection("playlists").find({}, { projection: { _id: 0 } }).toArray();
        playlistsCache = playlists;
        return playlists;
      } catch (e) {
        console.error("[MongoDB] Erro ao buscar playlists:", e);
      }
    }
    const currentUri = Deno.env.get("MONGODB_URI") || MONGODB_URI;
    if (!currentUri) {
      const local = (await readJson("playlists.json")) || [];
      playlistsCache = local;
      return local;
    }
    return playlistsCache || [];
  },

  /**
   * Salva/atualiza a lista completa de playlists
   */
  savePlaylists: async (playlists: any[]): Promise<boolean> => {
    await ensureMongoConnected();
    playlistsCache = playlists;
    if (isConnectedToMongo && mongoDb) {
      try {
        const col = mongoDb.collection("playlists");
        await col.deleteMany({});
        if (playlists.length > 0) {
          const docs = playlists.map((p) => {
            const { _id, ...rest } = p;
            return rest;
          });
          await col.insertMany(docs);
        }
        return true;
      } catch (e) {
        console.error("[MongoDB] Erro ao salvar playlists:", e);
        return false;
      }
    }
    return writeJson("playlists.json", playlists);
  },

  /**
   * Retorna o estado atual de todas as salas (objeto indexado por slug)
   */
  getState: async (): Promise<Record<string, any>> => {
    await ensureMongoConnected();
    if (stateCache) return { ...stateCache };
    if (isConnectedToMongo && mongoDb) {
      try {
        const docs = await mongoDb.collection("state").find({}).toArray();
        const stateObj: Record<string, any> = {};
        for (const doc of docs) {
          const { _id, slug, ...roomState } = doc;
          stateObj[slug || _id] = roomState;
        }
        stateCache = stateObj;
        return { ...stateObj };
      } catch (e) {
        console.error("[MongoDB] Erro ao buscar estado:", e);
      }
    }
    const currentUri = Deno.env.get("MONGODB_URI") || MONGODB_URI;
    if (!currentUri) {
      const local = (await readJson("state.json")) || {};
      stateCache = local;
      return { ...local };
    }
    return stateCache ? { ...stateCache } : {};
  },

  /**
   * Salva/atualiza o estado de apenas UMA sala no banco e no cache de forma ultra-rápida
   */
  saveRoomState: async (slug: string, roomState: any): Promise<boolean> => {
    if (!stateCache) {
      stateCache = await db.getState();
    }
    stateCache[slug] = roomState;

    if (isConnectedToMongo && mongoDb) {
      try {
        await mongoDb.collection("state").updateOne(
          { slug },
          { $set: { slug, ...(typeof roomState === "object" ? roomState : { playlist: roomState }) } },
          { upsert: true }
        );
        return true;
      } catch (e) {
        console.error(`[MongoDB] Erro ao salvar estado da sala ${slug}:`, e);
      }
    }
    return writeJson("state.json", stateCache);
  },

  /**
   * Salva/atualiza o estado das salas
   */
  saveState: async (state: Record<string, any>): Promise<boolean> => {
    stateCache = { ...state };
    if (isConnectedToMongo && mongoDb) {
      try {
        const col = mongoDb.collection("state");
        for (const [slug, roomState] of Object.entries(state)) {
          if (!roomState) continue;
          await col.updateOne(
            { slug },
            { $set: { slug, ...(typeof roomState === "object" ? roomState : { playlist: roomState }) } },
            { upsert: true }
          );
        }
        return true;
      } catch (e) {
        console.error("[MongoDB] Erro ao salvar estado:", e);
        return false;
      }
    }
    return writeJson("state.json", state);
  },

  /**
   * Retorna todos os aparelhos/dispositivos cadastrados
   */
  getDevices: async (): Promise<any[]> => {
    if (isConnectedToMongo && mongoDb) {
      try {
        return await mongoDb.collection("devices").find({}, { projection: { _id: 0 } }).toArray();
      } catch (e) {
        console.error("[MongoDB] Erro ao buscar dispositivos:", e);
      }
    }
    return (await readJson("devices.json")) || [];
  },

  /**
   * Retorna um aparelho específico pelo ID
   */
  getDevice: async (id: string): Promise<any | null> => {
    if (isConnectedToMongo && mongoDb) {
      try {
        return await mongoDb.collection("devices").findOne({ id }, { projection: { _id: 0 } });
      } catch (e) {
        console.error("[MongoDB] Erro ao buscar dispositivo:", e);
      }
    }
    const list: any[] = (await readJson("devices.json")) || [];
    return list.find((d) => d.id === id) || null;
  },

  /**
   * Salva ou atualiza os dados de um aparelho
   */
  saveDevice: async (device: any): Promise<boolean> => {
    if (!device || !device.id) return false;
    if (isConnectedToMongo && mongoDb) {
      try {
        const { _id, ...rest } = device;
        await mongoDb.collection("devices").updateOne(
          { id: device.id },
          { $set: rest },
          { upsert: true }
        );
        return true;
      } catch (e) {
        console.error("[MongoDB] Erro ao salvar dispositivo:", e);
        return false;
      }
    }
    const list: any[] = (await readJson("devices.json")) || [];
    const idx = list.findIndex((d) => d.id === device.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...device };
    } else {
      list.push(device);
    }
    return writeJson("devices.json", list);
  },

  /**
   * Remove um aparelho cadastrado
   */
  deleteDevice: async (id: string): Promise<boolean> => {
    if (isConnectedToMongo && mongoDb) {
      try {
        await mongoDb.collection("devices").deleteOne({ id });
        return true;
      } catch (e) {
        console.error("[MongoDB] Erro ao deletar dispositivo:", e);
        return false;
      }
    }
    let list: any[] = (await readJson("devices.json")) || [];
    list = list.filter((d) => d.id !== id);
    return writeJson("devices.json", list);
  },

  /**
   * Retorna lista de tarefas agendadas (opcionalmente filtrada por sala)
   */
  getSchedules: async (roomSlug?: string): Promise<any[]> => {
    if (isConnectedToMongo && mongoDb) {
      try {
        const query = roomSlug ? { roomSlug } : {};
        return await mongoDb
          .collection("schedules")
          .find(query, { projection: { _id: 0 } })
          .sort({ scheduledAt: 1 })
          .toArray();
      } catch (e) {
        console.error("[MongoDB] Erro ao buscar agendamentos:", e);
      }
    }
    const list: any[] = (await readJson("schedules.json")) || [];
    const filtered = roomSlug ? list.filter((s) => s.roomSlug === roomSlug) : list;
    return filtered.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  },

  /**
   * Retorna um agendamento específico pelo ID
   */
  getSchedule: async (id: string): Promise<any | null> => {
    if (isConnectedToMongo && mongoDb) {
      try {
        return await mongoDb.collection("schedules").findOne({ id }, { projection: { _id: 0 } });
      } catch (e) {
        console.error("[MongoDB] Erro ao buscar agendamento:", e);
      }
    }
    const list: any[] = (await readJson("schedules.json")) || [];
    return list.find((s) => s.id === id) || null;
  },

  /**
   * Salva ou atualiza uma tarefa agendada
   */
  saveSchedule: async (task: any): Promise<boolean> => {
    if (!task || !task.id) return false;
    if (isConnectedToMongo && mongoDb) {
      try {
        const { _id, ...rest } = task;
        await mongoDb.collection("schedules").updateOne(
          { id: task.id },
          { $set: rest },
          { upsert: true }
        );
        return true;
      } catch (e) {
        console.error("[MongoDB] Erro ao salvar agendamento:", e);
        return false;
      }
    }
    const list: any[] = (await readJson("schedules.json")) || [];
    const idx = list.findIndex((s) => s.id === task.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...task };
    } else {
      list.push(task);
    }
    return writeJson("schedules.json", list);
  },

  /**
   * Remove uma tarefa agendada
   */
  deleteSchedule: async (id: string): Promise<boolean> => {
    if (isConnectedToMongo && mongoDb) {
      try {
        await mongoDb.collection("schedules").deleteOne({ id });
        return true;
      } catch (e) {
        console.error("[MongoDB] Erro ao deletar agendamento:", e);
        return false;
      }
    }
    let list: any[] = (await readJson("schedules.json")) || [];
    list = list.filter((s) => s.id !== id);
    return writeJson("schedules.json", list);
  },

  /**
   * Retorna o status da conexão atual com detalhes de diagnóstico
   */
  getStatus: async () => {
    const currentUri = Deno.env.get("MONGODB_URI") || MONGODB_URI;
    if (!isConnectedToMongo && currentUri && !isConnecting) {
      await tryConnectMongo();
    }
    const currentDbName = Deno.env.get("MONGODB_DB_NAME") || MONGODB_DB_NAME;
    return {
      driver: isConnectedToMongo ? "mongodb" : "json",
      database: isConnectedToMongo ? currentDbName : "local-files",
      hasUri: Boolean(currentUri),
      error: isConnectedToMongo ? null : mongoConnectionError,
    };
  },
};
