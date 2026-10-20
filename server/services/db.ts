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
        console.log(`📦 [MongoDB] Migrando ${localRooms.length} salas locais para o MongoDB Atlas...`);
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
        console.log(`📦 [MongoDB] Migrando ${localPlaylists.length} playlists locais para o MongoDB Atlas...`);
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
        console.log(`📦 [MongoDB] Migrando estados de salas locais para o MongoDB Atlas...`);
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
  } catch (e) {
    console.warn("⚠️ [MongoDB] Aviso durante migração inicial de dados:", e);
  }
}

// Inicializa a conexão com o MongoDB Atlas se MONGODB_URI estiver presente
if (MONGODB_URI) {
  try {
    console.log("🔄 [Database] Conectando ao MongoDB Atlas...");
    mongoClient = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });
    await mongoClient.connect();
    mongoDb = mongoClient.db(MONGODB_DB_NAME);
    isConnectedToMongo = true;
    console.log(`✅ [MongoDB Atlas] Conectado com sucesso ao banco '${MONGODB_DB_NAME}'!`);

    await migrateLocalDataIfEmpty();
  } catch (err) {
    console.error("⚠️ [MongoDB Atlas] Falha ao conectar ao banco. Usando armazenamento local em JSON como fallback.", err);
    isConnectedToMongo = false;
  }
} else {
  console.log("ℹ️ [Database] MONGODB_URI não configurada. Usando armazenamento local em arquivos JSON (./config/).");
}

export const db = {
  /**
   * Retorna a lista de todas as salas cadastradas
   */
  getRooms: async (): Promise<any[]> => {
    if (isConnectedToMongo && mongoDb) {
      try {
        return await mongoDb.collection("rooms").find({}, { projection: { _id: 0 } }).toArray();
      } catch (e) {
        console.error("[MongoDB] Erro ao buscar salas:", e);
      }
    }
    return (await readJson("rooms.json")) || [];
  },

  /**
   * Salva/atualiza a lista completa de salas
   */
  saveRooms: async (rooms: any[]): Promise<boolean> => {
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
    if (isConnectedToMongo && mongoDb) {
      try {
        return await mongoDb.collection("playlists").find({}, { projection: { _id: 0 } }).toArray();
      } catch (e) {
        console.error("[MongoDB] Erro ao buscar playlists:", e);
      }
    }
    return (await readJson("playlists.json")) || [];
  },

  /**
   * Salva/atualiza a lista completa de playlists
   */
  savePlaylists: async (playlists: any[]): Promise<boolean> => {
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
    if (isConnectedToMongo && mongoDb) {
      try {
        const docs = await mongoDb.collection("state").find({}).toArray();
        const stateObj: Record<string, any> = {};
        for (const doc of docs) {
          const { _id, slug, ...roomState } = doc;
          stateObj[slug || _id] = roomState;
        }
        return stateObj;
      } catch (e) {
        console.error("[MongoDB] Erro ao buscar estado:", e);
      }
    }
    return (await readJson("state.json")) || {};
  },

  /**
   * Salva/atualiza o estado das salas
   */
  saveState: async (state: Record<string, any>): Promise<boolean> => {
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
   * Retorna o status da conexão atual
   */
  getStatus: () => ({
    driver: isConnectedToMongo ? "mongodb" : "json",
    database: isConnectedToMongo ? MONGODB_DB_NAME : "local-files",
  }),
};
