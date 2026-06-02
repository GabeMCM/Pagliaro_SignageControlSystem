const server = new Deno.Command("deno", {
  args: ["task", "dev:server"],
  stdout: "inherit",
  stderr: "inherit",
});

console.log("🚀 Iniciando Servidor Unificado (Porta 8000)...");
const serverProcess = server.spawn();

// Ao pressionar Ctrl+C, o terminal no Windows encerra toda a árvore de processos anexada,
// então os subprocessos serão fechados junto com o script principal automaticamente.
