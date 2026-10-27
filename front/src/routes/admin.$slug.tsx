import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect, useRef } from "react";
import {
  signageApi,
  type Playlist,
  type PlaylistItem,
  type DeviceInfo,
  type YoutubeTrackResult,
  type YoutubePlaylistResult,
  type ScheduleTask,
  API_BASE,
} from "@/lib/signage-api";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  VolumeX,
  GripVertical,
  Music,
  Plus,
  Tv,
  Gamepad2,
  ListVideo,
  PenTool,
  Globe,
  RefreshCw,
  ExternalLink,
  Upload,
  Pencil,
  FolderOpen,
  Radio as RadioIcon,
  X,
  Video,
  Sparkles,
  Wrench,
  Repeat,
  Repeat1,
  Shuffle,
  ChevronUp,
  ChevronDown,
  ListMusic,
  Layers,
  ArrowRight,
  LogOut,
  Monitor,
  Clock,
  Moon,
  Sun,
  Check,
  Radio,
  Info,
  Search,
  Disc,
  Loader2,
  CheckCircle2,
  Minus,
  Calendar,
  CalendarClock,
  Zap,
  AlertCircle,
  Save,
} from "lucide-react";

export const Route = createFileRoute("/admin/$slug")({
  component: RoomOperator,
});

/**
 * Normaliza e limpa links de áudio e Google Drive
 */
function cleanAudioUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (!url) return url;
  if (!/^https?:\/\//i.test(url) && !url.startsWith("youtube:")) {
    url = "https://" + url;
  }
  const gdriveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (gdriveMatch) {
    url = `https://drive.google.com/uc?export=download&id=${gdriveMatch[1]}`;
  }
  return url;
}

/**
 * Extrai um título legível a partir do URL do arquivo de áudio
 */
function extractTrackTitle(url: string, customTitle?: string): string {
  if (customTitle && customTitle.trim()) return customTitle.trim();
  try {
    const cleanUrl = url.split("?")[0];
    const filename = cleanUrl.substring(cleanUrl.lastIndexOf("/") + 1);
    const decoded = decodeURIComponent(filename);
    const withoutExt = decoded.replace(/\.[a-zA-Z0-9]+$/, "");
    return withoutExt || "Faixa de Áudio";
  } catch {
    return "Faixa de Áudio";
  }
}

/**
 * Formata o tempo decorrido desde a conexão da tela
 */
function formatConnectedTime(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return "há menos de 1 min";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffHour = Math.floor(diffMin / 60);
  return `há ${diffHour}h ${diffMin % 60}m`;
}

/**
 * Formata data e hora do agendamento em português humano
 */
function formatScheduleDateTime(isoOrStr: string): string {
  try {
    const d = new Date(isoOrStr);
    if (isNaN(d.getTime())) return isoOrStr;
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow =
      d.getDate() === tomorrow.getDate() &&
      d.getMonth() === tomorrow.getMonth() &&
      d.getFullYear() === tomorrow.getFullYear();

    const timeStr = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (isToday) return `Hoje às ${timeStr}`;
    if (isTomorrow) return `Amanhã às ${timeStr}`;

    const dateStr = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    return `${dateStr} às ${timeStr}`;
  } catch {
    return isoOrStr;
  }
}

/**
 * Converte Date para string compatível com input datetime-local (YYYY-MM-DDTHH:mm)
 */
function toLocalDatetimeString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Converte data/hora local para ISO string UTC segura para envio ao servidor.
 */
function toUtcIsoString(localDateTimeStr: string): string {
  if (!localDateTimeStr) return "";
  try {
    const d = new Date(localDateTimeStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  } catch {}
  return localDateTimeStr;
}

/**
 * Campo de Data e Hora Seguro para Mobile / Android Chrome / iOS / Desktop
 * Separa em input de data e input de hora para acionar os seletores nativos sem travar o teclado virtual.
 */
function DateTimePickerField({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (val: string) => void;
  className?: string;
}) {
  const [datePart, timePart] = useMemo(() => {
    if (!value) {
      const now = new Date();
      const dStr = toLocalDatetimeString(now).slice(0, 10);
      const tStr = toLocalDatetimeString(now).slice(11, 16);
      return [dStr, tStr];
    }
    try {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        const local = toLocalDatetimeString(d);
        return [local.slice(0, 10), local.slice(11, 16)];
      }
    } catch {}
    const parts = value.split("T");
    return [parts[0] || "", (parts[1] || "").slice(0, 5)];
  }, [value]);

  const handleDateChange = (newDate: string) => {
    if (!newDate) return;
    onChange(`${newDate}T${timePart || "08:00"}`);
  };

  const handleTimeChange = (newTime: string) => {
    if (!newTime) return;
    const d = datePart || toLocalDatetimeString(new Date()).slice(0, 10);
    onChange(`${d}T${newTime}`);
  };

  const addMinutes = (mins: number) => {
    try {
      const dStr = datePart || toLocalDatetimeString(new Date()).slice(0, 10);
      const tStr = timePart || "08:00";
      const base = new Date(`${dStr}T${tStr}:00`);
      const target = isNaN(base.getTime()) ? new Date() : base;
      target.setMinutes(target.getMinutes() + mins);
      onChange(toLocalDatetimeString(target));
    } catch {}
  };

  const setTodayTomorrow = (isTomorrow: boolean) => {
    try {
      const target = new Date();
      if (isTomorrow) target.setDate(target.getDate() + 1);
      const dStr = toLocalDatetimeString(target).slice(0, 10);
      onChange(`${dStr}T${timePart || "08:00"}`);
    } catch {}
  };

  return (
    <div className={`space-y-1.5 ${className || ""}`}>
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <span className="text-[10px] text-neutral-400 block mb-0.5">Data:</span>
          <input
            type="date"
            value={datePart}
            onChange={(e) => handleDateChange(e.target.value)}
            onClick={(e) => {
              try {
                (e.currentTarget as any).showPicker?.();
              } catch {}
            }}
            className="w-full rounded-[2px] border border-neutral-800 bg-black px-2 py-1.5 text-white font-mono text-xs outline-none focus:border-neutral-600 cursor-pointer"
          />
        </div>
        <div>
          <span className="text-[10px] text-neutral-400 block mb-0.5">Horário:</span>
          <input
            type="time"
            value={timePart}
            onChange={(e) => handleTimeChange(e.target.value)}
            onClick={(e) => {
              try {
                (e.currentTarget as any).showPicker?.();
              } catch {}
            }}
            className="w-full rounded-[2px] border border-neutral-800 bg-black px-2 py-1.5 text-white font-mono text-xs outline-none focus:border-neutral-600 cursor-pointer"
          />
        </div>
      </div>

      {/* Botões Rápidos de Ajuste para Celular */}
      <div className="flex items-center gap-1 flex-wrap text-[10px] text-neutral-400 font-mono">
        <span className="text-[9px] uppercase tracking-wider text-neutral-500 mr-0.5">Ajustes:</span>
        <button
          type="button"
          onClick={() => setTodayTomorrow(false)}
          className="px-1.5 py-0.5 rounded-[2px] bg-neutral-900 border border-neutral-800 hover:text-white hover:border-neutral-700"
        >
          Hoje
        </button>
        <button
          type="button"
          onClick={() => setTodayTomorrow(true)}
          className="px-1.5 py-0.5 rounded-[2px] bg-neutral-900 border border-neutral-800 hover:text-white hover:border-neutral-700"
        >
          Amanhã
        </button>
        <button
          type="button"
          onClick={() => addMinutes(15)}
          className="px-1.5 py-0.5 rounded-[2px] bg-neutral-900 border border-neutral-800 hover:text-white hover:border-neutral-700"
        >
          +15m
        </button>
        <button
          type="button"
          onClick={() => addMinutes(30)}
          className="px-1.5 py-0.5 rounded-[2px] bg-neutral-900 border border-neutral-800 hover:text-white hover:border-neutral-700"
        >
          +30m
        </button>
        <button
          type="button"
          onClick={() => addMinutes(60)}
          className="px-1.5 py-0.5 rounded-[2px] bg-neutral-900 border border-neutral-800 hover:text-white hover:border-neutral-700"
        >
          +1h
        </button>
      </div>
    </div>
  );
}

/**
 * Modal para Gestão e Exclusão de Filas e Playlists Salvas
 */
function ManagePlaylistsModal({
  isOpen,
  onClose,
  playlists,
  activePlaylistId,
  onSelect,
  onDelete,
}: {
  isOpen: boolean;
  onClose: () => void;
  playlists: Playlist[];
  activePlaylistId?: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string, name: string) => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-[2px] border border-neutral-800 bg-neutral-950 p-4 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <ListMusic className="h-4 w-4 text-white" />
            <h3 className="font-bold text-sm text-white">Gerenciar Listas de Músicas</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-[2px] text-neutral-400 hover:text-white hover:bg-neutral-900 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-neutral-400">
          Aqui você pode ver todas as filas e playlists salvas, selecionar para a sala ou excluir as que não for usar.
        </p>

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-[150px]">
          {playlists.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-500">
              Nenhuma playlist encontrada.
            </div>
          ) : (
            playlists.map((pl) => {
              const isActive = pl.id === activePlaylistId;
              return (
                <div
                  key={pl.id}
                  className={`flex items-center justify-between gap-2 p-2.5 rounded-[2px] border transition ${
                    isActive
                      ? "bg-neutral-900 border-white/40 shadow-xs"
                      : "bg-neutral-900/60 border-neutral-800 hover:border-neutral-700"
                  }`}
                >
                  <div
                    onClick={() => {
                      onSelect(pl.id);
                      onClose();
                    }}
                    className="flex-1 min-w-0 cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-white truncate">
                        {pl.name}
                      </span>
                      {isActive && (
                        <span className="px-1.5 py-0.2 rounded-[2px] text-[9px] font-bold bg-white text-black uppercase">
                          Ativa
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-neutral-400 font-mono">
                      {pl.items?.length || 0} faixa{(pl.items?.length || 0) !== 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {!isActive && (
                      <button
                        onClick={() => {
                          onSelect(pl.id);
                          onClose();
                        }}
                        className="px-2 py-1 rounded-[2px] bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold transition"
                      >
                        Usar
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(pl.id, pl.name)}
                      className="p-1.5 rounded-[2px] text-neutral-400 hover:text-red-400 hover:bg-red-500/10 transition"
                      title="Excluir playlist permanentemente"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="pt-2 border-t border-neutral-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-[2px] bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-semibold text-white transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Presets Rápidos de Volume de 0 a 100 em passos de 12,5%
 */
const VOLUME_PRESETS = [
  { label: "0%", val: 0 },
  { label: "12,5%", val: 12.5 },
  { label: "25%", val: 25 },
  { label: "37,5%", val: 37.5 },
  { label: "50%", val: 50 },
  { label: "62,5%", val: 62.5 },
  { label: "75%", val: 75 },
  { label: "87,5%", val: 87.5 },
  { label: "100%", val: 100 },
];

interface VolumeWheelPickerProps {
  value: number;
  onChange: (val: number) => void;
  compact?: boolean;
  disabled?: boolean;
}

/**
 * Seletor de Volume Estilo Roleta (UIDatePicker Wheel Picker)
 * Blindado contra eventos de scroll programáticos (evita sobrescrever o volume do servidor ao abrir/recarregar a página em outro aparelho).
 */
function VolumeWheelPicker({ value, onChange, compact = false, disabled = false }: VolumeWheelPickerProps) {
  const ITEM_HEIGHT = compact ? 32 : 38;
  const numbers = useMemo(() => Array.from({ length: 101 }, (_, i) => i), []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isUserInteractingRef = useRef(false);
  const isProgrammaticScrollRef = useRef(false);
  const programmaticTimerRef = useRef<any>(null);
  const debounceTimerRef = useRef<any>(null);
  const lastConfirmedValueRef = useRef<number>(Math.round(value));
  const [currentVal, setCurrentVal] = useState<number>(Math.round(value));

  const syncScrollPosition = (targetVal: number, smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    isProgrammaticScrollRef.current = true;
    if (programmaticTimerRef.current) clearTimeout(programmaticTimerRef.current);

    const targetTop = targetVal * ITEM_HEIGHT;
    if (smooth) {
      el.scrollTo({ top: targetTop, behavior: "smooth" });
      programmaticTimerRef.current = setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 350);
    } else {
      el.scrollTop = targetTop;
      programmaticTimerRef.current = setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 150);
    }
  };

  useEffect(() => {
    const rounded = Math.max(0, Math.min(100, Math.round(value)));
    lastConfirmedValueRef.current = rounded;
    setCurrentVal(rounded);
    if (!isUserInteractingRef.current) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      // Usa atribuição direta (instantânea) quando o valor vem do servidor/WS para nunca disparar scroll intermediário
      syncScrollPosition(rounded, false);
    }
  }, [value, ITEM_HEIGHT]);

  useEffect(() => {
    return () => {
      if (programmaticTimerRef.current) clearTimeout(programmaticTimerRef.current);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const markUserGesture = () => {
    if (disabled) return;
    isProgrammaticScrollRef.current = false;
    if (programmaticTimerRef.current) {
      clearTimeout(programmaticTimerRef.current);
      programmaticTimerRef.current = null;
    }
    isUserInteractingRef.current = true;
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    // Ignora completamente qualquer scroll causado por inicialização, reload ou sincronização do servidor!
    if (disabled || isProgrammaticScrollRef.current || !isUserInteractingRef.current) {
      return;
    }

    const top = e.currentTarget.scrollTop;
    const idx = Math.max(0, Math.min(100, Math.round(top / ITEM_HEIGHT)));
    setCurrentVal(idx);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      isUserInteractingRef.current = false;
      syncScrollPosition(idx, false);
      if (idx !== lastConfirmedValueRef.current) {
        lastConfirmedValueRef.current = idx;
        onChange(idx);
      }
    }, 140);
  };

  const handleSelect = (num: number) => {
    if (disabled) return;
    const clamped = Math.max(0, Math.min(100, Math.round(num)));
    isUserInteractingRef.current = false;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setCurrentVal(clamped);
    lastConfirmedValueRef.current = clamped;
    syncScrollPosition(clamped, false);
    onChange(clamped);
  };

  const step = (delta: number) => {
    if (disabled) return;
    const next = Math.max(0, Math.min(100, currentVal + delta));
    handleSelect(next);
  };

  return (
    <div className={`flex ${compact ? "flex-row items-center gap-2" : "flex-col sm:flex-row items-center gap-2.5"} w-full ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="flex items-center gap-1.5 justify-center w-full sm:w-auto">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={disabled || currentVal <= 0}
          className={`${compact ? "h-8 w-8 text-xs" : "h-9 w-9 text-sm"} rounded-[2px] bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 disabled:opacity-20 flex items-center justify-center transition flex-shrink-0`}
          title="Diminuir 1%"
        >
          <Minus className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        </button>

        {/* Tambor Cilíndrico da Roleta (UIDatePicker Style com Rounded Quase Zero) */}
        <div className={`relative ${compact ? "h-[96px] w-24 sm:w-28" : "h-[114px] w-28 sm:w-32"} overflow-hidden rounded-[2px] border border-neutral-800 bg-black shadow-inner select-none flex-shrink-0`}>
          <div className={`pointer-events-none absolute inset-x-0 top-0 ${compact ? "h-7" : "h-9"} bg-gradient-to-b from-neutral-950 via-neutral-950/80 to-transparent z-20`} />
          <div className={`pointer-events-none absolute inset-x-0 ${compact ? "top-[32px] h-[32px]" : "top-[38px] h-[38px]"} border-y border-neutral-600 bg-white/10 z-10 flex items-center justify-end pr-2`}>
            <span className="text-[10px] font-bold text-neutral-300 font-mono">%</span>
          </div>
          <div className={`pointer-events-none absolute inset-x-0 bottom-0 ${compact ? "h-7" : "h-9"} bg-gradient-to-t from-neutral-950 via-neutral-950/80 to-transparent z-20`} />

          <div
            ref={scrollRef}
            onTouchStart={markUserGesture}
            onPointerDown={markUserGesture}
            onMouseDown={markUserGesture}
            onWheel={markUserGesture}
            onScroll={handleScroll}
            className={`h-full overflow-y-auto snap-y snap-mandatory scrollbar-none ${compact ? "py-[32px]" : "py-[38px]"}`}
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {numbers.map((num) => {
              const isSelected = currentVal === num;
              const dist = Math.abs(currentVal - num);
              return (
                <div
                  key={num}
                  onClick={() => handleSelect(num)}
                  className={`${compact ? "h-[32px]" : "h-[38px]"} flex items-center justify-center snap-center cursor-pointer font-mono transition-all duration-100 ${
                    isSelected
                      ? `${compact ? "text-base" : "text-lg"} font-black text-white scale-105`
                      : dist === 1
                      ? "text-xs font-semibold text-neutral-400 scale-95 opacity-55"
                      : "text-[11px] text-neutral-600 scale-90 opacity-25"
                  }`}
                >
                  {num}
                </div>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => step(1)}
          disabled={disabled || currentVal >= 100}
          className={`${compact ? "h-8 w-8 text-xs" : "h-9 w-9 text-sm"} rounded-[2px] bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 disabled:opacity-20 flex items-center justify-center transition flex-shrink-0`}
          title="Aumentar 1%"
        >
          <Plus className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => handleSelect(currentVal > 0 ? 0 : 50)}
          className={`${compact ? "h-8 w-8" : "h-9 w-9"} rounded-[2px] border flex items-center justify-center transition flex-shrink-0 ${
            currentVal === 0
              ? "bg-red-500/20 border-red-500/40 text-red-300"
              : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:text-white"
          }`}
          title={currentVal === 0 ? "Desmutar (50%)" : "Mudo (0%)"}
        >
          {currentVal === 0 ? (
            <VolumeX className="h-4 w-4 text-red-400" />
          ) : (
            <Volume2 className="h-4 w-4 text-neutral-300" />
          )}
        </button>
      </div>

      {!compact && (
        <div className="flex items-center gap-1.5 justify-center sm:justify-start">
          <span className="text-xs text-neutral-400 font-medium">Volume:</span>
          <span className="text-sm font-bold text-white font-mono bg-neutral-900 px-2 py-0.5 rounded-[2px] border border-neutral-800">
            {currentVal}%
          </span>
        </div>
      )}
    </div>
  );
}

function RoomOperator() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const router = useRouter();

  // Controle de Versão Autoritativa do Servidor e Filas FIFO de Eventos (Entrada e Saída)
  const serverVersionRef = useRef<number>(0);
  const outgoingQueueRef = useRef<Promise<any>>(Promise.resolve());
  const incomingWsQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Reseta a versão ao trocar de sala
  useEffect(() => {
    serverVersionRef.current = 0;
  }, [slug]);

  /**
   * Aplica o estado autoritativo vindo do servidor respeitando a prioridade de versão monotônica.
   * Impede que respostas HTTP atrasadas sobrescrevam estados mais recentes recebidos via WebSocket.
   */
  const applyServerAuthoritativeState = (incomingState: any, explicitVersion?: number) => {
    if (!incomingState || typeof incomingState !== "object") return;
    const ver = Number(explicitVersion ?? incomingState.version ?? 0);
    if (ver > 0 && ver < serverVersionRef.current) {
      // Ignora pacote obsoleto (fora de ordem)
      return;
    }
    if (ver > serverVersionRef.current) {
      serverVersionRef.current = ver;
    }
    qc.setQueryData(["state", slug], incomingState);
  };

  // Abas Principais: Conteúdo / Áudio / Automação / Aparelhos
  const [activeTab, setActiveTab] = useState<"content" | "audio" | "automation" | "devices">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("signage_active_tab") as any) || "audio";
    }
    return "audio";
  });

  const handleSelectTab = (tab: "content" | "audio" | "automation" | "devices") => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      localStorage.setItem("signage_active_tab", tab);
    }
  };

  // Estados para Salvar Fila de Músicas (substituindo a gestão antiga de playlists)
  const [saveQueueModalOpen, setSaveQueueModalOpen] = useState(false);
  const [saveQueueName, setSaveQueueName] = useState("");
  const [saveQueueMode, setSaveQueueMode] = useState<"new" | "update">("new");
  const [isSavingQueue, setIsSavingQueue] = useState(false);
  const [isManagingPlaylistsOpen, setIsManagingPlaylistsOpen] = useState(false);
  const [queueSearchQuery, setQueueSearchQuery] = useState("");

  // Consultas de dados com intervalos mais suaves para poupar celulares antigos
  // O WebSocket já realiza sincronização em tempo real com prioridade ao estado do servidor!
  const roomsQ = useQuery({
    queryKey: ["rooms"],
    queryFn: signageApi.listRooms,
    refetchInterval: 8000,
  });
  const currentRoom = roomsQ.data?.find((r) => r.slug === slug);

  const stateQ = useQuery({
    queryKey: ["state", slug],
    queryFn: async () => {
      const fresh = await signageApi.getState(slug);
      const freshVer = Number(fresh?.version ?? 0);
      // Se o WebSocket já entregou uma versão mais nova enquanto o GET HTTP estava em trânsito, preserva o estado mais novo
      if (freshVer > 0 && freshVer < serverVersionRef.current) {
        const cached = qc.getQueryData<any>(["state", slug]);
        if (cached) return cached;
      }
      if (freshVer > serverVersionRef.current) {
        serverVersionRef.current = freshVer;
      }
      return fresh;
    },
    refetchInterval: 8000,
  });

  const playlistsQ = useQuery({
    queryKey: ["playlists"],
    queryFn: signageApi.listPlaylists,
  });

  const setState = useMutation({
    mutationFn: (updates: {
      playlist?: string | null;
      audioPlaylist?: string | null;
      audioStreamUrl?: string | null;
      siteUrl?: string | null;
      mode?: "playlist" | "site";
      audioVolume?: number;
      audioLoopMode?: "all" | "one" | "none";
      audioShuffle?: boolean;
      currentAudioIndex?: number;
      standby?: boolean;
      audioStatus?: "playing" | "paused";
    }) => {
      // Enfileira na fila FIFO de saída do cliente
      const task = outgoingQueueRef.current.then(async () => {
        const res = await signageApi.setState(slug, updates);
        if (res?.state) {
          applyServerAuthoritativeState(res.state, res.version);
        }
        return res;
      });
      outgoingQueueRef.current = task.catch(() => {});
      return task;
    },
    onMutate: async (updates) => {
      await qc.cancelQueries({ queryKey: ["state", slug] });
      const previousState = qc.getQueryData(["state", slug]);
      qc.setQueryData(["state", slug], (old: any) => ({
        ...(old || {}),
        ...updates,
      }));
      return { previousState };
    },
    onError: (_err, _updates, context: any) => {
      if (context?.previousState) {
        qc.setQueryData(["state", slug], context.previousState);
      }
      qc.invalidateQueries({ queryKey: ["state", slug] });
    },
  });

  // Disparo enfileirado (FIFO) com feedback visual imediato e reconciliação pelo Estado Autoritativo do Servidor
  const handleOptimisticCommand = (
    target: "visual" | "audio" | "site" | "room",
    command: "play" | "pause" | "next" | "prev" | "reload" | "setVolume" | "setLoopMode" | "setShuffle" | "setTrackIndex" | "setStandby",
    value?: any
  ) => {
    // Nunca permite que um dispositivo sem o estado carregado do servidor dispare alteração de volume
    if (!stateQ.data && command === "setVolume") {
      return;
    }

    qc.setQueryData(["state", slug], (old: any) => {
      if (!old) return old;
      const updated = { ...old };
      if (target === "audio") {
        if (command === "play") updated.audioStatus = "playing";
        else if (command === "pause") updated.audioStatus = "paused";
        else if (command === "setVolume") updated.audioVolume = Number(value);
        else if (command === "setLoopMode") updated.audioLoopMode = value;
        else if (command === "setShuffle") updated.audioShuffle = Boolean(value);
        else if (command === "setTrackIndex") updated.currentAudioIndex = Number(value);
        else if (command === "next" && activeAudio?.items && activeAudio.items.length > 0) {
          updated.audioStatus = "playing";
          const max = activeAudio.items.length;
          updated.currentAudioIndex = ((updated.currentAudioIndex || 0) + 1) % max;
        } else if (command === "prev" && activeAudio?.items && activeAudio.items.length > 0) {
          updated.audioStatus = "playing";
          const max = activeAudio.items.length;
          const curr = updated.currentAudioIndex || 0;
          updated.currentAudioIndex = curr <= 0 ? max - 1 : curr - 1;
        }
      } else if (target === "room" && command === "setStandby") {
        updated.standby = Boolean(value);
      }
      return updated;
    });

    // Enfileira o comando na Fila de Eventos de Saída (FIFO) e aplica o estado oficial retornado pelo servidor
    const nextTask = outgoingQueueRef.current.then(async () => {
      try {
        const res =
          command === "setVolume"
            ? await signageApi.setAudioVolume(slug, Number(value))
            : await signageApi.sendCommand(slug, target as any, command as any, value);
        if (res?.state) {
          applyServerAuthoritativeState(res.state, res.version);
        }
      } catch (_err) {
        qc.invalidateQueries({ queryKey: ["state", slug] });
      }
    });
    outgoingQueueRef.current = nextTask.catch(() => {});
  };

  const deleteRoomMut = useMutation({
    mutationFn: (id: string) => signageApi.deleteRoom(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rooms"] });
      router.navigate({ to: "/admin" });
    },
  });

  const deletePlaylistMut = useMutation({
    mutationFn: (id: string) => signageApi.deletePlaylist(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["playlists"] });
      qc.invalidateQueries({ queryKey: ["state", slug] });
    },
  });

  // Consulta de dispositivos / telas conectadas nesta sala (limite de 2)
  const devicesQ = useQuery({
    queryKey: ["roomDevices", slug],
    queryFn: () => signageApi.listRoomDevices(slug),
    refetchInterval: 6000,
  });

  // Mutação para retirar dispositivos para o lobby (individual ou todos)
  const kickDeviceMut = useMutation({
    mutationFn: ({ clientId, reason }: { clientId?: string; reason?: string }) =>
      signageApi.kickDevice(slug, clientId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roomDevices", slug] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
      qc.invalidateQueries({ queryKey: ["state", slug] });
    },
  });

  // Consulta de agendamentos e automações da sala
  const schedulesQ = useQuery({
    queryKey: ["schedules", slug],
    queryFn: () => signageApi.listSchedules(slug),
    refetchInterval: 10000,
  });

  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleTask | null>(null);
  const [wizardModalOpen, setWizardModalOpen] = useState(false);
  const [runningScheduleId, setRunningScheduleId] = useState<string | null>(null);

  const createScheduleMut = useMutation({
    mutationFn: (data: Partial<ScheduleTask>) => signageApi.createSchedule(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules", slug] });
    },
  });

  const updateScheduleMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ScheduleTask> }) =>
      signageApi.updateSchedule(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules", slug] });
    },
  });

  const deleteScheduleMut = useMutation({
    mutationFn: (id: string) => signageApi.deleteSchedule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules", slug] });
    },
  });

  const toggleScheduleMut = useMutation({
    mutationFn: (id: string) => signageApi.toggleSchedule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules", slug] });
    },
  });

  const runScheduleMut = useMutation({
    mutationFn: async (id: string) => {
      setRunningScheduleId(id);
      try {
        const res = await signageApi.runScheduleNow(id);
        return res;
      } finally {
        setRunningScheduleId(null);
      }
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["state", slug] });
      qc.invalidateQueries({ queryKey: ["schedules", slug] });
      alert(res.message || "Ação executada na TV com sucesso!");
    },
  });

  const handleDeleteRoom = () => {
    if (!currentRoom?.id) return;
    if (confirm(`Tem certeza que deseja apagar a sala "${currentRoom.name}"?`)) {
      deleteRoomMut.mutate(currentRoom.id);
    }
  };

  // Estados locais para inputs
  const [siteInputUrl, setSiteInputUrl] = useState("");
  const [audioStreamInputUrl, setAudioStreamInputUrl] = useState("");

  // Sub-modo de áudio no Modo Básico: busca youtube, importar playlist, fila da sala ou web rádio
  const [basicAudioTab, setBasicAudioTab] = useState<"youtube" | "playlist_import" | "playlist" | "stream">("youtube");

  // Inputs para adicionar faixa à playlist no Modo Básico
  const [newTrackUrl, setNewTrackUrl] = useState("");
  const [newTrackTitle, setNewTrackTitle] = useState("");
  const [multiLinksText, setMultiLinksText] = useState("");
  const [showMultiLinksModal, setShowMultiLinksModal] = useState(false);

  // Estados para Busca Direta no YouTube
  const [ytQuery, setYtQuery] = useState("");
  const [ytResults, setYtResults] = useState<YoutubeTrackResult[]>([]);
  const [isSearchingYt, setIsSearchingYt] = useState(false);
  const [ytSearchError, setYtSearchError] = useState(null as string | null);
  const [addedSuccessId, setAddedSuccessId] = useState(null as string | null);

  // Estados para Importação de Playlist / Álbum do YouTube
  const [playlistInputUrl, setPlaylistInputUrl] = useState("");
  const [loadedPlaylistPreview, setLoadedPlaylistPreview] = useState<YoutubePlaylistResult | null>(null);
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState(false);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (stateQ.data?.siteUrl) {
      setSiteInputUrl(stateQ.data.siteUrl);
    }
  }, [stateQ.data?.siteUrl]);

  useEffect(() => {
    if (stateQ.data?.audioStreamUrl) {
      setAudioStreamInputUrl(stateQ.data.audioStreamUrl);
      setBasicAudioTab("stream");
    }
  }, [stateQ.data?.audioStreamUrl]);

  const activeVisual = useMemo(() => {
    const id = stateQ.data?.playlist;
    return playlistsQ.data?.find((p) => p.id === id) ?? null;
  }, [stateQ.data, playlistsQ.data]);

  const activeAudio = useMemo(() => {
    const id = stateQ.data?.audioPlaylist;
    return playlistsQ.data?.find((p) => p.id === id) ?? null;
  }, [stateQ.data, playlistsQ.data]);

  const visualPlaylists = playlistsQ.data?.filter((p) => p.type === "visual") || [];
  const audioPlaylists = playlistsQ.data?.filter((p) => p.type === "audio") || [];

  const playerUrl = `${API_BASE}/player/index.html?room=${slug}`;
  const isSiteActive = stateQ.data?.mode === "site" && Boolean(stateQ.data?.siteUrl);
  const isAudioStreamActive = Boolean(stateQ.data?.audioStreamUrl);
  // Segurança: Padrão 0% enquanto o estado do servidor não carregou (jamais 100%)
  const currentAudioVolume = stateQ.data?.audioVolume ?? 0;
  const loopMode = stateQ.data?.audioLoopMode || (activeAudio && activeAudio.loopMode) || "all";
  const shuffleActive = Boolean(stateQ.data?.audioShuffle || (activeAudio && activeAudio.shuffle));
  const currentAudioIndex = stateQ.data?.currentAudioIndex ?? 0;
  const isAudioPlaying = stateQ.data?.audioStatus === "playing";

  // Identificação da faixa tocando agora
  const currentPlayingTrack = useMemo(() => {
    if (isAudioStreamActive) return "Transmissão Web Rádio";
    if (activeAudio?.items && activeAudio.items.length > 0) {
      const it = activeAudio.items[currentAudioIndex] || activeAudio.items[0];
      return it?.title || extractTrackTitle(it?.url || "");
    }
    return null;
  }, [isAudioStreamActive, activeAudio, currentAudioIndex]);

  // Sincronização via WebSocket com Fila de Eventos (FIFO) e Estado Autoritativo do Servidor
  useEffect(() => {
    const wsUrl = API_BASE.replace("http", "ws");
    const ws = new WebSocket(`${wsUrl}/ws/${slug}?role=admin`);
    let pingTimer: any = null;

    ws.onopen = () => {
      pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 25000);
    };

    ws.onmessage = (event) => {
      const rawData = event.data;
      // Enfileira cada mensagem recebida do WebSocket para processamento estritamente sequencial (FIFO)
      incomingWsQueueRef.current = incomingWsQueueRef.current
        .then(async () => {
          try {
            const data = JSON.parse(rawData);
            if (data.type === "pong") return;

            // 1. Sincronização inicial imediata ou atualização de estado oficial do servidor
            if ((data.type === "stateSync" || data.type === "updateState") && data.state) {
              applyServerAuthoritativeState(data.state, data.version);
              return;
            }

            // 2. Comando processado pela fila do servidor (já traz o state oficial e version atualizados)
            if (data.type === "control") {
              if (data.state) {
                applyServerAuthoritativeState(data.state, data.version);
                return;
              }
              // Fallback caso venha um comando sem state acoplado
              qc.setQueryData(["state", slug], (old: any) => {
                if (!old) return old;
                const updated = { ...old };
                if (data.target === "audio") {
                  if (data.command === "play") updated.audioStatus = "playing";
                  else if (data.command === "pause") updated.audioStatus = "paused";
                  else if (data.command === "setVolume") updated.audioVolume = data.value;
                  else if (data.command === "setLoopMode") updated.audioLoopMode = data.value;
                  else if (data.command === "setShuffle") updated.audioShuffle = data.value;
                  else if (data.command === "setTrackIndex" || data.command === "trackChanged")
                    updated.currentAudioIndex = data.value;
                } else if (data.target === "room" && data.command === "setStandby") {
                  updated.standby = data.value;
                }
                return updated;
              });
              return;
            }

            if (data.type === "devicesUpdate" || data.type === "presence") {
              if (Array.isArray(data.devices)) {
                qc.setQueryData(["roomDevices", slug], (old: any) => ({
                  ...(old || {}),
                  success: true,
                  room: slug,
                  count: data.devices.length,
                  max: data.maxClients || old?.max || 2,
                  devices: data.devices,
                }));
              }
              qc.invalidateQueries({ queryKey: ["roomDevices", slug] });
              return;
            }
          } catch (_e) {
            qc.invalidateQueries({ queryKey: ["state", slug] });
          }
        })
        .catch(() => {});
    };

    return () => {
      if (pingTimer) clearInterval(pingTimer);
      ws.close();
    };
  }, [slug, qc]);

  // Ações de Site
  const handleApplySite = () => {
    if (!siteInputUrl.trim()) return;
    let url = siteInputUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = "https://" + url;
      setSiteInputUrl(url);
    }
    setState.mutate({ siteUrl: url, mode: "site" });
  };

  const handleClearSite = () => {
    setState.mutate({ siteUrl: null, mode: "playlist" });
  };

  // Ações de Stream Único / Web Rádio
  const handleApplyAudioStream = () => {
    if (!audioStreamInputUrl.trim()) return;
    const url = cleanAudioUrl(audioStreamInputUrl);
    setAudioStreamInputUrl(url);
    setState.mutate({ audioStreamUrl: url, audioStatus: "playing" });
  };

  const handleClearAudioStream = () => {
    setState.mutate({ audioStreamUrl: null });
  };

  // ==========================================
  // Ações de YouTube (Busca & Importação de Playlist)
  // ==========================================
  const handleSearchYt = async (termToSearch?: string) => {
    const q = (termToSearch !== undefined ? termToSearch : ytQuery).trim();
    if (!q) return;
    if (termToSearch !== undefined) {
      setYtQuery(termToSearch);
    }
    setIsSearchingYt(true);
    setYtSearchError(null);
    try {
      const res = await signageApi.searchYoutube(q, 15);
      setYtResults(res.results || []);
      if ((res.results || []).length === 0) {
        setYtSearchError("Nenhum resultado encontrado para esta busca.");
      }
    } catch (err: any) {
      setYtSearchError(err.message || "Erro ao buscar no YouTube.");
    } finally {
      setIsSearchingYt(false);
    }
  };

  const handleAddYtTrack = async (track: YoutubeTrackResult, playImmediately = false) => {
    const newItem: PlaylistItem = {
      url: track.url,
      title: track.title,
      type: "audio",
      duration: track.durationSeconds,
      muted: false,
      volume: 100,
    };

    let targetPlaylistId = activeAudio?.id;
    let targetItems = [...(activeAudio?.items || [])];

    if (activeAudio) {
      targetItems.push(newItem);
      await signageApi.updatePlaylist(activeAudio.id, {
        ...activeAudio,
        items: targetItems,
      });
      if (stateQ.data?.audioStreamUrl) {
        await signageApi.setState(slug, { audioStreamUrl: null, audioStatus: "playing" });
      }
    } else {
      const playlistName = `Áudio - ${currentRoom?.name || slug}`;
      const existingQueue = audioPlaylists.find((p) => p.name === playlistName);
      if (existingQueue) {
        targetPlaylistId = existingQueue.id;
        targetItems = [...(existingQueue.items || []), newItem];
        await signageApi.updatePlaylist(targetPlaylistId, {
          ...existingQueue,
          items: targetItems,
        });
        await signageApi.setState(slug, {
          audioPlaylist: targetPlaylistId,
          audioStreamUrl: null,
          audioStatus: "playing",
        });
      } else {
        const res = await signageApi.createPlaylist({
          name: playlistName,
          type: "audio",
          items: [newItem],
          loop: true,
          loopMode: "all",
          shuffle: false,
        });
        targetPlaylistId = res.playlist?.id;
        if (targetPlaylistId) {
          await signageApi.setState(slug, {
            audioPlaylist: targetPlaylistId,
            audioStreamUrl: null,
            audioStatus: "playing",
          });
        }
      }
    }

    setAddedSuccessId(track.id);
    setTimeout(() => setAddedSuccessId(null), 2500);

    if (playImmediately) {
      const newIdx = targetItems.length - 1;
      signageApi.setTrackIndex(slug, newIdx);
      await signageApi.setState(slug, { audioStatus: "playing" });
    }

    qc.invalidateQueries({ queryKey: ["playlists"] });
    qc.invalidateQueries({ queryKey: ["state", slug] });
  };

  const handleFetchPlaylistInfo = async () => {
    if (!playlistInputUrl.trim()) return;
    setIsLoadingPlaylist(true);
    setPlaylistError(null);
    setLoadedPlaylistPreview(null);
    setImportSuccessMsg(null);
    try {
      const res = await signageApi.getYoutubePlaylist(playlistInputUrl.trim());
      if (res.playlist && res.playlist.videos.length > 0) {
        setLoadedPlaylistPreview(res.playlist);
      } else {
        setPlaylistError("A playlist do YouTube não possui vídeos disponíveis ou é privada.");
      }
    } catch (err: any) {
      setPlaylistError(err.message || "Erro ao carregar playlist do YouTube. Verifique o link.");
    } finally {
      setIsLoadingPlaylist(false);
    }
  };

  const handleImportPlaylistTracks = async (mode: "replace" | "append" | "new", limit?: number) => {
    if (!loadedPlaylistPreview || loadedPlaylistPreview.videos.length === 0) return;
    setIsLoadingPlaylist(true);
    setPlaylistError(null);

    const sourceVideos = limit
      ? loadedPlaylistPreview.videos.slice(0, limit)
      : loadedPlaylistPreview.videos;

    const newItems: PlaylistItem[] = sourceVideos.map((v) => ({
      url: v.url,
      title: v.title,
      type: "audio",
      duration: v.durationSeconds,
      muted: false,
      volume: 100,
    }));

    try {
      if (mode === "new" || !activeAudio) {
        const res = await signageApi.createPlaylist({
          name: loadedPlaylistPreview.title || `Playlist YouTube - ${currentRoom?.name || slug}`,
          type: "audio",
          items: newItems,
          loop: true,
          loopMode: "all",
          shuffle: false,
        });
        if (res.playlist?.id) {
          await signageApi.setState(slug, {
            audioPlaylist: res.playlist.id,
            audioStreamUrl: null,
            audioStatus: "playing",
            currentAudioIndex: 0,
          });
        }
      } else if (mode === "append") {
        const combined = [...(activeAudio.items || []), ...newItems];
        await signageApi.updatePlaylist(activeAudio.id, {
          ...activeAudio,
          items: combined,
        });
        if (stateQ.data?.audioStreamUrl) {
          await signageApi.setState(slug, { audioStreamUrl: null, audioStatus: "playing" });
        }
      } else if (mode === "replace") {
        await signageApi.updatePlaylist(activeAudio.id, {
          ...activeAudio,
          name: loadedPlaylistPreview.title || activeAudio.name,
          items: newItems,
        });
        await signageApi.setState(slug, {
          audioStreamUrl: null,
          audioStatus: "playing",
          currentAudioIndex: 0,
        });
      }

      setImportSuccessMsg(`${newItems.length} faixas importadas com sucesso para a sala!`);
      setPlaylistInputUrl("");
      setLoadedPlaylistPreview(null);
      setTimeout(() => {
        setBasicAudioTab("playlist");
        setImportSuccessMsg(null);
      }, 1500);

      qc.invalidateQueries({ queryKey: ["playlists"] });
      qc.invalidateQueries({ queryKey: ["state", slug] });
    } catch (err: any) {
      setPlaylistError(err.message || "Erro ao salvar faixas importadas.");
    } finally {
      setIsLoadingPlaylist(false);
    }
  };

  // Ações de Músicas / Playlist
  const handleAddTrack = async (rawUrl: string, customTitle?: string) => {
    if (!rawUrl.trim()) return;
    const cleaned = cleanAudioUrl(rawUrl);

    // Se detectou playlist do YouTube, encaminha direto para a aba de importação
    if (cleaned.includes("list=")) {
      setPlaylistInputUrl(cleaned);
      setBasicAudioTab("playlist_import");
      return;
    }

    let title = customTitle?.trim() || "";
    let duration: number | undefined;

    // Se for link do YouTube e não foi passado título manual, obtém dados oficiais
    if (!title && (cleaned.includes("youtube.com") || cleaned.includes("youtu.be"))) {
      try {
        const vidRes = await signageApi.getYoutubeVideo(cleaned);
        if (vidRes.video?.title) {
          title = vidRes.video.title;
          duration = vidRes.video.durationSeconds;
        }
      } catch (_e) {}
    }

    if (!title) {
      title = extractTrackTitle(cleaned, customTitle);
    }

    const newItem: PlaylistItem = {
      url: cleaned,
      title,
      type: "audio",
      duration,
      muted: false,
      volume: 100,
    };

    if (activeAudio) {
      const updatedItems = [...(activeAudio.items || []), newItem];
      await signageApi.updatePlaylist(activeAudio.id, {
        ...activeAudio,
        items: updatedItems,
      });
      if (stateQ.data?.audioStreamUrl) {
        await signageApi.setState(slug, { audioStreamUrl: null, audioStatus: "playing" });
      }
    } else {
      const playlistName = `Áudio - ${currentRoom?.name || slug}`;
      const existingQueue = audioPlaylists.find((p) => p.name === playlistName);
      if (existingQueue) {
        const targetItems = [...(existingQueue.items || []), newItem];
        await signageApi.updatePlaylist(existingQueue.id, {
          ...existingQueue,
          items: targetItems,
        });
        await signageApi.setState(slug, {
          audioPlaylist: existingQueue.id,
          audioStreamUrl: null,
          audioStatus: "playing",
        });
      } else {
        const res = await signageApi.createPlaylist({
          name: playlistName,
          type: "audio",
          items: [newItem],
          loop: true,
          loopMode: "all",
          shuffle: false,
        });
        if (res.playlist?.id) {
          await signageApi.setState(slug, {
            audioPlaylist: res.playlist.id,
            audioStreamUrl: null,
            audioStatus: "playing",
          });
        }
      }
    }

    setNewTrackUrl("");
    setNewTrackTitle("");
    qc.invalidateQueries({ queryKey: ["playlists"] });
    qc.invalidateQueries({ queryKey: ["state", slug] });
  };

  const handleAddMultipleTracks = async () => {
    const lines = multiLinksText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    const newItems: PlaylistItem[] = lines.map((line) => {
      const cleaned = cleanAudioUrl(line);
      const title = extractTrackTitle(cleaned);
      return {
        url: cleaned,
        title,
        type: "audio",
        muted: false,
        volume: 100,
      };
    });

    if (activeAudio) {
      const updatedItems = [...(activeAudio.items || []), ...newItems];
      await signageApi.updatePlaylist(activeAudio.id, {
        ...activeAudio,
        items: updatedItems,
      });
      if (stateQ.data?.audioStreamUrl) {
        await signageApi.setState(slug, { audioStreamUrl: null, audioStatus: "playing" });
      }
    } else {
      const playlistName = `Áudio - ${currentRoom?.name || slug}`;
      const existingQueue = audioPlaylists.find((p) => p.name === playlistName);
      if (existingQueue) {
        const targetItems = [...(existingQueue.items || []), ...newItems];
        await signageApi.updatePlaylist(existingQueue.id, {
          ...existingQueue,
          items: targetItems,
        });
        await signageApi.setState(slug, {
          audioPlaylist: existingQueue.id,
          audioStreamUrl: null,
          audioStatus: "playing",
        });
      } else {
        const res = await signageApi.createPlaylist({
          name: playlistName,
          type: "audio",
          items: newItems,
          loop: true,
          loopMode: "all",
          shuffle: false,
        });
        if (res.playlist?.id) {
          await signageApi.setState(slug, {
            audioPlaylist: res.playlist.id,
            audioStreamUrl: null,
            audioStatus: "playing",
          });
        }
      }
    }

    setMultiLinksText("");
    setShowMultiLinksModal(false);
    qc.invalidateQueries({ queryKey: ["playlists"] });
    qc.invalidateQueries({ queryKey: ["state", slug] });
  };

  const handleMoveTrack = async (index: number, direction: "up" | "down") => {
    if (!activeAudio || !activeAudio.items) return;
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= activeAudio.items.length) return;

    const newItems = [...activeAudio.items];
    const [moved] = newItems.splice(index, 1);
    newItems.splice(targetIdx, 0, moved);

    await signageApi.updatePlaylist(activeAudio.id, {
      ...activeAudio,
      items: newItems,
    });
    qc.invalidateQueries({ queryKey: ["playlists"] });
  };

  const handleRemoveTrack = async (index: number) => {
    if (!activeAudio || !activeAudio.items) return;
    const newItems = activeAudio.items.filter((_, i) => i !== index);
    await signageApi.updatePlaylist(activeAudio.id, {
      ...activeAudio,
      items: newItems,
    });
    qc.invalidateQueries({ queryKey: ["playlists"] });
  };

  const handlePlayTrack = (index: number) => {
    signageApi.setTrackIndex(slug, index);
    qc.invalidateQueries({ queryKey: ["state", slug] });
  };

  const handleClearPlaylist = async () => {
    if (!activeAudio || !confirm("Deseja esvaziar todas as faixas desta lista de reprodução?")) return;
    await signageApi.updatePlaylist(activeAudio.id, {
      ...activeAudio,
      items: [],
    });
    qc.invalidateQueries({ queryKey: ["playlists"] });
  };

  const handleChangeLoopMode = (mode: "all" | "one" | "none") => {
    signageApi.setLoopMode(slug, mode);
    signageApi.setState(slug, { audioLoopMode: mode });
    if (activeAudio) {
      signageApi.updatePlaylist(activeAudio.id, {
        ...activeAudio,
        loopMode: mode,
        loop: mode !== "none",
      });
    }
    qc.invalidateQueries({ queryKey: ["state", slug] });
  };

  const handleToggleShuffle = () => {
    const nextVal = !shuffleActive;
    signageApi.setShuffle(slug, nextVal);
    signageApi.setState(slug, { audioShuffle: nextVal });
    if (activeAudio) {
      signageApi.updatePlaylist(activeAudio.id, {
        ...activeAudio,
        shuffle: nextVal,
      });
    }
    qc.invalidateQueries({ queryKey: ["state", slug] });
  };

  const handleCreateNewAudioPlaylist = async () => {
    const name = prompt("Nome da nova playlist de áudio:", `Músicas ${audioPlaylists.length + 1}`);
    if (!name || !name.trim()) return;
    const res = await signageApi.createPlaylist({
      name: name.trim(),
      type: "audio",
      items: [],
      loop: true,
      loopMode: "all",
      shuffle: false,
    });
    if (res.playlist?.id) {
      await signageApi.setState(slug, {
        audioPlaylist: res.playlist.id,
        audioStreamUrl: null,
      });
      qc.invalidateQueries({ queryKey: ["playlists"] });
      qc.invalidateQueries({ queryKey: ["state", slug] });
    }
  };

  const handleSelectAudioPlaylist = (id: string) => {
    if (!id) {
      setState.mutate({ audioPlaylist: null });
    } else {
      setState.mutate({ audioPlaylist: id, audioStreamUrl: null, audioStatus: "playing" });
    }
  };

  // ==========================================
  // Gestão da Fila e Salvar como Playlist
  // ==========================================
  const handleOpenSaveQueue = () => {
    if (!activeAudio || !activeAudio.items || activeAudio.items.length === 0) {
      alert("A fila está vazia. Adicione músicas antes de salvar.");
      return;
    }
    const isCustom = activeAudio && !activeAudio.name.startsWith("Áudio -");
    setSaveQueueName(activeAudio.name || `Playlist ${currentRoom?.name || slug}`);
    setSaveQueueMode(isCustom ? "update" : "new");
    setSaveQueueModalOpen(true);
  };

  const handleSaveQueue = async () => {
    if (!saveQueueName.trim()) {
      alert("Digite um nome para a playlist.");
      return;
    }
    const items = activeAudio?.items || [];
    setIsSavingQueue(true);
    try {
      if (saveQueueMode === "update" && activeAudio?.id) {
        await signageApi.updatePlaylist(activeAudio.id, {
          ...activeAudio,
          name: saveQueueName.trim(),
          items,
          loopMode,
          shuffle: shuffleActive,
        });
        qc.invalidateQueries({ queryKey: ["playlists"] });
        alert(`Playlist "${saveQueueName.trim()}" atualizada com sucesso!`);
      } else {
        const res = await signageApi.createPlaylist({
          name: saveQueueName.trim(),
          type: "audio",
          items,
          loopMode,
          shuffle: shuffleActive,
        });
        if (res.success && res.playlist) {
          await signageApi.setState(slug, { audioPlaylist: res.playlist.id, audioStreamUrl: null });
          qc.invalidateQueries({ queryKey: ["playlists"] });
          qc.invalidateQueries({ queryKey: ["state", slug] });
          alert(`Playlist "${saveQueueName.trim()}" salva com sucesso!`);
        }
      }
      setSaveQueueModalOpen(false);
    } catch (err: any) {
      alert(err.message || "Erro ao salvar a playlist.");
    } finally {
      setIsSavingQueue(false);
    }
  };

  const handleDeleteCurrentPlaylist = async () => {
    if (!activeAudio?.id) return;
    if (confirm(`Deseja realmente excluir a playlist salva "${activeAudio.name}"?`)) {
      await signageApi.deletePlaylist(activeAudio.id);
      qc.invalidateQueries({ queryKey: ["playlists"] });
      qc.invalidateQueries({ queryKey: ["state", slug] });
    }
  };

  // Contagem e limites de dispositivos
  const devicesCount = devicesQ.data?.count ?? currentRoom?.clientsCount ?? 0;
  const maxDevices = devicesQ.data?.max ?? currentRoom?.maxClients ?? 2;
  const isRoomFull = devicesCount >= maxDevices;
  const isRoomOnline = Boolean(currentRoom?.online || devicesCount > 0);

  return (
    <div className="flex h-full flex-col text-neutral-100 font-sans antialiased overflow-y-auto overflow-x-hidden w-full max-w-full bg-neutral-950 overscroll-contain">
      {/* ============================================================ */}
      {/* CABEÇALHO PRINCIPAL LIMPO E INTUITIVO                         */}
      {/* ============================================================ */}
      {/* ============================================================ */}
      {/* CABEÇALHO PRINCIPAL LIMPO E INTUITIVO                         */}
      {/* ============================================================ */}
      <header className="border-b border-neutral-800 bg-neutral-950 px-3 py-2.5 sm:px-5 sm:py-3 space-y-2.5 w-full flex-shrink-0">
        {/* Linha 1: Título da Sala + Status + Ações Principais */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                Sala
              </span>
              {/* Badge de Status Simples e Direto */}
              {isRoomOnline ? (
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] text-[11px] font-semibold border truncate ${
                    isRoomFull
                      ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                      : "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full flex-shrink-0 ${
                      isRoomFull ? "bg-amber-400" : "bg-emerald-400"
                    }`}
                  />
                  <span className="truncate">
                    {devicesCount === 1 ? "1 TV conectada" : `${devicesCount} TVs conectadas`}
                    {isRoomFull ? " (Cheia)" : ""}
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] text-[11px] font-medium bg-neutral-900 text-neutral-400 border border-neutral-800">
                  <span className="h-2 w-2 rounded-full bg-neutral-600 flex-shrink-0" />
                  <span>Nenhuma TV</span>
                </span>
              )}
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate mt-0.5">
              {currentRoom?.name || slug}
            </h1>
          </div>

          {/* Botões de Controle Rápido da TV: 3 colunas iguais no mobile */}
          <div className="grid grid-cols-3 gap-1.5 w-full sm:w-auto sm:flex sm:items-center sm:gap-2">
            {/* Standby / Suspender TV */}
            <button
              onClick={() => {
                const nextStandby = !stateQ.data?.standby;
                setState.mutate({ standby: nextStandby });
              }}
              className={`min-h-[34px] px-2.5 py-1 rounded-[2px] text-xs font-bold transition flex items-center justify-center gap-1.5 text-center truncate ${
                stateQ.data?.standby
                  ? "bg-amber-500 text-neutral-950 hover:bg-amber-400 font-extrabold"
                  : "bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-amber-300 hover:border-amber-500/50"
              }`}
              title="Exibe relógio e clima na tela da TV (permite manter ou pausar a música)"
            >
              {stateQ.data?.standby ? <Sun className="h-3.5 w-3.5 flex-shrink-0" /> : <Moon className="h-3.5 w-3.5 flex-shrink-0" />}
              <span className="truncate">{stateQ.data?.standby ? "Standby" : "Suspender"}</span>
            </button>

            {/* Recarregar TV */}
            <button
              onClick={() => {
                if (confirm("Deseja recarregar a tela da TV conectada?")) {
                  signageApi.reloadRoom(slug);
                }
              }}
              className="min-h-[34px] px-2.5 py-1 rounded-[2px] bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700 text-xs font-medium transition flex items-center justify-center gap-1.5 text-center truncate"
              title="Recarrega a TV conectada"
            >
              <RefreshCw className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">Recarregar</span>
            </button>

            {/* Abrir Player em nova aba */}
            <a
              href={playerUrl}
              target="_blank"
              rel="noreferrer"
              className="min-h-[34px] px-2.5 py-1 rounded-[2px] bg-neutral-900 border border-neutral-800 text-neutral-200 hover:text-white hover:border-neutral-700 text-xs font-medium transition flex items-center justify-center gap-1.5 text-center truncate"
              title="Abre o visualizador da TV nesta aba"
            >
              <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">Ver TV</span>
            </a>
          </div>
        </div>

        {/* Linha 2: Abas Principais da Sala: Conteúdo / Áudio / Automação / Aparelhos */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-neutral-800/60 overflow-x-auto">
          <div className="grid grid-cols-4 bg-neutral-950 p-0.5 rounded-[2px] border border-neutral-800 gap-1 w-full sm:w-auto">
            <button
              onClick={() => handleSelectTab("content")}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-[2px] text-xs font-bold transition truncate ${
                activeTab === "content"
                  ? "bg-white text-black shadow-xs font-extrabold"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <Globe className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">Conteúdo</span>
            </button>
            <button
              onClick={() => handleSelectTab("audio")}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-[2px] text-xs font-bold transition truncate ${
                activeTab === "audio"
                  ? "bg-white text-black shadow-xs font-extrabold"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <Music className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">Áudio</span>
            </button>
            <button
              onClick={() => handleSelectTab("automation")}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-[2px] text-xs font-bold transition truncate ${
                activeTab === "automation"
                  ? "bg-white text-black shadow-xs font-extrabold"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <CalendarClock className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">Automação</span>
            </button>
            <button
              onClick={() => handleSelectTab("devices")}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-[2px] text-xs font-bold transition truncate ${
                activeTab === "devices"
                  ? "bg-white text-black shadow-xs font-extrabold"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <Monitor className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">Aparelhos</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <button
              onClick={handleDeleteRoom}
              disabled={deleteRoomMut.isPending}
              className="min-h-[28px] px-2 py-0.5 rounded-[2px] border border-neutral-800 bg-neutral-900 text-neutral-400 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 text-[11px] font-medium transition flex items-center gap-1"
              title="Excluir esta sala"
            >
              <Trash2 className="h-3 w-3" />
              <span>Excluir Sala</span>
            </button>
          </div>
        </div>
      </header>

      {/* Banner de Standby Ativo com controle rápido de som */}
      {stateQ.data?.standby && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-3.5 py-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-amber-200 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Moon className="h-4 w-4 text-amber-400 flex-shrink-0" />
            <div className="text-xs leading-snug">
              <strong>Modo Suspenso (Standby) Ativo:</strong> A TV exibe relógio, data e clima de Uberaba-MG •{" "}
              <span className={isAudioPlaying ? "text-emerald-300 font-bold" : "text-amber-200/80"}>
                {isAudioPlaying
                  ? `Música tocando (${currentPlayingTrack || "Ativa"} - Vol: ${currentAudioVolume}%)`
                  : "Música pausada"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto flex-shrink-0">
            <button
              onClick={() => handleOptimisticCommand("audio", isAudioPlaying ? "pause" : "play")}
              className={`flex-1 sm:flex-initial min-h-[32px] px-3 py-1 rounded-[2px] font-bold text-xs transition flex items-center justify-center gap-1.5 border ${
                isAudioPlaying
                  ? "bg-neutral-900 border-amber-500/40 text-amber-300 hover:bg-neutral-800"
                  : "bg-emerald-500 text-neutral-950 border-emerald-400 hover:bg-emerald-400"
              }`}
            >
              {isAudioPlaying ? (
                <>
                  <Pause className="h-3.5 w-3.5" />
                  <span>Pausar Música</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  <span>Tocar Música no Standby</span>
                </>
              )}
            </button>
            <button
              onClick={() => setState.mutate({ standby: false })}
              className="flex-1 sm:flex-initial min-h-[32px] px-3 py-1 rounded-[2px] bg-amber-500 text-neutral-950 font-bold text-xs hover:bg-amber-400 transition flex items-center justify-center gap-1.5"
            >
              <Sun className="h-3.5 w-3.5" />
              <span>Retomar Tela da TV</span>
            </button>
          </div>
        </div>
      )}

      <main className="p-2.5 pb-24 sm:p-4 sm:pb-16 max-w-4xl mx-auto w-full min-w-0 space-y-3 sm:space-y-4">
        {/* ============================================================ */}
        {/* ABA 1: CONTEÚDO NA TELA DA TV (SITE / LINK)                   */}
        {/* ============================================================ */}
        {activeTab === "content" && (
          <section
            className={`rounded-[2px] border p-3 sm:p-4 transition-all ${
              isSiteActive
                ? "border-emerald-500/40 bg-neutral-900/50 shadow-sm"
                : "border-neutral-800 bg-neutral-900/30"
            } space-y-3 overflow-hidden w-full`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-neutral-800">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`p-1.5 rounded-[2px] flex-shrink-0 ${
                    isSiteActive ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-neutral-900 text-neutral-400 border border-neutral-800"
                  }`}
                >
                  <Globe className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 flex-wrap">
                    <span>Conteúdo na TV</span>
                    {isSiteActive ? (
                      <span className="text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.2 rounded-[2px] font-bold">
                        No Ar
                      </span>
                    ) : (
                      <span className="text-[10px] bg-neutral-900 text-neutral-400 border border-neutral-800 px-2 py-0.2 rounded-[2px]">
                        Inativo
                      </span>
                    )}
                  </h2>
                  <p className="text-[11px] text-neutral-400 truncate">
                    Exiba cardápio, memorial ou página na TV.
                  </p>
                </div>
              </div>

              {/* Ações quando o site já está ativo */}
              {isSiteActive && (
                <div className="grid grid-cols-3 gap-1.5 w-full sm:w-auto sm:flex sm:items-center">
                  <button
                    onClick={() => signageApi.reloadSite(slug)}
                    className="min-h-[32px] px-2.5 py-1 rounded-[2px] border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-xs text-neutral-200 transition flex items-center justify-center gap-1 truncate text-center"
                    title="Recarrega apenas o site na tela"
                  >
                    <RefreshCw className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">Recarregar</span>
                  </button>
                  <a
                    href={stateQ.data?.siteUrl || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="min-h-[32px] px-2.5 py-1 rounded-[2px] border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-xs text-neutral-200 transition flex items-center justify-center gap-1 truncate text-center"
                  >
                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">Abrir</span>
                  </a>
                  <button
                    onClick={handleClearSite}
                    disabled={setState.isPending}
                    className="min-h-[32px] px-2.5 py-1 rounded-[2px] border border-neutral-800 bg-neutral-900 hover:bg-red-500/10 hover:border-red-500/30 text-xs text-red-400 transition flex items-center justify-center gap-1 truncate text-center"
                  >
                    <X className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">Remover</span>
                  </button>
                </div>
              )}
            </div>

            {/* Se o site está ativo, mostra o link atual de forma limpa */}
            {isSiteActive && (
              <div className="bg-neutral-950 border border-neutral-800 rounded-[2px] p-2 text-xs text-neutral-200 flex items-center justify-between gap-2 overflow-hidden w-full">
                <div className="truncate flex items-center gap-2 min-w-0 flex-1">
                  <span className="font-semibold text-neutral-400 flex-shrink-0 text-[11px]">Link Atual:</span>
                  <span className="truncate text-white min-w-0 flex-1 font-mono text-[11px]">{stateQ.data?.siteUrl}</span>
                </div>
              </div>
            )}

            {/* Campo para Colocar Novo Link */}
            <div className="space-y-1.5 w-full">
              <label className="text-xs font-semibold text-neutral-300 block">
                {isSiteActive ? "Trocar por outro link:" : "Cole o link para exibir na TV:"}
              </label>
              <div className="flex flex-col sm:flex-row items-stretch gap-1.5 w-full">
                <input
                  type="url"
                  placeholder="https://exemplo.com.br/homenagem"
                  value={siteInputUrl}
                  onChange={(e) => setSiteInputUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleApplySite()}
                  className="w-full flex-1 min-w-0 rounded-[2px] border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-white placeholder-neutral-500 outline-none focus:border-neutral-500 transition"
                />
                <button
                  onClick={handleApplySite}
                  disabled={!siteInputUrl.trim() || setState.isPending}
                  className="w-full sm:w-auto min-h-[36px] px-4 py-2 rounded-[2px] bg-white text-black font-bold text-xs uppercase tracking-wider hover:bg-neutral-200 disabled:opacity-40 transition flex items-center justify-center gap-1.5 shadow flex-shrink-0"
                >
                  <Tv className="h-3.5 w-3.5" />
                  <span>Exibir na TV</span>
                </button>
              </div>
              <p className="text-[10px] text-neutral-500 flex items-center gap-1">
                <Info className="h-3 w-3 text-neutral-500 flex-shrink-0" />
                <span>O site abrirá imediatamente em tela cheia na TV conectada.</span>
              </p>
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/* ABA 2: MÚSICA AMBIENTE & SOM DE FUNDO                        */}
        {/* ============================================================ */}
        {activeTab === "audio" && (
          <section className="rounded-[2px] border border-neutral-800 bg-neutral-900/40 p-3 sm:p-4 space-y-3">
            <div className="flex flex-col gap-2 pb-2.5 border-b border-neutral-800">
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-1.5 rounded-[2px] bg-neutral-900 text-neutral-200 border border-neutral-800 flex-shrink-0">
                    <Music className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 truncate">
                      <span>Música Ambiente</span>
                      {isAudioPlaying ? (
                        <span className="text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.2 rounded-[2px] font-bold flex-shrink-0">
                          Tocando
                        </span>
                      ) : (
                        <span className="text-[10px] bg-neutral-900 text-neutral-400 border border-neutral-800 px-2 py-0.2 rounded-[2px] flex items-center gap-1 flex-shrink-0">
                          <Pause className="h-2.5 w-2.5" />
                          <span>Pausado</span>
                        </span>
                      )}
                    </h2>
                    <p className="text-[11px] text-neutral-400 truncate">
                      Tocando agora: <span className="text-white font-medium">{currentPlayingTrack || "Nenhuma faixa em reprodução"}</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* CONTROLE PRINCIPAL DE ÁUDIO: STATUS, BOTÕES E VOLUME (EM PRIMEIRO LUGAR) */}
            <div className="bg-neutral-950 rounded-[2px] border border-neutral-800 p-3 space-y-3 w-full overflow-hidden">
              {/* Botões de Playback e Volume */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 w-full">
                {/* Botões Prev / Play-Pause / Next */}
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-1.5 w-full sm:w-auto">
                  <button
                    onClick={() => handleOptimisticCommand("audio", "prev")}
                    disabled={isAudioStreamActive || !activeAudio || activeAudio.items.length === 0}
                    className="min-h-[40px] w-10 rounded-[2px] bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 flex items-center justify-center transition disabled:opacity-30"
                    title="Música Anterior"
                  >
                    <SkipBack className="h-4 w-4" />
                  </button>

                  {isAudioPlaying ? (
                    <button
                      onClick={() => handleOptimisticCommand("audio", "pause")}
                      className="min-h-[40px] px-4 rounded-[2px] bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 flex items-center justify-center gap-1.5 font-bold text-xs uppercase tracking-wider transition"
                    >
                      <Pause className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">Pausar</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleOptimisticCommand("audio", "play")}
                      className="min-h-[40px] px-4 rounded-[2px] bg-white text-black hover:bg-neutral-200 flex items-center justify-center gap-1.5 font-bold text-xs uppercase tracking-wider shadow-sm transition"
                    >
                      <Play className="h-4 w-4 flex-shrink-0 ml-0.5" />
                      <span className="truncate">Tocar</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleOptimisticCommand("audio", "next")}
                    disabled={isAudioStreamActive || !activeAudio || activeAudio.items.length === 0}
                    className="min-h-[40px] w-10 rounded-[2px] bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 flex items-center justify-center transition disabled:opacity-30"
                    title="Próxima Música"
                  >
                    <SkipForward className="h-4 w-4" />
                  </button>
                </div>

                {/* Roleta de Volume (UIDatePicker Wheel Picker) e Presets de 12,5 em 12,5% */}
                <div className="w-full sm:w-auto space-y-2 bg-neutral-900/60 p-2.5 rounded-[2px] border border-neutral-800 overflow-hidden">
                  <VolumeWheelPicker
                    compact
                    disabled={!stateQ.data}
                    value={currentAudioVolume}
                    onChange={(val) => handleOptimisticCommand("audio", "setVolume", val)}
                  />

                  {/* 9 Botões Rápidos de Volume (0% a 100% de 12,5 em 12,5%) */}
                  <div className="space-y-1 pt-1.5 border-t border-neutral-800">
                    <span className="text-[9px] uppercase font-bold text-neutral-400 tracking-wider block">
                      Ajuste Rápido (passo de 12,5%):
                    </span>
                    <div className="grid grid-cols-3 sm:grid-cols-9 gap-1 w-full">
                      {VOLUME_PRESETS.map((preset) => {
                        const isSelected = Boolean(stateQ.data) && Math.abs(currentAudioVolume - preset.val) < 0.5;
                        return (
                          <button
                            key={preset.val}
                            disabled={!stateQ.data}
                            onClick={() => handleOptimisticCommand("audio", "setVolume", preset.val)}
                            className={`min-h-[28px] px-1 py-0.5 rounded-[2px] text-[10px] font-semibold transition text-center truncate flex items-center justify-center disabled:opacity-40 ${
                              isSelected
                                ? "bg-white text-black font-bold border border-white shadow-xs"
                                : "bg-neutral-900 text-neutral-300 hover:text-white hover:bg-neutral-800 border border-neutral-800"
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Real de Áudio por Aparelho Conectado na Sala */}
              {devicesQ.data?.devices && devicesQ.data.devices.length > 0 && (
                <div className="pt-2 border-t border-neutral-800/80 space-y-1.5">
                  <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider block">
                    Status de Som nas Telas Conectadas ({devicesQ.data.devices.length}):
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {devicesQ.data.devices.map((dev) => {
                      const st = dev.audioState?.state || "idle";
                      const detail = dev.audioState?.detail;
                      const badge =
                        st === "playing"
                          ? { label: "Tocando som", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" }
                          : st === "blocked"
                          ? { label: "Som bloqueado na TV (aperte OK no controle)", cls: "bg-amber-500/20 text-amber-300 border-amber-500/40" }
                          : st === "loading"
                          ? { label: detail || "Carregando áudio...", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" }
                          : st === "error"
                          ? { label: detail || "Reconectando áudio...", cls: "bg-red-500/20 text-red-300 border-red-500/40" }
                          : st === "disabled"
                          ? { label: "Modo sem áudio nesta tela", cls: "bg-neutral-900 text-neutral-500 border-neutral-800" }
                          : st === "paused"
                          ? { label: "Pausado", cls: "bg-neutral-900 text-neutral-400 border-neutral-800" }
                          : { label: "Aguardando", cls: "bg-neutral-900 text-neutral-400 border-neutral-800" };
                      return (
                        <div
                          key={dev.id}
                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[2px] bg-neutral-900/70 border border-neutral-800 text-[11px]"
                        >
                          <span className="text-neutral-200 font-medium truncate">{dev.deviceLabel}</span>
                          <span className={`px-1.5 py-0.5 rounded-[2px] border text-[10px] font-bold flex-shrink-0 ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Seletor de 4 Abas: Buscar, Importar, Fila, Rádio (MOVIDO PARA DEPOIS DO CONTROLE) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 bg-neutral-950 border border-neutral-800 p-0.5 rounded-[2px] gap-1 w-full">
              <button
                onClick={() => setBasicAudioTab("youtube")}
                className={`py-1.5 px-2 rounded-[2px] text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                  basicAudioTab === "youtube"
                    ? "bg-neutral-800 text-white border border-neutral-700 shadow-sm font-bold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                <Search className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">Buscar YouTube</span>
              </button>
              <button
                onClick={() => setBasicAudioTab("playlist_import")}
                className={`py-1.5 px-2 rounded-[2px] text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                  basicAudioTab === "playlist_import"
                    ? "bg-neutral-800 text-white border border-neutral-700 shadow-sm font-bold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                <Disc className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">Importar Playlist</span>
              </button>
              <button
                onClick={() => setBasicAudioTab("playlist")}
                className={`py-1.5 px-2 rounded-[2px] text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                  basicAudioTab === "playlist"
                    ? "bg-neutral-800 text-white border border-neutral-700 shadow-sm font-bold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                <ListMusic className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">Fila ({activeAudio?.items?.length || 0})</span>
              </button>
              <button
                onClick={() => setBasicAudioTab("stream")}
                className={`py-1.5 px-2 rounded-[2px] text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                  basicAudioTab === "stream"
                    ? "bg-neutral-800 text-white border border-neutral-700 shadow-sm font-bold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                <RadioIcon className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">Web Rádio</span>
              </button>
            </div>

            {/* ============================================================ */}
            {/* SUB-ABA 1: PESQUISAR NO YOUTUBE                              */}
            {/* ============================================================ */}
            {basicAudioTab === "youtube" && (
              <div className="space-y-2.5 w-full">
                <div className="bg-neutral-950/70 p-3 sm:p-3.5 rounded-[2px] border border-neutral-800 space-y-2.5">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Search className="h-3.5 w-3.5 text-neutral-400 flex-shrink-0" />
                      <span>Buscar Músicas e Artistas no YouTube</span>
                    </span>
                  </div>

                  {/* Barra de Busca */}
                  <div className="flex flex-col sm:flex-row items-stretch gap-1.5 w-full">
                    <div className="relative flex-1">
                      <input
                        placeholder="Ex: Padre Marcelo Rossi, Harpa Cristã, Pe. Fábio de Melo..."
                        value={ytQuery}
                        onChange={(e) => setYtQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSearchYt()}
                        className="w-full rounded-[2px] border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-white placeholder-neutral-500 outline-none focus:border-neutral-500"
                      />
                    </div>
                    <button
                      onClick={() => handleSearchYt()}
                      disabled={!ytQuery.trim() || isSearchingYt}
                      className="w-full sm:w-auto min-h-[36px] px-4 py-2 rounded-[2px] bg-white text-black font-bold text-xs uppercase tracking-wider hover:bg-neutral-200 disabled:opacity-40 transition flex items-center justify-center gap-1.5 shadow-sm flex-shrink-0"
                    >
                      {isSearchingYt ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Buscando...</span>
                        </>
                      ) : (
                        <>
                          <Search className="h-3.5 w-3.5" />
                          <span>Buscar</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Mensagem de Erro na Busca */}
                {ytSearchError && (
                  <div className="p-2.5 rounded-[2px] bg-neutral-900 border border-red-500/40 text-xs text-red-300 flex items-center gap-2">
                    <Info className="h-3.5 w-3.5 flex-shrink-0 text-red-400" />
                    <span>{ytSearchError}</span>
                  </div>
                )}

                {/* Lista de Resultados da Busca */}
                {ytResults.length > 0 && (
                  <div className="space-y-1.5 w-full">
                    <div className="flex items-center justify-between text-xs text-neutral-400 px-1">
                      <span className="font-semibold text-neutral-300 text-[11px]">
                        Resultados Encontrados ({ytResults.length})
                      </span>
                      <span className="text-[10px] text-neutral-500 hidden sm:inline">
                        Adicione à fila ou toque imediatamente na sala
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-0.5">
                      {ytResults.map((item) => {
                        const isJustAdded = addedSuccessId === item.id;

                        return (
                          <div
                            key={item.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 sm:p-2.5 rounded-[2px] border border-neutral-800 bg-neutral-950/60 hover:border-neutral-700 transition"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              {/* Thumbnail com tempo */}
                              {item.thumbnailUrl && (
                                <div className="relative w-14 h-10 sm:w-16 sm:h-11 rounded-[2px] overflow-hidden bg-neutral-900 flex-shrink-0">
                                  <img
                                    src={item.thumbnailUrl}
                                    alt={item.title}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                  />
                                  <span className="absolute bottom-0.5 right-0.5 bg-black/80 text-[9px] text-white px-1 rounded-[1px] font-mono">
                                    {item.durationFormatted}
                                  </span>
                                </div>
                              )}

                              <div className="min-w-0 flex-1">
                                <h4 className="text-xs sm:text-sm font-medium text-white line-clamp-2 leading-tight">
                                  {item.title}
                                </h4>
                                {item.author && (
                                  <p className="text-[10px] text-neutral-400 mt-0.5 truncate">
                                    {item.author}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Botões de Ação */}
                            <div className="flex items-center gap-1.5 self-end sm:self-center flex-shrink-0">
                              <button
                                onClick={() => handleAddYtTrack(item, false)}
                                className={`min-h-[32px] px-2.5 rounded-[2px] text-xs font-semibold transition flex items-center gap-1 ${
                                  isJustAdded
                                    ? "bg-neutral-800 text-emerald-400 border border-emerald-500/40 font-bold"
                                    : "bg-neutral-900 border border-neutral-800 text-neutral-300 hover:bg-neutral-800 hover:text-white"
                                }`}
                              >
                                {isJustAdded ? (
                                  <>
                                    <CheckCircle2 className="h-3 w-3" />
                                    <span>Adicionado!</span>
                                  </>
                                ) : (
                                  <>
                                    <Plus className="h-3 w-3" />
                                    <span>+ Fila</span>
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => handleAddYtTrack(item, true)}
                                className="min-h-[32px] px-3 rounded-[2px] bg-white text-black hover:bg-neutral-200 text-xs font-bold transition flex items-center gap-1 shadow-sm"
                                title="Adiciona e inicia a reprodução agora na TV"
                              >
                                <Play className="h-3 w-3 ml-0.5" />
                                <span>Tocar Agora</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ============================================================ */}
            {/* SUB-ABA 2: IMPORTAR PLAYLIST / ÁLBUM DO YOUTUBE               */}
            {/* ============================================================ */}
            {basicAudioTab === "playlist_import" && (
              <div className="space-y-3 w-full">
                <div className="bg-neutral-950/70 p-3 sm:p-3.5 rounded-[2px] border border-neutral-800 space-y-2.5">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Disc className="h-3.5 w-3.5 text-neutral-400 flex-shrink-0" />
                      <span>Importar Playlist ou Álbum Inteiro do YouTube</span>
                    </span>
                    <p className="text-[11px] text-neutral-400">
                      Cole o link de uma playlist pública (ex: Harpa Cristã, álbuns completos ou seleções). Todas as faixas são importadas em segundos.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch gap-1.5 w-full">
                    <input
                      placeholder="https://www.youtube.com/playlist?list=PLzWjmBOf3rY3hAXmvMI1..."
                      value={playlistInputUrl}
                      onChange={(e) => setPlaylistInputUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleFetchPlaylistInfo()}
                      className="w-full flex-1 rounded-[2px] border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-white placeholder-neutral-500 outline-none focus:border-neutral-500 font-mono"
                    />
                    <button
                      onClick={handleFetchPlaylistInfo}
                      disabled={!playlistInputUrl.trim() || isLoadingPlaylist}
                      className="w-full sm:w-auto min-h-[36px] px-4 py-2 rounded-[2px] bg-white text-black font-bold text-xs uppercase tracking-wider hover:bg-neutral-200 disabled:opacity-40 transition flex items-center justify-center gap-1.5 shadow-sm flex-shrink-0"
                    >
                      {isLoadingPlaylist ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Carregando...</span>
                        </>
                      ) : (
                        <>
                          <Disc className="h-3.5 w-3.5" />
                          <span>Carregar Playlist</span>
                        </>
                      )}
                    </button>
                  </div>

                  <p className="text-[10px] text-neutral-500 flex items-center gap-1">
                    <Info className="h-3 w-3 flex-shrink-0 text-neutral-500" />
                    <span>Também funciona colando o link de um vídeo que faz parte de uma playlist (com &quot;&amp;list=...&quot;).</span>
                  </p>
                </div>

                {/* Feedback de Erro */}
                {playlistError && (
                  <div className="p-2.5 rounded-[2px] bg-neutral-900 border border-red-500/40 text-xs text-red-300 flex items-center gap-2">
                    <Info className="h-3.5 w-3.5 flex-shrink-0 text-red-400" />
                    <span>{playlistError}</span>
                  </div>
                )}

                {/* Feedback de Sucesso */}
                {importSuccessMsg && (
                  <div className="p-2.5 rounded-[2px] bg-neutral-900 border border-emerald-500/40 text-xs text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                    <span className="font-semibold">{importSuccessMsg}</span>
                  </div>
                )}

                {/* Card de Pré-visualização da Playlist Encontrada */}
                {loadedPlaylistPreview && (
                  <div className="p-3 rounded-[2px] border border-neutral-700 bg-neutral-900/50 space-y-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-neutral-800 pb-2">
                      <div>
                        <span className="text-[9px] uppercase font-bold text-neutral-400 tracking-wider">
                          Playlist Reconhecida
                        </span>
                        <h3 className="text-xs sm:text-sm font-bold text-white mt-0.5">
                          {loadedPlaylistPreview.title}
                        </h3>
                        <p className="text-[11px] text-neutral-400 mt-0.5">
                          {loadedPlaylistPreview.videoCount} músicas encontradas no YouTube
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold text-neutral-300 block">
                        Como deseja importar para esta sala?
                      </span>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        <button
                          onClick={() => handleImportPlaylistTracks("replace")}
                          disabled={isLoadingPlaylist}
                          className="min-h-[36px] px-3 py-2 rounded-[2px] bg-white text-black font-bold text-xs hover:bg-neutral-200 transition flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <Disc className="h-3.5 w-3.5" />
                          <span>Importar Todas ({loadedPlaylistPreview.videoCount} faixas)</span>
                        </button>

                        {activeAudio && (
                          <button
                            onClick={() => handleImportPlaylistTracks("append")}
                            disabled={isLoadingPlaylist}
                            className="min-h-[36px] px-3 py-2 rounded-[2px] bg-neutral-900 border border-neutral-700 text-neutral-200 font-semibold text-xs hover:text-white hover:bg-neutral-800 transition flex items-center justify-center gap-1.5"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>Acrescentar à Fila Atual</span>
                          </button>
                        )}
                      </div>

                      {loadedPlaylistPreview.videoCount > 50 && (
                        <button
                          onClick={() => handleImportPlaylistTracks("replace", 50)}
                          disabled={isLoadingPlaylist}
                          className="w-full text-center text-[10px] text-neutral-400 hover:text-white pt-1"
                        >
                          Importar apenas as primeiras 50 faixas mais tocadas
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ============================================================ */}
            {/* SUB-ABA 3: FILA DE MÚSICAS DA SALA                           */}
            {/* ============================================================ */}
            {basicAudioTab === "playlist" && (
              <div className="space-y-3 w-full">
                {/* Seleção de Playlist & Modos de Repetição */}
                <div className="bg-neutral-950/70 p-3 rounded-[2px] border border-neutral-800 space-y-2.5 w-full overflow-hidden">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 w-full">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className="text-xs font-semibold text-neutral-400 flex-shrink-0">
                        Lista:
                      </span>
                      <select
                        value={activeAudio?.id || ""}
                        onChange={(e) => handleSelectAudioPlaylist(e.target.value)}
                        className="flex-1 min-w-0 rounded-[2px] border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-xs text-white outline-none focus:border-neutral-500 truncate"
                      >
                        <option value="">-- Nenhuma Selecionada --</option>
                        {audioPlaylists.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.items?.length || 0} faixas)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 w-full sm:w-auto">
                      <button
                        onClick={handleCreateNewAudioPlaylist}
                        className="min-h-[32px] px-2.5 py-1 rounded-[2px] bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 text-xs font-semibold transition flex items-center justify-center gap-1 truncate text-center"
                      >
                        <Plus className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">Nova Lista</span>
                      </button>
                      <button
                        onClick={() => setIsManagingPlaylistsOpen(true)}
                        className="min-h-[32px] px-2.5 py-1 rounded-[2px] bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 text-xs font-semibold transition flex items-center justify-center gap-1 truncate text-center"
                        title="Ver todas as listas salvas, selecionar ou excluir"
                      >
                        <ListMusic className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">Gerenciar ({audioPlaylists.length})</span>
                      </button>
                      {activeAudio && activeAudio.items && activeAudio.items.length > 0 && (
                        <button
                          onClick={handleOpenSaveQueue}
                          className="min-h-[32px] px-3 py-1 rounded-[2px] bg-white text-black hover:bg-neutral-200 text-xs font-bold transition flex items-center justify-center gap-1 truncate text-center shadow-xs"
                          title="Salvar esta fila como uma playlist reutilizável"
                        >
                          <Save className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">Salvar Fila</span>
                        </button>
                      )}
                      {activeAudio && activeAudio.items && activeAudio.items.length > 0 && (
                        <button
                          onClick={handleClearPlaylist}
                          className="min-h-[32px] px-2.5 py-1 rounded-[2px] border border-neutral-800 text-neutral-400 hover:text-red-400 hover:bg-red-500/10 text-xs transition text-center truncate"
                          title="Esvazia todas as músicas desta lista"
                        >
                          Limpar Fila
                        </button>
                      )}
                      {activeAudio && (
                        <button
                          onClick={handleDeleteCurrentPlaylist}
                          className="min-h-[32px] px-2.5 py-1 rounded-[2px] border border-neutral-800 text-neutral-400 hover:text-red-400 hover:bg-red-500/10 text-xs transition flex items-center justify-center gap-1"
                          title="Excluir playlist salva permanentemente"
                        >
                          <Trash2 className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="hidden sm:inline">Excluir</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Modos de Repetição e Ordem Aleatória */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-1.5 pt-1.5 border-t border-neutral-800/80 w-full">
                    <div className="grid grid-cols-3 bg-neutral-900 rounded-[2px] p-0.5 border border-neutral-800 w-full sm:w-auto">
                      <button
                        onClick={() => handleChangeLoopMode("all")}
                        className={`min-h-[28px] px-2 py-0.5 rounded-[2px] text-xs transition flex items-center justify-center gap-1 ${
                          loopMode === "all"
                            ? "bg-white text-black font-bold shadow-xs"
                            : "text-neutral-400 hover:text-white"
                        }`}
                        title="Repetir todas em loop contínuo"
                      >
                        <Repeat className="h-3 w-3 flex-shrink-0" />
                        <span>Todas</span>
                      </button>
                      <button
                        onClick={() => handleChangeLoopMode("one")}
                        className={`min-h-[28px] px-2 py-0.5 rounded-[2px] text-xs transition flex items-center justify-center gap-1 ${
                          loopMode === "one"
                            ? "bg-white text-black font-bold shadow-xs"
                            : "text-neutral-400 hover:text-white"
                        }`}
                        title="Repetir apenas esta faixa em loop"
                      >
                        <Repeat1 className="h-3 w-3 flex-shrink-0" />
                        <span>Uma</span>
                      </button>
                      <button
                        onClick={() => handleChangeLoopMode("none")}
                        className={`min-h-[28px] px-2 py-0.5 rounded-[2px] text-xs transition flex items-center justify-center ${
                          loopMode === "none"
                            ? "bg-white text-black font-bold shadow-xs"
                            : "text-neutral-400 hover:text-white"
                        }`}
                        title="Tocar a lista 1 vez e parar"
                      >
                        <span>1x</span>
                      </button>
                    </div>

                    <button
                      onClick={handleToggleShuffle}
                      className={`min-h-[28px] px-2.5 py-0.5 rounded-[2px] border text-xs transition flex items-center justify-center gap-1.5 w-full sm:w-auto ${
                        shuffleActive
                          ? "bg-white text-black font-bold border-white"
                          : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"
                      }`}
                      title="Ordem Aleatória (Shuffle)"
                    >
                      <Shuffle className="h-3 w-3 flex-shrink-0" />
                      <span>Ordem Aleatória</span>
                    </button>
                  </div>
                </div>

                {/* Bloco de Adicionar Músicas por Link Único */}
                <div className="rounded-[2px] border border-neutral-800 bg-neutral-950/60 p-3 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 w-full">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Plus className="h-3.5 w-3.5 text-neutral-400 flex-shrink-0" />
                      <span>Adicionar Link à Fila (YouTube / MP3)</span>
                    </span>
                    <button
                      onClick={() => setShowMultiLinksModal(true)}
                      className="text-xs text-neutral-300 hover:text-white hover:underline flex items-center gap-1 font-semibold self-start sm:self-auto"
                    >
                      <Layers className="h-3 w-3 flex-shrink-0" />
                      <span>Colar Vários Links de Uma Vez</span>
                    </button>
                  </div>

                  <div className="flex flex-col sm:grid sm:grid-cols-[1fr_180px_auto] gap-1.5 w-full">
                    <input
                      placeholder="Cole link do YouTube ou áudio MP3..."
                      value={newTrackUrl}
                      onChange={(e) => setNewTrackUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddTrack(newTrackUrl, newTrackTitle)}
                      className="w-full min-w-0 rounded-[2px] border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-white placeholder-neutral-500 outline-none focus:border-neutral-500"
                    />
                    <input
                      placeholder="Nome da música (opcional)"
                      value={newTrackTitle}
                      onChange={(e) => setNewTrackTitle(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddTrack(newTrackUrl, newTrackTitle)}
                      className="w-full min-w-0 rounded-[2px] border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-white placeholder-neutral-500 outline-none focus:border-neutral-500"
                    />
                    <button
                      onClick={() => handleAddTrack(newTrackUrl, newTrackTitle)}
                      disabled={!newTrackUrl.trim()}
                      className="w-full sm:w-auto min-h-[36px] px-4 py-2 rounded-[2px] bg-white text-black font-bold text-xs uppercase tracking-wider hover:bg-neutral-200 disabled:opacity-40 transition flex items-center justify-center gap-1 shadow-sm flex-shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Adicionar</span>
                    </button>
                  </div>
                </div>

                {/* Lista de Faixas na Playlist */}
                <div className="space-y-1.5 w-full overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-neutral-400 px-1">
                    <span className="font-semibold text-neutral-300 text-[11px]">
                      Faixas na Playlist ({activeAudio?.items?.length || 0})
                    </span>
                    <span className="text-[10px] text-neutral-500 hidden sm:inline">
                      Toque em qualquer faixa para tocar na TV
                    </span>
                  </div>

                  {/* Input de busca nas músicas da playlist */}
                  {activeAudio && activeAudio.items && activeAudio.items.length > 0 && (
                    <div className="relative w-full">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-500 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Buscar música nesta playlist..."
                        value={queueSearchQuery}
                        onChange={(e) => setQueueSearchQuery(e.target.value)}
                        className="w-full rounded-[2px] border border-neutral-800 bg-neutral-900/90 pl-8 pr-7 py-1.5 text-xs text-white placeholder-neutral-500 outline-none focus:border-neutral-600"
                      />
                      {queueSearchQuery && (
                        <button
                          onClick={() => setQueueSearchQuery("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-neutral-400 hover:text-white"
                          title="Limpar busca"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}

                  {activeAudio && activeAudio.items && activeAudio.items.length > 0 ? (
                    <div className="space-y-1 max-h-96 overflow-y-auto pr-0.5 w-full">
                      {activeAudio.items
                        .map((item, originalIndex) => ({ item, originalIndex }))
                        .filter(({ item }) => {
                          if (!queueSearchQuery.trim()) return true;
                          const q = queueSearchQuery.toLowerCase();
                          return (
                            (item.title || "").toLowerCase().includes(q) ||
                            (item.url || "").toLowerCase().includes(q)
                          );
                        })
                        .map(({ item, originalIndex: idx }) => {
                          const isCurrentlyPlaying =
                            !isAudioStreamActive && isAudioPlaying && currentAudioIndex === idx;

                          return (
                          <div
                            key={idx}
                            className={`flex items-center justify-between gap-2 p-2 rounded-[2px] border transition overflow-hidden w-full ${
                              isCurrentlyPlaying
                                ? "border-neutral-600 bg-neutral-900/80 border-l-2 border-l-white shadow-xs"
                                : "border-neutral-800 bg-neutral-950/40 hover:border-neutral-700"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {/* Botão de Tocar a Faixa */}
                              <button
                                onClick={() => handlePlayTrack(idx)}
                                className={`h-7 w-7 rounded-[2px] flex items-center justify-center transition flex-shrink-0 ${
                                  isCurrentlyPlaying
                                    ? "bg-white text-black shadow-xs font-bold"
                                    : "bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:text-white border border-neutral-800"
                                }`}
                                title="Tocar esta faixa agora"
                              >
                                {isCurrentlyPlaying ? (
                                  <Volume2 className="h-3.5 w-3.5" />
                                ) : (
                                  <Play className="h-3 w-3 ml-0.5" />
                                )}
                              </button>

                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-medium text-white truncate flex items-center gap-1.5">
                                  <span className="text-neutral-500 text-[10px] flex-shrink-0 font-mono">
                                    #{idx + 1}
                                  </span>
                                  <span className="truncate">
                                    {item.title || extractTrackTitle(item.url)}
                                  </span>
                                </div>
                                <div className="text-[10px] text-neutral-500 truncate mt-0.5 font-mono" title={item.url}>
                                  {item.url}
                                </div>
                              </div>
                            </div>

                            {/* Controles: Subir, Descer, Remover */}
                            <div className="flex items-center gap-0.5 flex-shrink-0">
                              <button
                                onClick={() => handleMoveTrack(idx, "up")}
                                disabled={idx === 0}
                                className="h-7 w-7 flex items-center justify-center rounded-[2px] text-neutral-400 hover:text-white hover:bg-neutral-800 disabled:opacity-20 transition"
                                title="Mover para cima"
                              >
                                <ChevronUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleMoveTrack(idx, "down")}
                                disabled={idx === activeAudio.items.length - 1}
                                className="h-7 w-7 flex items-center justify-center rounded-[2px] text-neutral-400 hover:text-white hover:bg-neutral-800 disabled:opacity-20 transition"
                                title="Mover para baixo"
                              >
                                <ChevronDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleRemoveTrack(idx)}
                                className="h-7 w-7 flex items-center justify-center rounded-[2px] text-neutral-400 hover:text-red-400 hover:bg-red-500/10 transition"
                                title="Remover da lista"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-[2px] border border-dashed border-neutral-800 p-6 text-center text-xs text-neutral-400 space-y-2">
                      <div>Nenhuma música na lista no momento.</div>
                      <div className="flex items-center justify-center gap-2 pt-1">
                        <button
                          onClick={() => setBasicAudioTab("youtube")}
                          className="px-3 py-1.5 rounded-[2px] bg-neutral-900 text-neutral-200 border border-neutral-700 text-xs font-semibold hover:bg-neutral-800 hover:text-white transition flex items-center gap-1.5"
                        >
                          <Search className="h-3.5 w-3.5" />
                          <span>Buscar no YouTube</span>
                        </button>
                        <button
                          onClick={() => setBasicAudioTab("playlist_import")}
                          className="px-3 py-1.5 rounded-[2px] bg-neutral-900 text-neutral-200 border border-neutral-700 text-xs font-semibold hover:bg-neutral-800 hover:text-white transition flex items-center gap-1.5"
                        >
                          <Disc className="h-3.5 w-3.5" />
                          <span>Importar Playlist</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ============================================================ */}
            {/* SUB-ABA 4: SINTONIZAR WEB RÁDIO                              */}
            {/* ============================================================ */}
            {basicAudioTab === "stream" && (
              <div className="rounded-[2px] border border-neutral-800 bg-neutral-950/60 p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RadioIcon
                      className={`h-4 w-4 ${
                        isAudioStreamActive ? "text-emerald-400 animate-pulse" : "text-neutral-500"
                      }`}
                    />
                    <span className="text-xs font-bold text-white">Transmissão Direta / Web Rádio</span>
                    {isAudioStreamActive && (
                      <span className="text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.2 rounded-[2px] font-bold">
                        Sintonizada
                      </span>
                    )}
                  </div>

                  {isAudioStreamActive && (
                    <button
                      onClick={handleClearAudioStream}
                      className="text-xs text-red-400 hover:underline flex items-center gap-1 font-semibold"
                    >
                      <X className="h-3 w-3" />
                      <span>Desconectar Rádio</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-stretch gap-1.5">
                  <input
                    placeholder="Link da rádio (ex: https://stream.zeno.fm/... ou link .mp3 contínuo)"
                    value={audioStreamInputUrl}
                    onChange={(e) => setAudioStreamInputUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleApplyAudioStream()}
                    className="flex-1 rounded-[2px] border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-white outline-none focus:border-neutral-500"
                  />
                  <button
                    onClick={handleApplyAudioStream}
                    disabled={!audioStreamInputUrl.trim() || setState.isPending}
                    className="min-h-[36px] px-4 py-2 rounded-[2px] bg-white text-black font-bold text-xs uppercase tracking-wider hover:bg-neutral-200 disabled:opacity-40 transition flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <RadioIcon className="h-3.5 w-3.5" />
                    <span>Sintonizar</span>
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ============================================================ */}
        {/* ABA 3: AGENDAMENTOS E AUTOMAÇÕES DA SALA                     */}
        {/* ============================================================ */}
        {activeTab === "automation" && (
          <RoomSchedulesCard
            slug={slug}
            schedules={schedulesQ.data}
            isLoading={schedulesQ.isLoading}
            audioPlaylists={audioPlaylists}
            onOpenNewModal={() => {
              setEditingSchedule(null);
              setScheduleModalOpen(true);
            }}
            onOpenEditModal={(task) => {
              setEditingSchedule(task);
              setScheduleModalOpen(true);
            }}
            onOpenWizardModal={() => setWizardModalOpen(true)}
            onToggle={(id) => toggleScheduleMut.mutate(id)}
            onRunNow={(id) => runScheduleMut.mutate(id)}
            onDelete={(id) => {
              if (confirm("Deseja realmente remover este agendamento programado?")) {
                deleteScheduleMut.mutate(id);
              }
            }}
            isRunningId={runningScheduleId}
          />
        )}

        {/* ============================================================ */}
        {/* ABA 4: APARELHOS / TVS CONECTADAS                            */}
        {/* ============================================================ */}
        {activeTab === "devices" && (
          <RoomDevicesCard
            slug={slug}
            devices={devicesQ.data?.devices}
            count={devicesCount}
            max={maxDevices}
            onKick={(clientId, reason) => kickDeviceMut.mutate({ clientId, reason })}
            isKicking={kickDeviceMut.isPending}
            playerUrl={playerUrl}
          />
        )}
      </main>

      {/* ============================================================ */}
      {/* MODAL PARA SALVAR FILA DE MÚSICAS COMO PLAYLIST              */}
      {/* ============================================================ */}
      {saveQueueModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-xs p-3 sm:p-4">
          <div className="w-full max-w-md rounded-[2px] border border-neutral-800 bg-neutral-950 p-4 sm:p-5 flex flex-col shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Save className="h-4 w-4 text-neutral-300" />
                <h3 className="text-sm font-bold text-white">Salvar Fila de Músicas</h3>
              </div>
              <button
                onClick={() => setSaveQueueModalOpen(false)}
                className="p-1 text-neutral-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <label className="text-xs font-semibold text-neutral-300 block">
                Nome da Playlist:
              </label>
              <input
                type="text"
                placeholder="Ex: Homenagem Família Silva, Músicas Suaves..."
                value={saveQueueName}
                onChange={(e) => setSaveQueueName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveQueue()}
                className="w-full rounded-[2px] border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white placeholder-neutral-500 outline-none focus:border-neutral-500"
                autoFocus
              />

              {activeAudio && (
                <div className="space-y-1 pt-1">
                  <span className="text-[11px] font-semibold text-neutral-400 block">Modo de Salvamento:</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSaveQueueMode("new")}
                      className={`p-2 rounded-[2px] border text-left text-xs transition ${
                        saveQueueMode === "new"
                          ? "border-white bg-neutral-900 text-white font-bold"
                          : "border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-neutral-200"
                      }`}
                    >
                      <div className="font-semibold">Nova Playlist</div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">Cria uma nova playlist independente</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSaveQueueMode("update")}
                      className={`p-2 rounded-[2px] border text-left text-xs transition ${
                        saveQueueMode === "update"
                          ? "border-white bg-neutral-900 text-white font-bold"
                          : "border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-neutral-200"
                      }`}
                    >
                      <div className="font-semibold">Atualizar Atual</div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">Sobrescreve a playlist atual</div>
                    </button>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-neutral-400 pt-1">
                A playlist salva contém {activeAudio?.items?.length || 0} faixas e poderá ser reusada a qualquer momento nesta ou em outras salas e nos agendamentos automáticos.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setSaveQueueModalOpen(false)}
                className="min-h-[34px] px-3.5 rounded-[2px] border border-neutral-800 bg-neutral-900 text-xs text-neutral-300 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveQueue}
                disabled={!saveQueueName.trim() || isSavingQueue}
                className="min-h-[34px] flex items-center gap-1.5 px-4 rounded-[2px] bg-white text-xs font-bold text-black hover:bg-neutral-200 disabled:opacity-40"
              >
                {isSavingQueue ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" />
                    <span>Salvar Playlist</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL PARA COLAR MÚLTIPLOS LINKS DE UMA VEZ                   */}      {/* ============================================================ */}
      {/* MODAL PARA COLAR MÚLTIPLOS LINKS DE UMA VEZ                   */}
      {/* ============================================================ */}
      {showMultiLinksModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-xs p-3 sm:p-4">
          <div className="w-full max-w-lg rounded-[2px] border border-neutral-800 bg-neutral-950 p-4 sm:p-5 flex flex-col shadow-2xl space-y-3 max-h-[90dvh]">
            <div className="flex items-center justify-between pb-2.5 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-neutral-300" />
                <h3 className="text-sm font-bold text-white">
                  Colar Vários Links de Uma Vez
                </h3>
              </div>
              <button
                onClick={() => setShowMultiLinksModal(false)}
                className="p-1 text-neutral-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-neutral-400">
              Cole sua lista de links do YouTube ou arquivos de áudio MP3 (um por linha). O sistema adiciona diretamente à fila da sala.
            </p>

            <textarea
              rows={8}
              placeholder={`https://www.youtube.com/watch?v=xV7ZzeBR3oc\nhttps://www.youtube.com/watch?v=QXX-O1U2ufY\nhttps://meusite.com/audio.mp3`}
              value={multiLinksText}
              onChange={(e) => setMultiLinksText(e.target.value)}
              className="w-full rounded-[2px] border border-neutral-700 bg-neutral-950 p-3 text-xs text-white placeholder-neutral-600 outline-none focus:border-neutral-500 font-mono"
            />

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
              <button
                onClick={() => setShowMultiLinksModal(false)}
                className="min-h-[34px] px-3.5 rounded-[2px] border border-neutral-800 bg-neutral-900 text-xs text-neutral-300 hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddMultipleTracks}
                disabled={!multiLinksText.trim()}
                className="min-h-[34px] flex items-center gap-1.5 px-4 rounded-[2px] bg-white text-xs font-bold text-black hover:bg-neutral-200 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Adicionar à Playlist</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL DE AGENDAMENTO INDIVIDUAL                              */}
      {/* ============================================================ */}
      <ScheduleModal
        isOpen={scheduleModalOpen}
        onClose={() => {
          setScheduleModalOpen(false);
          setEditingSchedule(null);
        }}
        slug={slug}
        currentSiteUrl={stateQ.data?.siteUrl}
        audioPlaylists={audioPlaylists}
        initialData={editingSchedule}
        onSave={(data) => {
          if (editingSchedule?.id) {
            updateScheduleMut.mutate({ id: editingSchedule.id, data });
          } else {
            createScheduleMut.mutate(data);
          }
        }}
      />

      {/* ============================================================ */}
      {/* MODAL DE ROTEIRO AUTOMÁTICO DE VELÓRIO (3 ETAPAS)            */}
      {/* ============================================================ */}
      <CeremonyWizardModal
        isOpen={wizardModalOpen}
        onClose={() => setWizardModalOpen(false)}
        slug={slug}
        currentSiteUrl={stateQ.data?.siteUrl}
        audioPlaylists={audioPlaylists}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ["schedules", slug] });
        }}
      />

      {/* ============================================================ */}
      {/* MODAL DE GERENCIAR TODAS AS PLAYLISTS / FILAS                */}
      {/* ============================================================ */}
      <ManagePlaylistsModal
        isOpen={isManagingPlaylistsOpen}
        onClose={() => setIsManagingPlaylistsOpen(false)}
        playlists={audioPlaylists}
        activePlaylistId={activeAudio?.id || null}
        onSelect={(id) => handleSelectAudioPlaylist(id)}
        onDelete={async (id, name) => {
          if (confirm(`Deseja realmente excluir a lista "${name}"?`)) {
            await signageApi.deletePlaylist(id);
            qc.invalidateQueries({ queryKey: ["playlists"] });
            if (activeAudio?.id === id) {
              qc.invalidateQueries({ queryKey: ["state", slug] });
            }
          }
        }}
      />
    </div>
  );
}

/**
 * Card de Dispositivos Conectados (TVs da Sala)
 */
function RoomDevicesCard({
  slug,
  devices = [],
  count = 0,
  max = 2,
  onKick,
  isKicking,
  playerUrl,
}: {
  slug: string;
  devices?: DeviceInfo[];
  count: number;
  max: number;
  onKick: (clientId?: string, reason?: string) => void;
  isKicking: boolean;
  playerUrl: string;
}) {
  const isFull = count >= max;
  const emptySlotsCount = Math.max(0, max - count);

  return (
    <section
      className={`rounded-[2px] border transition-all ${
        isFull
          ? "border-amber-500/30 bg-neutral-900/40"
          : count > 0
          ? "border-neutral-800 bg-neutral-900/30"
          : "border-neutral-800 bg-neutral-900/20"
      } p-3 sm:p-4 space-y-3`}
    >
      {/* Header do Card de Dispositivos */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-neutral-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`p-1.5 rounded-[2px] flex-shrink-0 ${
              isFull
                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                : count > 0
                ? "bg-neutral-900 text-neutral-200 border border-neutral-800"
                : "bg-neutral-900 text-neutral-400 border border-neutral-800"
            }`}
          >
            <Tv className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 flex-wrap">
              <span>TVs Conectadas</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-[2px] font-mono font-bold border truncate ${
                  isFull
                    ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                    : count > 0
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                    : "bg-neutral-900 text-neutral-400 border-neutral-800"
                }`}
              >
                {count}/{max} TVs {isFull && "• Cheia"}
              </span>
            </h2>
            <p className="text-[11px] text-neutral-400 truncate">
              Limite de até {max} TVs simultâneas nesta sala.
            </p>
          </div>
        </div>

        {/* Botão de Retirar Todas as Telas */}
        {count > 0 && (
          <button
            onClick={() => {
              if (
                confirm(
                  `Deseja desconectar todas as ${count} tela(s) desta sala e enviá-las de volta ao lobby?`
                )
              ) {
                onKick("all", "Todas as telas foram desconectadas pelo administrador.");
              }
            }}
            disabled={isKicking}
            className="w-full sm:w-auto min-h-[32px] flex items-center justify-center gap-1 rounded-[2px] bg-neutral-900 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/40 text-neutral-400 border border-neutral-800 px-3 py-1 text-xs font-semibold transition disabled:opacity-40"
          >
            <LogOut className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">Desconectar Todas ({count})</span>
          </button>
        )}
      </div>

      {/* Grid de Telas Conectadas e Vagas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {/* Telas Conectadas */}
        {devices.map((device, idx) => (
          <div
            key={device.id}
            className="flex flex-col justify-between p-3 rounded-[2px] border border-neutral-800 bg-neutral-950 shadow-xs space-y-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1.5 rounded-[2px] bg-neutral-900 text-neutral-200 border border-neutral-800 flex-shrink-0">
                  <Monitor className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-white truncate">
                    {device.deviceLabel}
                  </div>
                  <div className="text-[10px] text-neutral-400 flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Vaga #{idx + 1}
                    </span>
                    <span>•</span>
                    <span className="text-neutral-500 font-mono">
                      IP: {device.ip}
                    </span>
                  </div>
                </div>
              </div>

              <span className="text-[10px] text-neutral-500 flex items-center gap-1 flex-shrink-0 font-mono">
                <Clock className="h-3 w-3" />
                {formatConnectedTime(device.connectedAt)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-neutral-900">
              <span className="text-[10px] text-neutral-400 truncate">
                {device.audioState?.state === "playing"
                  ? "🔊 Reproduzindo som"
                  : device.audioState?.state === "blocked"
                  ? "⚠️ Som bloqueado (aperte OK na TV)"
                  : device.audioState?.state === "loading"
                  ? "⏳ Carregando áudio..."
                  : device.audioState?.state === "error"
                  ? `⚠️ ${device.audioState.detail || "Reconectando áudio"}`
                  : device.audioState?.state === "disabled"
                  ? "🔇 Som desativado nesta tela"
                  : "Conectada"}
              </span>
              <button
                onClick={() => {
                  if (confirm(`Desconectar "${device.deviceLabel}" e enviá-la de volta ao lobby?`)) {
                    onKick(
                      device.id,
                      "Você foi desconectado da sala pelo administrador e enviado ao lobby."
                    );
                  }
                }}
                disabled={isKicking}
                className="min-h-[28px] px-2.5 py-0.5 rounded-[2px] border border-neutral-800 bg-neutral-900 hover:bg-red-500/15 hover:border-red-500/30 hover:text-red-300 text-neutral-300 text-xs font-semibold transition flex items-center gap-1 disabled:opacity-40"
              >
                <LogOut className="h-3 w-3 flex-shrink-0" />
                <span>Desconectar</span>
              </button>
            </div>
          </div>
        ))}

        {/* Vagas Livres (até o limite) */}
        {Array.from({ length: emptySlotsCount }).map((_, i) => {
          const slotNum = count + i + 1;
          return (
            <div
              key={`empty-slot-${slotNum}`}
              className="flex flex-col items-center justify-center p-3.5 rounded-[2px] border border-dashed border-neutral-800 bg-neutral-950/40 text-center space-y-1 min-h-[96px]"
            >
              <div className="flex items-center gap-1.5 text-xs text-neutral-300 font-semibold">
                <Tv className="h-3.5 w-3.5 text-neutral-500" />
                <span>Vaga #{slotNum} Disponível</span>
              </div>
              <p className="text-[11px] text-neutral-500 max-w-xs">
                Aguardando conexão da TV ou selecione esta sala no menu do player.
              </p>
              <a
                href={playerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-neutral-300 hover:text-white underline font-semibold pt-0.5"
              >
                <ExternalLink className="h-3 w-3" />
                <span>Conectar TV nesta vaga</span>
              </a>
            </div>
          );
        })}
      </div>

      <div className="text-[10px] text-neutral-500 pt-1 border-t border-neutral-800/40 flex items-center gap-1.5">
        <Info className="h-3 w-3 text-neutral-500 flex-shrink-0" />
        <span>Ao desconectar, a TV vai para o lobby e pode se reconectar quando desejar.</span>
      </div>
    </section>
  );
}

/**
 * Interface de propriedades do Card de Agendamentos e Automações
 */
interface RoomSchedulesCardProps {
  slug: string;
  schedules?: ScheduleTask[];
  isLoading: boolean;
  audioPlaylists: Playlist[];
  onOpenNewModal: () => void;
  onOpenEditModal: (task: ScheduleTask) => void;
  onOpenWizardModal: () => void;
  onToggle: (id: string) => void;
  onRunNow: (id: string) => void;
  onDelete: (id: string) => void;
  isRunningId?: string | null;
}

/**
 * Card de Automações & Agendamentos da Sala (Linha do Tempo de Velório / Cerimônia)
 */
function RoomSchedulesCard({
  slug,
  schedules = [],
  isLoading,
  audioPlaylists,
  onOpenNewModal,
  onOpenEditModal,
  onOpenWizardModal,
  onToggle,
  onRunNow,
  onDelete,
  isRunningId,
}: RoomSchedulesCardProps) {
  // Ordena os agendamentos cronologicamente (do mais próximo para o futuro)
  const sortedSchedules = useMemo(() => {
    return [...schedules].sort((a, b) => {
      const timeA = new Date(a.scheduledAt).getTime() || 0;
      const timeB = new Date(b.scheduledAt).getTime() || 0;
      return timeA - timeB;
    });
  }, [schedules]);

  const activeCount = schedules.filter((s) => s.enabled && !s.executed).length;

  return (
    <section className="rounded-[2px] border border-neutral-800 bg-neutral-900/40 p-3 sm:p-4 space-y-3">
      {/* Header do Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-neutral-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-[2px] bg-neutral-900 text-neutral-300 border border-neutral-800 flex-shrink-0">
            <CalendarClock className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 flex-wrap">
              <span>Automação & Agendamentos</span>
              {activeCount > 0 ? (
                <span className="text-[10px] bg-neutral-800 text-neutral-300 border border-neutral-700 px-1.5 py-0.2 rounded-[2px] font-mono font-bold">
                  {activeCount} {activeCount === 1 ? "programado" : "programados"}
                </span>
              ) : (
                <span className="text-[10px] bg-neutral-900 text-neutral-500 px-1.5 py-0.2 rounded-[2px] font-mono">
                  Sem agendamentos
                </span>
              )}
            </h2>
            <p className="text-[11px] text-neutral-400 truncate">
              Ligue a TV, abra memoriais e toque músicas em horários programados.
            </p>
          </div>
        </div>

        {/* Botões do Topo */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={onOpenWizardModal}
            className="flex-1 sm:flex-none min-h-[34px] px-3 py-1 rounded-[2px] bg-white hover:bg-neutral-200 text-black font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-sm"
            title="Gera automaticamente as 3 etapas de um velório: Recepção, Despedida e Encerramento"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Roteiro de Velório</span>
          </button>

          <button
            onClick={onOpenNewModal}
            className="flex-1 sm:flex-none min-h-[34px] px-3 py-1 rounded-[2px] bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-800 font-semibold text-xs transition flex items-center justify-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Novo Horário</span>
          </button>
        </div>
      </div>

      {/* Lista de Agendamentos */}
      {isLoading ? (
        <div className="flex items-center justify-center p-6 text-neutral-400 text-xs gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
          <span>Carregando programação da sala...</span>
        </div>
      ) : sortedSchedules.length === 0 ? (
        <div className="rounded-[2px] border border-dashed border-neutral-800 bg-neutral-950/40 p-4 sm:p-5 text-center space-y-2.5">
          <div className="mx-auto h-9 w-9 rounded-[2px] bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400">
            <Calendar className="h-4 w-4" />
          </div>
          <div className="space-y-0.5">
            <h3 className="text-xs sm:text-sm font-bold text-white">Nenhum evento agendado para esta sala</h3>
            <p className="text-[11px] text-neutral-400 max-w-md mx-auto">
              Precisa deixar a TV programada para sair da suspensão às 19:30, tocar músicas de despedida às 08:00 e suspender às 08:15? Use nosso assistente guiado.
            </p>
          </div>
          <button
            onClick={onOpenWizardModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] bg-white hover:bg-neutral-200 text-black text-xs font-bold transition shadow"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Criar Roteiro Padrão de Velório</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedSchedules.map((task) => {
            const isExecuted = Boolean(task.executed);
            const isPaused = !task.enabled;
            const isRunning = isRunningId === task.id;
            const audioPlaylistName =
              task.actions.audioPlaylist
                ? audioPlaylists.find((p) => p.id === task.actions.audioPlaylist)?.name || "Playlist de Áudio"
                : null;

            return (
              <div
                key={task.id}
                className={`p-2.5 sm:p-3 rounded-[2px] border transition-all ${
                  isExecuted
                    ? "border-neutral-800/60 bg-neutral-950/40 opacity-75"
                    : isPaused
                    ? "border-amber-500/25 bg-neutral-950/60"
                    : "border-neutral-800 bg-neutral-950 shadow-xs hover:border-neutral-700"
                } space-y-2`}
              >
                {/* Linha 1: Horário, Título e Badges */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Badge de Horário */}
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-[2px] bg-neutral-900 border border-neutral-800 font-mono text-xs font-bold text-white">
                      <Clock className="h-3 w-3 text-neutral-400" />
                      <span>{formatScheduleDateTime(task.scheduledAt)}</span>
                    </div>

                    {/* Status Badge */}
                    {isExecuted ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-[2px] text-[10px] font-bold bg-neutral-800 text-neutral-400 border border-neutral-700">
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                        <span>Concluído</span>
                      </span>
                    ) : isPaused ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-[2px] text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/25">
                        <Pause className="h-3 w-3" />
                        <span>Pausado</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-[2px] text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Agendado</span>
                      </span>
                    )}

                    <h3 className="text-xs font-bold text-white truncate ml-0.5">
                      {task.title}
                    </h3>
                  </div>

                  {/* Ações Rápidas: Testar, Pausar, Editar, Excluir */}
                  <div className="flex items-center gap-1 self-end sm:self-auto flex-shrink-0">
                    <button
                      onClick={() => onRunNow(task.id)}
                      disabled={isRunning}
                      className="min-h-[28px] px-2 py-0.5 rounded-[2px] bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 text-[11px] font-semibold transition flex items-center gap-1 disabled:opacity-40"
                      title="Dispara as ações deste agendamento na TV agora mesmo para teste"
                    >
                      {isRunning ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Zap className="h-3 w-3 text-amber-400" />
                      )}
                      <span>Testar</span>
                    </button>

                    <button
                      onClick={() => onToggle(task.id)}
                      className={`min-h-[28px] px-2 py-0.5 rounded-[2px] border text-[11px] font-semibold transition flex items-center gap-1 ${
                        task.enabled
                          ? "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"
                          : "bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25"
                      }`}
                      title={task.enabled ? "Pausar este agendamento" : "Ativar este agendamento"}
                    >
                      {task.enabled ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                      <span>{task.enabled ? "Pausar" : "Ativar"}</span>
                    </button>

                    <button
                      onClick={() => onOpenEditModal(task)}
                      className="min-h-[28px] h-7 w-7 rounded-[2px] bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700 transition flex items-center justify-center"
                      title="Editar agendamento"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>

                    <button
                      onClick={() => onDelete(task.id)}
                      className="min-h-[28px] h-7 w-7 rounded-[2px] bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition flex items-center justify-center"
                      title="Excluir agendamento"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Linha 2: Tags / Ações que serão disparadas */}
                <div className="flex items-center gap-1 flex-wrap text-[10px] pt-1 border-t border-neutral-900">
                  {/* Standby / Suspensão */}
                  {task.actions.standby === false && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-[2px] bg-neutral-900 text-neutral-300 border border-neutral-800 font-medium">
                      <Sun className="h-3 w-3 text-amber-400" />
                      <span>Liga TV (Sai do Standby)</span>
                    </span>
                  )}
                  {task.actions.standby === true && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-[2px] bg-neutral-900 text-neutral-400 border border-neutral-800 font-medium">
                      <Moon className="h-3 w-3 text-amber-400" />
                      <span>Suspende TV (Standby)</span>
                    </span>
                  )}

                  {/* Site / Memorial */}
                  {task.actions.siteUrl && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-[2px] bg-neutral-900 text-neutral-300 border border-neutral-800 font-medium max-w-xs truncate">
                      <Globe className="h-3 w-3 flex-shrink-0 text-neutral-400" />
                      <span className="truncate">{task.actions.siteUrl}</span>
                    </span>
                  )}

                  {/* Playlist de Áudio */}
                  {audioPlaylistName && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-[2px] bg-neutral-900 text-neutral-300 border border-neutral-800 font-medium">
                      <Music className="h-3 w-3 text-neutral-400" />
                      <span>{audioPlaylistName}</span>
                    </span>
                  )}

                  {/* Volume */}
                  {task.actions.audioVolume !== undefined && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-[2px] bg-neutral-900 text-neutral-200 border border-neutral-800 font-medium font-mono">
                      <Volume2 className="h-3 w-3 text-neutral-400" />
                      <span>Vol: {task.actions.audioVolume}%</span>
                    </span>
                  )}

                  {/* Status de Áudio */}
                  {task.actions.audioStatus === "playing" && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-[2px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-medium">
                      <Play className="h-3 w-3" />
                      <span>Tocar Músicas</span>
                    </span>
                  )}
                  {task.actions.audioStatus === "paused" && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-[2px] bg-neutral-900 text-neutral-400 border border-neutral-800 font-medium">
                      <Pause className="h-3 w-3" />
                      <span>Pausar Som</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * Modal Assistente Guiado: Roteiro Automático de Velório em 3 Etapas
 */
function CeremonyWizardModal({
  isOpen,
  onClose,
  slug,
  currentSiteUrl,
  audioPlaylists,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  slug: string;
  currentSiteUrl?: string | null;
  audioPlaylists: Playlist[];
  onSuccess: () => void;
}) {
  if (!isOpen) return null;

  // Horário de Início: Hoje às 19:30 (ou amanhã se já passou das 20:00)
  const defaultStartTime = useMemo(() => {
    const d = new Date();
    d.setHours(19, 30, 0, 0);
    if (d.getTime() < Date.now() - 30 * 60 * 1000) {
      d.setDate(d.getDate() + 1);
    }
    return toLocalDatetimeString(d);
  }, []);

  // Horário da Despedida: Próximo dia às 08:00
  const defaultFarewellTime = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
    return toLocalDatetimeString(d);
  }, []);

  // Horário do Encerramento: Próximo dia às 08:15
  const defaultEndTime = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(8, 15, 0, 0);
    return toLocalDatetimeString(d);
  }, []);

  const [startTime, setStartTime] = useState(defaultStartTime);
  const [memorialUrl, setMemorialUrl] = useState(currentSiteUrl || "");
  const [startPlaylist, setStartPlaylist] = useState(audioPlaylists[0]?.id || "");
  const [startVolume, setStartVolume] = useState(0);

  const [farewellTime, setFarewellTime] = useState(defaultFarewellTime);
  const [farewellPlaylist, setFarewellPlaylist] = useState(audioPlaylists[0]?.id || "");
  const [farewellVolume, setFarewellVolume] = useState(0);

  const [endTime, setEndTime] = useState(defaultEndTime);
  const [endPlaylist, setEndPlaylist] = useState("");
  const [endVolume, setEndVolume] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // 1. Recepção
      await signageApi.createSchedule({
        roomSlug: slug,
        title: "Recepção & Abertura da Cerimônia",
        scheduledAt: toUtcIsoString(startTime),
        enabled: true,
        actions: {
          standby: false, // Liga TV / sai do modo suspenso
          siteUrl: memorialUrl.trim() || undefined,
          mode: memorialUrl.trim() ? "site" : undefined,
          audioPlaylist: startPlaylist || undefined,
          audioStatus: startPlaylist ? "playing" : undefined,
          audioVolume: Math.round(startVolume),
        },
      });

      // 2. Despedida
      await signageApi.createSchedule({
        roomSlug: slug,
        title: "Despedida da Família (Fechamento do Caixão)",
        scheduledAt: toUtcIsoString(farewellTime),
        enabled: true,
        actions: {
          audioPlaylist: farewellPlaylist || undefined,
          audioStatus: farewellPlaylist ? "playing" : undefined,
          audioVolume: Math.round(farewellVolume),
        },
      });

      // 3. Encerramento
      await signageApi.createSchedule({
        roomSlug: slug,
        title: "Encerramento da Cerimônia (Standby)",
        scheduledAt: toUtcIsoString(endTime),
        enabled: true,
        actions: {
          standby: true, // Volta para modo suspenso (relógio, clima, blackout suave)
          audioPlaylist: endPlaylist || undefined,
          audioStatus: endPlaylist ? "playing" : "paused",
          audioVolume: Math.round(endVolume),
        },
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      alert("Erro ao criar roteiro: " + (err.message || err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-xl rounded-[2px] border border-neutral-800 bg-neutral-950 p-3 sm:p-5 flex flex-col shadow-2xl space-y-3 max-h-[94dvh] my-auto overflow-y-auto">
        <div className="flex items-center justify-between pb-2.5 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-[2px] bg-neutral-900 text-neutral-200 border border-neutral-800">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">
                Roteiro Automático de Velório
              </h3>
              <p className="text-[11px] text-neutral-400">
                Gere em 1 clique as 3 etapas da cerimônia com volume livre e horário
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-neutral-400 hover:text-white transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2.5 text-xs">
          {/* ETAPA 1: Recepção e Início */}
          <div className="p-3 rounded-[2px] border border-neutral-800 bg-neutral-900/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-xs sm:text-sm flex items-center gap-1.5">
                <span className="font-mono text-[10px] bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded-[2px] border border-neutral-700 font-bold">
                  01
                </span>
                Recepção & Abertura da TV
              </span>
              <span className="text-[10px] bg-neutral-800 text-neutral-300 border border-neutral-700 px-2 py-0.5 rounded-[2px] font-mono font-semibold">
                Sai do Standby
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-semibold text-neutral-300 block mb-1">
                  Data e Horário de Início:
                </label>
                <DateTimePickerField value={startTime} onChange={setStartTime} />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-neutral-300 block mb-1">
                  Playlist da Recepção:
                </label>
                <select
                  value={startPlaylist}
                  onChange={(e) => setStartPlaylist(e.target.value)}
                  className="w-full rounded-[2px] border border-neutral-800 bg-black px-2.5 py-1.5 text-white text-xs outline-none focus:border-neutral-600"
                >
                  <option value="">Nenhuma música (Silêncio)</option>
                  {audioPlaylists.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.items?.length || 0} faixas)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-neutral-300 block mb-1">
                Link do Memorial / Homenagem (Foto/Vídeo):
              </label>
              <input
                type="url"
                placeholder="https://exemplo.com.br/homenagem"
                value={memorialUrl}
                onChange={(e) => setMemorialUrl(e.target.value)}
                className="w-full rounded-[2px] border border-neutral-800 bg-black px-2.5 py-1.5 text-white text-xs outline-none focus:border-neutral-600"
              />
            </div>

            {/* Controle Livre de Volume (Wheel Picker) */}
            <div className="space-y-1.5 pt-1 border-t border-neutral-800/80">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-neutral-300">
                  Volume Livre da Recepção:
                </span>
                <span className="font-mono font-bold text-xs text-white bg-neutral-900 px-2 py-0.5 rounded-[2px] border border-neutral-800">
                  {Math.round(startVolume)}%
                </span>
              </div>
              <VolumeWheelPicker
                value={startVolume}
                onChange={setStartVolume}
                compact
              />
              <div className="flex items-center gap-1 flex-wrap pt-0.5">
                <span className="text-[9px] uppercase tracking-wider text-neutral-500 mr-1 font-mono">Atalhos:</span>
                {[0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setStartVolume(v)}
                    className={`px-1.5 py-0.5 rounded-[2px] text-[10px] font-mono font-semibold border transition ${
                      startVolume === v
                        ? "bg-white text-black border-white font-bold"
                        : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700"
                    }`}
                  >
                    {v}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ETAPA 2: Despedida da Família */}
          <div className="p-3 rounded-[2px] border border-neutral-800 bg-neutral-900/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-xs sm:text-sm flex items-center gap-1.5">
                <span className="font-mono text-[10px] bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded-[2px] border border-neutral-700 font-bold">
                  02
                </span>
                Despedida da Família (Fechamento)
              </span>
              <span className="text-[10px] bg-neutral-800 text-neutral-300 border border-neutral-700 px-2 py-0.5 rounded-[2px] font-mono font-semibold">
                Músicas Especiais
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-semibold text-neutral-300 block mb-1">
                  Data e Horário da Despedida:
                </label>
                <DateTimePickerField value={farewellTime} onChange={setFarewellTime} />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-neutral-300 block mb-1">
                  Playlist de Despedida:
                </label>
                <select
                  value={farewellPlaylist}
                  onChange={(e) => setFarewellPlaylist(e.target.value)}
                  className="w-full rounded-[2px] border border-neutral-800 bg-black px-2.5 py-1.5 text-white text-xs outline-none focus:border-neutral-600"
                >
                  <option value="">Manter playlist atual</option>
                  {audioPlaylists.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.items?.length || 0} faixas)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Controle Livre de Volume (Wheel Picker) */}
            <div className="space-y-1.5 pt-1 border-t border-neutral-800/80">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-neutral-300">
                  Volume Livre da Despedida:
                </span>
                <span className="font-mono font-bold text-xs text-white bg-neutral-900 px-2 py-0.5 rounded-[2px] border border-neutral-800">
                  {Math.round(farewellVolume)}%
                </span>
              </div>
              <VolumeWheelPicker
                value={farewellVolume}
                onChange={setFarewellVolume}
                compact
              />
              <div className="flex items-center gap-1 flex-wrap pt-0.5">
                <span className="text-[9px] uppercase tracking-wider text-neutral-500 mr-1 font-mono">Atalhos:</span>
                {[0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setFarewellVolume(v)}
                    className={`px-1.5 py-0.5 rounded-[2px] text-[10px] font-mono font-semibold border transition ${
                      farewellVolume === v
                        ? "bg-white text-black border-white font-bold"
                        : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700"
                    }`}
                  >
                    {v}%
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ETAPA 3: Encerramento e Modo Suspenso */}
          <div className="p-3 rounded-[2px] border border-neutral-800 bg-neutral-900/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-xs sm:text-sm flex items-center gap-1.5">
                <span className="font-mono text-[10px] bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded-[2px] border border-neutral-700 font-bold">
                  03
                </span>
                Encerramento & Desocupação
              </span>
              <span className="text-[10px] bg-neutral-800 text-neutral-300 border border-neutral-700 px-2 py-0.5 rounded-[2px] font-mono font-semibold">
                Retorna ao Standby
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-semibold text-neutral-300 block mb-1">
                  Data e Horário de Saída:
                </label>
                <DateTimePickerField value={endTime} onChange={setEndTime} />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-neutral-300 block mb-1">
                  Som de Fundo após Saída:
                </label>
                <select
                  value={endPlaylist}
                  onChange={(e) => setEndPlaylist(e.target.value)}
                  className="w-full rounded-[2px] border border-neutral-800 bg-black px-2.5 py-1.5 text-white text-xs outline-none focus:border-neutral-600"
                >
                  <option value="">Pausar Som Completamente (Silêncio)</option>
                  {audioPlaylists.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.items?.length || 0} faixas)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Controle Livre de Volume (Wheel Picker) */}
            <div className="space-y-1.5 pt-1 border-t border-neutral-800/80">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-neutral-300">
                  Volume Livre do Fundo (Standby):
                </span>
                <span className="font-mono font-bold text-xs text-white bg-neutral-900 px-2 py-0.5 rounded-[2px] border border-neutral-800">
                  {Math.round(endVolume)}%
                </span>
              </div>
              <VolumeWheelPicker
                value={endVolume}
                onChange={setEndVolume}
                compact
              />
              <div className="flex items-center gap-1 flex-wrap pt-0.5">
                <span className="text-[9px] uppercase tracking-wider text-neutral-500 mr-1 font-mono">Atalhos:</span>
                {[0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setEndVolume(v)}
                    className={`px-1.5 py-0.5 rounded-[2px] text-[10px] font-mono font-semibold border transition ${
                      endVolume === v
                        ? "bg-white text-black border-white font-bold"
                        : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700"
                    }`}
                  >
                    {v}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-neutral-800">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[36px] px-3.5 rounded-[2px] border border-neutral-800 bg-neutral-900 text-xs text-neutral-300 hover:text-white hover:bg-neutral-800 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="min-h-[36px] flex items-center gap-2 px-4 rounded-[2px] bg-white hover:bg-neutral-200 text-black text-xs font-bold transition shadow disabled:opacity-40"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span>Criar Roteiro Automático</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Modal Individual para Criar ou Editar um Agendamento
 */
function ScheduleModal({
  isOpen,
  onClose,
  slug,
  currentSiteUrl,
  audioPlaylists,
  initialData,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  slug: string;
  currentSiteUrl?: string | null;
  audioPlaylists: Playlist[];
  initialData?: ScheduleTask | null;
  onSave: (data: Partial<ScheduleTask>) => void;
}) {
  if (!isOpen) return null;

  const isEditing = Boolean(initialData);

  const [title, setTitle] = useState(initialData?.title || "");
  const [scheduledAt, setScheduledAt] = useState(() => {
    if (initialData?.scheduledAt) {
      try {
        const d = new Date(initialData.scheduledAt);
        if (!isNaN(d.getTime())) return toLocalDatetimeString(d);
      } catch {}
      return initialData.scheduledAt;
    }
    const d = new Date();
    d.setMinutes(d.getMinutes() + 30);
    return toLocalDatetimeString(d);
  });

  const [standbyAction, setStandbyAction] = useState<"wake" | "standby" | "none">(() => {
    if (initialData?.actions.standby === false) return "wake";
    if (initialData?.actions.standby === true) return "standby";
    return "none";
  });

  const [siteUrl, setSiteUrl] = useState(initialData?.actions.siteUrl || "");
  const [audioPlaylist, setAudioPlaylist] = useState(initialData?.actions.audioPlaylist || "");
  const [audioVolume, setAudioVolume] = useState<number>(initialData?.actions.audioVolume ?? 0);
  const [audioStatus, setAudioStatus] = useState<"playing" | "paused" | "none">(() => {
    if (initialData?.actions.audioStatus === "playing") return "playing";
    if (initialData?.actions.audioStatus === "paused") return "paused";
    return "none";
  });

  const handleSave = () => {
    if (!scheduledAt) {
      alert("Por favor, selecione a data e horário do agendamento.");
      return;
    }

    const autoTitle = title.trim() || initialData?.title || (() => {
      if (standbyAction === "wake") return "Ligar TV (Sai do Standby)";
      if (standbyAction === "standby") return "Suspender TV (Standby)";
      if (siteUrl.trim()) return "Abrir Memorial / Site";
      if (audioPlaylist) {
        const pl = audioPlaylists.find((p) => p.id === audioPlaylist);
        return pl ? `Tocar: ${pl.name}` : "Tocar Playlist";
      }
      if (audioStatus === "paused") return "Pausar Áudio";
      return "Ação Agendada";
    })();

    const actions: ScheduleTask["actions"] = {};

    if (standbyAction === "wake") actions.standby = false;
    else if (standbyAction === "standby") actions.standby = true;

    if (siteUrl.trim()) {
      actions.siteUrl = siteUrl.trim();
      actions.mode = "site";
    }

    if (audioPlaylist) {
      actions.audioPlaylist = audioPlaylist;
    }

    if (audioVolume !== undefined) {
      actions.audioVolume = audioVolume;
    }

    if (audioStatus !== "none") {
      actions.audioStatus = audioStatus;
    }

    onSave({
      roomSlug: slug,
      title: autoTitle,
      scheduledAt: toUtcIsoString(scheduledAt),
      enabled: true,
      executed: false,
      executedAt: null,
      actions,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-[2px] border border-neutral-800 bg-neutral-950 p-3 sm:p-5 flex flex-col shadow-2xl space-y-3 max-h-[94dvh] my-auto overflow-y-auto">
        <div className="flex items-center justify-between pb-2.5 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-[2px] bg-neutral-900 text-neutral-200 border border-neutral-800">
              <CalendarClock className="h-4 w-4" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-white">
              {isEditing ? "Editar Agendamento" : "Novo Agendamento na TV"}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 text-neutral-400 hover:text-white transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2.5 text-xs">

          {/* Data e Hora */}
          <div>
            <label className="text-[11px] font-semibold text-neutral-300 block mb-1">
              Data e Horário de Execução:
            </label>
            <DateTimePickerField value={scheduledAt} onChange={setScheduledAt} />
          </div>

          {/* Tela da TV / Standby */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-neutral-300 block">
              Ação na Tela da TV:
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setStandbyAction("wake")}
                className={`p-2 rounded-[2px] border text-center transition flex flex-col items-center gap-1 ${
                  standbyAction === "wake"
                    ? "bg-white text-black border-white font-bold"
                    : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"
                }`}
              >
                <Sun className="h-3.5 w-3.5" />
                <span className="text-[10px] leading-tight">Ligar TV / Sair Standby</span>
              </button>

              <button
                type="button"
                onClick={() => setStandbyAction("standby")}
                className={`p-2 rounded-[2px] border text-center transition flex flex-col items-center gap-1 ${
                  standbyAction === "standby"
                    ? "bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold"
                    : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"
                }`}
              >
                <Moon className="h-3.5 w-3.5" />
                <span className="text-[10px] leading-tight">Modo Standby (Suspenso)</span>
              </button>

              <button
                type="button"
                onClick={() => setStandbyAction("none")}
                className={`p-2 rounded-[2px] border text-center transition flex flex-col items-center gap-1 ${
                  standbyAction === "none"
                    ? "bg-neutral-800 border-neutral-700 text-white font-bold"
                    : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"
                }`}
              >
                <Tv className="h-3.5 w-3.5" />
                <span className="text-[10px] leading-tight">Não Mudar Tela</span>
              </button>
            </div>
          </div>

          {/* Link do Memorial */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-semibold text-neutral-300">
                Link do Memorial / Site (Opcional):
              </label>
              {currentSiteUrl && (
                <button
                  type="button"
                  onClick={() => setSiteUrl(currentSiteUrl)}
                  className="text-[10px] text-neutral-400 hover:text-white underline"
                >
                  Usar link atual da sala
                </button>
              )}
            </div>
            <input
              type="url"
              placeholder="https://exemplo.com.br/homenagem"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              className="w-full rounded-[2px] border border-neutral-800 bg-black px-2.5 py-1.5 text-white text-xs outline-none focus:border-neutral-600"
            />
          </div>

          {/* Playlist de Áudio */}
          <div>
            <label className="text-[11px] font-semibold text-neutral-300 block mb-1">
              Músicas / Playlist de Áudio:
            </label>
            <select
              value={audioPlaylist}
              onChange={(e) => setAudioPlaylist(e.target.value)}
              className="w-full rounded-[2px] border border-neutral-800 bg-black px-2.5 py-1.5 text-white text-xs outline-none focus:border-neutral-600"
            >
              <option value="">Manter playlist atual</option>
              {audioPlaylists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.items?.length || 0} faixas)
                </option>
              ))}
            </select>
          </div>

          {/* Volume de Áudio Livre (Wheel Picker) */}
          <div className="space-y-1.5 pt-1 border-t border-neutral-800/80">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-neutral-300">
                Volume Livre do Áudio:
              </span>
              <span className="font-mono font-bold text-xs text-white bg-neutral-900 px-2 py-0.5 rounded-[2px] border border-neutral-800">
                {audioVolume}%
              </span>
            </div>
            <VolumeWheelPicker
              value={audioVolume}
              onChange={setAudioVolume}
              compact
            />
            <div className="flex items-center gap-1 flex-wrap pt-0.5">
              <span className="text-[9px] uppercase tracking-wider text-neutral-500 mr-1 font-mono">Atalhos:</span>
              {VOLUME_PRESETS.map((p) => (
                <button
                  key={p.val}
                  type="button"
                  onClick={() => setAudioVolume(p.val)}
                  className={`px-1.5 py-0.5 rounded-[2px] text-[10px] font-mono font-semibold border transition ${
                    audioVolume === p.val
                      ? "bg-white text-black border-white font-bold"
                      : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ação de Som */}
          <div>
            <label className="text-[11px] font-semibold text-neutral-300 block mb-1">
              Ação do Som:
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setAudioStatus("playing")}
                className={`p-2 rounded-[2px] border text-center transition flex items-center justify-center gap-1 ${
                  audioStatus === "playing"
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 font-bold"
                    : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"
                }`}
              >
                <Play className="h-3.5 w-3.5" />
                <span>Tocar</span>
              </button>

              <button
                type="button"
                onClick={() => setAudioStatus("paused")}
                className={`p-2 rounded-[2px] border text-center transition flex items-center justify-center gap-1 ${
                  audioStatus === "paused"
                    ? "bg-amber-500/20 border-amber-500/40 text-amber-300 font-bold"
                    : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"
                }`}
              >
                <Pause className="h-3.5 w-3.5" />
                <span>Pausar</span>
              </button>

              <button
                type="button"
                onClick={() => setAudioStatus("none")}
                className={`p-2 rounded-[2px] border text-center transition flex items-center justify-center gap-1 ${
                  audioStatus === "none"
                    ? "bg-neutral-800 border-neutral-700 text-white font-bold"
                    : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"
                }`}
              >
                <span>Não Mudar</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-neutral-800">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[36px] px-3.5 rounded-[2px] border border-neutral-800 bg-neutral-900 text-xs text-neutral-300 hover:text-white hover:bg-neutral-800 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="min-h-[36px] flex items-center gap-2 px-4 rounded-[2px] bg-white hover:bg-neutral-200 text-black text-xs font-bold transition shadow"
          >
            <Check className="h-4 w-4" />
            <span>{isEditing ? "Salvar Alterações" : "Criar Agendamento"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
