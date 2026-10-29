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
  pin?: string;
  password?: string;
  mustChangePin?: boolean;
  allowedRooms: string[];
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

export const DEFAULT_USERS: AppUser[] = [
  {
    id: "user-admin-01",
    username: "admin",
    name: "Administrador Geral",
    role: "admin",
    mustChangePin: false,
    allowedRooms: ["*"],
    isActive: true,
    createdAt: 1700000000000,
  },
  {
    id: "user-operator-01",
    username: "operador",
    name: "Operador de Cerimonial",
    role: "operator",
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
    mustChangePin: false,
    allowedRooms: ["*"],
    isActive: true,
    createdAt: 1700000000002,
  },
];

const STORAGE_USERS_KEY = "pagliaro_auth_users_v2";
const STORAGE_SESSION_KEY = "pagliaro_auth_session_v2";
const STORAGE_SESSION_USER_KEY = "pagliaro_auth_session_user_v2";
const AUTH_CHANGE_EVENT = "pagliaro:auth-changed";

const API_BASE =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE) ||
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:8001");

/**
 * Busca a lista de usuários atualizada do banco de dados (MongoDB Atlas / Backend)
 */
export async function fetchUsersFromApi(): Promise<AppUser[]> {
  try {
    const res = await fetch(`${API_BASE}/api/users`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(data));
        window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT));
        return data;
      }
    }
  } catch (err) {
    console.warn("[Auth] Não foi possível sincronizar usuários com a API no momento:", err);
  }
  return getUsers();
}

export function getUsers(): AppUser[] {
  if (typeof window === "undefined") return DEFAULT_USERS;
  try {
    const raw = localStorage.getItem(STORAGE_USERS_KEY);
    if (!raw) return DEFAULT_USERS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_USERS;
  } catch {
    return DEFAULT_USERS;
  }
}

export function getCurrentUser(): AppUser | null {
  if (typeof window === "undefined") return null;
  try {
    const rawUser = localStorage.getItem(STORAGE_SESSION_USER_KEY);
    if (rawUser) {
      const parsed = JSON.parse(rawUser);
      if (parsed && parsed.id) return parsed;
    }
    const activeId = localStorage.getItem(STORAGE_SESSION_KEY);
    if (!activeId) return null;
    const users = getUsers();
    return users.find((u) => u.id === activeId && u.isActive) || null;
  } catch {
    return null;
  }
}

export function logoutUser(): void {
  try {
    localStorage.removeItem(STORAGE_SESSION_KEY);
    localStorage.removeItem(STORAGE_SESSION_USER_KEY);
    window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT));
  } catch (err) {
    console.error("Erro ao efetuar logout:", err);
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
  const [currentUser, setLocalCurrentUser] = useState<AppUser | null>(() => getCurrentUser());
  const [users, setLocalUsers] = useState<AppUser[]>(() => getUsers());

  const refresh = useCallback(() => {
    setLocalUsers(getUsers());
    setLocalCurrentUser(getCurrentUser());
  }, []);

  // Sincroniza usuários com o banco de dados e valida integridade do token de sessão
  useEffect(() => {
    const savedToken = typeof window !== "undefined" ? localStorage.getItem("pagliaro_auth_session_token_v2") : null;
    if (savedToken) {
      fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${savedToken}` },
      })
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            if (data.authenticated && data.user) {
              localStorage.setItem(STORAGE_SESSION_USER_KEY, JSON.stringify(data.user));
              setLocalCurrentUser(data.user);
            }
          } else if (res.status === 401) {
            logoutUser();
            setLocalCurrentUser(null);
          }
        })
        .catch(() => {});
    }

    fetchUsersFromApi().then((fresh) => {
      setLocalUsers(fresh);
      const cur = getCurrentUser();
      if (cur) {
        const found = fresh.find((u) => u.id === cur.id);
        if (found) {
          localStorage.setItem(STORAGE_SESSION_USER_KEY, JSON.stringify(found));
          setLocalCurrentUser(found);
        }
      }
    });
  }, []);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_USERS_KEY || e.key === STORAGE_SESSION_KEY || e.key === STORAGE_SESSION_USER_KEY) {
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

  /**
   * Realiza login autenticando diretamente no Banco de Dados via API segura
   */
  const login = useCallback(
    async (
      identifierOrPin: string,
      pinOrPasswordInput?: string
    ): Promise<{ success: boolean; user?: AppUser; mustChangePin?: boolean; message?: string }> => {
      const cleanIdent = (identifierOrPin || "").trim();
      const cleanSecret = (pinOrPasswordInput || "").trim() || cleanIdent;

      try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identifier: cleanIdent,
            secret: cleanSecret,
          }),
        });

        const data = await res.json();

        if (res.ok && data.success && data.user) {
          const authUser: AppUser = data.user;
          localStorage.setItem(STORAGE_SESSION_KEY, authUser.id);
          localStorage.setItem(STORAGE_SESSION_USER_KEY, JSON.stringify(authUser));
          if (data.token) {
            localStorage.setItem("pagliaro_auth_session_token_v2", data.token);
          }
          setLocalCurrentUser(authUser);
          window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT));
          return {
            success: true,
            user: authUser,
            mustChangePin: Boolean(data.mustChangePin),
          };
        }

        return {
          success: false,
          message: data.error || "Usuário ou PIN incorreto.",
        };
      } catch (err: any) {
        console.error("Falha na chamada de login:", err);
        return {
          success: false,
          message: "Não foi possível conectar ao servidor para autenticar.",
        };
      }
    },
    []
  );

  /**
   * Troca de PIN / Senha pessoal pelo operador salvando no Banco de Dados
   */
  const changePin = useCallback(
    async (newPin: string, currentPin?: string): Promise<{ success: boolean; message?: string }> => {
      const cleanNew = newPin.trim();
      if (!/^\d{6}$/.test(cleanNew)) {
        return { success: false, message: "O novo PIN deve conter exatamente 6 dígitos numéricos." };
      }

      if (!currentUser?.id) {
        return { success: false, message: "Sessão expirada. Faça login novamente." };
      }

      try {
        const res = await fetch(`${API_BASE}/api/auth/change-pin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: currentUser.id,
            newPin: cleanNew,
            currentSecret: currentPin ? currentPin.trim() : undefined,
          }),
        });

        const data = await res.json();
        if (res.ok && data.success && data.user) {
          const updatedUser: AppUser = data.user;
          localStorage.setItem(STORAGE_SESSION_USER_KEY, JSON.stringify(updatedUser));
          setLocalCurrentUser(updatedUser);
          await fetchUsersFromApi();
          window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT));
          return { success: true };
        }

        return { success: false, message: data.error || "Erro ao atualizar PIN no banco de dados." };
      } catch (err: any) {
        return { success: false, message: err.message || "Erro de conexão ao salvar PIN." };
      }
    },
    [currentUser?.id]
  );

  /**
   * Administrador define o PIN de qualquer usuário
   */
  const adminSetPin = useCallback(
    async (
      userId: string,
      newPin: string,
      mustChangeOnNextLogin: boolean = true
    ): Promise<{ success: boolean; message?: string }> => {
      const cleanNew = newPin.trim();
      if (!/^\d{6}$/.test(cleanNew)) {
        return { success: false, message: "O PIN deve conter exatamente 6 dígitos numéricos." };
      }

      try {
        const res = await fetch(`${API_BASE}/api/users/${userId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pin: cleanNew,
            mustChangePin: mustChangeOnNextLogin,
          }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          await fetchUsersFromApi();
          return { success: true };
        }
        return { success: false, message: data.error || "Erro ao salvar PIN do usuário." };
      } catch (err: any) {
        return { success: false, message: err.message || "Erro de conexão." };
      }
    },
    []
  );

  /**
   * Adiciona um novo usuário no Banco de Dados
   */
  const addUser = useCallback(
    async (user: Omit<AppUser, "id" | "createdAt">): Promise<AppUser | null> => {
      try {
        const res = await fetch(`${API_BASE}/api/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(user),
        });

        const data = await res.json();
        if (res.ok && data.success && data.user) {
          await fetchUsersFromApi();
          return data.user;
        }
        throw new Error(data.error || "Erro ao cadastrar usuário");
      } catch (err: any) {
        console.error("Erro ao adicionar usuário:", err);
        throw err;
      }
    },
    []
  );

  /**
   * Atualiza dados de um usuário existente no Banco de Dados
   */
  const editUser = useCallback(
    async (id: string, updates: Partial<AppUser>): Promise<boolean> => {
      try {
        const res = await fetch(`${API_BASE}/api/users/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          await fetchUsersFromApi();
          return true;
        }
        return false;
      } catch (err) {
        console.error("Erro ao editar usuário:", err);
        return false;
      }
    },
    []
  );

  /**
   * Exclui um usuário do Banco de Dados
   */
  const removeUser = useCallback(
    async (id: string): Promise<{ success: boolean; message?: string }> => {
      try {
        const res = await fetch(`${API_BASE}/api/users/${id}`, {
          method: "DELETE",
        });

        const data = await res.json();
        if (res.ok && data.success) {
          await fetchUsersFromApi();
          return { success: true };
        }
        return { success: false, message: data.error || "Não foi possível excluir o usuário." };
      } catch (err: any) {
        return { success: false, message: err.message || "Erro de rede ao excluir usuário." };
      }
    },
    []
  );

  const logout = useCallback(() => {
    logoutUser();
    refresh();
  }, [refresh]);

  /**
   * Restaura todos os usuários para os padrões de fábrica no Banco de Dados
   */
  const resetAllToDefault = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/users/reset-defaults`, { method: "POST" });
      localStorage.removeItem(STORAGE_SESSION_KEY);
      localStorage.removeItem(STORAGE_SESSION_USER_KEY);
      await fetchUsersFromApi();
      refresh();
    } catch (err) {
      console.error("Erro ao restaurar usuários:", err);
    }
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
    login,
    loginWithPin: login,
    changePin,
    adminSetPin,
    logout,
    addUser,
    editUser,
    removeUser,
    resetAllToDefault,
    refresh,
  };
}
