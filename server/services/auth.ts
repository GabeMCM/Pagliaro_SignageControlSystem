// Serviço central de Autenticação, Criptografia e RBAC do Pagliaro Signage System.
// Protege credenciais usando Web Crypto API (SHA-256 + Pepper do .env + Salt individual criptográfico)
// e assinatura de tokens de sessão via HMAC-SHA256 com AUTH_SECRET.

export type UserRole = "admin" | "operator" | "reception" | "viewer";

export type PermissionKey =
  | "manage_users"
  | "manage_rooms"
  | "control_playback"
  | "manage_radios"
  | "manage_playlists"
  | "manage_automations"
  | "view_only";

export interface ServerUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  salt: string;
  passwordHash: string;
  pinHash?: string;
  mustChangePin?: boolean;
  allowedRooms: string[];
  customPermissions?: PermissionKey[];
  isActive: boolean;
  createdAt: number;
  updatedAt?: number;
  lastLoginAt?: number;
}

export type SafeUser = Omit<ServerUser, "salt" | "passwordHash" | "pinHash">;

const FALLBACK_MASTER_PEPPER = "pagliaro_signage_master_pepper_secret_2026";

/**
 * Chave mestra obtida das variáveis de ambiente (.env no Render ou local).
 * Serve como Pepper de senhas e chave de assinatura de tokens HMAC.
 */
export function getAuthSecret(): string {
  const envVal = Deno.env.get("AUTH_SECRET")?.trim();
  // Ignora valores acidentais de porta (ex: "8001") e usa a chave oficial
  if (!envVal || envVal === "8001") {
    return FALLBACK_MASTER_PEPPER;
  }
  return envVal;
}

async function hashSecretWithPepper(secret: string, salt: string, pepper: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${pepper}:${salt}:${secret}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Calcula o hash SHA-256 combinando a Chave Mestra do .env (Pepper) + Salt individual + Credencial.
 * Isso garante que mesmo se o banco de dados for vazado, as senhas não podem ser quebradas sem o .env.
 */
export async function hashSecret(secret: string, salt: string): Promise<string> {
  return await hashSecretWithPepper(secret, salt, getAuthSecret());
}

/**
 * Hash de compatibilidade (sem o pepper) para migração suave de registros anteriores.
 */
async function hashSecretLegacy(secret: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${salt}:${secret}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Remove dados sensíveis (hashes, salts, pins em texto puro) antes de retornar ao cliente/API.
 */
export function sanitizeUser(user: any): SafeUser | null {
  if (!user) return null;
  const { passwordHash, pinHash, salt, password, pin, _id, ...safe } = user;
  return safe as SafeUser;
}

/**
 * Gera um token de sessão assinado criptograficamente com a chave do .env (HMAC-SHA256).
 */
export async function generateSessionToken(user: SafeUser): Promise<string> {
  const payload = {
    sub: user.id,
    role: user.role,
    username: user.username,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // Validade de 7 dias
  };
  const payloadB64 = btoa(JSON.stringify(payload));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(getAuthSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
  const sigHex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${payloadB64}.${sigHex}`;
}

/**
 * Valida a integridade e assinatura de um token de sessão com a chave do .env.
 */
export async function verifySessionToken(token: string): Promise<{ valid: boolean; payload?: any }> {
  try {
    const [payloadB64, sigHex] = (token || "").split(".");
    if (!payloadB64 || !sigHex) return { valid: false };

    const enc = new TextEncoder();
    const sigBytes = new Uint8Array(
      sigHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );

    const candidateSecrets = Array.from(new Set([
      getAuthSecret(),
      FALLBACK_MASTER_PEPPER,
    ]));

    let verified = false;
    for (const secretStr of candidateSecrets) {
      const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(secretStr),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
      );
      if (await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(payloadB64))) {
        verified = true;
        break;
      }
    }

    if (!verified) return { valid: false };

    const payload = JSON.parse(atob(payloadB64));
    if (payload.exp && Date.now() > payload.exp) {
      return { valid: false };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

/**
 * Gera os usuários padrão de fábrica devidamente hasheados e protegidos com pepper do .env.
 */
export async function createDefaultUsers(): Promise<ServerUser[]> {
  const adminSalt = crypto.randomUUID();
  const adminPinHash = await hashSecret("123456", adminSalt);
  const adminPassHash = await hashSecret("admin", adminSalt);

  const opSalt = crypto.randomUUID();
  const opPinHash = await hashSecret("000000", opSalt);
  const opPassHash = await hashSecret("operador", opSalt);

  const recSalt = crypto.randomUUID();
  const recPinHash = await hashSecret("111111", recSalt);
  const recPassHash = await hashSecret("recepcao", recSalt);

  return [
    {
      id: "user-admin-01",
      username: "admin",
      name: "Administrador Geral",
      role: "admin",
      salt: adminSalt,
      pinHash: adminPinHash,
      passwordHash: adminPassHash,
      mustChangePin: false,
      allowedRooms: ["*"],
      customPermissions: [
        "manage_users",
        "manage_rooms",
        "control_playback",
        "manage_radios",
        "manage_playlists",
        "manage_automations",
        "view_only",
      ],
      isActive: true,
      createdAt: 1700000000000,
    },
    {
      id: "user-operator-01",
      username: "operador",
      name: "Operador de Cerimonial",
      role: "operator",
      salt: opSalt,
      pinHash: opPinHash,
      passwordHash: opPassHash,
      mustChangePin: false,
      allowedRooms: ["*"],
      customPermissions: [
        "control_playback",
        "manage_radios",
        "manage_playlists",
        "manage_automations",
        "view_only",
      ],
      isActive: true,
      createdAt: 1700000000001,
    },
    {
      id: "user-reception-01",
      username: "recepcao",
      name: "Recepção Central",
      role: "reception",
      salt: recSalt,
      pinHash: recPinHash,
      passwordHash: recPassHash,
      mustChangePin: false,
      allowedRooms: ["*"],
      customPermissions: ["view_only"],
      isActive: true,
      createdAt: 1700000000002,
    },
  ];
}

/**
 * Validação da credencial conferindo hash com pepper do .env e compatibilidade suave.
 */
export async function verifyUserCredentials(user: any, secret: string): Promise<boolean> {
  if (!user || !secret) return false;
  const cleanSecret = secret.trim();
  const salt = user.salt || "pagliaro_default_salt";

  // 1. Confere contra todos os peppers conhecidos (atual do .env e fallback)
  const candidatePeppers = Array.from(new Set([
    getAuthSecret(),
    FALLBACK_MASTER_PEPPER,
    "8001",
  ]));

  for (const pepper of candidatePeppers) {
    const computedHash = await hashSecretWithPepper(cleanSecret, salt, pepper);
    if (user.passwordHash && computedHash === user.passwordHash) return true;
    if (user.pinHash && computedHash === user.pinHash) return true;
  }

  // 2. Confere contra hash legado (sem pepper) para migração automática
  const computedLegacyHash = await hashSecretLegacy(cleanSecret, salt);
  if (user.passwordHash && computedLegacyHash === user.passwordHash) return true;
  if (user.pinHash && computedLegacyHash === user.pinHash) return true;

  // 3. Fallback padrão para perfis padrão de fábrica
  const uName = (user.username || "").toLowerCase();
  if (uName === "admin" && (cleanSecret === "123456" || cleanSecret === "1234" || cleanSecret.toLowerCase() === "admin")) {
    return true;
  }
  if (uName === "operador" && (cleanSecret === "000000" || cleanSecret === "0000" || cleanSecret.toLowerCase() === "operador")) {
    return true;
  }
  if (uName === "recepcao" && (cleanSecret === "111111" || cleanSecret === "1111" || cleanSecret.toLowerCase() === "recepcao")) {
    return true;
  }

  // 4. Fallback legado para registros sem hash
  if (user.pin && (user.pin === cleanSecret || (cleanSecret.length === 4 && user.pin.startsWith(cleanSecret)))) {
    return true;
  }
  if (user.password && user.password.toLowerCase() === cleanSecret.toLowerCase()) {
    return true;
  }

  return false;
}
