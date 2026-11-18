import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect, useRef } from "react";
import {
  signageApi,
  type Playlist,
  type PlaylistItem,
  type DeviceInfo,
  type RadioStationItem,
  type DropboxTrack,
  type DropboxStatus,
  type DropboxConfigPayload,
  type ScheduleTask,
  type RoomRoutine,
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
  Cloud,
  Folder,
  Settings,
  CheckCircle2,
  Minus,
  Calendar,
  CalendarClock,
  Zap,
  AlertCircle,
  Save,
  Bookmark,
  BookmarkCheck,
  Lock,
  QrCode,
  Printer,
  Copy,
  RotateCw,
} from "lucide-react";
import { AdiauSection } from "@/components/AdiauSection";
import { parseAdiauEndTimestamp, formatAdiauDateTime } from "@/lib/adiau";
import { LoginModal } from "@/components/LoginModal";
import { useSavedRadios } from "@/lib/saved-radios";
import { useAuth, ROLE_LABELS } from "@/lib/auth";

export const Route = createFileRoute("/admin/$slug")({
  component: RoomOperator,
});

/**
 * Normaliza e limpa links de áudio e Google Drive
 */
function cleanAudioUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (!url) return url;
  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }
  const gdriveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (gdriveMatch) {
    url = `https://drive.google.com/uc?export=download&id=${gdriveMatch[1]}`;
  }
  if (url.includes("dropbox.com")) {
    if (!url.includes("dl.dropboxusercontent.com")) {
      url = url.replace("www.dropbox.com", "dl.dropboxusercontent.com");
    }
    url = url.replace(/[?&]dl=0/, "").replace(/[?&]dl=1/, "");
    url += url.includes("?") ? "&dl=1" : "?dl=1";
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
            className="w-full rounded-none border border-neutral-900 bg-black px-2 py-1.5 text-white font-mono text-xs outline-none focus:border-neutral-600 cursor-pointer"
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
            className="w-full rounded-none border border-neutral-900 bg-black px-2 py-1.5 text-white font-mono text-xs outline-none focus:border-neutral-600 cursor-pointer"
          />
        </div>
      </div>

      {/* Botões Rápidos de Ajuste para Celular */}
      <div className="flex items-center gap-1 flex-wrap text-[10px] text-neutral-400 font-mono">
        <span className="text-[9px] uppercase tracking-wider text-neutral-500 mr-0.5">Ajustes:</span>
        <button
          type="button"
          onClick={() => setTodayTomorrow(false)}
          className="px-1.5 py-0.5 rounded-none bg-neutral-900 border border-neutral-900 hover:text-white hover:border-neutral-700"
        >
          Hoje
        </button>
        <button
          type="button"
          onClick={() => setTodayTomorrow(true)}
          className="px-1.5 py-0.5 rounded-none bg-neutral-900 border border-neutral-900 hover:text-white hover:border-neutral-700"
        >
          Amanhã
        </button>
        <button
          type="button"
          onClick={() => addMinutes(15)}
          className="px-1.5 py-0.5 rounded-none bg-neutral-900 border border-neutral-900 hover:text-white hover:border-neutral-700"
        >
          +15m
        </button>
        <button
          type="button"
          onClick={() => addMinutes(30)}
          className="px-1.5 py-0.5 rounded-none bg-neutral-900 border border-neutral-900 hover:text-white hover:border-neutral-700"
        >
          +30m
        </button>
        <button
          type="button"
          onClick={() => addMinutes(60)}
          className="px-1.5 py-0.5 rounded-none bg-neutral-900 border border-neutral-900 hover:text-white hover:border-neutral-700"
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
      <div className="w-full max-w-lg rounded-none border border-neutral-900 bg-neutral-950 p-4 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
          <div className="flex items-center gap-2">
            <ListMusic className="h-4 w-4 text-white" />
            <h3 className="font-bold text-sm text-white">Gerenciar Listas de Músicas</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-none text-neutral-400 hover:text-white hover:bg-neutral-900 transition"
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
                  className={`flex items-center justify-between gap-2 p-2.5 rounded-none border transition ${
                    isActive
                      ? "bg-neutral-900 border-white/40 shadow-xs"
                      : "bg-neutral-900/60 border-neutral-900 hover:border-neutral-700"
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
                        <span className="px-1.5 py-0.2 rounded-none text-[9px] font-bold bg-white text-black uppercase">
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
                        className="px-2 py-1 rounded-none bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold transition"
                      >
                        Usar
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(pl.id, pl.name)}
                      className="p-1.5 rounded-none text-neutral-400 hover:text-red-400 hover:bg-red-500/10 transition"
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

        <div className="pt-2 border-t border-neutral-900 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-none bg-neutral-900 hover:bg-neutral-800 border border-neutral-900 text-xs font-semibold text-white transition"
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
  { label: "25%", val: 25 },
  { label: "50%", val: 50 },
  { label: "75%", val: 75 },
  { label: "100%", val: 100 },
];

interface VolumeControlRowProps {
  value: number;
  onChange: (val: number) => void;
  disabled?: boolean;
}

/**
 * Controle de Volume unificado com o mesmo design da Visão Geral:
 * Botões [-] e [+] de 1 em 1, botão de alternar mudo/ícone no centro e 5 volumes fixos (0, 25, 50, 75, 100).
 */
function VolumeControlRow({ value, onChange, disabled = false }: VolumeControlRowProps) {
  const currentVal = Math.max(0, Math.min(100, Math.round(value)));

  const handleStep = (delta: number) => {
    if (disabled) return;
    const next = Math.max(0, Math.min(100, currentVal + delta));
    onChange(next);
  };

  const handleToggleMute = () => {
    if (disabled) return;
    onChange(currentVal > 0 ? 0 : 25);
  };

  return (
    <div className="space-y-1.5 w-full">
      {/* Barra [-], Status/Mudo, [+] */}
      <div className="grid grid-cols-[44px_1fr_44px] items-center border border-neutral-900 bg-neutral-950">
        <button
          type="button"
          onClick={() => handleStep(-1)}
          disabled={disabled || currentVal <= 0}
          className="min-h-[42px] sm:min-h-[36px] flex items-center justify-center text-neutral-300 hover:text-white hover:bg-neutral-900 disabled:opacity-30 transition border-r border-neutral-900"
          title="Diminuir volume (-1%)"
        >
          <Minus className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={handleToggleMute}
          disabled={disabled}
          className="min-h-[42px] sm:min-h-[36px] flex items-center justify-center gap-1.5 font-mono text-xs font-bold text-neutral-200 hover:text-white hover:bg-neutral-900 disabled:opacity-30 transition border-r border-neutral-900"
          title="Alternar mudo"
        >
          {currentVal === 0 ? (
            <>
              <VolumeX className="h-4 w-4 text-red-400" />
              <span className="text-[10px] text-red-400">Mudo (0%)</span>
            </>
          ) : (
            <>
              <Volume2 className="h-4 w-4 text-emerald-400" />
              <span className="text-white">{currentVal}%</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleStep(1)}
          disabled={disabled || currentVal >= 100}
          className="min-h-[42px] sm:min-h-[36px] flex items-center justify-center text-neutral-300 hover:text-white hover:bg-neutral-900 disabled:opacity-30 transition"
          title="Aumentar volume (+1%)"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* 5 Volumes Fixos: 0, 25, 50, 75, 100 */}
      <div className="grid grid-cols-5 gap-1 w-full">
        {VOLUME_PRESETS.map((preset) => {
          const isSelected = Math.abs(currentVal - preset.val) < 0.5;
          return (
            <button
              key={preset.val}
              type="button"
              disabled={disabled}
              onClick={() => onChange(preset.val)}
              className={`min-h-[32px] sm:min-h-[28px] px-1 py-0.5 rounded-none text-xs sm:text-[11px] font-mono font-semibold border transition text-center truncate flex items-center justify-center disabled:opacity-40 ${
                isSelected
                  ? "bg-white text-black border-white font-bold"
                  : "bg-neutral-900 border-neutral-900 text-neutral-300 hover:text-white hover:bg-neutral-800"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RoomOperator() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const router = useRouter();

  // Autenticação & Permissões do Operador
  const { currentUser, canAccessRoom, hasPermission } = useAuth();
  const [operatorLoginModalOpen, setOperatorLoginModalOpen] = useState(false);
  const canControlMedia = hasPermission("control_playback", slug);

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
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(`signage_admin_state_${slug}`, JSON.stringify(incomingState));
      } catch {}
    }
  };

  // Abas Principais: Conteúdo / Áudio / Aparelhos (Automações e Rotinas antigas removidas)
  const [activeTab, setActiveTab] = useState<"content" | "audio" | "devices">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("signage_active_tab");
      if (saved === "content" || saved === "audio" || saved === "devices") return saved;
    }
    return "content";
  });

  const handleSelectTab = (tab: "content" | "audio" | "devices") => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      localStorage.setItem("signage_active_tab", tab);
    }
  };

  // Controle de expansão do menu de orientação/rotação da TV
  const [isRotationExpanded, setIsRotationExpanded] = useState(false);

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
    initialData: () => {
      if (typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem(`signage_admin_state_${slug}`);
          if (raw) return JSON.parse(raw);
        } catch {}
      }
      return undefined;
    },
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
      if (typeof window !== "undefined" && fresh) {
        try {
          localStorage.setItem(`signage_admin_state_${slug}`, JSON.stringify(fresh));
        } catch {}
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
      rotation?: number;
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
    target: "visual" | "audio" | "site" | "room" | "screen",
    command: "play" | "pause" | "next" | "prev" | "reload" | "setVolume" | "setLoopMode" | "setShuffle" | "setTrackIndex" | "setStandby" | "setRotation",
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
      } else if ((target === "room" || target === "screen") && command === "setRotation") {
        updated.rotation = Number(value);
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

  // Feedback e mutations para recarregar TV / sala e site
  const [reloadNotice, setReloadNotice] = useState<string | null>(null);

  const reloadRoomMut = useMutation({
    mutationFn: () => signageApi.reloadRoom(slug),
    onSuccess: () => {
      setReloadNotice("Comando de recarregamento enviado para todas as TVs desta sala!");
      setTimeout(() => setReloadNotice(null), 3500);
    },
    onError: (err: any) => {
      setReloadNotice("Erro ao emitir recarregamento: " + (err.message || "Falha na rede"));
      setTimeout(() => setReloadNotice(null), 3500);
    },
  });

  const reloadSiteMut = useMutation({
    mutationFn: () => signageApi.reloadSite(slug),
    onSuccess: () => {
      setReloadNotice("Comando para recarregar memorial/site enviado!");
      setTimeout(() => setReloadNotice(null), 3500);
    },
    onError: (err: any) => {
      setReloadNotice("Erro ao recarregar site: " + (err.message || "Falha"));
      setTimeout(() => setReloadNotice(null), 3500);
    },
  });

  // Estados e controle de QR Code para o celular da família
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrNotice, setQrNotice] = useState<string | null>(null);

  const musicUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/music/${slug}`;
  const qrSvgUrl = `/api/qr?text=${encodeURIComponent(musicUrl)}`;

  const showMusicQrMut = useMutation({
    mutationFn: () => signageApi.showMusicQr(slug),
    onSuccess: () => {
      setQrNotice("QR Code exibido na TV da sala por 10 segundos!");
      setTimeout(() => setQrNotice(null), 10000);
    },
    onError: (err: any) => {
      setQrNotice("Erro ao enviar QR Code para a TV: " + (err.message || "Falha na rede"));
      setTimeout(() => setQrNotice(null), 4000);
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

  // Sub-modo de áudio: Meu Dropbox, Web Rádio 24h ou Fila da Sala
  const [basicAudioTab, setBasicAudioTab] = useState<"dropbox" | "stream" | "playlist">("dropbox");

  // Inputs para adicionar faixa à playlist no Modo Básico
  const [newTrackUrl, setNewTrackUrl] = useState("");
  const [newTrackTitle, setNewTrackTitle] = useState("");
  const [multiLinksText, setMultiLinksText] = useState("");
  const [showMultiLinksModal, setShowMultiLinksModal] = useState(false);
  const [addedSuccessId, setAddedSuccessId] = useState(null as string | null);

  // Estados e Presets para Web Rádio 24h
  const radioPresetsQ = useQuery({
    queryKey: ["radioPresets"],
    queryFn: signageApi.getRadioPresets,
    staleTime: 600000,
  });
  const {
    radios: savedRadios,
    saveRadio,
    deleteRadio,
    resetToDefaults,
    isSaved: isRadioSavedInStore,
  } = useSavedRadios();
  const [isAddingCustomRadio, setIsAddingCustomRadio] = useState(false);
  const [newRadioName, setNewRadioName] = useState("");
  const [newRadioUrl, setNewRadioUrl] = useState("");
  const [newRadioDesc, setNewRadioDesc] = useState("");
  const [radioSearchQuery, setRadioSearchQuery] = useState("");
  const [radioSearchResults, setRadioSearchResults] = useState<RadioStationItem[]>([]);
  const [isSearchingRadio, setIsSearchingRadio] = useState(false);
  const [isProbingRadio, setIsProbingRadio] = useState(false);
  const [radioStatusMsg, setRadioStatusMsg] = useState<string | null>(null);
  const [radioErrorMsg, setRadioErrorMsg] = useState<string | null>(null);

  // Estados para Músicas no Dropbox (Nuvem)
  const dropboxStatusQ = useQuery({
    queryKey: ["dropboxStatus"],
    queryFn: signageApi.getDropboxStatus,
    staleTime: 30000,
  });

  const [dropboxQuery, setDropboxQuery] = useState("");
  const [dropboxFolder, setDropboxFolder] = useState("");
  const [isRefreshingDropbox, setIsRefreshingDropbox] = useState(false);

  const dropboxTracksQ = useQuery({
    queryKey: ["dropboxTracks", dropboxFolder],
    queryFn: () => signageApi.getDropboxTracks(dropboxFolder || undefined),
    enabled: Boolean(dropboxStatusQ.data?.configured),
    staleTime: 60000,
  });

  const dropboxFoldersQ = useQuery({
    queryKey: ["dropboxFolders"],
    queryFn: signageApi.getDropboxFolders,
    enabled: Boolean(dropboxStatusQ.data?.configured),
    staleTime: 120000,
  });

  const filteredDropboxTracks = useMemo(() => {
    const list = dropboxTracksQ.data?.tracks || [];
    const q = dropboxQuery.trim().toLowerCase();
    if (!q) return list;
    const qNorm = q.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return list.filter((t) => {
      const titleNorm = t.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const nameNorm = t.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const folderNorm = t.folder.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return titleNorm.includes(qNorm) || nameNorm.includes(qNorm) || folderNorm.includes(qNorm);
    });
  }, [dropboxTracksQ.data?.tracks, dropboxQuery]);

  const handleRefreshDropbox = async () => {
    setIsRefreshingDropbox(true);
    try {
      await signageApi.getDropboxTracks(dropboxFolder || undefined, undefined, true);
      await qc.invalidateQueries({ queryKey: ["dropboxTracks"] });
      await qc.invalidateQueries({ queryKey: ["dropboxFolders"] });
      await qc.invalidateQueries({ queryKey: ["dropboxStatus"] });
    } catch (err: any) {
      console.error("Erro ao sincronizar Dropbox:", err);
    } finally {
      setIsRefreshingDropbox(false);
    }
  };

  const handleAddDropboxTrack = async (track: DropboxTrack, playImmediately = false) => {
    const newItem: PlaylistItem = {
      url: track.streamUrl,
      title: track.title,
      type: "audio",
      duration: track.duration,
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
      if (stateQ.data?.audioStreamUrl && playImmediately) {
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
          ...(playImmediately ? { audioStatus: "playing" } : {}),
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
            ...(playImmediately ? { audioStatus: "playing" } : {}),
          });
        }
      }
    }

    setAddedSuccessId(track.id);
    setTimeout(() => setAddedSuccessId(null), 2500);

    if (playImmediately) {
      const newIdx = targetItems.length - 1;
      await signageApi.setTrackIndex(slug, newIdx);
      await signageApi.setState(slug, {
        audioPlaylist: targetPlaylistId,
        audioStreamUrl: null,
        audioStatus: "playing",
        currentAudioIndex: newIdx,
        audioTitle: track.title,
      });
    }
    await qc.invalidateQueries({ queryKey: ["playlists"] });
    await qc.invalidateQueries({ queryKey: ["state", slug] });
  };

  const handleAddAllDropboxTracks = async (tracksToAdd: DropboxTrack[], playImmediately = false) => {
    if (!tracksToAdd || tracksToAdd.length === 0) return;

    const newItems: PlaylistItem[] = tracksToAdd.map((track) => ({
      url: track.streamUrl,
      title: track.title,
      type: "audio",
      duration: track.duration,
      muted: false,
      volume: 100,
    }));

    let targetPlaylistId = activeAudio?.id;
    let targetItems = [...(activeAudio?.items || [])];
    const initialLen = targetItems.length;

    if (activeAudio) {
      targetItems = [...targetItems, ...newItems];
      await signageApi.updatePlaylist(activeAudio.id, {
        ...activeAudio,
        items: targetItems,
      });
      if (stateQ.data?.audioStreamUrl && playImmediately) {
        await signageApi.setState(slug, { audioStreamUrl: null, audioStatus: "playing" });
      }
    } else {
      const playlistName = `Áudio - ${currentRoom?.name || slug}`;
      const existingQueue = audioPlaylists.find((p) => p.name === playlistName);
      if (existingQueue) {
        targetPlaylistId = existingQueue.id;
        targetItems = [...(existingQueue.items || []), ...newItems];
        await signageApi.updatePlaylist(targetPlaylistId, {
          ...existingQueue,
          items: targetItems,
        });
        await signageApi.setState(slug, {
          audioPlaylist: targetPlaylistId,
          audioStreamUrl: null,
          ...(playImmediately ? { audioStatus: "playing" } : {}),
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
        targetPlaylistId = res.playlist?.id;
        if (targetPlaylistId) {
          await signageApi.setState(slug, {
            audioPlaylist: targetPlaylistId,
            audioStreamUrl: null,
            ...(playImmediately ? { audioStatus: "playing" } : {}),
          });
        }
      }
    }

    if (playImmediately) {
      const firstNewTrack = tracksToAdd[0];
      await signageApi.setTrackIndex(slug, initialLen);
      await signageApi.setState(slug, {
        audioPlaylist: targetPlaylistId,
        audioStreamUrl: null,
        audioStatus: "playing",
        currentAudioIndex: initialLen,
        audioTitle: firstNewTrack?.title,
      });
    }
    await qc.invalidateQueries({ queryKey: ["playlists"] });
    await qc.invalidateQueries({ queryKey: ["state", slug] });
  };

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

  // Identificação da faixa ou Web Rádio tocando agora
  const currentPlayingTrack = useMemo(() => {
    if (isAudioStreamActive) {
      const activeStream = (stateQ.data?.audioStreamUrl || "").trim();
      const presetMatch = radioPresetsQ.data?.presets?.find(
        (r) => r.streamUrl === activeStream
      );
      if (presetMatch) return `Web Rádio: ${presetMatch.name}`;
      const searchMatch = radioSearchResults.find((r) => r.streamUrl === activeStream);
      if (searchMatch) return `Web Rádio: ${searchMatch.name}`;
      return "Transmissão Web Rádio Ao Vivo";
    }
    // 1. Título autoritativo persistido no estado da sala pelo backend
    if (stateQ.data?.audioTitle) {
      return stateQ.data.audioTitle;
    }
    // 2. Faixa do activeAudio
    if (activeAudio?.items && activeAudio.items.length > 0) {
      const it = activeAudio.items[currentAudioIndex] || activeAudio.items[0];
      if (it?.title) return it.title;
      if (it?.url) return extractTrackTitle(it.url);
    }
    // 3. Fallback buscando na lista de playlists se activeAudio ainda estiver sincronizando
    if (stateQ.data?.audioPlaylist && playlistsQ.data) {
      const pl = playlistsQ.data.find((p) => p.id === stateQ.data.audioPlaylist);
      if (pl?.items && pl.items.length > 0) {
        const it = pl.items[currentAudioIndex] || pl.items[0];
        if (it?.title) return it.title;
        if (it?.url) return extractTrackTitle(it.url);
      }
    }
    // 4. Se o som estiver tocando mas sem nome específico ainda
    if (isAudioPlaying) {
      return "Música em Reprodução";
    }
    return null;
  }, [
    isAudioStreamActive,
    stateQ.data?.audioStreamUrl,
    stateQ.data?.audioTitle,
    stateQ.data?.audioPlaylist,
    radioPresetsQ.data?.presets,
    radioSearchResults,
    activeAudio,
    playlistsQ.data,
    currentAudioIndex,
    isAudioPlaying,
  ]);

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

            // Relatório em tempo real do player de áudio (título e estado)
            if (data.type === "audioState") {
              if (data.detail && data.state === "playing") {
                qc.setQueryData(["state", slug], (old: any) => {
                  if (!old) return old;
                  return { ...old, audioTitle: data.detail, audioStatus: "playing" };
                });
              }
              return;
            }

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
                } else if ((data.target === "room" || data.target === "screen") && data.command === "setRotation") {
                  updated.rotation = Number(data.value);
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

  // Ações de Stream Único / Web Rádio 24h
  const handleTuneRadioStation = (station: RadioStationItem) => {
    setRadioErrorMsg(null);
    setRadioStatusMsg(`Sintonizada: ${station.name}`);
    setAudioStreamInputUrl(station.streamUrl);
    setState.mutate({ audioStreamUrl: station.streamUrl, audioPlaylist: null, audioStatus: "playing" });
    setTimeout(() => setRadioStatusMsg(null), 4000);
  };

  const handleApplyAudioStream = async () => {
    if (!audioStreamInputUrl.trim()) return;
    const raw = cleanAudioUrl(audioStreamInputUrl);
    setRadioErrorMsg(null);
    setRadioStatusMsg(null);
    setIsProbingRadio(true);
    try {
      const probe = await signageApi.probeRadio(raw);
      if (probe.ok && probe.resolvedUrl) {
        setAudioStreamInputUrl(probe.resolvedUrl);
        setState.mutate({ audioStreamUrl: probe.resolvedUrl, audioPlaylist: null, audioStatus: "playing" });
        setRadioStatusMsg(
          probe.stationName
            ? `Rádio validada e sintonizada: ${probe.stationName}`
            : "Transmissão ao vivo verificada e sintonizada!"
        );
        setTimeout(() => setRadioStatusMsg(null), 4500);
      } else {
        setRadioErrorMsg(
          probe.error ||
            "Este link não parece retornar áudio contínuo (MP3/AAC). Verifique o endereço ou escolha uma das rádios 24h abaixo."
        );
      }
    } catch (_e) {
      // Fallback: sintoniza mesmo se o teste prévio falhar
      setAudioStreamInputUrl(raw);
      setState.mutate({ audioStreamUrl: raw, audioPlaylist: null, audioStatus: "playing" });
    } finally {
      setIsProbingRadio(false);
    }
  };

  const handleClearAudioStream = () => {
    setRadioErrorMsg(null);
    setRadioStatusMsg(null);
    setState.mutate({ audioStreamUrl: null });
  };

  const handleSearchRadios = async (customQuery?: string) => {
    const q = (customQuery !== undefined ? customQuery : radioSearchQuery).trim();
    if (!q) return;
    if (customQuery !== undefined) setRadioSearchQuery(customQuery);
    setIsSearchingRadio(true);
    setRadioErrorMsg(null);
    try {
      const res = await signageApi.searchRadios(q, 16);
      setRadioSearchResults(res.results || []);
      if ((res.results || []).length === 0) {
        setRadioErrorMsg("Nenhuma estação ao vivo encontrada para esta busca.");
      }
    } catch (err: any) {
      setRadioErrorMsg(err.message || "Erro ao pesquisar estações de rádio.");
    } finally {
      setIsSearchingRadio(false);
    }
  };

  // Ações de Músicas / Playlist
  const handleAddTrack = async (rawUrl: string, customTitle?: string) => {
    if (!rawUrl.trim()) return;
    const cleaned = cleanAudioUrl(rawUrl);
    const title = customTitle?.trim() || extractTrackTitle(cleaned, customTitle);

    const newItem: PlaylistItem = {
      url: cleaned,
      title,
      type: "audio",
      duration: undefined,
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
        await signageApi.setState(slug, { audioStreamUrl: null });
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
        await signageApi.setState(slug, { audioStreamUrl: null });
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
  // Guarda de Permissão por Sala (RBAC)
  if (!canAccessRoom(slug)) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-center font-mono space-y-4 bg-neutral-950">
        <div className="p-3 bg-neutral-900 border border-neutral-900 text-amber-400">
          <Lock className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider">
            Acesso Restrito a Esta Sala
          </h2>
          <p className="text-xs text-neutral-400 max-w-sm">
            O operador <strong>{currentUser?.name}</strong> (@{currentUser?.username}) não possui permissão para operar os monitores da sala <strong>{currentRoom?.name || slug}</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Link
            to="/admin"
            className="px-3.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-900 text-xs font-mono text-white transition"
          >
            Voltar para Salas
          </Link>
          <button
            type="button"
            onClick={() => setOperatorLoginModalOpen(true)}
            className="px-3.5 py-1.5 bg-white text-black text-xs font-mono font-bold uppercase hover:bg-neutral-200 transition"
          >
            Trocar Operador
          </button>
        </div>

        <LoginModal
          isOpen={operatorLoginModalOpen}
          onClose={() => setOperatorLoginModalOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col text-neutral-100 font-sans antialiased overflow-y-auto overflow-x-hidden w-full max-w-full bg-neutral-950 overscroll-contain">
      {/* ============================================================ */}
      {/* CABEÇALHO PRINCIPAL LIMPO E INTUITIVO                         */}
      {/* ============================================================ */}
      {/* ============================================================ */}
      {/* CABEÇALHO PRINCIPAL LIMPO E INTUITIVO                         */}
      {/* ============================================================ */}
      <header className="border-b border-neutral-900 bg-black px-3 py-2 sm:px-5 sm:py-2.5 space-y-2 w-full flex-shrink-0">
        {/* Linha 1: Título da Sala + Status + Ações Principais */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              to="/admin"
              className="p-1 -ml-1 text-neutral-400 hover:text-white sm:hidden flex items-center justify-center flex-shrink-0"
              title="Voltar para Salas"
            >
              <ArrowRight className="h-4 w-4 rotate-180" />
            </Link>
            <h1 className="text-sm sm:text-base font-bold text-white tracking-tight truncate font-mono uppercase">
              {currentRoom?.name || slug}
            </h1>
            {isRoomOnline ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 bg-neutral-950 border border-neutral-900 text-[10px] font-mono text-emerald-400">
                <span className={`h-1.5 w-1.5 rounded-full ${isRoomFull ? "bg-amber-400" : "bg-emerald-400"}`} />
                <span>{devicesCount} TV{devicesCount !== 1 ? "s" : ""}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 bg-neutral-950 border border-neutral-900 text-[10px] font-mono text-neutral-400">
                <span className="h-1.5 w-1.5 rounded-full bg-neutral-700" />
                <span>Offline</span>
              </span>
            )}
          </div>

          {/* Botões de Ação Rápida */}
          <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
            {/* Standby (Desktop) */}
            <button
              onClick={() => {
                const nextStandby = !stateQ.data?.standby;
                setState.mutate({ standby: nextStandby });
              }}
              className={`hidden sm:flex min-h-[28px] px-2 py-0.5 text-xs font-mono font-bold transition items-center justify-center gap-1 ${
                stateQ.data?.standby
                  ? "bg-amber-500 text-black font-extrabold"
                  : "bg-neutral-950 border border-neutral-900 text-neutral-300 hover:text-amber-300 hover:border-amber-500/50"
              }`}
              title="Suspender TV / Standby"
            >
              {stateQ.data?.standby ? <Sun className="h-3 w-3 flex-shrink-0" /> : <Moon className="h-3 w-3 flex-shrink-0" />}
              <span>{stateQ.data?.standby ? "Standby" : "Suspender"}</span>
            </button>

            {/* Rotação de Tela (Desktop) */}
            <button
              onClick={() => {
                const currentRot = Number(stateQ.data?.rotation || 0);
                const nextRot = currentRot === 0 ? 90 : currentRot === 90 ? 180 : currentRot === 180 ? 270 : 0;
                setState.mutate({ rotation: nextRot });
              }}
              className={`hidden sm:flex min-h-[28px] px-2 py-0.5 text-xs font-mono font-bold transition items-center justify-center gap-1 ${
                (stateQ.data?.rotation || 0) !== 0
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "bg-neutral-950 border border-neutral-900 text-neutral-300 hover:text-white hover:bg-neutral-900"
              }`}
              title="Alternar Orientação da Tela da TV (0°, 90°, 180°, 270°)"
            >
              <RotateCw className="h-3 w-3 flex-shrink-0" />
              <span>
                {stateQ.data?.rotation === 90
                  ? "90° Vertical"
                  : stateQ.data?.rotation === 180
                  ? "180°"
                  : stateQ.data?.rotation === 270
                  ? "270° Vertical"
                  : "0° Padrão"}
              </span>
            </button>

            {/* Recarregar (Desktop) */}
            <button
              onClick={() => {
                if (confirm("Deseja recarregar a tela da TV conectada?")) {
                  reloadRoomMut.mutate();
                }
              }}
              disabled={reloadRoomMut.isPending}
              className="hidden sm:flex min-h-[28px] px-2 py-0.5 bg-neutral-950 border border-neutral-900 text-neutral-300 hover:text-white hover:bg-neutral-900 text-xs font-mono transition items-center justify-center gap-1 disabled:opacity-50"
              title="Recarregar tela"
            >
              <RefreshCw className={`h-3 w-3 flex-shrink-0 ${reloadRoomMut.isPending ? "animate-spin text-white" : ""}`} />
              <span>{reloadRoomMut.isPending ? "Recarregando..." : "Recarregar"}</span>
            </button>

            {/* QR Code TV */}
            <button
              onClick={() => setShowQrModal(true)}
              className="min-h-[32px] sm:min-h-[28px] px-2 py-0.5 bg-neutral-950 border border-neutral-900 hover:border-amber-500/50 text-neutral-300 hover:text-amber-300 text-xs font-mono font-bold transition flex items-center justify-center gap-1"
              title="QR Code de Música para Celular da Família"
            >
              <QrCode className="h-3.5 w-3.5 sm:h-3 sm:w-3 flex-shrink-0" />
              <span className="hidden md:inline">QR Música</span>
            </button>

            {/* Ver TV */}
            <a
              href={playerUrl}
              target="_blank"
              rel="noreferrer"
              className="min-h-[32px] sm:min-h-[28px] px-2.5 py-0.5 bg-white text-black hover:bg-neutral-200 text-xs font-mono font-bold transition flex items-center justify-center gap-1"
              title="Abrir Player em nova aba"
            >
              <ExternalLink className="h-3.5 w-3.5 sm:h-3 sm:w-3 flex-shrink-0" />
              <span>Ver TV</span>
            </a>
          </div>
        </div>

        {/* Linha de Ações Rápidas no Mobile (Standby, Rotação e Recarregar em botões grandes) */}
        <div className="grid grid-cols-3 gap-1.5 sm:hidden pt-0.5">
          <button
            onClick={() => {
              const nextStandby = !stateQ.data?.standby;
              setState.mutate({ standby: nextStandby });
            }}
            className={`min-h-[38px] px-1.5 py-1 text-xs font-mono font-bold transition flex items-center justify-center gap-1 border ${
              stateQ.data?.standby
                ? "bg-amber-500 text-black border-amber-400 font-extrabold"
                : "bg-neutral-950 border-neutral-900 text-neutral-300 active:bg-neutral-900"
            }`}
          >
            {stateQ.data?.standby ? <Sun className="h-3.5 w-3.5 flex-shrink-0" /> : <Moon className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" />}
            <span className="truncate">{stateQ.data?.standby ? "Standby" : "Suspender"}</span>
          </button>

          <button
            onClick={() => {
              const currentRot = Number(stateQ.data?.rotation || 0);
              const nextRot = currentRot === 0 ? 90 : currentRot === 90 ? 180 : currentRot === 180 ? 270 : 0;
              setState.mutate({ rotation: nextRot });
            }}
            className={`min-h-[38px] px-1.5 py-1 text-xs font-mono font-bold transition flex items-center justify-center gap-1 border ${
              (stateQ.data?.rotation || 0) !== 0
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                : "bg-neutral-950 border-neutral-900 text-neutral-300 active:bg-neutral-900"
            }`}
            title="Girar tela da TV"
          >
            <RotateCw className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">
              {stateQ.data?.rotation === 90
                ? "90° Vert"
                : stateQ.data?.rotation === 180
                ? "180°"
                : stateQ.data?.rotation === 270
                ? "270° Vert"
                : "0° Pad"}
            </span>
          </button>

          <button
            onClick={() => {
              if (confirm("Deseja recarregar a tela da TV conectada?")) {
                reloadRoomMut.mutate();
              }
            }}
            disabled={reloadRoomMut.isPending}
            className="min-h-[38px] px-1.5 py-1 bg-neutral-950 border border-neutral-900 text-neutral-300 active:bg-neutral-900 text-xs font-mono transition flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 flex-shrink-0 ${reloadRoomMut.isPending ? "animate-spin text-white" : ""}`} />
            <span className="truncate">{reloadRoomMut.isPending ? "..." : "Recarregar"}</span>
          </button>
        </div>

        {/* Linha 2: 3 Abas Principais (Conteúdo, Áudio, Aparelhos) */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-neutral-900">
          <div className="grid grid-cols-3 bg-neutral-950 p-0.5 border border-neutral-900 gap-0.5 w-full sm:w-auto">
            <button
              onClick={() => handleSelectTab("content")}
              className={`flex items-center justify-center gap-1 py-1 px-3 text-xs font-mono transition truncate ${
                activeTab === "content"
                  ? "bg-white text-black font-bold"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <Globe className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">Conteúdo</span>
            </button>
            <button
              onClick={() => handleSelectTab("audio")}
              className={`flex items-center justify-center gap-1 py-1 px-3 text-xs font-mono transition truncate ${
                activeTab === "audio"
                  ? "bg-white text-black font-bold"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <Music className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">Áudio</span>
            </button>
            <button
              onClick={() => handleSelectTab("devices")}
              className={`flex items-center justify-center gap-1 py-1 px-3 text-xs font-mono transition truncate ${
                activeTab === "devices"
                  ? "bg-white text-black font-bold"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <Monitor className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">Aparelhos</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <button
              onClick={handleDeleteRoom}
              disabled={deleteRoomMut.isPending}
              className="min-h-[26px] px-2 py-0.5 border border-neutral-900 bg-neutral-950 text-neutral-400 hover:bg-red-500/10 hover:border-red-900 hover:text-red-400 text-[10px] font-mono transition flex items-center gap-1"
              title="Excluir esta sala"
            >
              <Trash2 className="h-2.5 w-2.5" />
              <span>Excluir Sala</span>
            </button>
          </div>
        </div>
      </header>

      {/* Notificação / Feedback de Recarregamento */}
      {reloadNotice && (
        <div className="bg-black border-b border-emerald-500/50 px-3.5 py-1.5 text-xs font-mono text-emerald-300 flex items-center justify-between flex-shrink-0 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <Check className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
            <span>{reloadNotice}</span>
          </div>
          <button onClick={() => setReloadNotice(null)} className="text-neutral-500 hover:text-white p-0.5">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

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
              className={`flex-1 sm:flex-initial min-h-[32px] px-3 py-1 rounded-none font-bold text-xs transition flex items-center justify-center gap-1.5 border ${
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
              className="flex-1 sm:flex-initial min-h-[32px] px-3 py-1 rounded-none bg-amber-500 text-neutral-950 font-bold text-xs hover:bg-amber-400 transition flex items-center justify-center gap-1.5"
            >
              <Sun className="h-3.5 w-3.5" />
              <span>Retomar Tela da TV</span>
            </button>
          </div>
        </div>
      )}

      <main className="p-2.5 pb-24 sm:p-4 sm:pb-16 max-w-4xl mx-auto w-full min-w-0 space-y-3 sm:space-y-4">
        {/* RESUMO INSTANTÂNEO PARA OPERADOR MOBILE (SOMENTE MOBILE) */}
        <div className="sm:hidden bg-neutral-950 border border-neutral-900 p-2.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`h-2 w-2 rounded-full flex-shrink-0 ${
                isSiteActive ? "bg-emerald-400" : stateQ.data?.standby ? "bg-amber-400" : "bg-neutral-600"
              }`} />
              <span className="font-bold text-white truncate">
                {isSiteActive ? "TV: Transmissão no Ar" : stateQ.data?.standby ? "TV: Standby OLED" : "TV: Aguardando Conteúdo"}
              </span>
            </div>
            <span className="text-[10px] font-mono text-neutral-400 flex-shrink-0">
              {devicesCount} TV{devicesCount !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-neutral-900 text-xs">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <Music className={`h-3.5 w-3.5 flex-shrink-0 ${isAudioPlaying ? "text-emerald-400" : "text-neutral-500"}`} />
              <div className="min-w-0 flex-1">
                <div className="text-[9px] text-neutral-500 uppercase font-mono">Tocando:</div>
                <div className="text-white font-medium text-[11px] truncate">
                  {currentPlayingTrack || (isAudioPlaying ? "Música Ativa" : "Som Pausado")}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="font-mono text-xs font-bold text-neutral-300 bg-neutral-900 px-1.5 py-0.5 border border-neutral-800">
                {Math.round(currentAudioVolume)}%
              </span>
              <button
                type="button"
                onClick={() => handleOptimisticCommand("audio", isAudioPlaying ? "pause" : "play")}
                className={`min-h-[30px] px-2.5 py-0.5 text-xs font-bold uppercase transition flex items-center gap-1 ${
                  isAudioPlaying
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "bg-white text-black font-extrabold"
                }`}
              >
                {isAudioPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                <span>{isAudioPlaying ? "Pausar" : "Tocar"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* ABA 1: CONTEÚDO NA TELA DA TV (SITE / LINK)                   */}
        {/* ============================================================ */}
        {activeTab === "content" && (
          <section
            className={`rounded-none border p-3 sm:p-4 transition-all ${
              isSiteActive
                ? "border-emerald-500/40 bg-neutral-900/50 shadow-sm"
                : "border-neutral-900 bg-neutral-900/30"
            } space-y-3 overflow-hidden w-full`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-neutral-900">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`p-1.5 rounded-none flex-shrink-0 ${
                    isSiteActive ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-neutral-900 text-neutral-400 border border-neutral-900"
                  }`}
                >
                  <Globe className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 flex-wrap">
                    <span>Conteúdo na TV</span>
                    {isSiteActive ? (
                      <span className="text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.2 rounded-none font-bold">
                        No Ar
                      </span>
                    ) : (
                      <span className="text-[10px] bg-neutral-900 text-neutral-400 border border-neutral-900 px-2 py-0.2 rounded-none">
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
                    onClick={() => reloadSiteMut.mutate()}
                    disabled={reloadSiteMut.isPending}
                    className="min-h-[32px] px-2.5 py-1 rounded-none border border-neutral-900 bg-neutral-900 hover:bg-neutral-800 text-xs text-neutral-200 transition flex items-center justify-center gap-1 truncate text-center disabled:opacity-50"
                    title="Recarrega apenas o site na tela"
                  >
                    <RefreshCw className={`h-3 w-3 flex-shrink-0 ${reloadSiteMut.isPending ? "animate-spin text-white" : ""}`} />
                    <span className="truncate">{reloadSiteMut.isPending ? "Recarregando..." : "Recarregar"}</span>
                  </button>
                  <a
                    href={stateQ.data?.siteUrl || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="min-h-[32px] px-2.5 py-1 rounded-none border border-neutral-900 bg-neutral-900 hover:bg-neutral-800 text-xs text-neutral-200 transition flex items-center justify-center gap-1 truncate text-center"
                  >
                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">Abrir</span>
                  </a>
                  <button
                    onClick={handleClearSite}
                    disabled={setState.isPending}
                    className="min-h-[32px] px-2.5 py-1 rounded-none border border-neutral-900 bg-neutral-900 hover:bg-red-500/10 hover:border-red-500/30 text-xs text-red-400 transition flex items-center justify-center gap-1 truncate text-center"
                  >
                    <X className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">Remover</span>
                  </button>
                </div>
              )}
            </div>

            {/* Se o site está ativo, mostra o link atual e metadados da cerimônia com encerramento automático */}
            {isSiteActive && (
              <div className="bg-neutral-950 border border-neutral-900 rounded-none p-3 space-y-2 text-xs text-neutral-200 w-full">
                {stateQ.data?.ceremonyTitle && (
                  <div className="flex items-center gap-2 border-b border-neutral-900/80 pb-2">
                    <span className="text-[10px] font-mono uppercase font-bold text-neutral-400">Cerimônia:</span>
                    <span className="font-bold text-white text-sm">{stateQ.data.ceremonyTitle}</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 overflow-hidden">
                  <div className="truncate flex items-center gap-2 min-w-0 flex-1">
                    <span className="font-semibold text-neutral-400 flex-shrink-0 text-[11px] uppercase font-mono">No Ar:</span>
                    <span className="truncate text-white min-w-0 flex-1 font-mono text-[11px]" title={stateQ.data?.siteUrl || ""}>
                      {stateQ.data?.siteUrl}
                    </span>
                  </div>
                </div>

                {stateQ.data?.ceremonyEndAt && (
                  <div className="pt-2 border-t border-neutral-900/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-emerald-950/20 p-2 border border-emerald-500/20">
                    <div className="flex items-center gap-2 text-emerald-300 font-mono text-xs">
                      <Clock className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                      <span>
                        Encerramento programado para{" "}
                        <strong className="text-white">
                          {new Date(stateQ.data.ceremonyEndAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </strong>
                        {" "}(standby automático ao término)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("Deseja cancelar o encerramento automático e manter a cerimônia em exibição contínua?")) {
                          setState.mutate({ ceremonyEndAt: null });
                        }
                      }}
                      className="px-2 py-0.5 text-[10px] font-mono bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 self-start sm:self-auto"
                    >
                      Remover timer
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* CONTROLE DE ORIENTAÇÃO / ROTAÇÃO DA TV (HORIZONTAL / VERTICAL) - Botão Expansível */}
            <div className="border border-neutral-800 bg-neutral-950 rounded-none overflow-hidden">
              <button
                type="button"
                onClick={() => setIsRotationExpanded(!isRotationExpanded)}
                className="w-full p-2.5 sm:p-3 flex items-center justify-between gap-2 hover:bg-neutral-900/60 transition text-left cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <RotateCw className={`h-4 w-4 text-emerald-400 flex-shrink-0 transition-transform duration-200 ${isRotationExpanded ? "rotate-90" : ""}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                        Orientação da Tela / TV
                      </span>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.2 border border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
                        {stateQ.data?.rotation === 90
                          ? "90° Retrato"
                          : stateQ.data?.rotation === 180
                          ? "180° Invertido"
                          : stateQ.data?.rotation === 270
                          ? "270° Retrato"
                          : "0° Padrão (Horizontal)"}
                      </span>
                    </div>
                    <span className="text-[11px] text-neutral-400 block truncate">
                      Gire a exibição para TVs instaladas na vertical ou horizontal
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 text-neutral-400">
                  <span className="text-[11px] font-mono hidden sm:inline">{isRotationExpanded ? "Ocultar" : "Alterar"}</span>
                  {isRotationExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>

              {isRotationExpanded && (
                <div className="p-2.5 sm:p-3 pt-0 border-t border-neutral-900/80 bg-neutral-950/80 space-y-2">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono text-xs pt-2">
                    {[
                      { deg: 0, label: "0° Padrão", sub: "Horizontal", icon: Tv },
                      { deg: 90, label: "90° Vertical", sub: "Retrato (Direita)", icon: RotateCw },
                      { deg: 180, label: "180° Invertido", sub: "Horizontal", icon: RotateCw },
                      { deg: 270, label: "270° Vertical", sub: "Retrato (Esquerda)", icon: RotateCw },
                    ].map((item) => {
                      const currentRot = Number(stateQ.data?.rotation || 0);
                      const isSelected = currentRot === item.deg;
                      return (
                        <button
                          key={item.deg}
                          type="button"
                          onClick={() => {
                            setState.mutate({ rotation: item.deg });
                          }}
                          disabled={setState.isPending}
                          className={`p-2.5 border transition flex flex-col items-center justify-center gap-1 text-center cursor-pointer ${
                            isSelected
                              ? "bg-emerald-500 text-black border-emerald-400 font-extrabold shadow-sm"
                              : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700 active:bg-neutral-800"
                          }`}
                        >
                          <item.icon className={`h-4 w-4 ${isSelected ? "text-black" : "text-emerald-400"}`} />
                          <span className="font-bold text-xs">{item.label}</span>
                          <span className={`text-[10px] ${isSelected ? "text-black/80 font-medium" : "text-neutral-400 font-normal"}`}>{item.sub}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* SEÇÃO INTEGRADA ADIAŬ: Captura automática de cerimônias ativas com Encerramento Automático */}
            <AdiauSection
              currentSiteUrl={stateQ.data?.siteUrl}
              onApplySiteUrl={(url, att) => {
                setSiteInputUrl(url);
                const endAt = att ? parseAdiauEndTimestamp(att.attendanceEndDate || att.burialDate) : null;
                setState.mutate({
                  siteUrl: url,
                  mode: "site",
                  standby: false,
                  ceremonyEndAt: endAt,
                  ceremonyTitle: att?.deceasedName || null,
                });
              }}
              isApplying={setState.isPending}
            />

            {/* Campo Alternativo para Link Manual / Outro Site */}
            <div className="space-y-1.5 w-full pt-1 border-t border-neutral-900">
              <label className="text-xs font-semibold text-neutral-400 block font-mono">
                Ou cole um link manual de site (painel externo ou URL customizada):
              </label>
              <div className="flex flex-col sm:flex-row items-stretch gap-1.5 w-full">
                <input
                  type="url"
                  placeholder="https://exemplo.com.br/homenagem"
                  value={siteInputUrl}
                  onChange={(e) => setSiteInputUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleApplySite()}
                  className="w-full flex-1 min-w-0 rounded-none border border-neutral-900 bg-neutral-950 px-3 py-2 text-xs text-white placeholder-neutral-500 outline-none focus:border-neutral-500 transition font-mono"
                />
                <button
                  onClick={handleApplySite}
                  disabled={!siteInputUrl.trim() || setState.isPending}
                  className="w-full sm:w-auto min-h-[36px] px-4 py-2 rounded-none bg-neutral-900 hover:bg-neutral-800 border border-neutral-900 text-white font-mono font-bold text-xs uppercase tracking-wider disabled:opacity-40 transition flex items-center justify-center gap-1.5 shadow-xs flex-shrink-0"
                >
                  <Tv className="h-3.5 w-3.5" />
                  <span>Exibir na TV</span>
                </button>
              </div>
              <p className="text-[10px] text-neutral-400 flex items-center gap-1">
                <Info className="h-3 w-3 text-neutral-400 flex-shrink-0" />
                <span>O site abrirá imediatamente em tela cheia na TV conectada à sala.</span>
              </p>
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/* ABA 2: MÚSICA AMBIENTE & SOM DE FUNDO                        */}
        {/* ============================================================ */}
        {activeTab === "audio" && (
          <section className="rounded-none border border-neutral-900 bg-neutral-900/40 p-3 sm:p-4 space-y-3">
            <div className="flex flex-col gap-2 pb-2.5 border-b border-neutral-900">
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-1.5 rounded-none bg-neutral-900 text-neutral-200 border border-neutral-900 flex-shrink-0">
                    <Music className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 truncate">
                      <span>Música Ambiente</span>
                      {isAudioPlaying ? (
                        <span className="text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.2 rounded-none font-bold flex-shrink-0">
                          Tocando
                        </span>
                      ) : (
                        <span className="text-[10px] bg-neutral-900 text-neutral-400 border border-neutral-900 px-2 py-0.2 rounded-none flex items-center gap-1 flex-shrink-0">
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

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => showMusicQrMut.mutate()}
                    disabled={showMusicQrMut.isPending}
                    className="min-h-[32px] px-2.5 py-1 rounded-none bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 text-xs font-mono font-bold flex items-center gap-1.5 transition"
                    title="Exibir QR Code na TV da sala por 10 segundos"
                  >
                    <Tv className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>{showMusicQrMut.isPending ? "Exibindo..." : "QR Code na TV (10s)"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowQrModal(true)}
                    className="min-h-[32px] px-2.5 py-1 rounded-none bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white text-xs font-mono font-medium flex items-center gap-1.5 transition"
                    title="Ver / Imprimir QR Code do Celular da Família"
                  >
                    <QrCode className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="hidden sm:inline">Ver QR Code</span>
                  </button>
                </div>
              </div>

              {qrNotice && (
                <div className="px-3 py-1.5 rounded-none bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-mono font-semibold flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-amber-400" />
                  <span>{qrNotice}</span>
                </div>
              )}
            </div>

            {/* CONTROLE PRINCIPAL DE ÁUDIO: STATUS, BOTÕES E VOLUME (EM PRIMEIRO LUGAR) */}
            <div className="bg-neutral-950 rounded-none border border-neutral-900 p-3 space-y-3 w-full overflow-hidden">
              {/* Botões de Playback e Volume */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 w-full">
                {/* Botões Prev / Play-Pause / Next */}
                <div className="grid grid-cols-[52px_1fr_52px] sm:grid-cols-[auto_1fr_auto] items-center gap-2 sm:gap-1.5 w-full sm:w-auto">
                  <button
                    onClick={() => handleOptimisticCommand("audio", "prev")}
                    disabled={isAudioStreamActive || !activeAudio || activeAudio.items.length === 0}
                    className="min-h-[46px] sm:min-h-[40px] w-full sm:w-10 rounded-none bg-neutral-900 border border-neutral-900 text-neutral-300 hover:text-white hover:bg-neutral-800 flex items-center justify-center transition disabled:opacity-30"
                    title="Música Anterior"
                  >
                    <SkipBack className="h-5 w-5 sm:h-4 sm:w-4" />
                  </button>

                  {isAudioPlaying ? (
                    <button
                      onClick={() => handleOptimisticCommand("audio", "pause")}
                      className="min-h-[46px] sm:min-h-[40px] px-4 rounded-none bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 flex items-center justify-center gap-2 font-bold text-sm sm:text-xs uppercase tracking-wider transition"
                    >
                      <Pause className="h-5 w-5 sm:h-4 sm:w-4 flex-shrink-0" />
                      <span className="truncate">Pausar</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleOptimisticCommand("audio", "play")}
                      className="min-h-[46px] sm:min-h-[40px] px-4 rounded-none bg-white text-black hover:bg-neutral-200 flex items-center justify-center gap-2 font-bold text-sm sm:text-xs uppercase tracking-wider shadow-sm transition"
                    >
                      <Play className="h-5 w-5 sm:h-4 sm:w-4 flex-shrink-0 ml-0.5" />
                      <span className="truncate">Tocar</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleOptimisticCommand("audio", "next")}
                    disabled={isAudioStreamActive || !activeAudio || activeAudio.items.length === 0}
                    className="min-h-[46px] sm:min-h-[40px] w-full sm:w-10 rounded-none bg-neutral-900 border border-neutral-900 text-neutral-300 hover:text-white hover:bg-neutral-800 flex items-center justify-center transition disabled:opacity-30"
                    title="Próxima Música"
                  >
                    <SkipForward className="h-5 w-5 sm:h-4 sm:w-4" />
                  </button>
                </div>

                {/* Volume da Sala: Mesmo design da Visão Geral (botões - e + de 1 em 1 e 5 presets fixos) */}
                <div className="w-full sm:w-72 space-y-2 bg-neutral-900/60 p-2.5 rounded-none border border-neutral-900">
                  <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
                    <span className="uppercase tracking-wider text-[10px]">Volume Som:</span>
                    <span className="text-white font-bold text-xs bg-black px-2 py-0.5 border border-neutral-800">
                      {Math.round(currentAudioVolume)}%
                    </span>
                  </div>

                  <VolumeControlRow
                    value={currentAudioVolume}
                    disabled={!stateQ.data}
                    onChange={(val) => handleOptimisticCommand("audio", "setVolume", val)}
                  />
                </div>
              </div>

              {/* Status Real de Áudio por Aparelho Conectado na Sala */}
              {devicesQ.data?.devices && devicesQ.data.devices.length > 0 && (
                <div className="pt-2 border-t border-neutral-900 space-y-1.5">
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
                          ? { label: "Modo sem áudio nesta tela", cls: "bg-neutral-900 text-neutral-500 border-neutral-900" }
                          : st === "paused"
                          ? { label: "Pausado", cls: "bg-neutral-900 text-neutral-400 border-neutral-900" }
                          : { label: "Aguardando", cls: "bg-neutral-900 text-neutral-400 border-neutral-900" };
                      return (
                        <div
                          key={dev.id}
                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-none bg-neutral-900/70 border border-neutral-900 text-[11px]"
                        >
                          <span className="text-neutral-200 font-medium truncate">{dev.deviceLabel}</span>
                          <span className={`px-1.5 py-0.5 rounded-none border text-[10px] font-bold flex-shrink-0 ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Seletor de 3 Abas: Dropbox, Rádio, Fila */}
            <div className="grid grid-cols-3 bg-neutral-950 border border-neutral-900 p-0.5 rounded-none gap-1 w-full">
              <button
                onClick={() => setBasicAudioTab("dropbox")}
                className={`py-1.5 px-2 rounded-none text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                  basicAudioTab === "dropbox"
                    ? "bg-neutral-800 text-white border border-neutral-900 shadow-sm font-bold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">Pastas de Músicas</span>
              </button>
              <button
                onClick={() => setBasicAudioTab("stream")}
                className={`py-1.5 px-2 rounded-none text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                  basicAudioTab === "stream"
                    ? "bg-neutral-800 text-white border border-neutral-900 shadow-sm font-bold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                <RadioIcon className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">Web Rádio</span>
              </button>
              <button
                onClick={() => setBasicAudioTab("playlist")}
                className={`py-1.5 px-2 rounded-none text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                  basicAudioTab === "playlist"
                    ? "bg-neutral-800 text-white border border-neutral-900 shadow-sm font-bold"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                <ListMusic className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">Fila ({activeAudio?.items?.length || 0})</span>
              </button>
            </div>

            {/* ============================================================ */}
            {/* SUB-ABA: MÚSICAS LOCAIS / DA SALA                            */}
            {/* ============================================================ */}
            {basicAudioTab === "dropbox" && (
              <div className="space-y-3 w-full">
                {/* 1. Aviso quando a biblioteca de músicas não estiver disponível */}
                {!dropboxStatusQ.data?.configured && (
                  <div className="bg-neutral-950 border border-neutral-900 p-6 text-center space-y-2">
                    <FolderOpen className="h-7 w-7 text-neutral-500 mx-auto" />
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                      Biblioteca de Músicas
                    </h4>
                    <p className="text-xs text-neutral-400 max-w-md mx-auto leading-relaxed">
                      A biblioteca é carregada diretamente da pasta de músicas do servidor (<code className="text-neutral-300 font-mono text-[11px]">/home/capgestec/Músicas/signage</code>).
                    </p>
                    {dropboxStatusQ.data?.error && (
                      <p className="text-[11px] text-red-400 font-mono pt-1">
                        {dropboxStatusQ.data.error}
                      </p>
                    )}
                  </div>
                )}

                {/* 2. Barra de Status, Pesquisa e Controles quando conectado */}
                {dropboxStatusQ.data?.configured && (
                  <div className="bg-neutral-950/70 p-3 sm:p-3.5 border border-neutral-900 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-900 pb-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
                        <span className="text-xs font-bold text-white truncate">
                          {dropboxStatusQ.data.accountName || "Biblioteca Local Conectada"}
                        </span>
                        <span className="text-[10px] text-neutral-500 hidden sm:inline truncate">
                          (Pasta: {dropboxStatusQ.data.folder || "signage"})
                        </span>
                        <span className="text-[9px] bg-emerald-950 border border-emerald-800 text-emerald-400 px-1.5 py-0.5 font-mono uppercase tracking-wider">
                          Armazenamento Local
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={handleRefreshDropbox}
                          disabled={isRefreshingDropbox}
                          className="px-2.5 py-1 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold transition flex items-center gap-1"
                          title="Sincronizar e recarregar faixas da biblioteca local"
                        >
                          <RefreshCw className={`h-3 w-3 ${isRefreshingDropbox ? "animate-spin" : ""}`} />
                          <span>Sincronizar</span>
                        </button>
                      </div>
                    </div>

                    {/* Barra de Pesquisa e Filtro de Pastas */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="relative sm:col-span-2">
                        <input
                          type="text"
                          value={dropboxQuery}
                          onChange={(e) => setDropboxQuery(e.target.value)}
                          placeholder="Pesquisar por título, artista, nome da música..."
                          className="w-full bg-neutral-900 border border-neutral-800 pl-8 pr-8 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-600"
                        />
                        <Search className="h-3.5 w-3.5 text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        {dropboxQuery && (
                          <button
                            onClick={() => setDropboxQuery("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white p-1"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Dropdown de Pastas / Categorias */}
                      <div>
                        <select
                          value={dropboxFolder}
                          onChange={(e) => setDropboxFolder(e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-800 px-2.5 py-2 text-xs text-white focus:outline-none focus:border-neutral-600"
                        >
                          <option value="">Todas as Pastas</option>
                          {(dropboxFoldersQ.data?.folders || []).map((f) => (
                            <option key={f} value={f}>
                              Pasta: {f}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Menu Rápido de Pastas */}
                    {(dropboxFoldersQ.data?.folders || []).length > 0 && (
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
                        <button
                          type="button"
                          onClick={() => setDropboxFolder("")}
                          className={`px-2.5 py-1 text-[11px] font-mono font-semibold transition flex items-center gap-1 flex-shrink-0 ${
                            !dropboxFolder
                              ? "bg-white text-black font-bold"
                              : "bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800"
                          }`}
                        >
                          <Sparkles className="h-3 w-3" />
                          <span>Todas</span>
                        </button>
                        {(dropboxFoldersQ.data?.folders || []).map((f) => {
                          const isSel = dropboxFolder === f;
                          return (
                            <button
                              key={f}
                              type="button"
                              onClick={() => setDropboxFolder(isSel ? "" : f)}
                              className={`px-2.5 py-1 text-[11px] font-mono font-semibold transition flex items-center gap-1.5 flex-shrink-0 ${
                                isSel
                                  ? "bg-amber-500 text-black font-bold"
                                  : "bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800"
                              }`}
                            >
                              <Folder className="h-3 w-3" />
                              <span>{f}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Ações em Lote e Contagem */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-neutral-400">
                      <div>
                        <span>
                          {dropboxTracksQ.isLoading ? (
                            "Carregando músicas..."
                          ) : (
                            <>
                              <strong className="text-white font-mono">{filteredDropboxTracks.length}</strong> música
                              {filteredDropboxTracks.length === 1 ? "" : "s"} encontrada
                              {filteredDropboxTracks.length === 1 ? "" : "s"}
                            </>
                          )}
                        </span>
                      </div>

                      {filteredDropboxTracks.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleAddAllDropboxTracks(filteredDropboxTracks, false)}
                            className="px-2.5 py-1 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold transition flex items-center gap-1"
                            title="Adiciona todas as músicas exibidas à fila da sala"
                          >
                            <Plus className="h-3 w-3" />
                            <span>+ Fila Todas</span>
                          </button>
                          <button
                            onClick={() => handleAddAllDropboxTracks(filteredDropboxTracks, true)}
                            className="px-2.5 py-1 bg-white text-black hover:bg-neutral-200 text-xs font-bold transition flex items-center gap-1"
                            title="Coloca todas na fila e inicia a reprodução agora"
                          >
                            <Play className="h-3 w-3" />
                            <span>Tocar Tudo</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Lista de Músicas */}
                    {dropboxTracksQ.isLoading ? (
                      <div className="p-8 text-center text-neutral-500 text-xs flex flex-col items-center justify-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
                        <span>Carregando músicas da biblioteca local...</span>
                      </div>
                    ) : filteredDropboxTracks.length === 0 ? (
                      <div className="p-6 text-center text-neutral-500 text-xs border border-neutral-900 bg-neutral-950/40 space-y-1">
                        <p className="font-semibold text-neutral-400">
                          {dropboxQuery ? "Nenhuma música corresponde à sua pesquisa." : "Nenhum arquivo de áudio encontrado."}
                        </p>
                        <p className="text-[10px]">
                          {dropboxQuery
                            ? "Tente pesquisar por outro nome ou limpe o campo de busca."
                            : "Coloque arquivos de áudio (MP3, M4A, WAV, etc.) na pasta do servidor e clique em Sincronizar."}
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-neutral-900 border border-neutral-900 max-h-[460px] overflow-y-auto">
                        {filteredDropboxTracks.map((item) => {
                          const isJustAdded = addedSuccessId === item.id;
                          return (
                            <div
                              key={item.id}
                              className="p-2.5 bg-neutral-950/90 hover:bg-neutral-900/60 transition flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <div className="w-8 h-8 bg-neutral-900 border border-neutral-800 flex items-center justify-center flex-shrink-0">
                                  <Music className="h-4 w-4 text-neutral-400" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h4 className="text-xs sm:text-sm font-medium text-white truncate">
                                    {item.title}
                                  </h4>
                                  <div className="flex items-center gap-2 text-[10px] text-neutral-500 mt-0.5">
                                    <span className="truncate">{item.folder}</span>
                                    <span>•</span>
                                    <span>{item.sizeFormatted}</span>
                                    {item.durationFormatted && (
                                      <>
                                        <span>•</span>
                                        <span className="font-mono">{item.durationFormatted}</span>
                                      </>
                                    )}
                                    <span>•</span>
                                    <span className="uppercase text-[9px] font-mono text-neutral-600">{item.extension}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 w-full sm:w-auto self-stretch sm:self-center flex-shrink-0 pt-1 sm:pt-0">
                                <button
                                  type="button"
                                  onClick={() => handleAddDropboxTrack(item, false)}
                                  className={`flex-1 sm:flex-initial min-h-[38px] sm:min-h-[30px] px-2.5 text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                                    isJustAdded
                                      ? "bg-neutral-800 text-emerald-400 border border-emerald-500/40 font-bold"
                                      : "bg-neutral-900 border border-neutral-800 text-neutral-300 hover:bg-neutral-800 hover:text-white"
                                  }`}
                                >
                                  {isJustAdded ? (
                                    <>
                                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                      <span>Adicionado!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Plus className="h-3.5 w-3.5" />
                                      <span>+ Fila</span>
                                    </>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAddDropboxTrack(item, true)}
                                  className="flex-1 sm:flex-initial min-h-[38px] sm:min-h-[30px] px-3 bg-white text-black hover:bg-neutral-200 text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                                  title="Adiciona e inicia a reprodução agora na TV"
                                >
                                  <Play className="h-3.5 w-3.5" />
                                  <span>Tocar Agora</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
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
                <div className="bg-neutral-950/70 p-3 rounded-none border border-neutral-900 space-y-2.5 w-full overflow-hidden">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 w-full">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className="text-xs font-semibold text-neutral-400 flex-shrink-0">
                        Lista:
                      </span>
                      <select
                        value={activeAudio?.id || ""}
                        onChange={(e) => handleSelectAudioPlaylist(e.target.value)}
                        className="flex-1 min-w-0 rounded-none border border-neutral-900 bg-neutral-900 px-2.5 py-1.5 text-xs text-white outline-none focus:border-neutral-500 truncate"
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
                        className="min-h-[32px] px-2.5 py-1 rounded-none bg-neutral-900 border border-neutral-900 text-neutral-300 hover:text-white hover:bg-neutral-800 text-xs font-semibold transition flex items-center justify-center gap-1 truncate text-center"
                      >
                        <Plus className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">Nova Lista</span>
                      </button>
                      <button
                        onClick={() => setIsManagingPlaylistsOpen(true)}
                        className="min-h-[32px] px-2.5 py-1 rounded-none bg-neutral-900 border border-neutral-900 text-neutral-300 hover:text-white hover:bg-neutral-800 text-xs font-semibold transition flex items-center justify-center gap-1 truncate text-center"
                        title="Ver todas as listas salvas, selecionar ou excluir"
                      >
                        <ListMusic className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">Gerenciar ({audioPlaylists.length})</span>
                      </button>
                      {activeAudio && activeAudio.items && activeAudio.items.length > 0 && (
                        <button
                          onClick={handleOpenSaveQueue}
                          className="min-h-[32px] px-3 py-1 rounded-none bg-white text-black hover:bg-neutral-200 text-xs font-bold transition flex items-center justify-center gap-1 truncate text-center shadow-xs"
                          title="Salvar esta fila como uma playlist reutilizável"
                        >
                          <Save className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">Salvar Fila</span>
                        </button>
                      )}
                      {activeAudio && activeAudio.items && activeAudio.items.length > 0 && (
                        <button
                          onClick={handleClearPlaylist}
                          className="min-h-[32px] px-2.5 py-1 rounded-none border border-neutral-900 text-neutral-400 hover:text-red-400 hover:bg-red-500/10 text-xs transition text-center truncate"
                          title="Esvazia todas as músicas desta lista"
                        >
                          Limpar Fila
                        </button>
                      )}
                      {activeAudio && (
                        <button
                          onClick={handleDeleteCurrentPlaylist}
                          className="min-h-[32px] px-2.5 py-1 rounded-none border border-neutral-900 text-neutral-400 hover:text-red-400 hover:bg-red-500/10 text-xs transition flex items-center justify-center gap-1"
                          title="Excluir playlist salva permanentemente"
                        >
                          <Trash2 className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="hidden sm:inline">Excluir</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Modos de Repetição e Ordem Aleatória */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-1.5 pt-1.5 border-t border-neutral-900 w-full">
                    <div className="grid grid-cols-3 bg-neutral-900 rounded-none p-0.5 border border-neutral-900 w-full sm:w-auto">
                      <button
                        onClick={() => handleChangeLoopMode("all")}
                        className={`min-h-[28px] px-2 py-0.5 rounded-none text-xs transition flex items-center justify-center gap-1 ${
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
                        className={`min-h-[28px] px-2 py-0.5 rounded-none text-xs transition flex items-center justify-center gap-1 ${
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
                        className={`min-h-[28px] px-2 py-0.5 rounded-none text-xs transition flex items-center justify-center ${
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
                      className={`min-h-[28px] px-2.5 py-0.5 rounded-none border text-xs transition flex items-center justify-center gap-1.5 w-full sm:w-auto ${
                        shuffleActive
                          ? "bg-white text-black font-bold border-white"
                          : "bg-neutral-900 border-neutral-900 text-neutral-400 hover:text-white"
                      }`}
                      title="Ordem Aleatória (Shuffle)"
                    >
                      <Shuffle className="h-3 w-3 flex-shrink-0" />
                      <span>Ordem Aleatória</span>
                    </button>
                  </div>
                </div>

                {/* Bloco de Adicionar Músicas por Link Único */}
                <div className="rounded-none border border-neutral-900 bg-neutral-950/60 p-3 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 w-full">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Plus className="h-3.5 w-3.5 text-neutral-400 flex-shrink-0" />
                      <span>Adicionar Link Direto à Fila (MP3 / Áudio)</span>
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
                      placeholder="Cole link de arquivo MP3, AAC ou stream direto..."
                      value={newTrackUrl}
                      onChange={(e) => setNewTrackUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddTrack(newTrackUrl, newTrackTitle)}
                      className="w-full min-w-0 rounded-none border border-neutral-900 bg-neutral-950 px-3 py-2 text-xs text-white placeholder-neutral-500 outline-none focus:border-neutral-500"
                    />
                    <input
                      placeholder="Nome da música (opcional)"
                      value={newTrackTitle}
                      onChange={(e) => setNewTrackTitle(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddTrack(newTrackUrl, newTrackTitle)}
                      className="w-full min-w-0 rounded-none border border-neutral-900 bg-neutral-950 px-3 py-2 text-xs text-white placeholder-neutral-500 outline-none focus:border-neutral-500"
                    />
                    <button
                      onClick={() => handleAddTrack(newTrackUrl, newTrackTitle)}
                      disabled={!newTrackUrl.trim()}
                      className="w-full sm:w-auto min-h-[36px] px-4 py-2 rounded-none bg-white text-black font-bold text-xs uppercase tracking-wider hover:bg-neutral-200 disabled:opacity-40 transition flex items-center justify-center gap-1 shadow-sm flex-shrink-0"
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
                        className="w-full rounded-none border border-neutral-900 bg-neutral-900/90 pl-8 pr-7 py-1.5 text-xs text-white placeholder-neutral-500 outline-none focus:border-neutral-600"
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
                            className={`flex items-center justify-between gap-2 p-2 rounded-none border transition overflow-hidden w-full ${
                              isCurrentlyPlaying
                                ? "border-neutral-600 bg-neutral-900/80 border-l-2 border-l-white shadow-xs"
                                : "border-neutral-900 bg-neutral-950/40 hover:border-neutral-700"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {/* Botão de Tocar a Faixa */}
                              <button
                                onClick={() => handlePlayTrack(idx)}
                                className={`h-7 w-7 rounded-none flex items-center justify-center transition flex-shrink-0 ${
                                  isCurrentlyPlaying
                                    ? "bg-white text-black shadow-xs font-bold"
                                    : "bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:text-white border border-neutral-900"
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
                                className="h-7 w-7 flex items-center justify-center rounded-none text-neutral-400 hover:text-white hover:bg-neutral-800 disabled:opacity-20 transition"
                                title="Mover para cima"
                              >
                                <ChevronUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleMoveTrack(idx, "down")}
                                disabled={idx === activeAudio.items.length - 1}
                                className="h-7 w-7 flex items-center justify-center rounded-none text-neutral-400 hover:text-white hover:bg-neutral-800 disabled:opacity-20 transition"
                                title="Mover para baixo"
                              >
                                <ChevronDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleRemoveTrack(idx)}
                                className="h-7 w-7 flex items-center justify-center rounded-none text-neutral-400 hover:text-red-400 hover:bg-red-500/10 transition"
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
                    <div className="rounded-none border border-dashed border-neutral-900 p-6 text-center text-xs text-neutral-400 space-y-2">
                      <div>Nenhuma música na lista no momento.</div>
                      <div className="flex items-center justify-center gap-2 pt-1">
                        <button
                          onClick={() => setBasicAudioTab("dropbox")}
                          className="px-3 py-1.5 rounded-none bg-neutral-900 text-neutral-200 border border-neutral-800 text-xs font-semibold hover:bg-neutral-800 hover:text-white transition flex items-center gap-1.5"
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                          <span>Buscar Músicas</span>
                        </button>
                        <button
                          onClick={() => setBasicAudioTab("stream")}
                          className="px-3 py-1.5 rounded-none bg-neutral-900 text-neutral-200 border border-neutral-800 text-xs font-semibold hover:bg-neutral-800 hover:text-white transition flex items-center gap-1.5"
                        >
                          <RadioIcon className="h-3.5 w-3.5" />
                          <span>Sintonizar Web Rádio</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ============================================================ */}
            {/* SUB-ABA 4: SINTONIZAR WEB RÁDIO 24H                          */}
            {/* ============================================================ */}
            {basicAudioTab === "stream" && (
              <div className="rounded-none border border-neutral-900 bg-neutral-950/60 p-3 space-y-3">
                {/* Cabeçalho da Web Rádio */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-900 pb-2">
                  <div className="flex items-center gap-2">
                    <RadioIcon
                      className={`h-4 w-4 ${
                        isAudioStreamActive ? "text-emerald-400 animate-pulse" : "text-neutral-400"
                      }`}
                    />
                    <span className="text-xs font-bold text-white uppercase font-mono">
                      Web Rádios ({savedRadios.length})
                    </span>
                    {isAudioStreamActive && (
                      <span className="text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-none font-bold uppercase tracking-wider">
                        No Ar
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isAudioStreamActive && (
                      <button
                        onClick={handleClearAudioStream}
                        className="px-2 py-1 rounded-none bg-red-500/10 border border-red-500/30 text-[11px] text-red-300 hover:bg-red-500/20 flex items-center gap-1 font-semibold transition"
                      >
                        <X className="h-3 w-3" />
                        <span>Parar</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setIsAddingCustomRadio(!isAddingCustomRadio)}
                      className="px-2.5 py-1 text-[11px] font-mono bg-neutral-900 hover:bg-neutral-850 border border-neutral-900 text-neutral-300 hover:text-white transition flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" />
                      <span>{isAddingCustomRadio ? "Fechar" : "Nova Rádio"}</span>
                    </button>
                  </div>
                </div>

                {/* Mensagens de retorno (validação / sintonização) */}
                {radioStatusMsg && (
                  <div className="flex items-center gap-2 rounded-none border border-emerald-500/30 bg-emerald-950/30 px-2.5 py-1.5 text-xs text-emerald-300 font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-emerald-400" />
                    <span>{radioStatusMsg}</span>
                  </div>
                )}

                {radioErrorMsg && (
                  <div className="flex items-center gap-2 rounded-none border border-amber-500/30 bg-amber-950/30 px-2.5 py-1.5 text-xs text-amber-200">
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
                    <span>{radioErrorMsg}</span>
                  </div>
                )}

                {/* 1. MINHAS RÁDIOS SALVAS */}
                <div className="space-y-2">
                  {/* Formulário de Adicionar Nova Rádio Salva */}
                  {isAddingCustomRadio && (
                    <div className="p-2.5 border border-neutral-900 bg-neutral-950 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input
                        type="text"
                        placeholder="Nome da Rádio"
                        value={newRadioName}
                        onChange={(e) => setNewRadioName(e.target.value)}
                        className="sm:w-48 bg-black border border-neutral-900 px-2.5 py-1.5 text-xs text-white placeholder-neutral-500 outline-none focus:border-neutral-600 font-mono"
                      />
                      <input
                        type="url"
                        placeholder="URL do Stream (https://...)"
                        value={newRadioUrl}
                        onChange={(e) => setNewRadioUrl(e.target.value)}
                        className="flex-1 bg-black border border-neutral-900 px-2.5 py-1.5 text-xs text-white placeholder-neutral-500 outline-none focus:border-neutral-600 font-mono"
                      />
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          type="button"
                          onClick={() => setIsAddingCustomRadio(false)}
                          className="px-2.5 py-1.5 text-xs font-mono bg-neutral-900 border border-neutral-900 text-neutral-400 hover:text-white"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!newRadioUrl.trim()) return;
                            const clean = cleanAudioUrl(newRadioUrl);
                            saveRadio({
                              name: newRadioName.trim() || "Minha Rádio",
                              url: clean,
                              desc: "",
                              isCustom: true,
                            });
                            setNewRadioName("");
                            setNewRadioUrl("");
                            setNewRadioDesc("");
                            setIsAddingCustomRadio(false);
                            setRadioStatusMsg("Rádio salva!");
                            setTimeout(() => setRadioStatusMsg(null), 2500);
                          }}
                          className="px-3 py-1.5 text-xs font-mono bg-white text-black font-bold uppercase hover:bg-neutral-200"
                        >
                          Salvar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Grid de Rádios Salvas */}
                  {savedRadios.length === 0 ? (
                    <div className="p-3 border border-neutral-900 bg-neutral-950 text-center space-y-1">
                      <p className="text-xs text-neutral-300 font-mono">
                        Nenhuma rádio salva.
                      </p>
                      <p className="text-[11px] text-neutral-500">
                        Clique em &quot;Nova Rádio&quot; acima, busque estações no diretório online ou cole uma URL direta de áudio.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto pr-1">
                      {savedRadios.map((station) => {
                        const isThisActive =
                          isAudioStreamActive &&
                          (stateQ.data?.audioStreamUrl || "").trim() === station.url.trim();

                        return (
                          <div
                            key={station.id || station.url}
                            className={`rounded-none border px-2.5 py-2 flex items-center justify-between gap-2 transition ${
                              isThisActive
                                ? "border-emerald-500/60 bg-emerald-950/25"
                                : "border-neutral-900 bg-neutral-900/60 hover:border-neutral-700"
                            }`}
                          >
                            <div className="min-w-0 flex-1 flex items-center gap-1.5">
                              {isThisActive && (
                                <span className="h-2 w-2 rounded-full bg-emerald-400 flex-shrink-0" />
                              )}
                              <span className="text-xs font-bold text-white truncate">
                                {station.name}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  deleteRadio(station.id || station.url);
                                  setRadioStatusMsg(`"${station.name}" removida.`);
                                  setTimeout(() => setRadioStatusMsg(null), 2000);
                                }}
                                className="p-1.5 rounded-none bg-neutral-900 hover:bg-red-950 hover:text-red-300 border border-neutral-900 text-neutral-400 transition"
                                title="Excluir rádio"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  handleTuneRadioStation({
                                    id: station.id,
                                    name: station.name,
                                    category: station.isCustom ? "Salvas" : "Gospel",
                                    description: station.desc || "",
                                    streamUrl: station.url,
                                    codec: "MP3/AAC",
                                    bitrate: 128,
                                    country: "BR",
                                  })
                                }
                                disabled={setState.isPending}
                                className={`px-2.5 py-1.5 rounded-none text-xs font-bold uppercase tracking-wider flex items-center gap-1 transition ${
                                  isThisActive
                                    ? "bg-emerald-500 text-black hover:bg-emerald-400"
                                    : "bg-white text-black hover:bg-neutral-200"
                                }`}
                              >
                                <RadioIcon className="h-3 w-3" />
                                <span>{isThisActive ? "No Ar" : "Tocar"}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 2. BUSCAR RÁDIOS ONLINE */}
                <div className="border-t border-neutral-900 pt-2.5 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 font-mono">
                      Buscar no Diretório Online
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                      {["Gospel", "Instrumental", "Louvor", "Harpa", "Piano"].map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => handleSearchRadios(chip)}
                          className="px-2 py-0.5 rounded-none border border-neutral-900 bg-neutral-900 hover:bg-neutral-800 text-[10px] font-semibold text-neutral-300 hover:text-white transition"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch gap-1.5">
                    <input
                      placeholder="Buscar rádio por nome ou estilo..."
                      value={radioSearchQuery}
                      onChange={(e) => setRadioSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearchRadios()}
                      className="flex-1 rounded-none border border-neutral-900 bg-neutral-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-neutral-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleSearchRadios()}
                      disabled={!radioSearchQuery.trim() || isSearchingRadio}
                      className="min-h-[34px] px-3 py-1.5 rounded-none bg-neutral-800 border border-neutral-900 text-white font-bold text-xs uppercase tracking-wider hover:bg-neutral-700 disabled:opacity-40 transition flex items-center justify-center gap-1.5"
                    >
                      {isSearchingRadio ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Search className="h-3.5 w-3.5" />
                      )}
                      <span>Buscar</span>
                    </button>
                  </div>

                  {radioSearchResults.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-56 overflow-y-auto pr-1">
                      {radioSearchResults.map((station) => {
                        const isThisActive =
                          isAudioStreamActive &&
                          (stateQ.data?.audioStreamUrl || "").trim() === station.streamUrl;
                        return (
                          <div
                            key={station.id}
                            className={`rounded-none border px-2.5 py-1.5 flex items-center justify-between gap-2 ${
                              isThisActive
                                ? "border-emerald-500/60 bg-emerald-950/25"
                                : "border-neutral-900 bg-neutral-900/40"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-white truncate">
                                {station.name}
                              </div>
                              <div className="text-[10px] text-neutral-500 truncate">
                                {station.codec} • {station.bitrate || 128}k
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  if (isRadioSavedInStore(station.streamUrl)) {
                                    deleteRadio(station.streamUrl);
                                  } else {
                                    saveRadio({
                                      name: station.name,
                                      url: station.streamUrl,
                                      desc: "",
                                      isCustom: true,
                                    });
                                  }
                                }}
                                className={`p-1.5 rounded-none border text-[11px] font-mono transition flex items-center ${
                                  isRadioSavedInStore(station.streamUrl)
                                    ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/50"
                                    : "bg-black text-neutral-400 border-neutral-900 hover:text-white"
                                }`}
                                title={isRadioSavedInStore(station.streamUrl) ? "Salva" : "Salvar"}
                              >
                                {isRadioSavedInStore(station.streamUrl) ? (
                                  <BookmarkCheck className="h-3.5 w-3.5" />
                                ) : (
                                  <Bookmark className="h-3.5 w-3.5" />
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleTuneRadioStation(station)}
                                className="px-2.5 py-1.5 rounded-none bg-white text-black text-[11px] font-bold uppercase hover:bg-neutral-200 transition"
                              >
                                {isThisActive ? "No Ar" : "Tocar"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 3. LINK DIRETO (OPCIONAL) */}
                <div className="border-t border-neutral-900 pt-2.5 flex flex-col sm:flex-row items-stretch gap-1.5">
                  <input
                    placeholder="Ou cole a URL direta do stream (MP3/AAC)..."
                    value={audioStreamInputUrl}
                    onChange={(e) => setAudioStreamInputUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleApplyAudioStream()}
                    className="flex-1 rounded-none border border-neutral-900 bg-neutral-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-neutral-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!audioStreamInputUrl.trim()) return;
                      const name = prompt("Nome da Rádio:", "Minha Rádio");
                      if (name) {
                        saveRadio({
                          name: name.trim(),
                          url: cleanAudioUrl(audioStreamInputUrl),
                          desc: "",
                          isCustom: true,
                        });
                        setRadioStatusMsg(`"${name.trim()}" salva!`);
                        setTimeout(() => setRadioStatusMsg(null), 2500);
                      }
                    }}
                    disabled={!audioStreamInputUrl.trim()}
                    className="min-h-[34px] px-2.5 py-1.5 rounded-none bg-neutral-900 border border-neutral-900 text-neutral-300 hover:text-white disabled:opacity-40 transition flex items-center justify-center gap-1 text-xs font-mono"
                    title="Salvar nos favoritos"
                  >
                    <Bookmark className="h-3.5 w-3.5" />
                    <span>Salvar</span>
                  </button>
                  <button
                    onClick={handleApplyAudioStream}
                    disabled={!audioStreamInputUrl.trim() || setState.isPending || isProbingRadio}
                    className="min-h-[34px] px-3 py-1.5 rounded-none bg-white text-black font-bold text-xs uppercase tracking-wider hover:bg-neutral-200 disabled:opacity-40 transition flex items-center justify-center gap-1.5"
                  >
                    {isProbingRadio ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RadioIcon className="h-3.5 w-3.5" />
                    )}
                    <span>{isProbingRadio ? "..." : "Tocar URL"}</span>
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ============================================================ */}
        {/* ABA 3: APARELHOS / TVS CONECTADAS                            */}
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
          <div className="w-full max-w-md rounded-none border border-neutral-900 bg-neutral-950 p-4 sm:p-5 flex flex-col shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-neutral-900">
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
                className="w-full rounded-none border border-neutral-900 bg-neutral-900 px-3 py-2 text-xs text-white placeholder-neutral-500 outline-none focus:border-neutral-500"
                autoFocus
              />

              {activeAudio && (
                <div className="space-y-1 pt-1">
                  <span className="text-[11px] font-semibold text-neutral-400 block">Modo de Salvamento:</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSaveQueueMode("new")}
                      className={`p-2 rounded-none border text-left text-xs transition ${
                        saveQueueMode === "new"
                          ? "border-white bg-neutral-900 text-white font-bold"
                          : "border-neutral-900 bg-neutral-950 text-neutral-400 hover:text-neutral-200"
                      }`}
                    >
                      <div className="font-semibold">Nova Playlist</div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">Cria uma nova playlist independente</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSaveQueueMode("update")}
                      className={`p-2 rounded-none border text-left text-xs transition ${
                        saveQueueMode === "update"
                          ? "border-white bg-neutral-900 text-white font-bold"
                          : "border-neutral-900 bg-neutral-950 text-neutral-400 hover:text-neutral-200"
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

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-900">
              <button
                type="button"
                onClick={() => setSaveQueueModalOpen(false)}
                className="min-h-[34px] px-3.5 rounded-none border border-neutral-900 bg-neutral-900 text-xs text-neutral-300 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveQueue}
                disabled={!saveQueueName.trim() || isSavingQueue}
                className="min-h-[34px] flex items-center gap-1.5 px-4 rounded-none bg-white text-xs font-bold text-black hover:bg-neutral-200 disabled:opacity-40"
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
          <div className="w-full max-w-lg rounded-none border border-neutral-900 bg-neutral-950 p-4 sm:p-5 flex flex-col shadow-2xl space-y-3 max-h-[90dvh]">
            <div className="flex items-center justify-between pb-2.5 border-b border-neutral-900">
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
              Cole sua lista de links de arquivos de áudio MP3, AAC ou streams (um por linha). O sistema adiciona diretamente à fila da sala.
            </p>

            <textarea
              rows={8}
              placeholder={`https://meusite.com/musica1.mp3\nhttps://meusite.com/musica2.mp3\nhttps://exemplo.com/stream`}
              value={multiLinksText}
              onChange={(e) => setMultiLinksText(e.target.value)}
              className="w-full rounded-none border border-neutral-900 bg-neutral-950 p-3 text-xs text-white placeholder-neutral-600 outline-none focus:border-neutral-500 font-mono"
            />

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-900">
              <button
                onClick={() => setShowMultiLinksModal(false)}
                className="min-h-[34px] px-3.5 rounded-none border border-neutral-900 bg-neutral-900 text-xs text-neutral-300 hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddMultipleTracks}
                disabled={!multiLinksText.trim()}
                className="min-h-[34px] flex items-center gap-1.5 px-4 rounded-none bg-white text-xs font-bold text-black hover:bg-neutral-200 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Adicionar à Playlist</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL DE QR CODE PARA CELULAR DA FAMÍLIA                     */}
      {/* ============================================================ */}
      <MusicQrModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        roomName={currentRoom?.name || slug}
        slug={slug}
        musicUrl={musicUrl}
        qrSvgUrl={qrSvgUrl}
        onShowOnTv={() => showMusicQrMut.mutate()}
        isSendingToTv={showMusicQrMut.isPending}
        qrNotice={qrNotice}
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

      <LoginModal
        isOpen={operatorLoginModalOpen}
        onClose={() => setOperatorLoginModalOpen(false)}
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
      className={`rounded-none border transition-all ${
        isFull
          ? "border-amber-500/30 bg-neutral-900/40"
          : count > 0
          ? "border-neutral-900 bg-neutral-900/30"
          : "border-neutral-900 bg-neutral-900/20"
      } p-3 sm:p-4 space-y-3`}
    >
      {/* Header do Card de Dispositivos */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-neutral-900">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`p-1.5 rounded-none flex-shrink-0 ${
              isFull
                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                : count > 0
                ? "bg-neutral-900 text-neutral-200 border border-neutral-900"
                : "bg-neutral-900 text-neutral-400 border border-neutral-900"
            }`}
          >
            <Tv className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 flex-wrap">
              <span>TVs Conectadas</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-none font-mono font-bold border truncate ${
                  isFull
                    ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                    : count > 0
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                    : "bg-neutral-900 text-neutral-400 border-neutral-900"
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
            className="w-full sm:w-auto min-h-[32px] flex items-center justify-center gap-1 rounded-none bg-neutral-900 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/40 text-neutral-400 border border-neutral-900 px-3 py-1 text-xs font-semibold transition disabled:opacity-40"
          >
            <LogOut className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">Desconectar Todas ({count})</span>
          </button>
        )}
      </div>

      {/* Lista de Telas Conectadas e Vagas Disponíveis */}
      <div className="rounded-none border border-neutral-900 bg-neutral-950/70 overflow-hidden divide-y divide-neutral-800/80">
        {/* Telas Conectadas */}
        {devices.map((device, idx) => (
          <div
            key={device.id}
            className="p-3 sm:px-4 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-neutral-900/40 transition"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative p-2 rounded-none bg-neutral-900 border border-neutral-900 flex-shrink-0 text-neutral-200">
                <Monitor className="h-4 w-4" />
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 animate-pulse border border-neutral-950" />
              </div>

              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs sm:text-sm font-bold text-white truncate">
                    {device.deviceLabel}
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.2 rounded-none bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                    Vaga #{idx + 1}
                  </span>
                  <span className="text-[10px] text-neutral-500 font-mono">
                    IP: {device.ip || "localhost"}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-neutral-400 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1 font-medium ${
                      device.audioState?.state === "playing"
                        ? "text-emerald-400"
                        : device.audioState?.state === "blocked"
                        ? "text-amber-400"
                        : device.audioState?.state === "error"
                        ? "text-red-400"
                        : "text-neutral-400"
                    }`}
                  >
                    {device.audioState?.state === "playing"
                      ? "Áudio ativo"
                      : device.audioState?.state === "blocked"
                      ? "Áudio bloqueado (requer interação na TV)"
                      : device.audioState?.state === "loading"
                      ? "Carregando áudio..."
                      : device.audioState?.state === "error"
                      ? (device.audioState.detail ? `Erro: ${device.audioState.detail}` : "Erro de áudio")
                      : device.audioState?.state === "disabled"
                      ? "Som desativado nesta tela"
                      : "Tela conectada"}
                  </span>
                  <span className="text-neutral-600">•</span>
                  <span className="text-[10px] text-neutral-500 flex items-center gap-1 font-mono">
                    <Clock className="h-2.5 w-2.5" />
                    <span>Conectada {formatConnectedTime(device.connectedAt)}</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 flex-shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-neutral-900">
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
                className="min-h-[30px] px-3 py-1 rounded-none border border-neutral-900 bg-neutral-900 hover:bg-red-500/15 hover:border-red-500/30 hover:text-red-300 text-neutral-300 text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-40"
              >
                <LogOut className="h-3 w-3 flex-shrink-0" />
                <span>Desconectar Tela</span>
              </button>
            </div>
          </div>
        ))}

        {/* Vagas Livres em Formato de Linha */}
        {Array.from({ length: emptySlotsCount }).map((_, i) => {
          const slotNum = count + i + 1;
          return (
            <div
              key={`empty-slot-${slotNum}`}
              className="p-3 sm:px-4 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-neutral-950/40 text-neutral-400 hover:bg-neutral-950/70 transition"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-none border border-dashed border-neutral-900 bg-neutral-900/40 text-neutral-600 flex-shrink-0">
                  <Tv className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-neutral-300 flex items-center gap-2">
                    <span>Vaga #{slotNum} Disponível</span>
                    <span className="text-[9px] uppercase px-1.5 py-0.2 rounded-none border border-dashed border-neutral-900 text-neutral-500">
                      Livre
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500">
                    Aguardando aparelho conectar ou abra o link do player nesta TV.
                  </p>
                </div>
              </div>

              <a
                href={playerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-none bg-neutral-900 border border-neutral-900 text-neutral-300 hover:text-white hover:bg-neutral-850 text-xs font-semibold transition flex-shrink-0"
              >
                <ExternalLink className="h-3 w-3" />
                <span>Conectar TV Nesta Vaga</span>
              </a>
            </div>
          );
        })}
      </div>

      <div className="text-[10px] text-neutral-500 pt-1 border-t border-neutral-900 flex items-center gap-1.5">
        <Info className="h-3 w-3 text-neutral-500 flex-shrink-0" />
        <span>Ao desconectar, a TV vai para o lobby e pode se reconectar quando desejar.</span>
      </div>
    </section>
  );
}

/**
 * Modal para visualizar, copiar e imprimir QR Code de Música para Celular da Família
 */
function MusicQrModal({
  isOpen,
  onClose,
  roomName,
  slug: _slug,
  musicUrl,
  qrSvgUrl,
  onShowOnTv,
  isSendingToTv,
  qrNotice,
}: {
  isOpen: boolean;
  onClose: () => void;
  roomName: string;
  slug: string;
  musicUrl: string;
  qrSvgUrl: string;
  onShowOnTv: () => void;
  isSendingToTv: boolean;
  qrNotice: string | null;
}) {
  const [copied, setCopied] = useState(false);
  if (!isOpen) return null;

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(musicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QR Code de Música - Pagliaro</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fff; color: #111; }
          .card { text-align: center; border: 4px solid #111; border-radius: 24px; padding: 48px; max-width: 420px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
          .badge { display: inline-block; background: #000; color: #fff; font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.15em; padding: 6px 16px; border-radius: 999px; margin-bottom: 20px; }
          h1 { margin: 0 0 8px 0; font-size: 38px; font-weight: 900; letter-spacing: 0.05em; }
          p { margin: 0 0 24px 0; font-size: 18px; color: #555; }
          .qr { width: 260px; height: 260px; margin: 0 auto 24px auto; display: block; }
          .tip { font-size: 16px; font-weight: 600; color: #222; margin-top: 12px; }
          .footer { margin-top: 32px; font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.2em; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">Músicas & Homenagens</div>
          <h1>PAGLIARO</h1>
          <p>${roomName}</p>
          <img class="qr" src="${qrSvgUrl}" alt="QR Code" />
          <div class="tip">Aponte a câmera do celular para escolher as músicas da sala</div>
          <div class="footer">Serviços Sociais Pagliaro</div>
        </div>
        <script>window.onload = function() { window.print(); }<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-6 shadow-2xl space-y-5 text-center">
        <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
          <div className="flex items-center gap-2 text-amber-400">
            <QrCode className="h-5 w-5" />
            <span className="font-bold text-sm text-white">QR Code • Celular da Família</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-1">
          <h3 className="text-xl font-extrabold uppercase tracking-wider text-white">Pagliaro</h3>
          <p className="text-xs text-neutral-400">{roomName} • Controle de Músicas</p>
        </div>

        {/* Imagem do QR Code */}
        <div className="bg-white p-4 rounded-2xl inline-block shadow-lg mx-auto">
          <img src={qrSvgUrl} alt="QR Code Música" className="w-48 h-48 block" />
        </div>

        <p className="text-xs text-neutral-400 max-w-xs mx-auto">
          A família pode escanear com a câmera do celular para escolher músicas da sala, pausar, avançar e regular o volume.
        </p>

        {qrNotice && (
          <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-bold animate-in fade-in">
            {qrNotice}
          </div>
        )}

        {/* Copiar Link */}
        <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-xl p-1.5 pl-3">
          <span className="text-xs font-mono text-neutral-300 truncate flex-1 text-left">
            {musicUrl}
          </span>
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-white flex items-center gap-1.5 transition flex-shrink-0"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? "Copiado!" : "Copiar"}</span>
          </button>
        </div>

        {/* Botões de Ação */}
        <div className="grid grid-cols-3 gap-2 pt-1 font-mono">
          <button
            type="button"
            onClick={onShowOnTv}
            disabled={isSendingToTv}
            className="py-2.5 px-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-black font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition shadow"
            title="Exibir este QR Code na tela da TV por 10 segundos"
          >
            <Tv className="h-4 w-4" />
            <span>Na TV (10s)</span>
          </button>

          <a
            href={musicUrl}
            target="_blank"
            rel="noreferrer"
            className="py-2.5 px-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition border border-neutral-800"
          >
            <ExternalLink className="h-4 w-4" />
            <span>Abrir</span>
          </a>

          <button
            type="button"
            onClick={handlePrint}
            className="py-2.5 px-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition border border-neutral-800"
          >
            <Printer className="h-4 w-4" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>
    </div>
  );
}

