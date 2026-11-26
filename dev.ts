const isIsolatedDev = Deno.env.get("SIGNAGE_ENV") === "dev";
const backendPort = isIsolatedDev ? "8002" : "8001";

console.log(`🚀 Iniciando Signage Control System (${isIsolatedDev ? "Dev Isolado -> cap-signage-dev" : "Dev Padrão"})...`);
console.log(`📡 Backend Deno API: http://localhost:${backendPort}`);
console.log("⚡ Frontend Vite (HMR): http://localhost:5173");

const env = {
  ...Deno.env.toObject(),
  VITE_BACKEND_URL: `http://localhost:${backendPort}`,
};

const server = new Deno.Command("deno", {
  args: ["task", "dev:server"],
  env,
  stdout: "inherit",
  stderr: "inherit",
});
const serverProcess = server.spawn();

const front = new Deno.Command("deno", {
  args: ["task", "dev:front"],
  env,
  stdout: "inherit",
  stderr: "inherit",
});
const frontProcess = front.spawn();

const cleanup = () => {
  console.log("\n🛑 Encerrando processos...");
  try {
    serverProcess.kill();
  } catch (_e) {}
  try {
    frontProcess.kill();
  } catch (_e) {}
  Deno.exit(0);
};

Deno.addSignalListener("SIGINT", cleanup);
if (Deno.build.os !== "windows") {
  Deno.addSignalListener("SIGTERM", cleanup);
}

await Promise.race([serverProcess.status, frontProcess.status]);
