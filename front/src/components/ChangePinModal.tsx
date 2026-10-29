import React, { useState, useEffect } from "react";
import {
  X,
  Key,
  Shield,
  CheckCircle2,
  AlertCircle,
  Lock,
  ArrowRight,
  RotateCcw,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

export interface ChangePinModalProps {
  isOpen: boolean;
  onClose: () => void;
  isMandatory?: boolean; // Se true, o operador é forçado a trocar o PIN no primeiro acesso
  onOpenSwitchUser?: () => void;
}

export function ChangePinModal({
  isOpen,
  onClose,
  isMandatory = false,
  onOpenSwitchUser,
}: ChangePinModalProps) {
  if (!isOpen) return null;

  const { currentUser, changePin } = useAuth();

  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const [activeTarget, setActiveTarget] = useState<"current" | "new" | "confirm">(
    isMandatory ? "new" : "current"
  );

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    setErrorMsg(null);
    setSuccessMsg(null);
    setActiveTarget(isMandatory ? "new" : "current");
  }, [isOpen, isMandatory]);

  // Digitação pelo teclado virtual na tela
  const handleKeypadPress = (val: string) => {
    setErrorMsg(null);
    if (activeTarget === "current") {
      if (currentPin.length < 6) setCurrentPin((prev) => prev + val);
      if (currentPin.length === 5) setActiveTarget("new");
    } else if (activeTarget === "new") {
      if (newPin.length < 6) setNewPin((prev) => prev + val);
      if (newPin.length === 5) setActiveTarget("confirm");
    } else {
      if (confirmPin.length < 6) setConfirmPin((prev) => prev + val);
    }
  };

  const handleKeypadBackspace = () => {
    setErrorMsg(null);
    if (activeTarget === "confirm") {
      if (confirmPin.length > 0) {
        setConfirmPin((prev) => prev.slice(0, -1));
      } else {
        setActiveTarget("new");
      }
    } else if (activeTarget === "new") {
      if (newPin.length > 0) {
        setNewPin((prev) => prev.slice(0, -1));
      } else if (!isMandatory) {
        setActiveTarget("current");
      }
    } else {
      setCurrentPin((prev) => prev.slice(0, -1));
    }
  };

  const handleKeypadClear = () => {
    setErrorMsg(null);
    if (activeTarget === "current") setCurrentPin("");
    else if (activeTarget === "new") setNewPin("");
    else setConfirmPin("");
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setErrorMsg(null);

    if (!isMandatory && currentPin.length !== 6) {
      setErrorMsg("Digite o PIN atual completo de 6 dígitos.");
      setActiveTarget("current");
      return;
    }

    if (newPin.length !== 6) {
      setErrorMsg("O novo PIN deve conter exatamente 6 dígitos.");
      setActiveTarget("new");
      return;
    }

    if (!/^\d{6}$/.test(newPin)) {
      setErrorMsg("O novo PIN deve conter apenas números.");
      setActiveTarget("new");
      return;
    }

    if (confirmPin !== newPin) {
      setErrorMsg("A confirmação do PIN não confere com o novo PIN.");
      setActiveTarget("confirm");
      return;
    }

    if (currentPin && currentPin === newPin) {
      setErrorMsg("O novo PIN deve ser diferente do PIN atual.");
      setActiveTarget("new");
      return;
    }

    const res = changePin(newPin, isMandatory ? undefined : currentPin);
    if (res.success) {
      setSuccessMsg("PIN de 6 dígitos alterado com sucesso!");
      setTimeout(() => {
        onClose();
      }, 1200);
    } else {
      setErrorMsg(res.message || "Erro ao salvar novo PIN.");
    }
  };

  const renderPinDots = (val: string, max = 6) => {
    return (
      <div className="flex items-center justify-center gap-1.5 py-1">
        {Array.from({ length: max }).map((_, i) => {
          const filled = i < val.length;
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
    );
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/90 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto font-sans antialiased">
      <div className="w-full max-w-sm bg-neutral-950 border border-neutral-900 p-4 sm:p-5 flex flex-col space-y-3.5 my-auto max-h-[96dvh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-neutral-900">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-neutral-900 border border-neutral-900 text-white">
              <Key className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight uppercase font-mono">
                {isMandatory ? "Definir Meu Novo PIN" : "Alterar PIN de Acesso"}
              </h3>
              <p className="text-[10px] text-neutral-400 font-mono">
                PIN de 6 dígitos numéricos
              </p>
            </div>
          </div>
          {!isMandatory && (
            <button
              onClick={onClose}
              className="p-1 text-neutral-400 hover:text-white transition"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Info do Operador */}
        <div className="p-2.5 border border-neutral-900 bg-black flex items-center justify-between gap-2 text-xs font-mono">
          <div className="min-w-0">
            <span className="text-[9px] uppercase text-neutral-500 block">
              Operador:
            </span>
            <span className="font-bold text-white truncate block">
              {currentUser?.name || "Operador"}
            </span>
          </div>
          <span className="text-[10px] text-neutral-400">
            @{currentUser?.username}
          </span>
        </div>

        {/* Aviso de Primeiro Acesso */}
        {isMandatory && (
          <div className="p-2.5 border border-amber-500/40 bg-amber-950/20 text-xs text-amber-300 font-mono flex items-start gap-2">
            <Shield className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Primeiro Acesso:</span>
              <span className="text-[11px] text-amber-200/90 leading-tight block mt-0.5">
                Defina o seu PIN pessoal de 6 dígitos para substituir o PIN padrão inicial.
              </span>
            </div>
          </div>
        )}

        {/* Feedback Messages */}
        {successMsg && (
          <div className="p-2.5 border border-emerald-500/40 bg-emerald-950/20 text-xs text-emerald-300 font-mono flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-2.5 border border-red-900/50 bg-red-950/20 text-xs text-red-300 font-mono flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Seletor dos 3 campos de PIN */}
        <div className="space-y-2 font-mono text-xs">
          {/* 1. PIN Atual (apenas se voluntário) */}
          {!isMandatory && (
            <div
              onClick={() => setActiveTarget("current")}
              className={`p-2.5 border cursor-pointer transition ${
                activeTarget === "current"
                  ? "border-white bg-neutral-900/60"
                  : "border-neutral-900 bg-black hover:border-neutral-800"
              }`}
            >
              <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1">
                <span>1. PIN Atual (6 dígitos):</span>
                <span className="text-[10px] text-neutral-500 font-mono">
                  {currentPin.length}/6
                </span>
              </div>
              {renderPinDots(currentPin)}
            </div>
          )}

          {/* 2. Novo PIN */}
          <div
            onClick={() => setActiveTarget("new")}
            className={`p-2.5 border cursor-pointer transition ${
              activeTarget === "new"
                ? "border-white bg-neutral-900/60"
                : "border-neutral-900 bg-black hover:border-neutral-800"
            }`}
          >
            <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1">
              <span>{isMandatory ? "1. Novo PIN Pessoal (6 dígitos):" : "2. Novo PIN (6 dígitos):"}</span>
              <span className="text-[10px] text-neutral-500 font-mono">
                {newPin.length}/6
              </span>
            </div>
            {renderPinDots(newPin)}
          </div>

          {/* 3. Confirmar Novo PIN */}
          <div
            onClick={() => setActiveTarget("confirm")}
            className={`p-2.5 border cursor-pointer transition ${
              activeTarget === "confirm"
                ? "border-white bg-neutral-900/60"
                : "border-neutral-900 bg-black hover:border-neutral-800"
            }`}
          >
            <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1">
              <span>{isMandatory ? "2. Confirmar Novo PIN:" : "3. Confirmar Novo PIN:"}</span>
              <span className="text-[10px] text-neutral-500 font-mono">
                {confirmPin.length}/6
              </span>
            </div>
            {renderPinDots(confirmPin)}
          </div>
        </div>

        {/* Teclado Numérico Virtual para Telas Touch (Ergonômico & Limpo) */}
        <div className="pt-1">
          <div className="grid grid-cols-3 gap-1.5 font-mono text-base font-bold">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => handleKeypadPress(n)}
                className="h-11 bg-black border border-neutral-900 hover:bg-neutral-900 hover:text-white text-neutral-200 transition active:bg-neutral-800 flex items-center justify-center rounded-none"
              >
                {n}
              </button>
            ))}

            <button
              type="button"
              onClick={handleKeypadClear}
              className="h-11 bg-neutral-950 border border-neutral-900 hover:bg-neutral-900 text-neutral-400 text-xs uppercase tracking-wider transition rounded-none"
              title="Limpar campo ativo"
            >
              Limpar
            </button>

            <button
              type="button"
              onClick={() => handleKeypadPress("0")}
              className="h-11 bg-black border border-neutral-900 hover:bg-neutral-900 hover:text-white text-neutral-200 transition active:bg-neutral-800 flex items-center justify-center rounded-none"
            >
              0
            </button>

            <button
              type="button"
              onClick={handleKeypadBackspace}
              className="h-11 bg-neutral-950 border border-neutral-900 hover:bg-neutral-900 text-neutral-400 text-xs uppercase tracking-wider transition rounded-none"
              title="Apagar dígito"
            >
              Apagar
            </button>
          </div>
        </div>

        {/* Botão de Salvar & Opção de Trocar de Operador */}
        <div className="pt-2 space-y-2">
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={Boolean(successMsg)}
            className="w-full min-h-[40px] bg-white text-black font-bold text-xs font-mono uppercase hover:bg-neutral-200 transition flex items-center justify-center gap-1.5 shadow-sm rounded-none"
          >
            <Lock className="h-3.5 w-3.5" />
            <span>Salvar Novo PIN (6 dígitos)</span>
          </button>

          {isMandatory && onOpenSwitchUser && (
            <button
              type="button"
              onClick={onOpenSwitchUser}
              className="w-full py-1.5 text-center text-[10px] font-mono text-neutral-400 hover:text-white underline transition"
            >
              Entrar com outra conta de operador
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
