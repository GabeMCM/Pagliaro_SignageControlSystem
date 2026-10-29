import React, { useState, useRef, useEffect } from "react";
import {
  Shield,
  Key,
  Lock,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Users,
} from "lucide-react";
import { useAuth, ROLE_LABELS, type AppUser } from "@/lib/auth";

export interface LoginScreenProps {
  onSuccess?: (user?: AppUser, mustChangePin?: boolean) => void;
}

export function LoginScreen({ onSuccess }: LoginScreenProps) {
  const { users, login } = useAuth();

  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  // Foco automático no input para digitação física via teclado
  useEffect(() => {
    hiddenInputRef.current?.focus();
  }, [selectedUser]);

  const handleSelectUser = (u: AppUser) => {
    setSelectedUser(u);
    setPinInput("");
    setErrorMessage(null);
    setTimeout(() => hiddenInputRef.current?.focus(), 50);
  };

  const handleKeypadPress = (digit: string) => {
    setErrorMessage(null);
    if (pinInput.length < 6) {
      const next = pinInput + digit;
      setPinInput(next);
      if (next.length === 6) {
        processLogin(next, selectedUser);
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
      const authUser = res.user || userToLogin;
      setSuccessMessage(
        res.mustChangePin
          ? `Autenticado como ${authUser?.name}. Primeiro acesso detectado.`
          : `Bem-vindo, ${authUser?.name}`
      );

      setTimeout(() => {
        onSuccess?.(authUser || undefined, res.mustChangePin);
      }, 600);
    } else {
      setErrorMessage(res.message || "PIN inválido. Deve conter 6 dígitos numéricos.");
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
    <div className="min-h-screen min-h-[100dvh] w-full bg-black text-white flex flex-col items-center justify-center p-3 sm:p-6 font-sans antialiased selection:bg-neutral-800">
      {/* Background Ambient Glow (Ultra subtle) */}
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(120,119,198,0.08),rgba(255,255,255,0))]" />

      <div className="w-full max-w-sm sm:max-w-md bg-neutral-950 border border-neutral-900 p-5 sm:p-7 flex flex-col space-y-4 shadow-2xl relative z-10">
        {/* Top Header / Branding */}
        <div className="text-center pb-4 border-b border-neutral-900 space-y-1">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-black border border-neutral-900 mb-1">
            <Shield className="h-3.5 w-3.5 text-neutral-400" />
            <span className="text-[10px] font-mono tracking-widest uppercase text-neutral-300">
              Acesso Restrito
            </span>
          </div>
          <h1 className="text-base sm:text-lg font-bold tracking-[0.25em] text-white uppercase font-mono">
            PAGLIARO SIGNAGE
          </h1>
          <p className="text-[11px] text-neutral-400 font-mono">
            Painel de Cerimonial & Monitoramento de Salas
          </p>
        </div>

        {/* Feedback Messages */}
        {successMessage && (
          <div className="p-3 border border-emerald-500/40 bg-emerald-950/20 text-xs text-emerald-300 font-mono flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 border border-red-900/50 bg-red-950/20 text-xs text-red-300 font-mono flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* PASSO 1: Selecionar Operador ou Entrada com PIN Direto */}
        {!selectedUser ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-mono uppercase text-neutral-400">
                <span>Selecione seu perfil de operador:</span>
                <span>{users.length} cadastrados</span>
              </div>

              <div className="divide-y divide-neutral-900 border border-neutral-900 bg-black max-h-52 overflow-y-auto">
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleSelectUser(u)}
                    className="w-full p-2.5 text-left flex items-center justify-between gap-2 hover:bg-neutral-900 transition"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                        <span>{u.name}</span>
                        {u.mustChangePin && (
                          <span className="text-[9px] font-mono text-amber-400 px-1 border border-amber-900/50 bg-amber-950/30">
                            1º Acesso
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
                      <span className="text-[9px] font-mono px-1.5 py-0.5 bg-neutral-900 border border-neutral-900 text-neutral-300">
                        PIN 6D
                      </span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Ou digite seu PIN de 6 dígitos diretamente */}
            <div className="pt-2 border-t border-neutral-900 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400">
                <span>Ou digite seu PIN de 6 dígitos:</span>
                <span className="text-neutral-500">{pinInput.length}/6</span>
              </div>

              {/* Indicador de 6 Marcadores */}
              <div
                onClick={() => hiddenInputRef.current?.focus()}
                className="p-3 bg-black border border-neutral-900 flex items-center justify-center gap-2 cursor-pointer"
              >
                {Array.from({ length: 6 }).map((_, i) => {
                  const filled = i < pinInput.length;
                  return (
                    <span
                      key={i}
                      className={`h-3.5 w-3.5 border transition-colors ${
                        filled
                          ? "bg-white border-white"
                          : "bg-black border-neutral-800"
                      }`}
                    />
                  );
                })}
              </div>

              {/* Teclado numérico na tela */}
              <div className="grid grid-cols-3 gap-1.5 font-mono text-base font-bold pt-1">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => handleKeypadPress(n)}
                    className="h-11 bg-black border border-neutral-900 hover:bg-neutral-900 hover:text-white text-neutral-200 transition flex items-center justify-center rounded-none active:bg-neutral-800"
                  >
                    {n}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={handleKeypadClear}
                  className="h-11 bg-neutral-950 border border-neutral-900 hover:bg-neutral-900 text-neutral-400 text-xs uppercase tracking-wider transition rounded-none"
                >
                  Limpar
                </button>

                <button
                  type="button"
                  onClick={() => handleKeypadPress("0")}
                  className="h-11 bg-black border border-neutral-900 hover:bg-neutral-900 hover:text-white text-neutral-200 transition flex items-center justify-center rounded-none active:bg-neutral-800"
                >
                  0
                </button>

                <button
                  type="button"
                  onClick={handleKeypadBackspace}
                  className="h-11 bg-neutral-950 border border-neutral-900 hover:bg-neutral-900 text-neutral-400 text-xs uppercase tracking-wider transition rounded-none"
                >
                  Apagar
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* PASSO 2: Digitação do PIN para o Operador Escolhido */
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="p-3 border border-neutral-900 bg-black flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[9px] uppercase font-mono text-neutral-500 block">
                  Operador Selecionado:
                </span>
                <span className="text-xs sm:text-sm font-bold text-white font-mono truncate block">
                  {selectedUser.name}
                </span>
                <span className="text-[10px] font-mono text-neutral-400 block">
                  @{selectedUser.username} • {ROLE_LABELS[selectedUser.role]?.title}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedUser(null);
                  setPinInput("");
                  setErrorMessage(null);
                }}
                className="text-[10px] font-mono text-neutral-400 hover:text-white underline flex-shrink-0"
              >
                Trocar
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-neutral-300">
                <span>Digite o PIN de 6 dígitos:</span>
                <span className="text-[10px] text-neutral-500">{pinInput.length}/6</span>
              </div>

              {/* Indicador de 6 Marcadores */}
              <div
                onClick={() => hiddenInputRef.current?.focus()}
                className="p-3 bg-black border border-neutral-900 flex items-center justify-center gap-2 cursor-pointer"
              >
                {Array.from({ length: 6 }).map((_, i) => {
                  const filled = i < pinInput.length;
                  return (
                    <span
                      key={i}
                      className={`h-3.5 w-3.5 border transition-colors ${
                        filled
                          ? "bg-white border-white"
                          : "bg-black border-neutral-800"
                      }`}
                    />
                  );
                })}
              </div>

              {/* Input Invisível para Digitação Física via Teclado */}
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

            {/* Teclado Numérico Virtual */}
            <div className="grid grid-cols-3 gap-1.5 font-mono text-base font-bold">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => handleKeypadPress(n)}
                  className="h-11 bg-black border border-neutral-900 hover:bg-neutral-900 hover:text-white text-neutral-200 transition flex items-center justify-center rounded-none active:bg-neutral-800"
                >
                  {n}
                </button>
              ))}

              <button
                type="button"
                onClick={handleKeypadClear}
                className="h-11 bg-neutral-950 border border-neutral-900 hover:bg-neutral-900 text-neutral-400 text-xs uppercase tracking-wider transition rounded-none"
              >
                Limpar
              </button>

              <button
                type="button"
                onClick={() => handleKeypadPress("0")}
                className="h-11 bg-black border border-neutral-900 hover:bg-neutral-900 hover:text-white text-neutral-200 transition flex items-center justify-center rounded-none active:bg-neutral-800"
              >
                0
              </button>

              <button
                type="button"
                onClick={handleKeypadBackspace}
                className="h-11 bg-neutral-950 border border-neutral-900 hover:bg-neutral-900 text-neutral-400 text-xs uppercase tracking-wider transition rounded-none"
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
                className="min-h-[38px] bg-neutral-900 hover:bg-neutral-850 border border-neutral-900 text-neutral-300 hover:text-white text-xs font-mono transition rounded-none"
              >
                Voltar
              </button>
              <button
                type="submit"
                className="min-h-[38px] bg-white text-black font-bold text-xs font-mono uppercase hover:bg-neutral-200 transition rounded-none flex items-center justify-center gap-1.5"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>Entrar</span>
              </button>
            </div>
          </form>
        )}

        {/* Rodapé Informativo */}
        <div className="pt-3 border-t border-neutral-900 text-[10px] font-mono text-neutral-500 flex flex-col gap-0.5">
          <span>PINs padrão de fábrica (6 dígitos numéricos):</span>
          <span className="text-neutral-400">
            Admin: 123456 • Operador: 000000 • Recepção: 111111
          </span>
        </div>
      </div>
    </div>
  );
}
