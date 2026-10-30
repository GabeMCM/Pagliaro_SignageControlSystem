// ==============================================================================
// GERADOR DE REFRESH TOKEN DO DROPBOX (NUNCA EXPIRA)
// ==============================================================================
// Uso:
//   deno run -A scripts/dropbox-token.ts
// ou:
//   deno run -A scripts/dropbox-token.ts <APP_SECRET> <CODIGO>
// ==============================================================================

const defaultAppKey = Deno.env.get("DROPBOX_APP_KEY") || "1occi7mbnags2z2";

console.log("\n=======================================================");
console.log(" 🔑 GERADOR DE REFRESH TOKEN DO DROPBOX (OFFLINE ACCESS)");
console.log("=======================================================\n");

let appKey = defaultAppKey;
let appSecret = Deno.env.get("DROPBOX_APP_SECRET") || "";
let authCode = "";

if (Deno.args.length === 1 && Deno.args[0] !== "--help") {
  appSecret = Deno.args[0];
} else if (Deno.args.length === 2) {
  appSecret = Deno.args[0];
  authCode = Deno.args[1];
} else if (Deno.args.length >= 3) {
  appKey = Deno.args[0];
  appSecret = Deno.args[1];
  authCode = Deno.args[2];
}

const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${appKey}&response_type=code&token_access_type=offline`;

console.log("PASSO 1: Abra o link abaixo no seu navegador para autorizar seu App:");
console.log("------------------------------------------------------------------");
console.log(authUrl);
console.log("------------------------------------------------------------------\n");
console.log("Clique em 'Continuar' e depois 'Permitir'. O Dropbox mostrará um código na tela.\n");

if (!appSecret) {
  const inputSecret = prompt("Digite o App Secret do seu aplicativo Dropbox (Settings -> App secret):");
  if (!inputSecret) {
    console.error("❌ App Secret é obrigatório.");
    Deno.exit(1);
  }
  appSecret = inputSecret.trim();
}

if (!authCode) {
  const inputCode = prompt("Cole o Código de Autorização gerado pelo Dropbox:");
  if (!inputCode) {
    console.error("❌ Código de autorização é obrigatório.");
    Deno.exit(1);
  }
  authCode = inputCode.trim();
}

console.log("\n⏳ Trocando o código pelo Refresh Token perpétuo...");

try {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: authCode,
    client_id: appKey,
    client_secret: appSecret,
  });

  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`\n❌ Erro retornado pelo Dropbox (${res.status}):\n`, errText);
    Deno.exit(1);
  }

  const data = await res.json();
  const refreshToken = data.refresh_token;
  const accessToken = data.access_token;

  if (!refreshToken) {
    console.warn("⚠️ O Dropbox não retornou um refresh_token. Verifique se o link foi aberto com token_access_type=offline.");
    console.log("Dados:", data);
    Deno.exit(1);
  }

  // Testa conexão com o novo token
  const accRes = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
    method: "POST",
    headers: { "Authorization": "Bearer " + accessToken },
  });
  const accData = await accRes.json();

  console.log("\n=======================================================");
  console.log(" ✅ REFRESH TOKEN GERADO COM SUCESSO!");
  console.log("=======================================================");
  console.log(" Conta Conectada:", accData.name?.display_name || "OK");
  console.log(" E-mail:", accData.email || "");
  console.log("=======================================================\n");
  console.log("Copie e cole estas variáveis no seu arquivo .env ou no Render:\n");
  console.log(`DROPBOX_APP_KEY=${appKey}`);
  console.log(`DROPBOX_APP_SECRET=${appSecret}`);
  console.log(`DROPBOX_REFRESH_TOKEN=${refreshToken}`);
  console.log(`DROPBOX_MUSIC_FOLDER=/Músicas\n`);
  console.log("=======================================================");
  console.log("Pronto! Com essas variáveis, o servidor renovará o acesso");
  console.log("automaticamente para sempre, sem precisar mexer nunca mais.\n");

} catch (err: any) {
  console.error("❌ Falha de rede:", err.message || err);
  Deno.exit(1);
}
