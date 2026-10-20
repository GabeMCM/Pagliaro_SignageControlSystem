console.log("🚀 Iniciando Signage Control System (Dev Mode)...");
console.log("📡 Backend Deno API: http://localhost:8000");
console.log("⚡ Frontend Vite (HMR): http://localhost:5173");

const server = new Deno.Command("deno", {
  args: ["task", "dev:server"],
  stdout: "inherit",
  stderr: "inherit",
});
const serverProcess = server.spawn();

const front = new Deno.Command("deno", {
  args: ["task", "dev:front"],
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
