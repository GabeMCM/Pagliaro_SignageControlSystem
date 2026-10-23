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
}

/**
 * Seletor de Volume Estilo Roleta (UIDatePicker Wheel Picker)
 */
function VolumeWheelPicker({ value, onChange }: VolumeWheelPickerProps) {
  const ITEM_HEIGHT = 38;
  const numbers = useMemo(() => Array.from({ length: 101 }, (_, i) => i), []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isUserInteractingRef = useRef(false);
  const debounceTimerRef = useRef<any>(null);
  const [currentVal, setCurrentVal] = useState<number>(Math.round(value));

  useEffect(() => {
    const rounded = Math.round(value);
    setCurrentVal(rounded);
    if (!isUserInteractingRef.current && scrollRef.current) {
      scrollRef.current.scrollTo({
        top: rounded * ITEM_HEIGHT,
        behavior: "smooth",
      });
    }
  }, [value]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    isUserInteractingRef.current = true;
    const top = e.currentTarget.scrollTop;
    const idx = Math.max(0, Math.min(100, Math.round(top / ITEM_HEIGHT)));
    setCurrentVal(idx);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      isUserInteractingRef.current = false;
      onChange(idx);
      if (scrollRef.current) {
        scrollRef.current.scrollTo({
          top: idx * ITEM_HEIGHT,
          behavior: "smooth",
        });
      }
    }, 120);
  };

  const handleSelect = (num: number) => {
    isUserInteractingRef.current = false;
    setCurrentVal(num);
    onChange(num);
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: num * ITEM_HEIGHT,
        behavior: "smooth",
      });
    }
  };

  const step = (delta: number) => {
    const next = Math.max(0, Math.min(100, currentVal + delta));
    handleSelect(next);
  };

  return (
    <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
      <div className="flex items-center gap-2 justify-center w-full sm:w-auto">
        <button
          onClick={() => step(-1)}
          disabled={currentVal <= 0}
          className="h-10 w-10 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 disabled:opacity-20 flex items-center justify-center transition flex-shrink-0"
          title="Diminuir 1%"
        >
          <Minus className="h-4 w-4" />
        </button>

        {/* Tambor Cilíndrico da Roleta (UIDatePicker Style) */}
        <div className="relative h-[114px] w-28 sm:w-32 overflow-hidden rounded-2xl border border-neutral-800 bg-black/95 shadow-inner select-none flex-shrink-0">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-9 bg-gradient-to-b from-neutral-950 via-neutral-950/80 to-transparent z-20" />
          <div className="pointer-events-none absolute inset-x-0 top-[38px] h-[38px] border-y border-blue-500/50 bg-blue-500/15 z-10 shadow-[0_0_12px_rgba(59,130,246,0.2)] flex items-center justify-end pr-2.5">
            <span className="text-[10px] font-black text-blue-400 font-mono">%</span>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t from-neutral-950 via-neutral-950/80 to-transparent z-20" />

          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="h-full overflow-y-auto snap-y snap-mandatory scrollbar-none py-[38px]"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {numbers.map((num) => {
              const isSelected = currentVal === num;
              const dist = Math.abs(currentVal - num);
              return (
                <div
                  key={num}
                  onClick={() => handleSelect(num)}
                  className={`h-[38px] flex items-center justify-center snap-center cursor-pointer font-mono transition-all duration-100 ${
                    isSelected
                      ? "text-lg font-black text-white scale-110"
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
          onClick={() => step(1)}
          disabled={currentVal >= 100}
          className="h-10 w-10 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 disabled:opacity-20 flex items-center justify-center transition flex-shrink-0"
          title="Aumentar 1%"
        >
          <Plus className="h-4 w-4" />
        </button>

        <button
          onClick={() => onChange(currentVal > 0 ? 0 : 100)}
          className={`h-10 w-10 rounded-xl border flex items-center justify-center transition flex-shrink-0 ${
            currentVal === 0
              ? "bg-red-500/20 border-red-500/40 text-red-300"
              : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:text-white"
          }`}
          title={currentVal === 0 ? "Desmutar" : "Mudo"}
        >
          {currentVal === 0 ? (
            <VolumeX className="h-4 w-4 text-red-400" />
          ) : (
            <Volume2 className="h-4 w-4 text-blue-400" />
          )}
        </button>
      </div>

      <div className="flex items-center gap-2 justify-center sm:justify-start">
        <span className="text-xs text-neutral-400 font-semibold">Volume:</span>
        <span className="text-base font-black text-white font-mono bg-neutral-900 px-2.5 py-0.5 rounded-lg border border-neutral-800">
          {currentVal}%
        </span>
      </div>
    </div>
  );
}

function RoomOperator() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const router = useRouter();

  // Modo de operação: Básico (padrão, limpo) ou Avançado (todas as features)
  const [viewMode, setViewMode] = useState<"basic" | "advanced">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("signage_view_mode") as "basic" | "advanced") || "basic";
    }
    return "basic";
  });

  const handleSetViewMode = (mode: "basic" | "advanced") => {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("signage_view_mode", mode);
    }
  };

  // Sub-abas do Modo Avançado
  const [advancedTab, setAdvancedTab] = useState<"control" | "playlists" | "editor">("control");
  const [editingPlaylistId, setEditingPlaylistId] = useState<string>("new");

  // Consultas de dados com intervalos mais suaves para poupar celulares antigos
  // O WebSocket já realiza invalidação em tempo real para mudanças instantâneas!
  const roomsQ = useQuery({
    queryKey: ["rooms"],
    queryFn: signageApi.listRooms,
    refetchInterval: 8000,
  });
  const currentRoom = roomsQ.data?.find((r) => r.slug === slug);

  const stateQ = useQuery({
    queryKey: ["state", slug],
    queryFn: () => signageApi.getState(slug),
    refetchInterval: 6000,
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
    }) => signageApi.setState(slug, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["state", slug] }),
  });

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
  const [ytSearchError, setYtSearchError] = useState<string | null>(null);
  const [addedSuccessId, setAddedSuccessId] = useState<string | null>(null);

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
  const currentAudioVolume = stateQ.data?.audioVolume ?? 100;
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

  // Sincronização via WebSocket para atualização instantânea (não consome vaga de TV)
  useEffect(() => {
    const wsUrl = API_BASE.replace("http", "ws");
    const ws = new WebSocket(`${wsUrl}/ws/${slug}?role=admin`);

    ws.onmessage = () => {
      qc.invalidateQueries({ queryKey: ["state", slug] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
      qc.invalidateQueries({ queryKey: ["playlists"] });
      qc.invalidateQueries({ queryKey: ["roomDevices", slug] });
    };

    return () => ws.close();
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

  // Funções do Modo Avançado
  const [selectedVisual, setSelectedVisual] = useState<string | null>(null);
  const [selectedAudio, setSelectedAudio] = useState<string | null>(null);

  const handleEditPlaylist = (id: string) => {
    setEditingPlaylistId(id);
    setAdvancedTab("editor");
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
      <header className="border-b border-neutral-800/80 bg-neutral-950 px-3 py-3.5 sm:px-6 sm:py-4 space-y-3 w-full flex-shrink-0">
        {/* Linha 1: Título da Sala + Status + Ações Principais */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                Sala
              </span>
              {/* Badge de Status Simples e Direto */}
              {isRoomOnline ? (
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border truncate ${
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
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-900 text-neutral-400 border border-neutral-800">
                  <span className="h-2 w-2 rounded-full bg-neutral-600 flex-shrink-0" />
                  <span>Nenhuma TV</span>
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight truncate mt-0.5">
              {currentRoom?.name || slug}
            </h1>
          </div>

          {/* Botões de Controle Rápido da TV: 3 colunas iguais no mobile */}
          <div className="grid grid-cols-3 gap-1.5 w-full sm:w-auto sm:flex sm:items-center sm:gap-2 pt-0.5 sm:pt-0">
            {/* Standby / Suspender TV */}
            <button
              onClick={() => {
                const nextStandby = !stateQ.data?.standby;
                if (
                  confirm(
                    nextStandby
                      ? "Ativar Modo Standby? A TV exibirá data, relógio e clima de Uberaba-MG (som pausado)."
                      : "Retomar a exibição normal na TV?"
                  )
                ) {
                  setState.mutate({ standby: nextStandby });
                }
              }}
              className={`min-h-[40px] px-2 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm text-center truncate ${
                stateQ.data?.standby
                  ? "bg-amber-500 text-neutral-950 hover:bg-amber-400 font-extrabold"
                  : "bg-neutral-900 border border-neutral-700/80 text-neutral-200 hover:border-amber-500 hover:text-amber-300"
              }`}
              title="Pausa tela e som sem desligar a TV da tomada"
            >
              {stateQ.data?.standby ? <Sun className="h-4 w-4 flex-shrink-0" /> : <Moon className="h-4 w-4 flex-shrink-0" />}
              <span className="truncate">{stateQ.data?.standby ? "Standby" : "Suspender"}</span>
            </button>

            {/* Recarregar TV */}
            <button
              onClick={() => {
                if (confirm("Deseja recarregar a tela da TV conectada?")) {
                  signageApi.reloadRoom(slug);
                }
              }}
              className="min-h-[40px] px-2 sm:px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700 text-xs font-medium transition flex items-center justify-center gap-1.5 text-center truncate"
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
              className="min-h-[40px] px-2 sm:px-3.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500 hover:text-black text-xs font-bold transition flex items-center justify-center gap-1.5 text-center truncate"
              title="Abre o visualizador da TV nesta aba"
            >
              <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">Ver TV</span>
            </a>
          </div>
        </div>

        {/* Linha 2: Seletor de Modo Limpo com Explicação Humana */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1 border-t border-neutral-800/60">
          <div className="grid grid-cols-2 bg-neutral-900 p-1 rounded-xl border border-neutral-800 gap-1 w-full sm:w-auto">
            <button
              onClick={() => handleSetViewMode("basic")}
              className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-bold transition truncate ${
                viewMode === "basic"
                  ? "bg-emerald-500 text-neutral-950 shadow-sm"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <Sparkles className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">Modo Básico</span>
            </button>
            <button
              onClick={() => handleSetViewMode("advanced")}
              className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-bold transition truncate ${
                viewMode === "advanced"
                  ? "bg-neutral-800 text-emerald-400 border border-neutral-700 shadow-sm"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <Wrench className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">Modo Avançado</span>
            </button>
          </div>

          <p className="text-[11px] text-neutral-400 text-center sm:text-right hidden sm:block">
            {viewMode === "basic"
              ? "Focado no dia a dia: Site na tela e controle de som/músicas."
              : "Todas as ferramentas: Playlists de fotos/vídeos e upload de mídias."}
          </p>
        </div>
      </header>

      {/* Banner de Standby Ativo */}
      {stateQ.data?.standby && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-200 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Moon className="h-5 w-5 text-amber-400 flex-shrink-0 animate-pulse" />
            <div className="text-xs sm:text-sm">
              <strong>Modo Standby Ativo:</strong> A TV está exibindo relógio, data e previsão do tempo de Uberaba-MG (com som pausado).
            </div>
          </div>
          <button
            onClick={() => setState.mutate({ standby: false })}
            className="w-full sm:w-auto min-h-[40px] px-4 py-2 rounded-lg bg-amber-500 text-neutral-950 font-bold text-xs hover:bg-amber-400 transition flex items-center justify-center gap-2 shadow"
          >
            <Sun className="h-4 w-4" />
            <span>Retomar Exibição na TV</span>
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* 1. MODO BÁSICO (Simples, organizado e rápido para celulares) */}
      {/* ============================================================ */}
      {viewMode === "basic" ? (
        <main className="p-3 pb-28 sm:p-5 sm:pb-16 md:p-8 md:pb-20 space-y-4 sm:space-y-6 max-w-4xl mx-auto w-full min-w-0">
          {/* CARD 1: O QUE ESTÁ NA TELA DA TV (SITE / LINK) */}
          <section
            className={`rounded-2xl border p-3.5 sm:p-6 transition-all ${
              isSiteActive
                ? "border-emerald-500/50 bg-neutral-900/60 shadow-md"
                : "border-neutral-800 bg-neutral-900/30"
            } space-y-3.5 sm:space-y-4 overflow-hidden w-full`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <div
                  className={`p-2 sm:p-2.5 rounded-xl flex-shrink-0 ${
                    isSiteActive ? "bg-emerald-500/20 text-emerald-400" : "bg-neutral-800 text-neutral-400"
                  }`}
                >
                  <Globe className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm sm:text-lg font-bold text-white flex items-center gap-2 flex-wrap">
                    <span>Conteúdo na TV</span>
                    {isSiteActive ? (
                      <span className="text-[10px] sm:text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                        No Ar
                      </span>
                    ) : (
                      <span className="text-[10px] sm:text-[11px] bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded-full">
                        Inativo
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-neutral-400 mt-0.5 truncate">
                    Exiba cardápio, memorial ou página na TV.
                  </p>
                </div>
              </div>

              {/* Ações quando o site já está ativo */}
              {isSiteActive && (
                <div className="grid grid-cols-3 gap-1.5 w-full sm:w-auto sm:flex sm:items-center">
                  <button
                    onClick={() => signageApi.reloadSite(slug)}
                    className="min-h-[36px] px-2 py-1.5 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 transition flex items-center justify-center gap-1 truncate text-center"
                    title="Recarrega apenas o site na tela"
                  >
                    <RefreshCw className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">Recarregar</span>
                  </button>
                  <a
                    href={stateQ.data?.siteUrl || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="min-h-[36px] px-2 py-1.5 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 transition flex items-center justify-center gap-1 truncate text-center"
                  >
                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">Abrir</span>
                  </a>
                  <button
                    onClick={handleClearSite}
                    disabled={setState.isPending}
                    className="min-h-[36px] px-2 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500 hover:text-white text-xs text-red-300 transition flex items-center justify-center gap-1 truncate text-center"
                  >
                    <X className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">Remover</span>
                  </button>
                </div>
              )}
            </div>

            {/* Se o site está ativo, mostra o link atual de forma limpa */}
            {isSiteActive && (
              <div className="bg-emerald-950/20 border border-emerald-500/25 rounded-xl p-3 text-xs text-emerald-200 flex items-center justify-between gap-2 overflow-hidden w-full">
                <div className="truncate flex items-center gap-2 min-w-0 flex-1">
                  <span className="font-semibold text-emerald-400 flex-shrink-0">Link Atual:</span>
                  <span className="truncate text-white min-w-0 flex-1">{stateQ.data?.siteUrl}</span>
                </div>
              </div>
            )}

            {/* Campo para Colocar Novo Link */}
            <div className="space-y-2 w-full">
              <label className="text-xs font-semibold text-neutral-300 block">
                {isSiteActive ? "Trocar por outro link:" : "Cole o link para exibir na TV:"}
              </label>
              <div className="flex flex-col sm:flex-row items-stretch gap-2 w-full">
                <input
                  type="url"
                  placeholder="https://exemplo.com.br/homenagem"
                  value={siteInputUrl}
                  onChange={(e) => setSiteInputUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleApplySite()}
                  className="w-full flex-1 min-w-0 rounded-xl border border-neutral-700 bg-neutral-950 px-3.5 py-3 text-base sm:text-sm text-white placeholder-neutral-500 outline-none focus:border-emerald-500 transition"
                />
                <button
                  onClick={handleApplySite}
                  disabled={!siteInputUrl.trim() || setState.isPending}
                  className="w-full sm:w-auto min-h-[46px] px-5 py-3 rounded-xl bg-emerald-500 text-neutral-950 font-bold text-xs uppercase tracking-wider hover:bg-emerald-400 disabled:opacity-40 transition flex items-center justify-center gap-2 shadow flex-shrink-0"
                >
                  <Tv className="h-4 w-4" />
                  <span>Exibir na TV</span>
                </button>
              </div>
              <p className="text-[11px] text-neutral-400 flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-neutral-400 flex-shrink-0" />
                <span>O site abrirá imediatamente em tela cheia na TV conectada.</span>
              </p>
            </div>
          </section>

          {/* CARD 2: MÚSICA AMBIENTE & SOM DE FUNDO (YOUTUBE STREAMING ZERO STORAGE) */}
          <section className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-3.5 sm:p-6 space-y-4 sm:space-y-5">
            <div className="flex flex-col gap-3 pb-3 border-b border-neutral-800">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div className="p-2 sm:p-2.5 rounded-xl bg-blue-500/20 text-blue-400 flex-shrink-0">
                    <Music className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2 truncate">
                      <span>Música Ambiente</span>
                      {isAudioPlaying ? (
                        <span className="text-[10px] sm:text-[11px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-bold flex-shrink-0">
                          Tocando
                        </span>
                      ) : (
                        <span className="text-[10px] sm:text-[11px] bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0">
                          <Pause className="h-3 w-3" />
                          <span>Pausado</span>
                        </span>
                      )}
                    </h2>
                    <p className="text-[11px] sm:text-xs text-neutral-400 mt-0.5 truncate">
                      YouTube (Álbuns & Hinos sem anúncios), MP3 e Rádios Web.
                    </p>
                  </div>
                </div>
              </div>

              {/* Seletor de 4 Abas para Mobile: Buscar, Importar, Fila, Rádio */}
              <div className="grid grid-cols-2 sm:grid-cols-4 bg-neutral-950 border border-neutral-800 p-1 rounded-xl gap-1 w-full">
                <button
                  onClick={() => setBasicAudioTab("youtube")}
                  className={`py-2 px-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                    basicAudioTab === "youtube"
                      ? "bg-red-600 text-white shadow font-bold"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <Search className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">Buscar YouTube</span>
                </button>
                <button
                  onClick={() => setBasicAudioTab("playlist_import")}
                  className={`py-2 px-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                    basicAudioTab === "playlist_import"
                      ? "bg-purple-600 text-white shadow font-bold"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <Disc className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">Importar Playlist</span>
                </button>
                <button
                  onClick={() => setBasicAudioTab("playlist")}
                  className={`py-2 px-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                    basicAudioTab === "playlist"
                      ? "bg-blue-600 text-white shadow font-bold"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <ListMusic className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">Fila ({activeAudio?.items?.length || 0})</span>
                </button>
                <button
                  onClick={() => setBasicAudioTab("stream")}
                  className={`py-2 px-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
                    basicAudioTab === "stream"
                      ? "bg-blue-600 text-white shadow font-bold"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <RadioIcon className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">Web Rádio</span>
                </button>
              </div>
            </div>

            {/* CONTROLE PRINCIPAL DE ÁUDIO: STATUS, BOTÕES GRANDES E VOLUME */}
            <div className="bg-neutral-950/80 rounded-2xl border border-neutral-800 p-3.5 sm:p-4 space-y-4 w-full overflow-hidden">
              {/* Informação da música tocando agora */}
              <div className="flex items-center justify-between gap-2.5 text-xs bg-neutral-900/60 px-3 py-2.5 rounded-xl border border-neutral-800/80 overflow-hidden w-full">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div
                    className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                      isAudioPlaying ? "bg-blue-400 animate-pulse" : "bg-neutral-600"
                    }`}
                  />
                  <div className="truncate min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center sm:gap-1.5">
                    <span className="text-neutral-400 text-[11px] sm:text-xs flex-shrink-0">No som da TV:</span>
                    <strong className="text-white font-semibold truncate text-xs sm:text-sm">
                      {currentPlayingTrack || "Nenhuma música selecionada"}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Botões Grandes de Playback (Amigáveis para touch em celulares) */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 w-full">
                {/* Botões Prev / Play-Pause / Next */}
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => signageApi.sendCommand(slug, "audio", "prev")}
                    disabled={isAudioStreamActive || !activeAudio || activeAudio.items.length === 0}
                    className="min-h-[48px] w-12 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 flex items-center justify-center transition disabled:opacity-30"
                    title="Música Anterior"
                  >
                    <SkipBack className="h-5 w-5" />
                  </button>

                  {isAudioPlaying ? (
                    <button
                      onClick={() => signageApi.sendCommand(slug, "audio", "pause")}
                      className="min-h-[52px] px-4 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 flex items-center justify-center gap-2 font-bold text-sm transition"
                    >
                      <Pause className="h-5 w-5 flex-shrink-0" />
                      <span className="truncate">Pausar</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => signageApi.sendCommand(slug, "audio", "play")}
                      className="min-h-[52px] px-4 rounded-xl bg-blue-600 text-white hover:bg-blue-500 flex items-center justify-center gap-2 font-bold text-sm shadow-md transition"
                    >
                      <Play className="h-5 w-5 flex-shrink-0 ml-0.5" />
                      <span className="truncate">Tocar</span>
                    </button>
                  )}

                  <button
                    onClick={() => signageApi.sendCommand(slug, "audio", "next")}
                    disabled={isAudioStreamActive || !activeAudio || activeAudio.items.length === 0}
                    className="min-h-[48px] w-12 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 flex items-center justify-center transition disabled:opacity-30"
                    title="Próxima Música"
                  >
                    <SkipForward className="h-5 w-5" />
                  </button>
                </div>

                {/* Roleta de Volume (UIDatePicker Wheel Picker) e Presets de 12,5 em 12,5% */}
                <div className="w-full sm:w-auto space-y-3 bg-neutral-900/50 p-3 rounded-2xl border border-neutral-800/80 overflow-hidden">
                  <VolumeWheelPicker
                    value={currentAudioVolume}
                    onChange={(val) => signageApi.setAudioVolume(slug, val)}
                  />

                  {/* 9 Botões Rápidos de Volume (0% a 100% de 12,5 em 12,5%) */}
                  <div className="space-y-1.5 pt-2 border-t border-neutral-800/80">
                    <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider block">
                      Ajuste Rápido (passo de 12,5%):
                    </span>
                    <div className="grid grid-cols-3 sm:grid-cols-9 gap-1.5 w-full">
                      {VOLUME_PRESETS.map((preset) => {
                        const isSelected = Math.abs(currentAudioVolume - preset.val) < 0.5;
                        return (
                          <button
                            key={preset.val}
                            onClick={() => signageApi.setAudioVolume(slug, preset.val)}
                            className={`min-h-[36px] px-1 py-1 rounded-xl text-[11px] font-semibold transition text-center truncate shadow-sm flex items-center justify-center ${
                              isSelected
                                ? "bg-blue-600 text-white font-bold ring-2 ring-blue-400/50 shadow"
                                : "bg-neutral-800/90 text-neutral-300 hover:text-white hover:bg-neutral-700 border border-neutral-700/50"
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
            </div>

            {/* ============================================================ */}
            {/* SUB-ABA 1: PESQUISAR NO YOUTUBE                              */}
            {/* ============================================================ */}
            {basicAudioTab === "youtube" && (
              <div className="space-y-3.5 w-full">
                <div className="bg-neutral-950/70 p-3.5 sm:p-4 rounded-xl border border-neutral-800 space-y-3">
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Search className="h-4 w-4 text-red-500 flex-shrink-0" />
                      <span>Buscar Músicas e Artistas no YouTube</span>
                    </span>
                    <p className="text-[11px] text-neutral-400">
                      Streaming de áudio direto e invisível em segundo plano na TV, sem anúncios e sem ocupar memória.
                    </p>
                  </div>

                  {/* Barra de Busca */}
                  <div className="flex flex-col sm:flex-row items-stretch gap-2 w-full">
                    <div className="relative flex-1">
                      <input
                        placeholder="Ex: Padre Marcelo Rossi, Harpa Cristã, Pe. Fábio de Melo..."
                        value={ytQuery}
                        onChange={(e) => setYtQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSearchYt()}
                        className="w-full rounded-xl border border-neutral-700 bg-black px-3.5 py-2.5 text-base sm:text-xs text-white placeholder-neutral-500 outline-none focus:border-red-500"
                      />
                    </div>
                    <button
                      onClick={() => handleSearchYt()}
                      disabled={!ytQuery.trim() || isSearchingYt}
                      className="w-full sm:w-auto min-h-[42px] px-5 py-2.5 rounded-xl bg-red-600 text-white font-bold text-xs uppercase tracking-wider hover:bg-red-500 disabled:opacity-40 transition flex items-center justify-center gap-1.5 shadow flex-shrink-0"
                    >
                      {isSearchingYt ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Buscando...</span>
                        </>
                      ) : (
                        <>
                          <Search className="h-4 w-4" />
                          <span>Buscar</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Atalhos Rápidos de Toque (Chips) */}
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold block">
                      Sugestões Rápidas:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        "Hinos da Harpa Cristã",
                        "Padre Marcelo Rossi",
                        "Pe. Fábio de Melo",
                        "Músicas Católicas Suaves",
                        "Louvores Voz e Violão",
                        "Instrumental Piano e Cordas",
                      ].map((chip) => (
                        <button
                          key={chip}
                          onClick={() => handleSearchYt(chip)}
                          className="px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-800 text-[11px] text-neutral-300 hover:text-white hover:border-neutral-700 transition"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Mensagem de Erro na Busca */}
                {ytSearchError && (
                  <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-xs text-red-300 flex items-center gap-2">
                    <Info className="h-4 w-4 flex-shrink-0" />
                    <span>{ytSearchError}</span>
                  </div>
                )}

                {/* Lista de Resultados da Busca */}
                {ytResults.length > 0 && (
                  <div className="space-y-2 w-full">
                    <div className="flex items-center justify-between text-xs text-neutral-400 px-1">
                      <span className="font-semibold text-neutral-300">
                        Resultados Encontrados ({ytResults.length})
                      </span>
                      <span className="text-[11px] text-neutral-500 hidden sm:inline">
                        Adicione à fila ou toque imediatamente na sala
                      </span>
                    </div>

                    <div className="space-y-2 max-h-[440px] overflow-y-auto pr-0.5">
                      {ytResults.map((item) => {
                        const isJustAdded = addedSuccessId === item.id;

                        return (
                          <div
                            key={item.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 sm:p-3 rounded-xl border border-neutral-800 bg-neutral-950/50 hover:border-neutral-700 transition"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {/* Thumbnail com tempo */}
                              {item.thumbnailUrl && (
                                <div className="relative w-16 h-11 sm:w-20 sm:h-12 rounded-lg overflow-hidden bg-neutral-900 flex-shrink-0">
                                  <img
                                    src={item.thumbnailUrl}
                                    alt={item.title}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                  />
                                  <span className="absolute bottom-0.5 right-0.5 bg-black/80 text-[10px] text-white px-1 rounded font-mono">
                                    {item.durationFormatted}
                                  </span>
                                </div>
                              )}

                              <div className="min-w-0 flex-1">
                                <h4 className="text-xs sm:text-sm font-semibold text-white line-clamp-2 leading-tight">
                                  {item.title}
                                </h4>
                                {item.author && (
                                  <p className="text-[11px] text-neutral-400 mt-0.5 truncate">
                                    {item.author}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Botões de Ação */}
                            <div className="flex items-center gap-1.5 self-end sm:self-center flex-shrink-0">
                              <button
                                onClick={() => handleAddYtTrack(item, false)}
                                className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                                  isJustAdded
                                    ? "bg-emerald-600 text-white font-bold"
                                    : "bg-neutral-800 text-neutral-200 hover:bg-neutral-700 hover:text-white"
                                }`}
                              >
                                {isJustAdded ? (
                                  <>
                                    <CheckCircle2 className="h-3.5 w-3.5" />
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
                                onClick={() => handleAddYtTrack(item, true)}
                                className="min-h-[38px] px-3 rounded-lg bg-blue-600 text-white hover:bg-blue-500 text-xs font-bold transition flex items-center gap-1.5 shadow"
                                title="Adiciona e inicia a reprodução agora na TV"
                              >
                                <Play className="h-3.5 w-3.5 ml-0.5" />
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
              <div className="space-y-4 w-full">
                <div className="bg-neutral-950/70 p-3.5 sm:p-4 rounded-xl border border-neutral-800 space-y-3">
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Disc className="h-4 w-4 text-purple-400 flex-shrink-0" />
                      <span>Importar Playlist ou Álbum Inteiro do YouTube</span>
                    </span>
                    <p className="text-[11px] text-neutral-400">
                      Cole o link de uma playlist pública (ex: Harpa Cristã, álbuns completos ou seleções). Todas as faixas são importadas em segundos.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch gap-2 w-full">
                    <input
                      placeholder="https://www.youtube.com/playlist?list=PLzWjmBOf3rY3hAXmvMI1..."
                      value={playlistInputUrl}
                      onChange={(e) => setPlaylistInputUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleFetchPlaylistInfo()}
                      className="w-full flex-1 rounded-xl border border-neutral-700 bg-black px-3.5 py-2.5 text-base sm:text-xs text-white placeholder-neutral-500 outline-none focus:border-purple-500 font-mono"
                    />
                    <button
                      onClick={handleFetchPlaylistInfo}
                      disabled={!playlistInputUrl.trim() || isLoadingPlaylist}
                      className="w-full sm:w-auto min-h-[42px] px-5 py-2.5 rounded-xl bg-purple-600 text-white font-bold text-xs uppercase tracking-wider hover:bg-purple-500 disabled:opacity-40 transition flex items-center justify-center gap-1.5 shadow flex-shrink-0"
                    >
                      {isLoadingPlaylist ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Carregando...</span>
                        </>
                      ) : (
                        <>
                          <Disc className="h-4 w-4" />
                          <span>Carregar Playlist</span>
                        </>
                      )}
                    </button>
                  </div>

                  <p className="text-[11px] text-neutral-500 flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5 flex-shrink-0 text-neutral-400" />
                    <span>Também funciona colando o link de um vídeo que faz parte de uma playlist (com &quot;&amp;list=...&quot;).</span>
                  </p>
                </div>

                {/* Feedback de Erro */}
                {playlistError && (
                  <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-xs text-red-300 flex items-center gap-2">
                    <Info className="h-4 w-4 flex-shrink-0" />
                    <span>{playlistError}</span>
                  </div>
                )}

                {/* Feedback de Sucesso */}
                {importSuccessMsg && (
                  <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                    <span className="font-semibold">{importSuccessMsg}</span>
                  </div>
                )}

                {/* Card de Pré-visualização da Playlist Encontrada */}
                {loadedPlaylistPreview && (
                  <div className="p-4 rounded-xl border border-purple-500/40 bg-purple-950/20 space-y-3.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-purple-500/20 pb-3">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-purple-400 tracking-wider">
                          Playlist Reconhecida
                        </span>
                        <h3 className="text-sm sm:text-base font-bold text-white mt-0.5">
                          {loadedPlaylistPreview.title}
                        </h3>
                        <p className="text-xs text-neutral-300 mt-0.5">
                          {loadedPlaylistPreview.videoCount} músicas encontradas no YouTube
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-neutral-300 block">
                        Como deseja importar para esta sala?
                      </span>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          onClick={() => handleImportPlaylistTracks("replace")}
                          disabled={isLoadingPlaylist}
                          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-purple-600 text-white font-bold text-xs hover:bg-purple-500 transition flex items-center justify-center gap-2 shadow"
                        >
                          <Disc className="h-4 w-4" />
                          <span>Importar Todas ({loadedPlaylistPreview.videoCount} faixas)</span>
                        </button>

                        {activeAudio && (
                          <button
                            onClick={() => handleImportPlaylistTracks("append")}
                            disabled={isLoadingPlaylist}
                            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-200 font-semibold text-xs hover:text-white hover:bg-neutral-800 transition flex items-center justify-center gap-2"
                          >
                            <Plus className="h-4 w-4" />
                            <span>Acrescentar à Fila Atual</span>
                          </button>
                        )}
                      </div>

                      {loadedPlaylistPreview.videoCount > 50 && (
                        <button
                          onClick={() => handleImportPlaylistTracks("replace", 50)}
                          disabled={isLoadingPlaylist}
                          className="w-full text-center text-[11px] text-neutral-400 hover:text-purple-300 pt-1"
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
              <div className="space-y-4 w-full">
                {/* Seleção de Playlist & Modos de Repetição */}
                <div className="bg-neutral-950/70 p-3.5 rounded-xl border border-neutral-800 space-y-3 w-full overflow-hidden">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 w-full">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-xs font-semibold text-neutral-400 flex-shrink-0">
                        Lista:
                      </span>
                      <select
                        value={activeAudio?.id || ""}
                        onChange={(e) => handleSelectAudioPlaylist(e.target.value)}
                        className="flex-1 min-w-0 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-white outline-none focus:border-blue-500 truncate"
                      >
                        <option value="">-- Nenhuma Selecionada --</option>
                        {audioPlaylists.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.items?.length || 0} faixas)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
                      <button
                        onClick={handleCreateNewAudioPlaylist}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 hover:bg-blue-500 hover:text-white text-xs font-semibold transition flex items-center justify-center gap-1 truncate text-center"
                      >
                        <Plus className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">Nova Lista</span>
                      </button>
                      {activeAudio && activeAudio.items.length > 0 && (
                        <button
                          onClick={handleClearPlaylist}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg border border-neutral-800 text-neutral-400 hover:text-red-400 text-xs transition text-center truncate"
                          title="Esvazia todas as músicas desta lista"
                        >
                          Limpar Fila
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Modos de Repetição e Ordem Aleatória */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-neutral-800/60 w-full">
                    <div className="grid grid-cols-3 bg-neutral-900 rounded-lg p-0.5 border border-neutral-800 w-full sm:w-auto">
                      <button
                        onClick={() => handleChangeLoopMode("all")}
                        className={`min-h-[34px] px-2.5 py-1 rounded-md text-xs transition flex items-center justify-center gap-1 ${
                          loopMode === "all"
                            ? "bg-blue-600 text-white font-bold"
                            : "text-neutral-400 hover:text-white"
                        }`}
                        title="Repetir todas em loop contínuo"
                      >
                        <Repeat className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>Todas</span>
                      </button>
                      <button
                        onClick={() => handleChangeLoopMode("one")}
                        className={`min-h-[34px] px-2.5 py-1 rounded-md text-xs transition flex items-center justify-center gap-1 ${
                          loopMode === "one"
                            ? "bg-blue-600 text-white font-bold"
                            : "text-neutral-400 hover:text-white"
                        }`}
                        title="Repetir apenas esta faixa em loop"
                      >
                        <Repeat1 className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>Uma</span>
                      </button>
                      <button
                        onClick={() => handleChangeLoopMode("none")}
                        className={`min-h-[34px] px-2.5 py-1 rounded-md text-xs transition flex items-center justify-center ${
                          loopMode === "none"
                            ? "bg-blue-600 text-white font-bold"
                            : "text-neutral-400 hover:text-white"
                        }`}
                        title="Tocar a lista 1 vez e parar"
                      >
                        <span>1x</span>
                      </button>
                    </div>

                    <button
                      onClick={handleToggleShuffle}
                      className={`min-h-[34px] px-3 py-1 rounded-lg border text-xs transition flex items-center justify-center gap-1.5 w-full sm:w-auto ${
                        shuffleActive
                          ? "bg-purple-600/30 border-purple-500/60 text-purple-200 font-bold"
                          : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"
                      }`}
                      title="Ordem Aleatória (Shuffle)"
                    >
                      <Shuffle className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>Ordem Aleatória</span>
                    </button>
                  </div>
                </div>

                {/* Bloco de Adicionar Músicas por Link Único */}
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3.5 sm:p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 w-full">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Plus className="h-4 w-4 text-blue-400 flex-shrink-0" />
                      <span>Adicionar Link à Fila (YouTube / MP3)</span>
                    </span>
                    <button
                      onClick={() => setShowMultiLinksModal(true)}
                      className="text-xs text-blue-400 hover:underline flex items-center gap-1 font-semibold self-start sm:self-auto"
                    >
                      <Layers className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>Colar Vários Links de Uma Vez</span>
                    </button>
                  </div>

                  <div className="flex flex-col sm:grid sm:grid-cols-[1fr_180px_auto] gap-2 w-full">
                    <input
                      placeholder="Cole link do YouTube ou arquivo de áudio..."
                      value={newTrackUrl}
                      onChange={(e) => setNewTrackUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddTrack(newTrackUrl, newTrackTitle)}
                      className="w-full min-w-0 rounded-xl border border-neutral-700 bg-black px-3.5 py-2.5 text-base sm:text-xs text-white placeholder-neutral-500 outline-none focus:border-blue-500"
                    />
                    <input
                      placeholder="Nome da música (opcional)"
                      value={newTrackTitle}
                      onChange={(e) => setNewTrackTitle(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddTrack(newTrackUrl, newTrackTitle)}
                      className="w-full min-w-0 rounded-xl border border-neutral-700 bg-black px-3.5 py-2.5 text-base sm:text-xs text-white placeholder-neutral-500 outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={() => handleAddTrack(newTrackUrl, newTrackTitle)}
                      disabled={!newTrackUrl.trim()}
                      className="w-full sm:w-auto min-h-[42px] px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-xs uppercase tracking-wider hover:bg-blue-500 disabled:opacity-40 transition flex items-center justify-center gap-1.5 shadow flex-shrink-0"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Adicionar</span>
                    </button>
                  </div>
                </div>

                {/* Lista de Faixas na Playlist */}
                <div className="space-y-2 w-full overflow-hidden">
                  <div className="flex items-center justify-between text-xs text-neutral-400 px-1">
                    <span className="font-semibold text-neutral-300">
                      Faixas na Playlist ({activeAudio?.items?.length || 0})
                    </span>
                    <span className="text-[11px] text-neutral-500 hidden sm:inline">
                      Toque em qualquer faixa para tocar na TV
                    </span>
                  </div>

                  {activeAudio && activeAudio.items && activeAudio.items.length > 0 ? (
                    <div className="space-y-1.5 max-h-96 overflow-y-auto pr-0.5 w-full">
                      {activeAudio.items.map((item, idx) => {
                        const isCurrentlyPlaying =
                          !isAudioStreamActive && isAudioPlaying && currentAudioIndex === idx;

                        return (
                          <div
                            key={idx}
                            className={`flex items-center justify-between gap-2 p-2 sm:p-2.5 rounded-xl border transition overflow-hidden w-full ${
                              isCurrentlyPlaying
                                ? "border-blue-500 bg-blue-950/30 shadow-md border-l-4"
                                : "border-neutral-800 bg-neutral-950/40 hover:border-neutral-700"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {/* Botão de Tocar a Faixa */}
                              <button
                                onClick={() => handlePlayTrack(idx)}
                                className={`h-8 w-8 sm:h-9 sm:w-9 rounded-full flex items-center justify-center transition flex-shrink-0 ${
                                  isCurrentlyPlaying
                                    ? "bg-blue-500 text-white shadow-md animate-pulse"
                                    : "bg-neutral-800 text-neutral-300 hover:bg-blue-600 hover:text-white"
                                }`}
                                title="Tocar esta faixa agora"
                              >
                                {isCurrentlyPlaying ? (
                                  <Volume2 className="h-4 w-4" />
                                ) : (
                                  <Play className="h-3.5 w-3.5 ml-0.5" />
                                )}
                              </button>

                              <div className="min-w-0 flex-1">
                                <div className="text-xs sm:text-sm font-semibold text-white truncate flex items-center gap-1.5">
                                  <span className="text-neutral-500 text-[10px] sm:text-[11px] flex-shrink-0">
                                    #{idx + 1}
                                  </span>
                                  <span className="truncate">
                                    {item.title || extractTrackTitle(item.url)}
                                  </span>
                                </div>
                                <div className="text-[10px] sm:text-[11px] text-neutral-500 truncate mt-0.5" title={item.url}>
                                  {item.url}
                                </div>
                              </div>
                            </div>

                            {/* Controles: Subir, Descer, Remover */}
                            <div className="flex items-center gap-0.5 flex-shrink-0">
                              <button
                                onClick={() => handleMoveTrack(idx, "up")}
                                disabled={idx === 0}
                                className="h-8 w-8 sm:h-9 sm:w-9 flex items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 disabled:opacity-20 transition"
                                title="Mover para cima"
                              >
                                <ChevronUp className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleMoveTrack(idx, "down")}
                                disabled={idx === activeAudio.items.length - 1}
                                className="h-8 w-8 sm:h-9 sm:w-9 flex items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 disabled:opacity-20 transition"
                                title="Mover para baixo"
                              >
                                <ChevronDown className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleRemoveTrack(idx)}
                                className="h-8 w-8 sm:h-9 sm:w-9 flex items-center justify-center rounded-lg text-neutral-400 hover:text-red-400 hover:bg-red-500/10 transition"
                                title="Remover da lista"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-neutral-800 p-8 text-center text-xs text-neutral-400 space-y-2">
                      <div>Nenhuma música na lista no momento.</div>
                      <div className="flex items-center justify-center gap-2 pt-1">
                        <button
                          onClick={() => setBasicAudioTab("youtube")}
                          className="px-3 py-1.5 rounded-lg bg-red-600/20 text-red-300 border border-red-500/30 text-xs font-semibold hover:bg-red-600 hover:text-white transition flex items-center gap-1.5"
                        >
                          <Search className="h-3.5 w-3.5" />
                          <span>Buscar no YouTube</span>
                        </button>
                        <button
                          onClick={() => setBasicAudioTab("playlist_import")}
                          className="px-3 py-1.5 rounded-lg bg-purple-600/20 text-purple-300 border border-purple-500/30 text-xs font-semibold hover:bg-purple-600 hover:text-white transition flex items-center gap-1.5"
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
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RadioIcon
                      className={`h-4 w-4 ${
                        isAudioStreamActive ? "text-blue-400 animate-pulse" : "text-neutral-500"
                      }`}
                    />
                    <span className="text-xs font-bold text-white">Transmissão Direta / Web Rádio</span>
                    {isAudioStreamActive && (
                      <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-bold">
                        Sintonizada
                      </span>
                    )}
                  </div>

                  {isAudioStreamActive && (
                    <button
                      onClick={handleClearAudioStream}
                      className="text-xs text-red-400 hover:underline flex items-center gap-1 font-semibold"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>Desconectar Rádio</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-stretch gap-2">
                  <input
                    placeholder="Link da rádio (ex: https://stream.zeno.fm/... ou link .mp3 contínuo)"
                    value={audioStreamInputUrl}
                    onChange={(e) => setAudioStreamInputUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleApplyAudioStream()}
                    className="flex-1 rounded-xl border border-neutral-700 bg-black px-3.5 py-3 text-base sm:text-xs text-white outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={handleApplyAudioStream}
                    disabled={!audioStreamInputUrl.trim() || setState.isPending}
                    className="min-h-[46px] px-5 py-3 rounded-xl bg-blue-600 text-white font-bold text-xs uppercase tracking-wider hover:bg-blue-500 disabled:opacity-40 transition flex items-center justify-center gap-2 shadow"
                  >
                    <RadioIcon className="h-4 w-4" />
                    <span>Sintonizar</span>
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* CARD 3: DISPOSITIVOS / TVS CONECTADAS */}
          <RoomDevicesCard
            slug={slug}
            devices={devicesQ.data?.devices}
            count={devicesCount}
            max={maxDevices}
            onKick={(clientId, reason) => kickDeviceMut.mutate({ clientId, reason })}
            isKicking={kickDeviceMut.isPending}
            playerUrl={playerUrl}
          />
        </main>
      ) : (
        /* ============================================================ */
        /* 2. MODO AVANÇADO (Completo: Imagens, Vídeos, Editor)         */
        /* ============================================================ */
        <div className="flex flex-col flex-1">
          {/* Navegação por Abas do Modo Avançado */}
          <nav className="border-b border-neutral-800 bg-neutral-950 px-3 sm:px-6 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 w-full overflow-hidden">
            <div className="grid grid-cols-3 gap-1 bg-neutral-900 p-1 rounded-xl border border-neutral-800 w-full sm:w-auto">
              <button
                onClick={() => setAdvancedTab("control")}
                className={`flex items-center justify-center gap-1.5 px-2 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold transition truncate text-center ${
                  advancedTab === "control"
                    ? "bg-emerald-500 text-black shadow-sm"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                <Gamepad2 className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">
                  <span className="inline sm:hidden">Ao Vivo</span>
                  <span className="hidden sm:inline">Ao Vivo & Controle</span>
                </span>
              </button>
              <button
                onClick={() => setAdvancedTab("playlists")}
                className={`flex items-center justify-center gap-1.5 px-2 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold transition truncate text-center ${
                  advancedTab === "playlists"
                    ? "bg-emerald-500 text-black shadow-sm"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                <ListVideo className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">
                  <span className="inline sm:hidden">Playlists</span>
                  <span className="hidden sm:inline">Playlists Salvas</span>
                </span>
              </button>
              <button
                onClick={() => setAdvancedTab("editor")}
                className={`flex items-center justify-center gap-1.5 px-2 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold transition truncate text-center ${
                  advancedTab === "editor"
                    ? "bg-emerald-500 text-black shadow-sm"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                <PenTool className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">
                  <span className="inline sm:hidden">Editor</span>
                  <span className="hidden sm:inline">Editor de Mídias</span>
                </span>
              </button>
            </div>

            <button
              onClick={handleDeleteRoom}
              disabled={deleteRoomMut.isPending}
              className="self-end sm:self-auto min-h-[34px] px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white text-xs font-medium transition flex items-center gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Excluir Sala</span>
            </button>
          </nav>

          {/* CONTEÚDO DAS ABAS DO MODO AVANÇADO */}
          <div className="flex-1 overflow-y-auto p-4 pb-28 sm:p-6 sm:pb-16 md:p-8 md:pb-20 max-w-5xl mx-auto w-full space-y-6">
            {/* ABA 1: AO VIVO & CONTROLE */}
            {advancedTab === "control" && (
              <div className="space-y-5">
                {/* Status Bar Ao Vivo */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-2">
                    <div className="text-[11px] uppercase tracking-wider text-neutral-400 font-bold flex items-center gap-1.5">
                      <Tv className="h-4 w-4 text-emerald-400" />
                      <span>Display Visual na TV</span>
                    </div>
                    <div className="text-sm font-semibold text-white truncate">
                      {isSiteActive ? (
                        <span className="text-emerald-400 flex items-center gap-1.5 truncate">
                          <Globe className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate">{stateQ.data?.siteUrl}</span>
                        </span>
                      ) : activeVisual?.name ? (
                        `Playlist: ${activeVisual.name}`
                      ) : (
                        "Nenhuma playlist visual ativa"
                      )}
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t border-neutral-800">
                      <button
                        onClick={() => signageApi.sendCommand(slug, "visual", "prev")}
                        disabled={isSiteActive}
                        className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs disabled:opacity-30"
                      >
                        <SkipBack className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() =>
                          signageApi.sendCommand(
                            slug,
                            "visual",
                            stateQ.data?.visualStatus === "paused" ? "play" : "pause"
                          )
                        }
                        disabled={isSiteActive}
                        className="px-4 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500 hover:text-black text-xs font-bold disabled:opacity-30 flex items-center gap-1"
                      >
                        {stateQ.data?.visualStatus === "paused" ? (
                          <Play className="h-4 w-4" />
                        ) : (
                          <Pause className="h-4 w-4" />
                        )}
                        <span>{stateQ.data?.visualStatus === "paused" ? "Play" : "Pause"}</span>
                      </button>
                      <button
                        onClick={() => signageApi.sendCommand(slug, "visual", "next")}
                        disabled={isSiteActive}
                        className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs disabled:opacity-30"
                      >
                        <SkipForward className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-2">
                    <div className="text-[11px] uppercase tracking-wider text-neutral-400 font-bold flex items-center gap-1.5">
                      <Music className="h-4 w-4 text-blue-400" />
                      <span>Som de Fundo na TV</span>
                    </div>
                    <div className="text-sm font-semibold text-white truncate">
                      {isAudioStreamActive ? (
                        <span className="text-blue-400 flex items-center gap-1.5 truncate">
                          <RadioIcon className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate">{stateQ.data?.audioStreamUrl}</span>
                        </span>
                      ) : activeAudio?.name ? (
                        `Playlist: ${activeAudio.name}`
                      ) : (
                        "Sem áudio tocando"
                      )}
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t border-neutral-800">
                      <button
                        onClick={() => signageApi.sendCommand(slug, "audio", "prev")}
                        disabled={isAudioStreamActive}
                        className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs disabled:opacity-30"
                      >
                        <SkipBack className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() =>
                          signageApi.sendCommand(
                            slug,
                            "audio",
                            isAudioPlaying ? "pause" : "play"
                          )
                        }
                        className="px-4 py-1.5 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600 hover:text-white text-xs font-bold flex items-center gap-1"
                      >
                        {isAudioPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        <span>{isAudioPlaying ? "Pausar" : "Tocar"}</span>
                      </button>
                      <button
                        onClick={() => signageApi.sendCommand(slug, "audio", "next")}
                        disabled={isAudioStreamActive}
                        className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs disabled:opacity-30"
                      >
                        <SkipForward className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Card de Dispositivos */}
                <RoomDevicesCard
                  slug={slug}
                  devices={devicesQ.data?.devices}
                  count={devicesCount}
                  max={maxDevices}
                  onKick={(clientId, reason) => kickDeviceMut.mutate({ clientId, reason })}
                  isKicking={kickDeviceMut.isPending}
                  playerUrl={playerUrl}
                />
              </div>
            )}

            {/* ABA 2: PLAYLISTS SALVAS */}
            {advancedTab === "playlists" && (
              <div className="space-y-6">
                {/* Playlists Visuais */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h3 className="text-xs uppercase tracking-wider text-neutral-300 font-bold flex items-center gap-2">
                      <Tv className="h-4 w-4 text-emerald-400" />
                      <span>Playlists Visuais (Fotos / Vídeos)</span>
                    </h3>
                    <div className="flex gap-2">
                      <button
                        disabled={!selectedVisual || setState.isPending}
                        onClick={() =>
                          selectedVisual && setState.mutate({ playlist: selectedVisual, mode: "playlist" })
                        }
                        className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-emerald-500 text-neutral-950 text-xs font-bold hover:bg-emerald-400 disabled:opacity-30 transition"
                      >
                        Colocar no Ar
                      </button>
                      <button
                        disabled={setState.isPending}
                        onClick={() => setState.mutate({ playlist: null })}
                        className="min-h-[36px] px-3.5 py-1.5 rounded-lg border border-neutral-700 hover:border-red-500 text-neutral-300 hover:text-red-400 text-xs transition"
                      >
                        Desativar
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {visualPlaylists.map((p) => (
                      <PlaylistCard
                        key={p.id}
                        playlist={p}
                        selected={selectedVisual === p.id}
                        active={!isSiteActive && activeVisual?.id === p.id}
                        onClick={() => setSelectedVisual(p.id)}
                        onEdit={() => handleEditPlaylist(p.id)}
                        onDelete={() => {
                          if (confirm(`Deseja apagar a playlist "${p.name}"?`)) {
                            deletePlaylistMut.mutate(p.id);
                            if (selectedVisual === p.id) setSelectedVisual(null);
                          }
                        }}
                      />
                    ))}
                    {visualPlaylists.length === 0 && (
                      <div className="col-span-2 rounded-xl border border-dashed border-neutral-800 p-6 text-center text-xs text-neutral-500">
                        Nenhuma playlist visual criada ainda. Use a aba "Editor de Mídias" para criar uma.
                      </div>
                    )}
                  </div>
                </div>

                {/* Playlists de Áudio */}
                <div className="space-y-3 pt-4 border-t border-neutral-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h3 className="text-xs uppercase tracking-wider text-neutral-300 font-bold flex items-center gap-2">
                      <Music className="h-4 w-4 text-blue-400" />
                      <span>Playlists de Áudio</span>
                    </h3>
                    <div className="flex gap-2">
                      <button
                        disabled={!selectedAudio || setState.isPending}
                        onClick={() =>
                          selectedAudio &&
                          setState.mutate({ audioPlaylist: selectedAudio, audioStreamUrl: null })
                        }
                        className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 disabled:opacity-30 transition"
                      >
                        Tocar no Som
                      </button>
                      <button
                        disabled={setState.isPending}
                        onClick={() => setState.mutate({ audioPlaylist: null, audioStreamUrl: null })}
                        className="min-h-[36px] px-3.5 py-1.5 rounded-lg border border-neutral-700 hover:border-red-500 text-neutral-300 hover:text-red-400 text-xs transition"
                      >
                        Mutar Som
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {audioPlaylists.map((p) => (
                      <PlaylistCard
                        key={p.id}
                        playlist={p}
                        selected={selectedAudio === p.id}
                        active={!isAudioStreamActive && activeAudio?.id === p.id}
                        onClick={() => setSelectedAudio(p.id)}
                        onEdit={() => handleEditPlaylist(p.id)}
                        onDelete={() => {
                          if (confirm(`Deseja apagar a playlist "${p.name}"?`)) {
                            deletePlaylistMut.mutate(p.id);
                            if (selectedAudio === p.id) setSelectedAudio(null);
                          }
                        }}
                      />
                    ))}
                    {audioPlaylists.length === 0 && (
                      <div className="col-span-2 rounded-xl border border-dashed border-neutral-800 p-6 text-center text-xs text-neutral-500">
                        Nenhuma playlist de áudio criada.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ABA 3: EDITOR DE MÍDIAS */}
            {advancedTab === "editor" && (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 sm:p-6">
                <ConfigPlaylistForm
                  playlists={playlistsQ.data || []}
                  selectedId={editingPlaylistId}
                  onSelectId={setEditingPlaylistId}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL PARA COLAR MÚLTIPLOS LINKS DE UMA VEZ                   */}
      {/* ============================================================ */}
      {showMultiLinksModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 sm:p-4">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 p-4 sm:p-6 flex flex-col shadow-2xl space-y-4 max-h-[90dvh]">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-blue-400" />
                <h3 className="text-sm font-bold text-white">
                  Colar Vários Links de Uma Vez
                </h3>
              </div>
              <button
                onClick={() => setShowMultiLinksModal(false)}
                className="p-1.5 text-neutral-400 hover:text-white"
              >
                <X className="h-5 w-5" />
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
              className="w-full rounded-xl border border-neutral-700 bg-black p-3.5 text-base sm:text-xs text-white placeholder-neutral-600 outline-none focus:border-blue-500 font-mono"
            />

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
              <button
                onClick={() => setShowMultiLinksModal(false)}
                className="min-h-[40px] px-4 rounded-xl border border-neutral-700 text-xs text-neutral-300 hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddMultipleTracks}
                disabled={!multiLinksText.trim()}
                className="min-h-[40px] flex items-center gap-1.5 px-4 rounded-xl bg-blue-600 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
                <span>Adicionar à Playlist</span>
              </button>
            </div>
          </div>
        </div>
      )}
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
      className={`rounded-2xl border transition-all ${
        isFull
          ? "border-amber-500/40 bg-neutral-900/40"
          : count > 0
          ? "border-emerald-500/30 bg-neutral-900/30"
          : "border-neutral-800 bg-neutral-900/20"
      } p-4 sm:p-6 space-y-4`}
    >
      {/* Header do Card de Dispositivos */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`p-2.5 rounded-xl flex-shrink-0 ${
              isFull
                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                : count > 0
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "bg-neutral-800 text-neutral-400"
            }`}
          >
            <Tv className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2 flex-wrap">
              <span>TVs Conectadas</span>
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full font-bold border truncate ${
                  isFull
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    : count > 0
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                    : "bg-neutral-800 text-neutral-400 border-neutral-700"
                }`}
              >
                {count}/{max} TVs {isFull && "• Cheia"}
              </span>
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5 truncate">
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
            className="w-full sm:w-auto min-h-[38px] flex items-center justify-center gap-1.5 rounded-xl bg-red-500/10 hover:bg-red-500 hover:text-white text-red-300 border border-red-500/30 px-3.5 py-1.5 text-xs font-semibold transition disabled:opacity-40"
          >
            <LogOut className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">Desconectar Todas ({count})</span>
          </button>
        )}
      </div>

      {/* Grid de Telas Conectadas e Vagas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Telas Conectadas */}
        {devices.map((device, idx) => (
          <div
            key={device.id}
            className="flex flex-col justify-between p-4 rounded-xl border border-neutral-700/80 bg-neutral-950 shadow-sm space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex-shrink-0">
                  <Monitor className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-white truncate">
                    {device.deviceLabel}
                  </div>
                  <div className="text-[11px] text-neutral-400 flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Vaga #{idx + 1}
                    </span>
                    <span>•</span>
                    <span className="text-neutral-400 font-mono text-[10px]">
                      IP: {device.ip}
                    </span>
                  </div>
                </div>
              </div>

              <span className="text-[10px] text-neutral-400 flex items-center gap-1 flex-shrink-0">
                <Clock className="h-3 w-3" />
                {formatConnectedTime(device.connectedAt)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-800">
              <span className="text-[10px] text-neutral-500">
                Conectada
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
                className="min-h-[34px] px-3 py-1.5 rounded-lg border border-neutral-700 bg-neutral-900 hover:bg-red-500/20 hover:border-red-500/40 hover:text-red-300 text-neutral-300 text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-40"
              >
                <LogOut className="h-3.5 w-3.5 flex-shrink-0" />
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
              className="flex flex-col items-center justify-center p-5 rounded-xl border border-dashed border-neutral-800 bg-neutral-950/40 text-center space-y-1.5 min-h-[110px]"
            >
              <div className="flex items-center gap-1.5 text-xs text-neutral-300 font-semibold">
                <Tv className="h-4 w-4 text-neutral-500" />
                <span>Vaga #{slotNum} Disponível</span>
              </div>
              <p className="text-[11px] text-neutral-500 max-w-xs">
                Aguardando conexão da TV ou selecione esta sala no menu do player.
              </p>
              <a
                href={playerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold pt-1"
              >
                <ExternalLink className="h-3 w-3" />
                <span>Conectar TV nesta vaga</span>
              </a>
            </div>
          );
        })}
      </div>

      <div className="text-[11px] text-neutral-400 pt-1 border-t border-neutral-800/40 flex items-center gap-1.5">
        <Info className="h-3.5 w-3.5 text-neutral-400 flex-shrink-0" />
        <span>Ao desconectar, a TV vai para o lobby e pode se reconectar quando desejar.</span>
      </div>
    </section>
  );
}

/**
 * Card de Playlist no Modo Avançado
 */
function PlaylistCard({
  playlist,
  selected,
  active,
  onClick,
  onEdit,
  onDelete,
}: {
  playlist: Playlist;
  selected: boolean;
  active: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group relative rounded-xl border text-left transition ${
        selected
          ? playlist.type === "visual"
            ? "border-emerald-500 bg-emerald-500/10 shadow-md"
            : "border-blue-500 bg-blue-500/10 shadow-md"
          : "border-neutral-800 hover:border-neutral-700 bg-neutral-900/40"
      }`}
    >
      <button onClick={onClick} className="w-full p-4 text-left">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold text-white truncate pr-2">{playlist.name}</div>
          {active && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                playlist.type === "visual"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
              }`}
            >
              No Ar
            </span>
          )}
        </div>
        <div className="mt-2 text-xs text-neutral-400 flex items-center gap-2">
          {playlist.type === "visual" ? (
            <Tv className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Music className="h-3.5 w-3.5 text-blue-400" />
          )}
          <span>
            {playlist.items.length} {playlist.items.length === 1 ? "item" : "itens"} ·{" "}
            {playlist.loop ? "Loop contínuo" : "Tocar 1x"}
          </span>
        </div>
      </button>

      {/* Ações do Card */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
          title="Editar Playlist"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="rounded-lg p-2 text-neutral-400 hover:bg-red-500/20 hover:text-red-400 transition"
          title="Apagar Playlist"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Editor Completo de Playlists do Modo Avançado
 */
function ConfigPlaylistForm({
  playlists,
  selectedId,
  onSelectId,
}: {
  playlists: Playlist[];
  selectedId: string;
  onSelectId: (id: string) => void;
}) {
  const qc = useQueryClient();

  const [type, setType] = useState<"visual" | "audio">("visual");
  const [name, setName] = useState("");
  const [loop, setLoop] = useState(true);
  const [globalDuration, setGlobalDuration] = useState(8);
  const [items, setItems] = useState<PlaylistItem[]>([]);

  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ytUrl, setYtUrl] = useState("");
  const [webUrl, setWebUrl] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  const [showMediaModal, setShowMediaModal] = useState(false);

  useEffect(() => {
    if (selectedId === "new") {
      setName("");
      setLoop(true);
      setItems([]);
    } else {
      const p = playlists.find((p) => p.id === selectedId);
      if (p) {
        setType(p.type || "visual");
        setName(p.name);
        setLoop(p.loop ?? true);
        setItems(p.items || []);
      }
    }
  }, [selectedId, playlists]);

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim() || "Nova Playlist", type, items, loop };
      if (selectedId === "new") {
        return signageApi.createPlaylist(payload);
      } else {
        return signageApi.updatePlaylist(selectedId, payload);
      }
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["playlists"] });
      const createdId = data?.playlist?.id || data?.id;
      if (createdId) {
        onSelectId(createdId);
      }
    },
  });

  const addFiles = async (files: FileList | File[]) => {
    setUploading(true);
    const arr: PlaylistItem[] = [];
    for (const f of Array.from(files)) {
      try {
        if (type === "audio" && !f.type.startsWith("audio")) {
          alert(`Arquivo ${f.name} não é um arquivo de áudio.`);
          continue;
        }
        if (type === "visual" && f.type.startsWith("audio")) {
          alert(`Arquivo ${f.name} é um áudio. Envie-o para uma playlist de áudio.`);
          continue;
        }

        const { filename } = await signageApi.uploadMedia(f);
        const url = `/media/uploads/${filename}`;

        arr.push({
          url,
          type: type === "audio" ? "audio" : f.type.startsWith("video") ? "video" : "image",
          duration: type === "visual" && !f.type.startsWith("video") ? globalDuration : undefined,
          muted: false,
          volume: 100,
        });
      } catch (err) {
        console.error("Falha ao subir arquivo:", f.name, err);
      }
    }
    if (arr.length > 0) setItems((prev) => [...prev, ...arr]);
    setUploading(false);
  };

  const addYt = () => {
    if (!ytUrl.trim() || type === "audio") return;
    setItems((prev) => [...prev, { url: ytUrl.trim(), type: "youtube", muted: false, volume: 100 }]);
    setYtUrl("");
  };

  const addWebItem = () => {
    if (!webUrl.trim() || type === "audio") return;
    let url = webUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    setItems((prev) => [...prev, { url, type: "web", duration: globalDuration || 15 }]);
    setWebUrl("");
  };

  const addAudioUrl = () => {
    if (!audioUrl.trim() || type !== "audio") return;
    const url = cleanAudioUrl(audioUrl);
    setItems((prev) => [...prev, { url, type: "audio", volume: 100, title: extractTrackTitle(url) }]);
    setAudioUrl("");
  };

  const updateItem = (index: number, changes: Partial<PlaylistItem>) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], ...changes };
    setItems(newItems);
  };

  const handleDropItem = (targetIdx: number) => {
    if (draggedIdx === null || draggedIdx === targetIdx) return;
    const newItems = [...items];
    const [removed] = newItems.splice(draggedIdx, 1);
    newItems.splice(targetIdx, 0, removed);
    setItems(newItems);
    setDraggedIdx(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
        <div>
          <h3 className="text-base font-bold text-white">Editor de Playlists</h3>
          <p className="text-xs text-neutral-400">Monte sequências de telas ou áudio.</p>
        </div>
        {selectedId !== "new" && (
          <button
            onClick={() => onSelectId("new")}
            className="text-xs font-semibold text-emerald-400 hover:underline"
          >
            + Criar Nova
          </button>
        )}
      </div>

      <select
        value={selectedId}
        onChange={(e) => onSelectId(e.target.value)}
        className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3.5 py-2.5 text-xs text-white outline-none focus:border-emerald-500"
      >
        <option value="new">-- Criar Nova Playlist --</option>
        {playlists.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.type})
          </option>
        ))}
      </select>

      <div className="grid grid-cols-2 bg-neutral-950 rounded-xl p-1 border border-neutral-800 gap-1">
        <button
          type="button"
          onClick={() => setType("visual")}
          className={`py-2 text-xs font-bold rounded-lg transition ${
            type === "visual" ? "bg-emerald-500 text-black shadow" : "text-neutral-400 hover:text-white"
          }`}
        >
          Visual (Telas)
        </button>
        <button
          type="button"
          onClick={() => setType("audio")}
          className={`py-2 text-xs font-bold rounded-lg transition ${
            type === "audio" ? "bg-blue-600 text-white shadow" : "text-neutral-400 hover:text-white"
          }`}
        >
          Áudio (Músicas)
        </button>
      </div>

      <input
        placeholder="Nome da Playlist"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3.5 py-2.5 text-base sm:text-xs text-white outline-none focus:border-emerald-500"
      />

      <div className="flex flex-wrap items-center justify-between gap-2 bg-neutral-950 p-3 text-xs rounded-xl border border-neutral-800">
        <label className="flex items-center gap-2 text-neutral-300 cursor-pointer font-medium">
          <input
            type="checkbox"
            checked={loop}
            onChange={(e) => setLoop(e.target.checked)}
            className="accent-emerald-500 h-4 w-4"
          />
          Loop Contínuo
        </label>

        {type === "visual" && (
          <label className="flex items-center gap-2 text-neutral-400">
            <span>Tempo por foto:</span>
            <input
              type="number"
              min={1}
              value={globalDuration}
              onChange={(e) => setGlobalDuration(Number(e.target.value))}
              className="w-14 rounded-lg bg-neutral-900 border border-neutral-700 px-2 py-1 outline-none text-center text-white"
            />
            <span>s</span>
          </label>
        )}
      </div>

      {type === "visual" && (
        <div className="space-y-2 w-full">
          <div className="flex items-center gap-2 w-full">
            <input
              placeholder="Adicionar link do YouTube"
              value={ytUrl}
              onChange={(e) => setYtUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addYt()}
              className="flex-1 min-w-0 rounded-xl border border-neutral-700 bg-neutral-950 px-3.5 py-2.5 text-base sm:text-xs text-white outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={addYt}
              className="min-h-[42px] px-3.5 rounded-xl bg-neutral-800 text-neutral-300 hover:bg-emerald-500 hover:text-black transition flex-shrink-0"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 w-full">
            <input
              placeholder="Página web à rotação (ex: https://weather.com)"
              value={webUrl}
              onChange={(e) => setWebUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addWebItem()}
              className="flex-1 min-w-0 rounded-xl border border-neutral-700 bg-neutral-950 px-3.5 py-2.5 text-base sm:text-xs text-white outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={addWebItem}
              className="min-h-[42px] px-3.5 rounded-xl bg-neutral-800 text-neutral-300 hover:bg-emerald-500 hover:text-black transition flex-shrink-0"
            >
              <Globe className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {type === "audio" && (
        <div className="flex items-center gap-2 w-full">
          <input
            placeholder="Link de áudio (YouTube, MP3 ou áudio online)"
            value={audioUrl}
            onChange={(e) => setAudioUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addAudioUrl()}
            className="flex-1 min-w-0 rounded-xl border border-neutral-700 bg-neutral-950 px-3.5 py-2.5 text-base sm:text-xs text-white outline-none focus:border-blue-500"
          />
          <button
            type="button"
            onClick={addAudioUrl}
            className="min-h-[42px] px-3.5 rounded-xl bg-neutral-800 text-neutral-300 hover:bg-blue-600 hover:text-white transition flex-shrink-0"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Botão de Galeria de Mídia do Servidor */}
      <button
        type="button"
        onClick={() => setShowMediaModal(true)}
        className="w-full min-h-[42px] flex items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 text-xs font-semibold text-neutral-200 hover:border-neutral-500 transition"
      >
        <FolderOpen className="h-4 w-4 text-emerald-400" />
        <span>Abrir Galeria do Servidor</span>
      </button>

      {/* Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center text-xs transition ${
          dragOver
            ? type === "visual"
              ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
              : "border-blue-500 bg-blue-500/10 text-blue-300"
            : "border-neutral-800 text-neutral-400"
        }`}
      >
        <Upload className="mb-2 h-6 w-6" />
        {uploading ? (
          <span className="font-semibold">Enviando arquivo...</span>
        ) : type === "visual" ? (
          <span>Arraste Fotos ou Vídeos aqui</span>
        ) : (
          <span>Arraste Músicas (MP3/WAV) aqui</span>
        )}
        <label
          className={`mt-2 cursor-pointer font-bold ${
            type === "visual" ? "text-emerald-400 hover:underline" : "text-blue-400 hover:underline"
          }`}
        >
          ou selecione do aparelho
          <input
            type="file"
            multiple
            accept={type === "visual" ? "video/*,image/*" : "audio/*"}
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
        </label>
      </div>

      {/* Fila de Itens da Playlist */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-neutral-300 flex items-center justify-between">
          <span>Itens na Fila ({items.length})</span>
        </div>

        {items.length > 0 && (
          <ul className="space-y-2 text-xs max-h-72 overflow-y-auto pr-1">
            {items.map((it, i) => (
              <li
                key={i}
                draggable
                onDragStart={() => setDraggedIdx(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDropItem(i)}
                className={`flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 p-2.5 transition ${
                  draggedIdx === i ? "opacity-40" : ""
                }`}
              >
                <div className="cursor-grab active:cursor-grabbing text-neutral-500 p-1">
                  <GripVertical className="h-4 w-4" />
                </div>

                <div className="w-9 h-9 rounded-lg bg-black flex-shrink-0 flex items-center justify-center overflow-hidden border border-neutral-800">
                  {it.type === "image" ? (
                    <img src={it.url} alt="" className="w-full h-full object-cover" />
                  ) : it.type === "youtube" ? (
                    <span className="text-[10px] font-bold text-red-400">YT</span>
                  ) : it.type === "video" ? (
                    <Video className="h-4 w-4 text-blue-400" />
                  ) : it.type === "web" ? (
                    <Globe className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Music className="h-4 w-4 text-blue-500" />
                  )}
                </div>

                <div className="flex-1 min-w-0 truncate">
                  <span className="font-bold mr-1.5 text-[10px] uppercase text-neutral-400">
                    {it.type}
                  </span>
                  <span className="text-white text-xs truncate" title={it.url}>
                    {it.title || it.url.split("/").pop()}
                  </span>
                </div>

                {it.type === "image" || it.type === "web" ? (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <input
                      type="number"
                      min={1}
                      value={it.duration ?? globalDuration}
                      onChange={(e) => updateItem(i, { duration: Number(e.target.value) })}
                      className="w-12 rounded bg-neutral-900 border border-neutral-800 px-1 py-1 text-center text-white text-xs"
                    />
                    <span className="text-neutral-500 text-[10px]">s</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!it.muted && (
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={it.volume ?? 100}
                        onChange={(e) => updateItem(i, { volume: Number(e.target.value) })}
                        className="w-12 accent-blue-500"
                      />
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setItems(items.filter((_, j) => j !== i))}
                  className="text-neutral-500 hover:text-red-400 p-1.5 transition"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        disabled={!name.trim() || items.length === 0 || saveMut.isPending || uploading}
        onClick={() => saveMut.mutate()}
        className={`w-full min-h-[46px] rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-wider text-neutral-950 transition disabled:opacity-30 ${
          type === "visual" ? "bg-emerald-500 hover:bg-emerald-400" : "bg-blue-500 hover:bg-blue-400"
        }`}
      >
        {saveMut.isPending ? "Salvando..." : selectedId === "new" ? "Criar Playlist" : "Salvar Alterações"}
      </button>

      {/* Modal da Galeria de Mídias */}
      {showMediaModal && (
        <MediaLibraryModal
          type={type}
          onSelect={(url) => {
            setItems((prev) => [
              ...prev,
              {
                url,
                type: type === "audio" ? "audio" : /\.(mp4|webm|mov)$/i.test(url) ? "video" : "image",
                duration: type === "visual" && !/\.(mp4|webm|mov)$/i.test(url) ? globalDuration : undefined,
                muted: false,
                volume: 100,
                title: extractTrackTitle(url),
              },
            ]);
          }}
          onClose={() => setShowMediaModal(false)}
        />
      )}
    </div>
  );
}

/**
 * Modal de Galeria de Mídias Existentes
 */
function MediaLibraryModal({
  type,
  onSelect,
  onClose,
}: {
  type: "visual" | "audio";
  onSelect: (url: string) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const mediaQ = useQuery({ queryKey: ["mediaFiles"], queryFn: signageApi.listMedia });

  const deleteMediaMut = useMutation({
    mutationFn: signageApi.deleteMedia,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mediaFiles"] }),
  });

  const files = mediaQ.data || [];
  const filtered = files.filter((f) => {
    const isAudio = /\.(mp3|wav|ogg|aac|m4a)$/i.test(f);
    return type === "audio" ? isAudio : !isAudio;
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 sm:p-4">
      <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-950 p-4 sm:p-6 flex flex-col max-h-[90dvh] shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">
              Galeria do Servidor ({filtered.length})
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-neutral-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-3 space-y-2">
          {filtered.length === 0 && (
            <div className="text-center py-8 text-neutral-500 text-xs">
              Nenhuma mídia deste tipo encontrada no servidor.
            </div>
          )}
          {filtered.map((filename) => {
            const url = `/media/uploads/${filename}`;
            const isImg = /\.(png|jpe?g|gif|webp)$/i.test(filename);
            const isVid = /\.(mp4|webm|mov)$/i.test(filename);

            return (
              <div
                key={filename}
                className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl border border-neutral-800 bg-neutral-900/60 hover:border-neutral-700 transition"
              >
                <div className="w-10 h-10 rounded-lg bg-black flex-shrink-0 flex items-center justify-center overflow-hidden border border-neutral-800">
                  {isImg ? (
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  ) : isVid ? (
                    <Video className="h-5 w-5 text-blue-400" />
                  ) : (
                    <Music className="h-5 w-5 text-blue-500" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-xs text-white truncate font-medium">{filename}</div>
                  <div className="text-[10px] text-neutral-500 truncate">{url}</div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => onSelect(url)}
                    className="min-h-[34px] flex items-center gap-1 rounded-lg bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-500 hover:text-black font-semibold transition"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Adicionar</span>
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Excluir permanentemente o arquivo "${filename}" do servidor?`)) {
                        deleteMediaMut.mutate(filename);
                      }
                    }}
                    className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition"
                    title="Excluir arquivo do servidor"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-3 border-t border-neutral-800 flex justify-end">
          <button
            onClick={onClose}
            className="min-h-[40px] rounded-xl bg-neutral-800 px-5 py-2 text-xs text-white hover:bg-neutral-700 font-semibold"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
}
