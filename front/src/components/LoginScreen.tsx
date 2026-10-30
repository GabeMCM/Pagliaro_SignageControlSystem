import React, { useState, useRef, useEffect } from "react";
import {
  Shield,
  Key,
  Lock,
  User,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { useAuth, type AppUser } from "@/lib/auth";

export interface LoginScreenProps {
  onSuccess?: (user?: AppUser, mustChangePin?: boolean) => void;
}

export function LoginScreen({ onSuccess }: LoginScreenProps) {
  const { login } = useAuth();

  const [usernameInput, setUsernameInput] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  const usernameRef = useRef<HTMLInputElement>(null);
  const pinRef = useRef<HTMLInputElement>(null);

  // Foco automático no campo de usuário ao abrir a tela
  useEffect(() => {
    usernameRef.current?.focus();
  }, []);



  const processLogin = async (username: string, pin: string) => {
    setErrorMessage(null);

    const cleanUser = username.trim();
    const cleanPin = pin.trim();

    if (!cleanUser) {
      setErrorMessage("Por favor, informe seu usuário ou login.");
      usernameRef.current?.focus();
      return;
    }

    if (!cleanPin) {
      setErrorMessage("Por favor, informe seu PIN ou senha.");
      pinRef.current?.focus();
      return;
    }

    setLoading(true);
    try {
      const res = await login(cleanUser, cleanPin);

      if (res.success) {
        const authUser = res.user;
        setSuccessMessage(
          res.mustChangePin
            ? `Autenticado como ${authUser?.name}. Primeiro acesso detectado.`
            : `Bem-vindo, ${authUser?.name}`
        );

        setTimeout(() => {
          onSuccess?.(authUser || undefined, res.mustChangePin);
        }, 300);
      } else {
        setErrorMessage(res.message || "Usuário ou credencial incorreta.");
        pinRef.current?.focus();
      }
    } catch (_err) {
      setErrorMessage("Falha na comunicação com o servidor.");
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loading) {
      processLogin(usernameInput, pinInput);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] w-full bg-black text-white flex flex-col items-center justify-center p-3 sm:p-6 font-sans antialiased selection:bg-neutral-800">
      {/* Background Ambient Glow */}
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

        {/* Formulário de Identificação Individual */}
        <form onSubmit={handleFormSubmit} className="space-y-3.5">
          {/* Campo 1: Usuário */}
          <div className="space-y-1">
            <label className="text-[11px] font-mono text-neutral-300 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-neutral-400" />
              <span>Usuário / Login:</span>
            </label>
            <input
              ref={usernameRef}
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              required
              placeholder="ex: admin ou operador"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  pinRef.current?.focus();
                }
              }}
              className="w-full bg-black border border-neutral-900 p-2.5 text-xs text-white outline-none focus:border-neutral-500 font-mono tracking-wider transition"
            />
          </div>

          {/* Campo 2: PIN ou Senha */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono text-neutral-300">
              <label className="flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5 text-neutral-400" />
                <span>PIN ou Senha de Acesso:</span>
              </label>
              <span className="text-[10px] text-neutral-500 font-mono">
                {pinInput.length > 0 ? `${pinInput.length} caracteres` : "6 dígitos"}
              </span>
            </div>

            <input
              ref={pinRef}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="current-password"
              required
              placeholder="Digite o PIN (ex: 123456) ou senha"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              className="w-full bg-black border border-neutral-900 p-2.5 text-sm text-white outline-none focus:border-neutral-500 font-mono tracking-widest transition"
            />
          </div>

          {/* Botão de Envio */}
          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[44px] bg-white text-black font-bold text-xs font-mono uppercase hover:bg-neutral-200 transition rounded-none flex items-center justify-center gap-2 mt-4 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Lock className="h-3.5 w-3.5" />
            <span>{loading ? "Verificando..." : "Entrar no Painel"}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
