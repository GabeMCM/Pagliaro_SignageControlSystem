import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Key,
  Shield,
  Check,
  AlertCircle,
  Users,
  ChevronRight,
  Lock,
  ArrowRight,
} from "lucide-react";
import { useAuth, ROLE_LABELS, type AppUser } from "@/lib/auth";

export interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (user?: AppUser, mustChangePin?: boolean) => void;
  onOpenChangePin?: () => void;
}

export function LoginModal({
  isOpen,
  onClose,
  onSuccess,
  onOpenChangePin,
}: LoginModalProps) {
  if (!isOpen) return null;

  const { currentUser, users, login } = useAuth();

  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelectedUser(null);
    setPinInput("");
    setErrorMessage(null);
    setSuccessMessage(null);
  }, [isOpen]);

  const handleSelectUser = (u: AppUser) => {
    setSelectedUser(u);
    setPinInput("");
    setErrorMessage(null);
    setTimeout(() => {
      hiddenInputRef.current?.focus();
    }, 100);
  };

  const handleKeypadPress = (digit: string) => {
    setErrorMessage(null);
    if (pinInput.length < 6) {
      const nextPin = pinInput + digit;
      setPinInput(nextPin);
      if (nextPin.length === 6) {
        processLogin(nextPin, selectedUser);
      }
    }
  };

  const handleKeypadBackspace = () => {
    setErrorMessage(null);
    setPinInput((prev) => prev.slice(0, -1));
  };

  const handleKeypadClear = () => {
    setErrorMessage(null);
    setPinInput("");
  };

  const processLogin = (pinToSubmit: string, userToLogin: AppUser | null) => {
    setErrorMessage(null);

    const res = userToLogin
      ? login(userToLogin.id, pinToSubmit)
      : login(pinToSubmit);

    if (res.success) {
      const authenticatedUser = res.user || userToLogin;
      setSuccessMessage(
        res.mustChangePin
          ? `Conectado como ${authenticatedUser?.name}. Primeiro acesso: redefina seu PIN.`
          : `Conectado como ${authenticatedUser?.name}`
      );

      setTimeout(() => {
        onSuccess?.(authenticatedUser || undefined, res.mustChangePin);
        onClose();
      }, 700);
    } else {
      setErrorMessage(res.message || "PIN inválido. Deve conter 6 dígitos.");
      setPinInput("");
    }
  };

  const handleFormSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (pinInput.length !== 6) {
      setErrorMessage("Digite o PIN completo de 6 dígitos.");
      return;
    }
    processLogin(pinInput, selectedUser);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto font-sans antialiased">
      <div className="w-full max-w-sm bg-neutral-950 border border-neutral-900 p-4 sm:p-5 flex flex-col space-y-3.5 my-auto max-h-[94dvh] overflow-y-auto shadow-2xl">
        {/* Topo / Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-neutral-900">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-neutral-900 border border-neutral-900 text-neutral-200">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight uppercase font-mono">
                Autenticação de Operador
              </h3>
              <p className="text-[10px] text-neutral-400 font-mono">
                Acesso por PIN numérico de 6 dígitos
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
          <div className="p-2.5 border border-neutral-900 bg-black flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[9px] uppercase font-mono text-neutral-500 block">
                Operador Conectado:
              </span>
              <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>{currentUser.name}</span>
                <span className="text-[9px] font-mono font-semibold px-1 py-0.2 bg-neutral-900 border border-neutral-900 text-neutral-400">
                  {ROLE_LABELS[currentUser.role]?.badge || currentUser.role}
                </span>
              </div>
            </div>
            {onOpenChangePin && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenChangePin();
                }}
                className="text-[10px] font-mono px-2 py-1 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-900 transition flex items-center gap-1"
                title="Mudar meu PIN de 6 dígitos"
              >
                <Key className="h-3 w-3" />
                <span>Mudar PIN</span>
              </button>
            )}
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

        {/* PASSO 1: Selecionar Operador ou Entrada Rápida de PIN */}
        {!selectedUser ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <span className="text-[10px] uppercase font-mono text-neutral-400 block">
                Selecione o operador ou digite o PIN direto:
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
                              (Ativo)
                            </span>
                          )}
                          {u.mustChangePin && (
                            <span className="text-[9px] font-mono text-amber-400 px-1 border border-amber-900/50 bg-amber-950/30">
                              Troca pendente
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
                          PIN 6D
                        </span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Ou digite seu PIN de 6 dígitos diretamente */}
            <div className="pt-2 border-t border-neutral-900 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-neutral-400">
                  Ou digite seu PIN de 6 dígitos:
                </span>
                <span className="text-[10px] font-mono text-neutral-500">
                  {pinInput.length}/6
                </span>
              </div>

              {/* Indicador de 6 bolinhas */}
              <div
                onClick={() => hiddenInputRef.current?.focus()}
                className="p-2 bg-black border border-neutral-900 flex items-center justify-center gap-2 cursor-pointer"
              >
                {Array.from({ length: 6 }).map((_, i) => {
                  const filled = i < pinInput.length;
                  return (
                    <span
                      key={i}
                      className={`h-3 w-3 border transition-colors ${
                        filled
                          ? "bg-white border-white"
                          : "bg-black border-neutral-800"
                      }`}
                    />
                  );
                })}
              </div>

              {/* Teclado numérico na tela */}
              <div className="grid grid-cols-3 gap-1.5 font-mono text-base font-bold">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => handleKeypadPress(n)}
                    className="h-10 bg-black border border-neutral-900 hover:bg-neutral-900 hover:text-white text-neutral-200 transition flex items-center justify-center rounded-none"
                  >
                    {n}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={handleKeypadClear}
                  className="h-10 bg-neutral-950 border border-neutral-900 hover:bg-neutral-900 text-neutral-400 text-xs uppercase tracking-wider transition rounded-none"
                >
                  Limpar
                </button>

                <button
                  type="button"
                  onClick={() => handleKeypadPress("0")}
                  className="h-10 bg-black border border-neutral-900 hover:bg-neutral-900 hover:text-white text-neutral-200 transition flex items-center justify-center rounded-none"
                >
                  0
                </button>

                <button
                  type="button"
                  onClick={handleKeypadBackspace}
                  className="h-10 bg-neutral-950 border border-neutral-900 hover:bg-neutral-900 text-neutral-400 text-xs uppercase tracking-wider transition rounded-none"
                >
                  Apagar
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* PASSO 2: Digitar PIN do operador selecionado */
          <form onSubmit={handleFormSubmit} className="space-y-3">
            <div className="p-3 border border-neutral-900 bg-black flex items-center justify-between gap-2">
              <div>
                <span className="text-[10px] uppercase font-mono text-neutral-500 block">
                  Operador Selecionado:
                </span>
                <span className="text-xs font-bold text-white font-mono">
                  {selectedUser.name}
                </span>
                <span className="text-[10px] font-mono text-neutral-400 block">
                  @{selectedUser.username}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedUser(null);
                  setPinInput("");
                  setErrorMessage(null);
                }}
                className="text-[10px] font-mono text-neutral-400 hover:text-white underline"
              >
                Trocar operador
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-mono text-neutral-300 block">
                  Digite o PIN de 6 dígitos:
                </label>
                <span className="text-[10px] font-mono text-neutral-500">
                  {pinInput.length}/6
                </span>
              </div>

              {/* Indicador de 6 bolinhas */}
              <div
                onClick={() => hiddenInputRef.current?.focus()}
                className="p-2.5 bg-black border border-neutral-900 flex items-center justify-center gap-2 cursor-pointer"
              >
                {Array.from({ length: 6 }).map((_, i) => {
                  const filled = i < pinInput.length;
                  return (
                    <span
                      key={i}
                      className={`h-3 w-3 border transition-colors ${
                        filled
                          ? "bg-white border-white"
                          : "bg-black border-neutral-800"
                      }`}
                    />
                  );
                })}
              </div>

              {/* Input escondido para capturar digitação física de teclado */}
              <input
                ref={hiddenInputRef}
                type="password"
                inputMode="numeric"
                autoFocus
                value={pinInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setPinInput(val);
                  if (val.length === 6) {
                    processLogin(val, selectedUser);
                  }
                }}
                className="opacity-0 h-0 w-0 absolute pointer-events-none"
              />
            </div>

            {/* Teclado numérico virtual */}
            <div className="grid grid-cols-3 gap-1.5 font-mono text-base font-bold">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => handleKeypadPress(n)}
                  className="h-10 bg-black border border-neutral-900 hover:bg-neutral-900 hover:text-white text-neutral-200 transition flex items-center justify-center rounded-none"
                >
                  {n}
                </button>
              ))}

              <button
                type="button"
                onClick={handleKeypadClear}
                className="h-10 bg-neutral-950 border border-neutral-900 hover:bg-neutral-900 text-neutral-400 text-xs uppercase tracking-wider transition rounded-none"
              >
                Limpar
              </button>

              <button
                type="button"
                onClick={() => handleKeypadPress("0")}
                className="h-10 bg-black border border-neutral-900 hover:bg-neutral-900 hover:text-white text-neutral-200 transition flex items-center justify-center rounded-none"
              >
                0
              </button>

              <button
                type="button"
                onClick={handleKeypadBackspace}
                className="h-10 bg-neutral-950 border border-neutral-900 hover:bg-neutral-900 text-neutral-400 text-xs uppercase tracking-wider transition rounded-none"
              >
                Apagar
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setSelectedUser(null);
                  setPinInput("");
                  setErrorMessage(null);
                }}
                className="min-h-[36px] bg-neutral-900 hover:bg-neutral-850 border border-neutral-900 text-neutral-300 hover:text-white text-xs font-mono transition rounded-none"
              >
                Voltar
              </button>
              <button
                type="submit"
                className="min-h-[36px] bg-white text-black font-bold text-xs font-mono uppercase hover:bg-neutral-200 transition rounded-none flex items-center justify-center gap-1"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>Confirmar</span>
              </button>
            </div>
          </form>
        )}

        {/* Rodapé informativo */}
        <div className="pt-2 border-t border-neutral-900 text-[10px] font-mono text-neutral-500 flex flex-col gap-0.5">
          <span>PINs padrão de fábrica (6 dígitos):</span>
          <span className="text-neutral-400">
            Admin: 123456 • Operador: 000000 • Recepção: 111111
          </span>
        </div>
      </div>
    </div>
  );
}
