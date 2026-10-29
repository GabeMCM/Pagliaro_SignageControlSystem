import { useState, useEffect, useCallback } from "react";

export type UserRole = "admin" | "operator" | "reception" | "viewer";

export type PermissionKey =
  | "manage_users"
  | "manage_rooms"
  | "control_playback"
  | "manage_radios"
  | "manage_playlists"
  | "manage_automations"
  | "view_only";

export interface PermissionDefinition {
  key: PermissionKey;
  label: string;
  description: string;
}

export const SYSTEM_PERMISSIONS: PermissionDefinition[] = [
  {
    key: "manage_users",
    label: "Gerenciar Usuários & Acessos",
    description: "Criar, editar e excluir contas de operadores e alterar permissões",
  },
  {
    key: "manage_rooms",
    label: "Gerenciar Salas & Telas",
    description: "Criar, excluir salas e vincular novos displays de TV",
  },
  {
    key: "control_playback",
    label: "Controle de Mídia & Som",
    description: "Dar play/pause no áudio, ajustar volume, trocar faixas e ligar/desligar standby",
  },
  {
    key: "manage_radios",
    label: "Gerenciar Web Rádios",
    description: "Sintonizar emissoras, cadastrar novos streams e excluir rádios",
  },
  {
    key: "manage_playlists",
    label: "Gerenciar Mídias & Playlists",
    description: "Criar playlists, enviar músicas/vídeos e reordenar faixas",
  },
  {
    key: "manage_automations",
    label: "Automações & Rotinas",
    description: "Criar e editar rotinas agnósticas de salas e agendamentos de cerimônia",
  },
  {
    key: "view_only",
    label: "Visualização do Sistema",
    description: "Consultar cerimônias, homenagens e monitorar status das telas",
  },
];

export interface AppUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  pin: string; // 6 dígitos numéricos (ex: "123456")
  mustChangePin?: boolean; // Se true, o operador é forçado a redefinir no primeiro login
  allowedRooms: string[]; // ["*"] para todas as salas ou lista de slugs ["sala-01", "sala-02"]
  customPermissions?: PermissionKey[];
  isActive: boolean;
  createdAt: number;
  lastLoginAt?: number;
}

export const ROLE_LABELS: Record<UserRole, { title: string; desc: string; badge: string }> = {
  admin: {
    title: "Administrador Geral",
    desc: "Acesso irrestrito a todas as salas, aparelhos, rotinas e configurações do sistema.",
    badge: "Superuser",
  },
  operator: {
    title: "Operador de Cerimonial",
    desc: "Controle operacional do som, transmissões e automações nas salas autorizadas.",
    badge: "Operador",
  },
  reception: {
    title: "Recepção / Atendimento",
    desc: "Consulta das cerimônias em andamento e status das telas, sem permissão de alteração.",
    badge: "Recepção",
  },
  viewer: {
    title: "Monitoramento / Leitura",
    desc: "Apenas visualização do painel e monitoramento passivo das salas.",
    badge: "Leitura",
  },
};

const DEFAULT_USERS: AppUser[] = [
  {
    id: "user-admin-01",
    username: "admin",
    name: "Administrador Geral",
    role: "admin",
    pin: "123456",
    mustChangePin: false,
    allowedRooms: ["*"],
    isActive: true,
    createdAt: 1700000000000,
    lastLoginAt: Date.now(),
  },
  {
    id: "user-operator-01",
    username: "operador",
    name: "Operador de Cerimonial",
    role: "operator",
    pin: "000000",
    mustChangePin: false,
    allowedRooms: ["*"],
    isActive: true,
    createdAt: 1700000000001,
  },
  {
    id: "user-reception-01",
    username: "recepcao",
    name: "Recepção Central",
    role: "reception",
    pin: "111111",
    mustChangePin: false,
    allowedRooms: ["*"],
    isActive: true,
    createdAt: 1700000000002,
  },
];

const STORAGE_USERS_KEY = "pagliaro_auth_users_v1";
const STORAGE_SESSION_KEY = "pagliaro_auth_session_v1";
const AUTH_CHANGE_EVENT = "pagliaro:auth-changed";

export function getUsers(): AppUser[] {
  if (typeof window === "undefined") return DEFAULT_USERS;
  try {
    const raw = localStorage.getItem(STORAGE_USERS_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(DEFAULT_USERS));
      return DEFAULT_USERS;
    }
    const parsed: AppUser[] = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Migração suave de PINs legados de 4 dígitos para 6 dígitos
      let hasMigration = false;
      const normalized = parsed.map((u) => {
        let pin = (u.pin || "").trim();
        if (pin.length < 6) {
          if (pin === "1234") pin = "123456";
          else if (pin === "0000") pin = "000000";
          else if (pin === "1111") pin = "111111";
          else pin = pin.padEnd(6, "0");
          hasMigration = true;
        }
        return {
          ...u,
          pin,
          mustChangePin: Boolean(u.mustChangePin),
        };
      });
      if (hasMigration) {
        localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(normalized));
      }
      return normalized;
    }
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(DEFAULT_USERS));
    return DEFAULT_USERS;
  } catch (err) {
    console.error("Erro ao carregar usuários:", err);
    return DEFAULT_USERS;
  }
}

export function saveUsers(users: AppUser[]): void {
  try {
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users));
    window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT));
  } catch (err) {
    console.error("Erro ao salvar usuários:", err);
  }
}

export function getCurrentUser(): AppUser {
  const users = getUsers();
  if (typeof window === "undefined") return users[0] || DEFAULT_USERS[0];
  try {
    const activeId = localStorage.getItem(STORAGE_SESSION_KEY);
    if (activeId) {
      const found = users.find((u) => u.id === activeId && u.isActive);
      if (found) return found;
    }
    // Padrão: primeira conta admin ativa
    const firstAdmin = users.find((u) => u.role === "admin" && u.isActive) || users[0];
    if (firstAdmin) {
      localStorage.setItem(STORAGE_SESSION_KEY, firstAdmin.id);
      return firstAdmin;
    }
    return DEFAULT_USERS[0];
  } catch {
    return DEFAULT_USERS[0];
  }
}

export function setCurrentUser(userId: string): boolean {
  const users = getUsers();
  const user = users.find((u) => u.id === userId && u.isActive);
  if (!user) return false;

  try {
    localStorage.setItem(STORAGE_SESSION_KEY, user.id);
    // Atualiza lastLoginAt
    const updated = users.map((u) =>
      u.id === user.id ? { ...u, lastLoginAt: Date.now() } : u
    );
    saveUsers(updated);
    window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function checkUserPermission(
  user: AppUser | null,
  permission: PermissionKey,
  roomSlug?: string
): boolean {
  if (!user || !user.isActive) return false;

  // Admin possui todas as permissões em todas as salas
  if (user.role === "admin") return true;

  // Validação de Sala Alvo (se informada)
  if (roomSlug && !user.allowedRooms.includes("*") && !user.allowedRooms.includes(roomSlug)) {
    return false;
  }

  // Permissões customizadas explícitas
  if (user.customPermissions && user.customPermissions.includes(permission)) {
    return true;
  }

  // Permissões padrão por Papel
  switch (user.role) {
    case "operator":
      return [
        "control_playback",
        "manage_radios",
        "manage_playlists",
        "manage_automations",
        "view_only",
      ].includes(permission);

    case "reception":
      return ["view_only"].includes(permission);

    case "viewer":
      return ["view_only"].includes(permission);

    default:
      return false;
  }
}

export function canUserAccessRoom(user: AppUser | null, roomSlug: string): boolean {
  if (!user || !user.isActive) return false;
  if (user.role === "admin") return true;
  if (user.allowedRooms.includes("*")) return true;
  return user.allowedRooms.includes(roomSlug);
}

export function useAuth() {
  const [currentUser, setLocalCurrentUser] = useState<AppUser>(() => getCurrentUser());
  const [users, setLocalUsers] = useState<AppUser[]>(() => getUsers());

  const refresh = useCallback(() => {
    setLocalUsers(getUsers());
    setLocalCurrentUser(getCurrentUser());
  }, []);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_USERS_KEY || e.key === STORAGE_SESSION_KEY) {
        refresh();
      }
    };
    const handleCustomChange = () => refresh();

    window.addEventListener(AUTH_CHANGE_EVENT, handleCustomChange);
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener(AUTH_CHANGE_EVENT, handleCustomChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [refresh]);

  const loginWithPin = useCallback(
    (identifierOrPin: string, pinInput?: string): { success: boolean; user?: AppUser; mustChangePin?: boolean; message?: string } => {
      const clean1 = identifierOrPin.trim();
      const clean2 = (pinInput || "").trim();

      // Caso 1: Forneceu apenas o PIN de 6 dígitos direto (sem escolher usuário previamente)
      if (!pinInput && /^\d{6}$/.test(clean1)) {
        const found = users.find((u) => u.isActive && u.pin === clean1);
        if (found) {
          setCurrentUser(found.id);
          refresh();
          return { success: true, user: found, mustChangePin: Boolean(found.mustChangePin) };
        }
        return { success: false, message: "PIN de 6 dígitos não encontrado." };
      }

      // Caso 2: Escolheu usuário (por ID ou username) e digitou o PIN
      const user = users.find(
        (u) =>
          u.isActive &&
          (u.id === clean1 || u.username.toLowerCase() === clean1.toLowerCase())
      );

      if (!user) {
        return { success: false, message: "Operador não localizado." };
      }

      const checkPin = clean2 || clean1;
      if (user.pin === checkPin) {
        setCurrentUser(user.id);
        refresh();
        return { success: true, user, mustChangePin: Boolean(user.mustChangePin) };
      }

      return { success: false, message: "PIN incorreto. Deve conter 6 dígitos." };
    },
    [users, refresh]
  );

  const changePin = useCallback(
    (newPin: string, currentPin?: string): { success: boolean; message?: string } => {
      const cleanNew = newPin.trim();
      if (!/^\d{6}$/.test(cleanNew)) {
        return { success: false, message: "O novo PIN deve conter exatamente 6 dígitos numéricos." };
      }

      const currentList = getUsers();
      const idx = currentList.findIndex((u) => u.id === currentUser?.id);
      if (idx < 0) {
        return { success: false, message: "Usuário ativo não encontrado." };
      }

      const user = currentList[idx];

      // Se informou PIN atual, valida se bate
      if (currentPin !== undefined && !user.mustChangePin) {
        if (user.pin !== currentPin.trim()) {
          return { success: false, message: "O PIN atual digitado está incorreto." };
        }
      }

      if (user.pin === cleanNew) {
        return { success: false, message: "O novo PIN não pode ser igual ao PIN atual." };
      }

      currentList[idx] = {
        ...user,
        pin: cleanNew,
        mustChangePin: false,
      };

      saveUsers(currentList);
      refresh();
      return { success: true };
    },
    [currentUser?.id, refresh]
  );

  const adminSetPin = useCallback(
    (userId: string, newPin: string, mustChangeOnNextLogin: boolean = true): { success: boolean; message?: string } => {
      const cleanNew = newPin.trim();
      if (!/^\d{6}$/.test(cleanNew)) {
        return { success: false, message: "O PIN deve conter exatamente 6 dígitos numéricos." };
      }

      const currentList = getUsers();
      const idx = currentList.findIndex((u) => u.id === userId);
      if (idx < 0) {
        return { success: false, message: "Usuário não encontrado." };
      }

      currentList[idx] = {
        ...currentList[idx],
        pin: cleanNew,
        mustChangePin: mustChangeOnNextLogin,
      };

      saveUsers(currentList);
      refresh();
      return { success: true };
    },
    [refresh]
  );

  const switchUser = useCallback(
    (userId: string) => {
      const ok = setCurrentUser(userId);
      if (ok) refresh();
      return ok;
    },
    [refresh]
  );

  const addUser = useCallback(
    (user: Omit<AppUser, "id" | "createdAt">): AppUser => {
      const currentList = getUsers();
      const newUser: AppUser = {
        ...user,
        pin: user.pin || "000000",
        id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        createdAt: Date.now(),
        isActive: true,
      };
      const updated = [...currentList, newUser];
      saveUsers(updated);
      refresh();
      return newUser;
    },
    [refresh]
  );

  const editUser = useCallback(
    (id: string, updates: Partial<AppUser>): boolean => {
      const currentList = getUsers();
      const idx = currentList.findIndex((u) => u.id === id);
      if (idx < 0) return false;

      currentList[idx] = { ...currentList[idx], ...updates };
      saveUsers(currentList);
      refresh();
      return true;
    },
    [refresh]
  );

  const removeUser = useCallback(
    (id: string): { success: boolean; message?: string } => {
      const currentList = getUsers();
      if (currentList.length <= 1) {
        return { success: false, message: "Não é permitido excluir o único usuário do sistema." };
      }
      const target = currentList.find((u) => u.id === id);
      if (!target) return { success: false, message: "Usuário não encontrado." };

      if (target.id === currentUser.id) {
        return { success: false, message: "Você não pode excluir o usuário que está atualmente logado." };
      }

      const filtered = currentList.filter((u) => u.id !== id);
      saveUsers(filtered);
      refresh();
      return { success: true };
    },
    [currentUser.id, refresh]
  );

  const resetAllToDefault = useCallback(() => {
    localStorage.removeItem(STORAGE_USERS_KEY);
    localStorage.removeItem(STORAGE_SESSION_KEY);
    saveUsers(DEFAULT_USERS);
    setCurrentUser(DEFAULT_USERS[0].id);
    refresh();
  }, [refresh]);

  const hasPermission = useCallback(
    (permission: PermissionKey, roomSlug?: string) => {
      return checkUserPermission(currentUser, permission, roomSlug);
    },
    [currentUser]
  );

  const canAccessRoom = useCallback(
    (roomSlug: string) => {
      return canUserAccessRoom(currentUser, roomSlug);
    },
    [currentUser]
  );

  return {
    currentUser,
    users,
    hasPermission,
    canAccessRoom,
    login: loginWithPin,
    loginWithPin,
    changePin,
    adminSetPin,
    switchUser,
    addUser,
    editUser,
    removeUser,
    resetAllToDefault,
    refresh,
  };
}
