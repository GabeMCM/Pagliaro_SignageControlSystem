import React, { useState } from "react";
import {
  X,
  User,
  Key,
  Shield,
  Check,
  AlertCircle,
  LogIn,
  Users,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { useAuth, ROLE_LABELS, type AppUser } from "@/lib/auth";

export interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function LoginModal({ isOpen, onClose, onSuccess }: LoginModalProps) {
  if (!isOpen) return null;

  const { currentUser, users, login, switchUser } = useAuth();
  const [mode, setMode] = useState<"quick" | "form">("quick");

  // Form states
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");

  // Quick switch states
  const [selectedUserForPin, setSelectedUserForPin] = useState<AppUser | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSelectUser = (u: AppUser) => {
    setSelectedUserForPin(u);
    setPinInput("");
    setErrorMessage(null);

    // Se o usuário não tiver PIN nem senha, troca imediatamente
    if (!u.pin && !u.password) {
      switchUser(u.id);
      setSuccessMessage(`Conectado como ${u.name}`);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 700);
    }
  };

  const handlePinSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedUserForPin) return;

    setErrorMessage(null);
    const res = login(selectedUserForPin.username, pinInput);
    if (res.success) {
      setSuccessMessage(`Conectado como ${selectedUserForPin.name}`);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 700);
    } else {
      setErrorMessage(res.message || "PIN inválido.");
      setPinInput("");
    }
  };

  const handleFormLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim()) {
      setErrorMessage("Informe o usuário ou PIN.");
      return;
    }

    setErrorMessage(null);
    const res = login(usernameInput.trim(), passwordInput);
    if (res.success) {
      setSuccessMessage("Autenticado com sucesso!");
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 700);
    } else {
      setErrorMessage(res.message || "Credenciais incorretas.");
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto font-sans antialiased">
      <div className="w-full max-w-md bg-neutral-950 border border-neutral-900 p-4 sm:p-5 flex flex-col space-y-3.5 my-auto max-h-[92dvh] overflow-y-auto shadow-2xl">
        {/* Topo / Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-neutral-900">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-neutral-900 border border-neutral-900 text-neutral-200">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight uppercase font-mono">
                Autenticação de Usuário
              </h3>
              <p className="text-[10px] text-neutral-400 font-mono">
                Controle de Acessos & Permissões por Operador
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

        {/* Indicador de Usuário Atual */}
        {currentUser && (
          <div className="p-2.5 border border-neutral-900 bg-neutral-900/40 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[9px] uppercase font-mono text-neutral-500 block">
                Operador Ativo no Momento:
              </span>
              <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>{currentUser.name}</span>
                <span className="text-[9px] font-mono font-semibold px-1 py-0.2 bg-black border border-neutral-900 text-neutral-400">
                  {ROLE_LABELS[currentUser.role]?.badge || currentUser.role}
                </span>
              </div>
            </div>
            <span className="text-[10px] font-mono text-neutral-400">
              @{currentUser.username}
            </span>
          </div>
        )}

        {/* Mensagens de Sucesso / Erro */}
        {successMessage && (
          <div className="p-2.5 border border-emerald-500/40 bg-emerald-950/20 text-xs text-emerald-300 font-mono flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-2.5 border border-red-900/50 bg-red-950/20 text-xs text-red-300 font-mono flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Alternador de Modo: Troca Rápida vs Login Tradicional */}
        <div className="flex items-center gap-1 bg-neutral-950 p-0.5 border border-neutral-900 font-mono text-xs">
          <button
            type="button"
            onClick={() => {
              setMode("quick");
              setErrorMessage(null);
            }}
            className={`flex-1 py-1.5 px-2 text-center transition flex items-center justify-center gap-1.5 ${
              mode === "quick"
                ? "bg-white text-black font-bold"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Troca Rápida (PIN)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("form");
              setErrorMessage(null);
            }}
            className={`flex-1 py-1.5 px-2 text-center transition flex items-center justify-center gap-1.5 ${
              mode === "form"
                ? "bg-white text-black font-bold"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Key className="h-3.5 w-3.5" />
            <span>Usuário & Senha</span>
          </button>
        </div>

        {/* MODO 1: TROCA RÁPIDA DE OPERADOR (SELEÇÃO + PIN) */}
        {mode === "quick" && (
          <div className="space-y-3">
            {!selectedUserForPin ? (
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-mono text-neutral-400 block">
                  Selecione o operador que está assumindo o turno:
                </span>
                <div className="divide-y divide-neutral-900 border border-neutral-900 bg-black max-h-56 overflow-y-auto">
                  {users.map((u) => {
                    const isCurrent = u.id === currentUser?.id;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleSelectUser(u)}
                        className={`w-full p-2.5 text-left flex items-center justify-between gap-2 hover:bg-neutral-900 transition ${
                          isCurrent ? "bg-neutral-900/50" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                            <span>{u.name}</span>
                            {isCurrent && (
                              <span className="text-[9px] font-mono text-emerald-400">
                                (Logado)
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-neutral-400 flex items-center gap-2 mt-0.5">
                            <span>{ROLE_LABELS[u.role]?.title}</span>
                            <span>•</span>
                            <span>@{u.username}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 text-neutral-400 flex-shrink-0">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 bg-neutral-900 border border-neutral-900 text-neutral-300">
                            {u.pin ? "PIN" : "Livre"}
                          </span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Informar PIN do Operador Escolhido */
              <form onSubmit={handlePinSubmit} className="space-y-3">
                <div className="p-3 border border-neutral-900 bg-black flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] uppercase font-mono text-neutral-500 block">
                      Operador Selecionado:
                    </span>
                    <span className="text-xs font-bold text-white font-mono">
                      {selectedUserForPin.name}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUserForPin(null);
                      setPinInput("");
                      setErrorMessage(null);
                    }}
                    className="text-[10px] font-mono text-neutral-400 hover:text-white underline"
                  >
                    Trocar operador
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono text-neutral-300 block">
                    Digite o PIN de 4 dígitos ou senha:
                  </label>
                  <input
                    type="password"
                    autoFocus
                    placeholder="••••"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    maxLength={10}
                    className="w-full bg-black border border-neutral-900 p-2 text-center text-lg tracking-[0.5em] text-white outline-none focus:border-neutral-500 font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUserForPin(null);
                      setPinInput("");
                    }}
                    className="min-h-[36px] bg-neutral-900 hover:bg-neutral-850 border border-neutral-900 text-neutral-300 hover:text-white text-xs font-mono transition"
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    className="min-h-[36px] bg-white text-black font-bold text-xs font-mono uppercase hover:bg-neutral-200 transition"
                  >
                    Confirmar PIN
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* MODO 2: FORMULÁRIO DE LOGIN COMPLETO */}
        {mode === "form" && (
          <form onSubmit={handleFormLogin} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-neutral-300 block">
                Nome de Usuário ou PIN:
              </label>
              <input
                type="text"
                autoFocus
                placeholder="ex: admin ou 1234"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                className="w-full bg-black border border-neutral-900 p-2 text-xs text-white outline-none focus:border-neutral-500 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-neutral-300 block">
                Senha de Acesso:
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full bg-black border border-neutral-900 p-2 text-xs text-white outline-none focus:border-neutral-500 font-mono"
              />
            </div>

            <button
              type="submit"
              className="w-full min-h-[38px] bg-white text-black font-bold text-xs font-mono uppercase hover:bg-neutral-200 transition flex items-center justify-center gap-1.5 shadow-sm mt-2"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Entrar no Sistema</span>
            </button>
          </form>
        )}

        {/* Rodapé / Dica de Senha Inicial */}
        <div className="pt-2 border-t border-neutral-900 flex items-center justify-between text-[10px] font-mono text-neutral-500">
          <span>PIN padrão Admin: 1234</span>
          <span>Operador: 0000</span>
        </div>
      </div>
    </div>
  );
}
