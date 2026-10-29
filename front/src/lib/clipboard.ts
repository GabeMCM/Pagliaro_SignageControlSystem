/**
 * Utilitário seguro para cópia de texto para a área de transferência.
 * Funciona tanto em contextos HTTPS seguros quanto em HTTP simples (IPs locais de rede como 192.168.x.x),
 * usando navigator.clipboard com fallback automático para textarea + document.execCommand.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Tenta API moderna do navegador se disponível em contexto seguro
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function" &&
    (typeof window !== "undefined" ? window.isSecureContext : false)
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_err) {
      // Falhou ou bloqueado por permissão; tenta o fallback abaixo
    }
  }

  // 2. Fallback robusto para HTTP / ambientes de rede local (LAN)
  if (typeof document !== "undefined") {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      // Garante que o elemento fique invisível e fora do viewport sem scroll
      textArea.style.position = "fixed";
      textArea.style.top = "0";
      textArea.style.left = "0";
      textArea.style.width = "2em";
      textArea.style.height = "2em";
      textArea.style.padding = "0";
      textArea.style.border = "none";
      textArea.style.outline = "none";
      textArea.style.boxShadow = "none";
      textArea.style.background = "transparent";
      document.body.appendChild(textArea);

      textArea.focus();
      textArea.select();
      textArea.setSelectionRange(0, 99999);

      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);
      return successful;
    } catch (fallbackErr) {
      console.error("[Clipboard] Erro no fallback de cópia:", fallbackErr);
      return false;
    }
  }

  return false;
}
