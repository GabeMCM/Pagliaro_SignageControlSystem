import React, { useState } from "react";
import {
  X,
  User,
  Users,
  Shield,
  Key,
  Plus,
  Trash2,
  Pencil,
  Check,
  CheckCircle2,
  AlertCircle,
  Lock,
  Unlock,
  Monitor,
  RotateCcw,
  Sliders,
} from "lucide-react";
import {
  useAuth,
  ROLE_LABELS,
  SYSTEM_PERMISSIONS,
  type AppUser,
  type UserRole,
  type PermissionKey,
} from "@/lib/auth";

export interface UserPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableRooms: { slug: string; name: string }[];
}

export function UserPermissionsModal({
  isOpen,
  onClose,
  availableRooms = [],
}: UserPermissionsModalProps) {
  if (!isOpen) return null;

  const {
    currentUser,
    users,
    addUser,
    editUser,
    removeUser,
    resetAllToDefault,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<"list" | "create" | "roles">("list");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  // Formulário State
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<UserRole>("operator");
  const [pin, setPin] = useState("");
  const [mustChangePin, setMustChangePin] = useState(true);
  const [allRoomsAllowed, setAllRoomsAllowed] = useState(true);
  const [selectedRooms, setSelectedRooms] = useState<string[]>([]);
  const [customPerms, setCustomPerms] = useState<PermissionKey[]>([]);

  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const resetForm = () => {
    setName("");
    setUsername("");
    setRole("operator");
    setPin("123456");
    setMustChangePin(true);
    setAllRoomsAllowed(true);
    setSelectedRooms([]);
    setCustomPerms([]);
    setEditingUserId(null);
  };

  const handleStartCreate = () => {
    resetForm();
    setActiveTab("create");
  };

  const handleStartEdit = (user: AppUser) => {
    setEditingUserId(user.id);
    setName(user.name);
    setUsername(user.username);
    setRole(user.role);
    setPin(user.pin || "000000");
    setMustChangePin(Boolean(user.mustChangePin));
    const isAll = user.allowedRooms.includes("*") || user.allowedRooms.length === 0;
    setAllRoomsAllowed(isAll);
    setSelectedRooms(isAll ? [] : user.allowedRooms);
    setCustomPerms(user.customPermissions || []);
    setActiveTab("create");
  };

  const handleToggleRoom = (slug: string) => {
    setSelectedRooms((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  };

  const handleTogglePerm = (key: PermissionKey) => {
    setCustomPerms((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert("Por favor, preencha o nome do usuário.");
      return;
    }
    if (!username.trim()) {
      alert("Por favor, preencha o nome de login do usuário.");
      return;
    }

    const cleanUsername = username.trim().toLowerCase();

    // Validação de username duplicado
    const existing = users.find(
      (u) => u.username.toLowerCase() === cleanUsername && u.id !== editingUserId
    );
    if (existing) {
      alert("Já existe outro usuário com este mesmo login.");
      return;
    }

    const cleanPin = pin.trim() || (editingUserId ? undefined : "123456");
    if (cleanPin && !/^\d{6}$/.test(cleanPin)) {
      alert("O PIN de acesso deve conter exatamente 6 dígitos numéricos (ex: 123456).");
      return;
    }

    const allowed = allRoomsAllowed ? ["*"] : selectedRooms;
    if (!allRoomsAllowed && allowed.length === 0) {
      alert("Por favor, selecione ao menos uma sala autorizada para este operador.");
      return;
    }

    if (editingUserId) {
      // Edição
      editUser(editingUserId, {
        name: name.trim(),
        username: cleanUsername,
        role,
        ...(cleanPin ? { pin: cleanPin } : {}),
        mustChangePin,
        allowedRooms: allowed,
        customPermissions: customPerms,
      });
      setFeedbackMsg({ text: `Usuário "${name.trim()}" atualizado com sucesso!` });
    } else {
      // Criação
      addUser({
        name: name.trim(),
        username: cleanUsername,
        role,
        pin: cleanPin || "123456",
        mustChangePin,
        allowedRooms: allowed,
        customPermissions: customPerms,
        isActive: true,
      });
      setFeedbackMsg({ text: `Usuário "${name.trim()}" cadastrado com sucesso (PIN provisório: ${cleanPin || "123456"})!` });
    }

    resetForm();
    setActiveTab("list");
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const handleDeleteUser = (user: AppUser) => {
    if (user.id === currentUser?.id) {
      alert("Você não pode excluir o usuário conectado nesta sessão.");
      return;
    }
    if (confirm(`Tem certeza que deseja excluir o usuário "${user.name}" (@${user.username})?`)) {
      const res = removeUser(user.id);
      if (res.success) {
        setFeedbackMsg({ text: `Usuário "${user.name}" excluído.` });
        setTimeout(() => setFeedbackMsg(null), 3000);
      } else {
        alert(res.message || "Não foi possível excluir o usuário.");
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto font-sans antialiased">
      <div className="w-full max-w-2xl bg-neutral-950 border border-neutral-900 p-4 sm:p-5 flex flex-col space-y-3.5 my-auto max-h-[94dvh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-neutral-900">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-neutral-900 border border-neutral-900 text-white">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight uppercase font-mono">
                Usuários & Permissões
              </h3>
              <p className="text-[10px] text-neutral-400 font-mono">
                Controle de acesso granular baseado em papéis e salas (RBAC)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedbackMsg && (
          <div
            className={`p-2.5 border text-xs font-mono flex items-center gap-2 ${
              feedbackMsg.error
                ? "border-red-900/50 bg-red-950/20 text-red-300"
                : "border-emerald-500/40 bg-emerald-950/20 text-emerald-300"
            }`}
          >
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        {/* Barra de Abas */}
        <div className="flex items-center gap-1 bg-black p-0.5 border border-neutral-900 text-xs font-mono">
          <button
            type="button"
            onClick={() => setActiveTab("list")}
            className={`flex-1 py-1.5 px-2 text-center transition flex items-center justify-center gap-1.5 ${
              activeTab === "list"
                ? "bg-white text-black font-bold"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Operadores ({users.length})</span>
          </button>

          <button
            type="button"
            onClick={handleStartCreate}
            className={`flex-1 py-1.5 px-2 text-center transition flex items-center justify-center gap-1.5 ${
              activeTab === "create"
                ? "bg-white text-black font-bold"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{editingUserId ? "Editar Usuário" : "+ Novo Usuário"}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("roles")}
            className={`flex-1 py-1.5 px-2 text-center transition flex items-center justify-center gap-1.5 ${
              activeTab === "roles"
                ? "bg-white text-black font-bold"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>Papéis & Regras</span>
          </button>
        </div>

        {/* ABA 1: LISTAGEM DE USUÁRIOS */}
        {activeTab === "list" && (
          <div className="space-y-3">
            <div className="divide-y divide-neutral-900 border border-neutral-900 bg-black">
              {users.map((u) => {
                const isCurrent = u.id === currentUser?.id;
                const isSuperAdmin = u.role === "admin";
                const roomsSummary = u.allowedRooms.includes("*")
                  ? "Todas as salas liberadas"
                  : `${u.allowedRooms.length} sala(s) autorizada(s)`;

                return (
                  <div
                    key={u.id}
                    className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-neutral-950 transition"
                  >
                    <div className="min-w-0 space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs sm:text-sm font-bold text-white font-mono">
                          {u.name}
                        </span>
                        <span className="text-[10px] font-mono text-neutral-400">
                          @{u.username}
                        </span>
                        <span
                          className={`text-[9px] font-mono uppercase px-1.5 py-0.2 border ${
                            isSuperAdmin
                              ? "bg-amber-950/40 text-amber-300 border-amber-600/40 font-bold"
                              : u.role === "operator"
                              ? "bg-emerald-950/40 text-emerald-300 border-emerald-600/40"
                              : "bg-neutral-900 text-neutral-300 border-neutral-800"
                          }`}
                        >
                          {ROLE_LABELS[u.role]?.title || u.role}
                        </span>
                        {isCurrent && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 bg-white text-black font-bold uppercase">
                            Sua Sessão
                          </span>
                        )}
                      </div>

                      <div className="text-[10px] font-mono text-neutral-400 flex flex-wrap items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Monitor className="h-3 w-3 text-neutral-500" />
                          <span>{roomsSummary}</span>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Key className="h-3 w-3 text-neutral-500" />
                          <span>PIN: {u.pin ? "6 dígitos" : "Não definido"}</span>
                        </span>
                        {u.mustChangePin && (
                          <>
                            <span>•</span>
                            <span className="text-[9px] font-mono text-amber-400 bg-amber-950/40 border border-amber-800/40 px-1 py-0.2">
                              Troca no 1º acesso pendente
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(u)}
                        className="px-2.5 py-1 text-xs font-mono bg-neutral-900 hover:bg-neutral-800 border border-neutral-900 text-neutral-300 hover:text-white transition flex items-center gap-1"
                        title="Editar operador"
                      >
                        <Pencil className="h-3 w-3" />
                        <span>Editar</span>
                      </button>

                      {!isCurrent && (
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u)}
                          className="p-1.5 text-xs font-mono bg-neutral-900 hover:bg-red-950 hover:text-red-300 border border-neutral-900 text-neutral-400 transition"
                          title="Excluir operador"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-2.5 border border-neutral-900 bg-neutral-900/30 flex items-center justify-between text-[11px] font-mono text-neutral-400">
              <span>Para alternar rapidamente de operador, clique no seu nome no menu.</span>
              <button
                type="button"
                onClick={() => {
                  if (confirm("Deseja restaurar as contas padrão originais (admin, operador, recepção)?")) {
                    resetAllToDefault();
                  }
                }}
                className="text-[10px] text-neutral-400 hover:text-white underline flex items-center gap-1"
              >
                <RotateCcw className="h-2.5 w-2.5" />
                <span>Restaurar Padrões</span>
              </button>
            </div>
          </div>
        )}

        {/* ABA 2: CADASTRAR / EDITAR USUÁRIO */}
        {activeTab === "create" && (
          <form onSubmit={handleSaveUser} className="space-y-3 font-mono text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-[11px] text-neutral-300 block">
                  Nome Completo / Identificação:
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: Gabriel Cerimonial"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-black border border-neutral-900 p-2 text-white outline-none focus:border-neutral-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-neutral-300 block">
                  Login de Usuário (@username):
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: gabriel"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-black border border-neutral-900 p-2 text-white outline-none focus:border-neutral-500 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-[11px] text-neutral-300 block">
                  Papel no Sistema:
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full bg-black border border-neutral-900 p-2 text-white outline-none focus:border-neutral-500 font-mono"
                >
                  <option value="admin">Administrador Geral</option>
                  <option value="operator">Operador de Cerimonial</option>
                  <option value="reception">Recepção / Atendimento</option>
                  <option value="viewer">Visualizador (Leitura)</option>
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-neutral-300 block">
                    PIN Provisório / Inicial (6 dígitos numéricos):
                  </label>
                  <span className="text-[10px] text-neutral-500 font-mono">
                    {pin.length}/6
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={6}
                  inputMode="numeric"
                  placeholder="ex: 123456"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-full bg-black border border-neutral-900 p-2 text-white outline-none focus:border-neutral-500 font-mono tracking-widest"
                />
              </div>
            </div>

            {/* Checkbox de Obrigatório Trocar PIN no Próximo Acesso */}
            <div className="p-2.5 border border-neutral-900 bg-neutral-900/30 flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-white block">
                  Exigir troca de PIN no próximo login do operador:
                </label>
                <span className="text-[10px] text-neutral-400 block mt-0.5">
                  Ao entrar com o PIN provisório, o operador será obrigado a cadastrar seu PIN definitivo de 6 dígitos.
                </span>
              </div>
              <input
                type="checkbox"
                checked={mustChangePin}
                onChange={(e) => setMustChangePin(e.target.checked)}
                className="h-4 w-4 accent-white cursor-pointer flex-shrink-0 ml-3"
              />
            </div>

            {/* SELEÇÃO DE SALAS AUTORIZADAS */}
            <div className="space-y-1.5 p-3 border border-neutral-900 bg-black">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-white block">
                  Salas Autorizadas para este Operador:
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-neutral-400">
                  <input
                    type="checkbox"
                    checked={allRoomsAllowed}
                    onChange={(e) => setAllRoomsAllowed(e.target.checked)}
                    className="accent-white"
                  />
                  <span>Liberar Todas as Salas</span>
                </label>
              </div>

              {!allRoomsAllowed && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1.5">
                  {availableRooms.map((r) => {
                    const isChecked = selectedRooms.includes(r.slug);
                    return (
                      <button
                        key={r.slug}
                        type="button"
                        onClick={() => handleToggleRoom(r.slug)}
                        className={`p-2 border text-left transition flex items-center justify-between ${
                          isChecked
                            ? "bg-neutral-900 text-white border-neutral-700"
                            : "bg-black text-neutral-400 border-neutral-900 hover:text-white"
                        }`}
                      >
                        <span className="truncate">{r.name}</span>
                        {isChecked && <Check className="h-3 w-3 text-emerald-400 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* PERMISSÕES GRANULARES (OPCIONAL) */}
            <div className="space-y-1.5 p-3 border border-neutral-900 bg-black">
              <label className="text-[11px] font-bold text-white block">
                Permissões Específicas do Sistema:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                {SYSTEM_PERMISSIONS.map((perm) => {
                  const isChecked =
                    role === "admin" || customPerms.includes(perm.key);
                  return (
                    <label
                      key={perm.key}
                      className="p-2 border border-neutral-900 bg-neutral-950 flex items-start gap-2 cursor-pointer hover:border-neutral-800"
                    >
                      <input
                        type="checkbox"
                        disabled={role === "admin"}
                        checked={isChecked}
                        onChange={() => handleTogglePerm(perm.key)}
                        className="mt-0.5 accent-white"
                      />
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold text-white truncate">
                          {perm.label}
                        </div>
                        <div className="text-[9px] text-neutral-400 leading-tight">
                          {perm.description}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Botões do Formulário */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-900">
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setActiveTab("list");
                }}
                className="px-3 py-2 bg-neutral-900 hover:bg-neutral-850 border border-neutral-900 text-neutral-400 hover:text-white transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-white text-black font-bold uppercase hover:bg-neutral-200 transition"
              >
                {editingUserId ? "Salvar Alterações" : "Cadastrar Usuário"}
              </button>
            </div>
          </form>
        )}

        {/* ABA 3: MATRIZ DE PAPÉIS & REGRAS */}
        {activeTab === "roles" && (
          <div className="space-y-3 font-mono text-xs">
            <p className="text-neutral-400 text-[11px]">
              O sistema utiliza controle de acessos baseado em papéis (RBAC). Cada perfil define o nível de intervenção permitido nos monitores de velório:
            </p>

            <div className="space-y-2">
              {(Object.keys(ROLE_LABELS) as UserRole[]).map((rKey) => {
                const info = ROLE_LABELS[rKey];
                return (
                  <div
                    key={rKey}
                    className="p-3 border border-neutral-900 bg-black space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-xs">{info.title}</span>
                      <span className="text-[9px] uppercase px-1.5 py-0.2 bg-neutral-900 text-neutral-300 border border-neutral-900 font-bold">
                        {info.badge}
                      </span>
                    </div>
                    <p className="text-[10px] text-neutral-400 leading-relaxed">
                      {info.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
