import { join } from "@std/path";
import { MongoClient } from "npm:mongodb";

// Carrega .env
try {
  const envContent = await Deno.readTextFile(".env");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!Deno.env.get(key)) Deno.env.set(key, val);
    }
  }
} catch {}

const uri = Deno.env.get("MONGODB_URI");
if (!uri) {
  console.error("❌ MONGODB_URI não encontrada no .env");
  Deno.exit(1);
}

const prodDbName = Deno.env.get("MONGODB_DB_NAME") || "cap-signage";
const targetDirs = ["./config-dev", "./config"];

console.log(`🔄 Exportando dados de '${prodDbName}' (MongoDB) para armazenamento local (${targetDirs.join(", ")})...`);
const client = new MongoClient(uri);
await client.connect();

const prodDb = client.db(prodDbName);

for (const dir of targetDirs) {
  await Deno.mkdir(dir, { recursive: true });
}

// 1. Coleções base em formato Array
const arrayCollections = ["rooms", "playlists", "users", "routines", "schedules", "devices"];
for (const colName of arrayCollections) {
  const docs = await prodDb.collection(colName).find({}, { projection: { _id: 0 } }).toArray();
  for (const dir of targetDirs) {
    await Deno.writeTextFile(join(dir, `${colName}.json`), JSON.stringify(docs, null, 2));
  }
  console.log(`  ✅ Arquivo '${colName}.json': ${docs.length} registro(s) exportado(s).`);
}

// 2. Coleção 'state' (objeto indexado por slug da sala)
const stateDocs = await prodDb.collection("state").find({}).toArray();
const stateMap: Record<string, any> = {};
for (const doc of stateDocs) {
  const { _id, slug, ...roomState } = doc;
  const key = String(slug || _id);
  stateMap[key] = roomState;
}
for (const dir of targetDirs) {
  await Deno.writeTextFile(join(dir, "state.json"), JSON.stringify(stateMap, null, 2));
}
console.log(`  ✅ Arquivo 'state.json': ${Object.keys(stateMap).length} sala(s) exportada(s).`);

// 3. Coleção 'settings' (objeto chave -> valor)
const settingsDocs = await prodDb.collection("settings").find({}).toArray();
const settingsMap: Record<string, any> = {};
for (const doc of settingsDocs) {
  if (doc.key) {
    settingsMap[doc.key] = doc.value;
  }
}
for (const dir of targetDirs) {
  await Deno.writeTextFile(join(dir, "settings.json"), JSON.stringify(settingsMap, null, 2));
}
console.log(`  ✅ Arquivo 'settings.json': ${Object.keys(settingsMap).length} configuração(ões) exportada(s).`);

await client.close();
console.log(`🎉 Dados locais sincronizados com sucesso em './config-dev/' e './config/'! (Zero uso de cluster extra no Mongo)`);

