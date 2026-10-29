import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Key,
  Shield,
  Check,
  AlertCircle,
  User,
  Lock,
  LogOut,
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

  const { currentUser, login, logout } = useAuth();

  const [usernameInput, setUsernameInput] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const usernameRef = useRef<HTMLInputElement>(null);
  const pinRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUsernameInput("");
    setPinInput("");
    setErrorMessage(null);
    setSuccessMessage(null);
    setTimeout(() => usernameRef.current?.focus(), 50);
  }, [isOpen]);

  const handleKeypadPress = (digit: string) => {
    setErrorMessage(null);
    setPinInput((prev) => prev + digit);
  };

  const handleKeypadBackspace = () => {
    setErrorMessage(null);
    setPinInput((prev) => prev.slice(0, -1));
  };

  const handleKeypadClear = () => {
    setErrorMessage(null);
    setPinInput("");
  };

  const processLogin = (username: string, pin: string) => {
    setErrorMessage(null);

    const cleanUser = username.trim();
    const cleanPin = pin.trim();

    if (!cleanUser) {
      setErrorMessage("Informe o usuário do operador.");
      usernameRef.current?.focus();
      return;
    }

    if (!cleanPin) {
      setErrorMessage("Informe o PIN ou senha de acesso.");
      pinRef.current?.focus();
      return;
    }

    const res = login(cleanUser, cleanPin);

    if (res.success) {
      const authUser = res.user;
      setSuccessMessage(
        res.mustChangePin
          ? `Conectado como ${authUser?.name}. Primeiro acesso detectado.`
          : `Conectado como ${authUser?.name}`
      );

      setTimeout(() => {
        onSuccess?.(authUser || undefined, res.mustChangePin);
        onClose();
      }, 600);
    } else {
      setErrorMessage(res.message || "Usuário ou PIN incorreto.");
      setPinInput("");
      pinRef.current?.focus();
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    processLogin(usernameInput, pinInput);
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
                Alternar Operador
              </h3>
              <p className="text-[10px] text-neutral-400 font-mono">
                Digite o usuário e o PIN de 6 dígitos
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
            <div className="flex items-center gap-1">
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
              <button
                type="button"
                onClick={() => {
                  if (confirm("Encerrar a sessão do operador atual?")) {
                    logout();
                    onClose();
                  }
                }}
                className="text-[10px] font-mono px-2 py-1 bg-neutral-900 hover:bg-red-950/40 text-neutral-400 hover:text-red-300 border border-neutral-900 hover:border-red-900/50 transition flex items-center gap-1"
                title="Encerrar Sessão (Logout)"
              >
                <LogOut className="h-3 w-3" />
                <span>Sair</span>
              </button>
            </div>
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

        {/* Formulário: Usuário + PIN de 6 dígitos */}
        <form onSubmit={handleFormSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] font-mono text-neutral-300 flex items-center gap-1.5">
              <User className="h-3 w-3 text-neutral-400" />
              <span>Usuário / Login:</span>
            </label>
            <input
              ref={usernameRef}
              type="text"
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
              className="w-full bg-black border border-neutral-900 p-2 text-xs text-white outline-none focus:border-neutral-500 font-mono tracking-wider transition"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono text-neutral-300">
              <label className="flex items-center gap-1.5">
                <Key className="h-3 w-3 text-neutral-400" />
                <span>PIN ou Senha de Acesso:</span>
              </label>
              <span className="text-[10px] font-mono text-neutral-500">
                {pinInput.length > 0 ? `${pinInput.length} caracteres` : "6 dígitos"}
              </span>
            </div>

            <input
              ref={pinRef}
              type="password"
              required
              placeholder="Digite o PIN (ex: 123456) ou senha"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              className="w-full bg-black border border-neutral-900 p-2 text-sm text-white outline-none focus:border-neutral-500 font-mono tracking-widest transition"
            />
          </div>

          {/* Teclado numérico virtual para telas touch */}
          <div className="grid grid-cols-3 gap-1.5 font-mono text-base font-bold pt-0.5">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => handleKeypadPress(n)}
                className="h-10 bg-black border border-neutral-900 hover:bg-neutral-900 hover:text-white text-neutral-200 transition flex items-center justify-center rounded-none active:bg-neutral-800"
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
              className="h-10 bg-black border border-neutral-900 hover:bg-neutral-900 hover:text-white text-neutral-200 transition flex items-center justify-center rounded-none active:bg-neutral-800"
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
              onClick={onClose}
              className="min-h-[36px] bg-neutral-900 hover:bg-neutral-850 border border-neutral-900 text-neutral-300 hover:text-white text-xs font-mono transition rounded-none"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="min-h-[36px] bg-white text-black font-bold text-xs font-mono uppercase hover:bg-neutral-200 transition rounded-none flex items-center justify-center gap-1"
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Entrar</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
