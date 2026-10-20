import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { signageApi, type Playlist, type PlaylistItem, type DeviceInfo, API_BASE } from "@/lib/signage-api";
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
} from "lucide-react";

export const Route = createFileRoute("/admin/$slug")({
  component: RoomOperator,
});

/**
 * Normaliza e limpa links do Dropbox (?dl=0 -> ?raw=1) e Google Drive
 */
function cleanAudioUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (!url) return url;
  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }
  if (url.includes("dropbox.com")) {
    url = url.replace(/[?&]dl=[01]/g, "");
    url += url.includes("?") ? "&raw=1" : "?raw=1";
  } else {
    const gdriveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (gdriveMatch) {
      url = `https://drive.google.com/uc?export=download&id=${gdriveMatch[1]}`;
    }
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

  // Tabs do Modo Avançado
  const [activeTab, setActiveTab] = useState<"control" | "playlists" | "editor">("control");
  const [editingPlaylistId, setEditingPlaylistId] = useState<string>("new");

  // Dados das salas e estado
  const roomsQ = useQuery({ queryKey: ["rooms"], queryFn: signageApi.listRooms, refetchInterval: 3000 });
  const currentRoom = roomsQ.data?.find((r) => r.slug === slug);

  const stateQ = useQuery({
    queryKey: ["state", slug],
    queryFn: () => signageApi.getState(slug),
    refetchInterval: 2000,
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
    refetchInterval: 2500,
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

  // Sub-modo de áudio no Modo Básico: playlist ou rádio único
  const [basicAudioTab, setBasicAudioTab] = useState<"playlist" | "stream">("playlist");

  // Inputs para adicionar faixa à playlist no Modo Básico
  const [newTrackUrl, setNewTrackUrl] = useState("");
  const [newTrackTitle, setNewTrackTitle] = useState("");
  const [multiLinksText, setMultiLinksText] = useState("");
  const [showMultiLinksModal, setShowMultiLinksModal] = useState(false);

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

  // Sincronização via WebSocket para atualização instantânea (como observador Admin, não consome vaga de TV)
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
  // Ações da Playlist de Músicas (Modo Básico)
  // ==========================================
  const handleAddTrack = async (rawUrl: string, customTitle?: string) => {
    if (!rawUrl.trim()) return;
    const cleaned = cleanAudioUrl(rawUrl);
    const title = extractTrackTitle(cleaned, customTitle);

    const newItem: PlaylistItem = {
      url: cleaned,
      title,
      type: "audio",
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
    if (!activeAudio || !confirm("Deseja esvaziar todas as faixas desta playlist?")) return;
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
    const name = prompt("Nome da nova playlist de áudio:", `Áudio ${audioPlaylists.length + 1}`);
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
    setActiveTab("editor");
  };

  // Contagem e limites de dispositivos
  const devicesCount = devicesQ.data?.count ?? currentRoom?.clientsCount ?? 0;
  const maxDevices = devicesQ.data?.max ?? currentRoom?.maxClients ?? 2;
  const isRoomFull = devicesCount >= maxDevices;
  const isRoomOnline = Boolean(currentRoom?.online || devicesCount > 0);

  return (
    <div className={`flex h-full flex-col text-neutral-100 font-mono relative overflow-y-auto ${viewMode === "advanced" ? "pb-20 lg:pb-0" : "pb-6"}`}>
      {/* ============================================================ */}
      {/* HEADER PRINCIPAL COM STATUS E SELETOR DE MODO BÁSICO/AVANÇADO */}
      {/* ============================================================ */}
      <header className="border-b border-neutral-800 p-3 sm:p-4 md:px-8 bg-neutral-950 space-y-3">
        {/* Linha 1: Nome da Sala + Status + Ações Rápidas */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.25em] text-neutral-500 flex items-center gap-2">
              <span>Display / Sala</span>
              {isRoomOnline ? (
                <span
                  className={`font-bold text-[9px] px-2 py-0.5 rounded-full border flex items-center gap-1.5 ${
                    isRoomFull
                      ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
                      : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full animate-pulse ${
                      isRoomFull ? "bg-amber-400" : "bg-emerald-400"
                    }`}
                  />
                  ONLINE ({devicesCount}/{maxDevices} TVs{isRoomFull ? " • LIMITE ATINGIDO" : ""})
                </span>
              ) : (
                <span className="text-neutral-500 text-[9px] bg-neutral-900 px-2 py-0.5 rounded-full border border-neutral-800 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-neutral-600" />
                  OFFLINE (0/{maxDevices} TVs)
                </span>
              )}
            </div>
            <h1 className="mt-0.5 text-xl sm:text-2xl font-bold tracking-tight text-white truncate">
              {currentRoom?.name || slug}
            </h1>
          </div>

          {/* Botões de Ação da TV */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => {
                if (confirm("Forçar recarregamento completo da TV conectada?")) signageApi.reloadRoom(slug);
              }}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs uppercase tracking-wider text-neutral-300 hover:border-yellow-500 hover:text-yellow-400 transition"
              title="Recarregar tela inteira da TV"
            >
              <RefreshCw className="h-3.5 w-3.5 flex-shrink-0" />
              <span>Reload TV</span>
            </button>
            <a
              href={playerUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3.5 py-2 text-xs uppercase tracking-wider text-emerald-400 hover:bg-emerald-500 hover:text-black font-semibold transition"
            >
              <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
              <span>Abrir Player ↗</span>
            </a>
          </div>
        </div>

        {/* Linha 2: Seletor de Modo Básico vs Avançado */}
        <div className="w-full sm:w-auto grid grid-cols-2 sm:inline-flex bg-neutral-900 border border-neutral-800 p-1 rounded-xl gap-1">
          <button
            onClick={() => handleSetViewMode("basic")}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
              viewMode === "basic"
                ? "bg-emerald-500 text-black shadow-md font-bold"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Modo Básico</span>
          </button>
          <button
            onClick={() => handleSetViewMode("advanced")}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
              viewMode === "advanced"
                ? "bg-neutral-800 text-emerald-400 border border-neutral-700 shadow-md font-bold"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Wrench className="h-3.5 w-3.5" />
            <span>Modo Avançado</span>
          </button>
        </div>
      </header>

      {/* ============================================================ */}
      {/* VISÃO 1: MODO BÁSICO (Foco: Site + Áudio Dropbox / Links)     */}
      {/* ============================================================ */}
      {viewMode === "basic" ? (
        <div className="p-3 sm:p-5 md:p-8 space-y-4 sm:space-y-6 max-w-5xl mx-auto w-full">
          {/* Card 1: Exibição Web (Site Remoto / Dashboard) */}
          <div className={`rounded-xl border transition-all ${
            isSiteActive
              ? "border-emerald-500/60 bg-emerald-950/10 shadow-lg shadow-emerald-950/20"
              : "border-neutral-800 bg-neutral-900/30"
          } p-4 sm:p-5 md:p-6 space-y-3 sm:space-y-4`}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800/80">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${isSiteActive ? "bg-emerald-500/20 text-emerald-400" : "bg-neutral-800 text-neutral-400"}`}>
                  <Globe className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 flex-wrap">
                    <span>Site Remoto na TV</span>
                    {isSiteActive ? (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                        ● EXIBINDO NA TV
                      </span>
                    ) : (
                      <span className="text-[10px] bg-neutral-800 text-neutral-500 px-2 py-0.5 rounded-full">
                        ○ INATIVO / TELA PRETA
                      </span>
                    )}
                  </h2>
                  <p className="text-[11px] sm:text-xs text-neutral-400 mt-0.5">
                    Exiba cardápios, dashboards ou páginas web em tela cheia na TV.
                  </p>
                </div>
              </div>

              {/* Ações Rápidas do Site Ativo */}
              {isSiteActive && (
                <div className="grid grid-cols-3 sm:flex items-center gap-1.5 w-full sm:w-auto">
                  <button
                    onClick={() => signageApi.reloadSite(slug)}
                    className="flex items-center justify-center gap-1 rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-[11px] text-neutral-200 hover:border-emerald-500 hover:text-white transition"
                    title="Recarrega apenas o site na TV"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Recarregar</span>
                  </button>
                  <a
                    href={stateQ.data?.siteUrl || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-1 rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-[11px] text-neutral-200 hover:border-blue-500 hover:text-white transition"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span>Abrir</span>
                  </a>
                  <button
                    onClick={handleClearSite}
                    disabled={setState.isPending}
                    className="flex items-center justify-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-400 hover:bg-red-500 hover:text-white transition"
                    title="Desativa o site na TV"
                  >
                    <X className="h-3 w-3" />
                    <span>Desativar</span>
                  </button>
                </div>
              )}
            </div>

            {/* Input de URL do Site (16px em mobile evita auto-zoom do iOS) */}
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
              <div className="relative flex-1 w-full">
                <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
                <input
                  placeholder="https://meusite.com.br ou link do seu dashboard..."
                  value={siteInputUrl}
                  onChange={(e) => setSiteInputUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleApplySite()}
                  className="w-full rounded-lg border border-neutral-700 bg-black py-2.5 pl-10 pr-4 text-base sm:text-sm text-white placeholder-neutral-500 outline-none focus:border-emerald-500 transition"
                />
              </div>
              <button
                onClick={handleApplySite}
                disabled={!siteInputUrl.trim() || setState.isPending}
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-lg bg-emerald-500 py-3 sm:py-2.5 px-5 text-xs font-bold uppercase tracking-wider text-black hover:bg-emerald-400 disabled:opacity-40 transition shadow flex-shrink-0"
              >
                <Tv className="h-4 w-4" />
                <span>Aplicar na TV</span>
              </button>
            </div>
          </div>

          {/* Card 2: Áudio de Fundo & Gestão de Playlist (Dropbox / Links) */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 sm:p-5 md:p-6 space-y-4 sm:space-y-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800/80">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-blue-500/20 text-blue-400">
                  <Music className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 flex-wrap">
                    <span>Áudio de Fundo & Playlists</span>
                    {stateQ.data?.audioStatus === "playing" ? (
                      <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full font-bold">
                        ● TOCANDO
                      </span>
                    ) : (
                      <span className="text-[10px] bg-neutral-800 text-neutral-500 px-2 py-0.5 rounded-full">
                        ○ PAUSADO
                      </span>
                    )}
                  </h2>
                  <p className="text-[11px] sm:text-xs text-neutral-400 mt-0.5">
                    Toque músicas contínuas pelo Dropbox ou sintonize rádios online.
                  </p>
                </div>
              </div>

              {/* Seletor entre Playlist Dropbox e Web Rádio */}
              <div className="w-full sm:w-auto grid grid-cols-2 sm:flex bg-black border border-neutral-800 p-1 rounded-lg gap-1">
                <button
                  onClick={() => setBasicAudioTab("playlist")}
                  className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                    basicAudioTab === "playlist"
                      ? "bg-blue-600 text-white shadow"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <ListMusic className="h-3.5 w-3.5" />
                  <span>Playlist</span>
                </button>
                <button
                  onClick={() => setBasicAudioTab("stream")}
                  className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                    basicAudioTab === "stream"
                      ? "bg-blue-600 text-white shadow"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <RadioIcon className="h-3.5 w-3.5" />
                  <span>Rádio / Stream</span>
                </button>
              </div>
            </div>

            {/* BARRA DE CONTROLE DE REPRODUÇÃO & VOLUME MESTRE */}
            <div className="bg-black/70 p-3 sm:p-4 rounded-xl border border-neutral-800/80 space-y-3">
              {/* Linha 1: Transporte de Áudio (Prev, Play/Pause, Next) + Volume Remoto */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Controles Play/Pause/Prev/Next */}
                <div className="flex items-center justify-center sm:justify-start gap-2">
                  <div className="flex items-center gap-1 bg-neutral-900 rounded-lg p-1 border border-neutral-800 w-full sm:w-auto justify-center">
                    <button
                      onClick={() => signageApi.sendCommand(slug, "audio", "prev")}
                      disabled={isAudioStreamActive || !activeAudio || activeAudio.items.length === 0}
                      className="h-10 w-12 sm:h-9 sm:w-9 flex items-center justify-center text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-md transition disabled:opacity-30"
                      title="Faixa Anterior"
                    >
                      <SkipBack className="h-5 w-5 sm:h-4 sm:w-4" />
                    </button>
                    {stateQ.data?.audioStatus === "playing" ? (
                      <button
                        onClick={() => signageApi.sendCommand(slug, "audio", "pause")}
                        className="h-10 flex-1 sm:flex-none sm:w-12 px-4 flex items-center justify-center bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 rounded-md transition"
                        title="Pausar Áudio"
                      >
                        <Pause className="h-5 w-5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => signageApi.sendCommand(slug, "audio", "play")}
                        className="h-10 flex-1 sm:flex-none sm:w-12 px-4 flex items-center justify-center bg-blue-600 text-white hover:bg-blue-500 rounded-md transition shadow"
                        title="Tocar Áudio"
                      >
                        <Play className="h-5 w-5 ml-0.5" />
                      </button>
                    )}
                    <button
                      onClick={() => signageApi.sendCommand(slug, "audio", "next")}
                      disabled={isAudioStreamActive || !activeAudio || activeAudio.items.length === 0}
                      className="h-10 w-12 sm:h-9 sm:w-9 flex items-center justify-center text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-md transition disabled:opacity-30"
                      title="Próxima Faixa"
                    >
                      <SkipForward className="h-5 w-5 sm:h-4 sm:w-4" />
                    </button>
                  </div>
                </div>

                {/* Volume Master Slider */}
                <div className="flex items-center justify-between sm:justify-end gap-2 bg-neutral-900/80 p-2 sm:p-1.5 rounded-lg border border-neutral-800">
                  <button
                    onClick={() => signageApi.setAudioVolume(slug, currentAudioVolume > 0 ? 0 : 100)}
                    className="p-1.5 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition"
                    title={currentAudioVolume === 0 ? "Desmutar" : "Mutar"}
                  >
                    {currentAudioVolume === 0 ? <VolumeX className="h-4 w-4 text-red-400" /> : <Volume2 className="h-4 w-4 text-blue-400" />}
                  </button>
                  <span className="text-[11px] text-neutral-400 uppercase hidden xs:inline">Vol:</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={currentAudioVolume}
                    onChange={(e) => signageApi.setAudioVolume(slug, Number(e.target.value))}
                    className="flex-1 sm:w-24 accent-blue-500 cursor-pointer h-2"
                  />
                  <span className="text-xs font-bold text-white w-9 text-right">{currentAudioVolume}%</span>
                </div>
              </div>

              {/* Linha 2: Modos de Repetição e Shuffle */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-800/60">
                <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-lg p-0.5 flex-1 sm:flex-none">
                  <button
                    onClick={() => handleChangeLoopMode("all")}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-1.5 rounded-md text-xs transition ${
                      loopMode === "all" ? "bg-blue-600 text-white font-bold shadow" : "text-neutral-400 hover:text-white"
                    }`}
                    title="Repetir todas as músicas continuamente"
                  >
                    <Repeat className="h-3.5 w-3.5" />
                    <span>Todas</span>
                  </button>
                  <button
                    onClick={() => handleChangeLoopMode("one")}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-1.5 rounded-md text-xs transition ${
                      loopMode === "one" ? "bg-blue-600 text-white font-bold shadow" : "text-neutral-400 hover:text-white"
                    }`}
                    title="Repetir faixa atual em loop"
                  >
                    <Repeat1 className="h-3.5 w-3.5" />
                    <span>Uma</span>
                  </button>
                  <button
                    onClick={() => handleChangeLoopMode("none")}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-1.5 rounded-md text-xs transition ${
                      loopMode === "none" ? "bg-blue-600 text-white font-bold shadow" : "text-neutral-400 hover:text-white"
                    }`}
                    title="Tocar uma vez e parar no final"
                  >
                    <span>1x</span>
                  </button>
                </div>

                {/* Botão de Shuffle */}
                <button
                  onClick={handleToggleShuffle}
                  className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition ${
                    shuffleActive
                      ? "bg-purple-600/30 border-purple-500/60 text-purple-300 font-bold"
                      : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white"
                  }`}
                  title="Ordem Aleatória (Shuffle)"
                >
                  <Shuffle className="h-3.5 w-3.5" />
                  <span>Aleatório</span>
                </button>
              </div>
            </div>

            {/* SELECIONOU: TAB PLAYLIST (DROPBOX) */}
            {basicAudioTab === "playlist" ? (
              <div className="space-y-4">
                {/* Seletor de Playlist Ativa & Criar Nova */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 bg-neutral-950/70 p-3 rounded-lg border border-neutral-800">
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <span className="text-xs text-neutral-400 flex-shrink-0">Playlist:</span>
                    <select
                      value={activeAudio?.id || ""}
                      onChange={(e) => handleSelectAudioPlaylist(e.target.value)}
                      className="flex-1 sm:flex-none bg-neutral-900 border border-neutral-700 text-white text-xs rounded-md px-2 py-1.5 outline-none focus:border-blue-500"
                    >
                      <option value="">-- Nenhuma Selecionada --</option>
                      {audioPlaylists.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.items?.length || 0} faixas)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                      onClick={handleCreateNewAudioPlaylist}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-semibold px-2.5 py-1.5 rounded-md bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition"
                    >
                      <Plus className="h-3.5 w-3.5" /> <span>Nova Playlist</span>
                    </button>
                    {activeAudio && activeAudio.items.length > 0 && (
                      <button
                        onClick={handleClearPlaylist}
                        className="text-xs text-neutral-500 hover:text-red-400 px-2 py-1.5 transition"
                        title="Limpar todas as faixas desta playlist"
                      >
                        Limpar Fila
                      </button>
                    )}
                  </div>
                </div>

                {/* Adicionar Faixa via Link Dropbox */}
                <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3.5 sm:p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Plus className="h-3.5 w-3.5 text-blue-400" /> Adicionar Músicas por Link
                    </span>
                    <button
                      onClick={() => setShowMultiLinksModal(true)}
                      className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
                    >
                      <Layers className="h-3 w-3" /> Colar Vários Links
                    </button>
                  </div>

                  <div className="flex flex-col md:grid md:grid-cols-[1fr_200px_auto] gap-2">
                    <input
                      placeholder="Cole o link do Dropbox (ex: https://www.dropbox.com/scl/fi/...)"
                      value={newTrackUrl}
                      onChange={(e) => setNewTrackUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddTrack(newTrackUrl, newTrackTitle)}
                      className="rounded-lg border border-neutral-700 bg-black px-3 py-2 text-base sm:text-xs text-white placeholder-neutral-500 outline-none focus:border-blue-500"
                    />
                    <input
                      placeholder="Título da música (opcional)"
                      value={newTrackTitle}
                      onChange={(e) => setNewTrackTitle(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddTrack(newTrackUrl, newTrackTitle)}
                      className="rounded-lg border border-neutral-700 bg-black px-3 py-2 text-base sm:text-xs text-white placeholder-neutral-500 outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={() => handleAddTrack(newTrackUrl, newTrackTitle)}
                      disabled={!newTrackUrl.trim()}
                      className="flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2.5 px-4 text-xs font-bold uppercase tracking-wider text-white hover:bg-blue-500 disabled:opacity-40 transition shadow"
                    >
                      <Plus className="h-4 w-4" /> <span>Adicionar</span>
                    </button>
                  </div>

                  <p className="text-[11px] text-neutral-500">
                    💡 <strong className="text-neutral-400">Dica:</strong> Cole links compartilhados comuns do Dropbox. O sistema converte automaticamente para streaming sem comerciais.
                  </p>
                </div>

                {/* Lista de Faixas da Playlist */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-neutral-400 px-1">
                    <span>Faixas ({activeAudio?.items?.length || 0})</span>
                    <span className="text-[11px] text-neutral-500 hidden sm:inline">Toque em qualquer faixa para tocar na TV</span>
                  </div>

                  {activeAudio && activeAudio.items && activeAudio.items.length > 0 ? (
                    <div className="space-y-1.5 max-h-96 overflow-y-auto pr-0.5">
                      {activeAudio.items.map((item, idx) => {
                        const isCurrentlyPlaying =
                          !isAudioStreamActive &&
                          stateQ.data?.audioStatus === "playing" &&
                          currentAudioIndex === idx;

                        return (
                          <div
                            key={idx}
                            className={`flex items-center justify-between gap-2.5 p-2.5 rounded-lg border transition ${
                              isCurrentlyPlaying
                                ? "border-blue-500/80 bg-blue-950/25 shadow-md border-l-4 border-l-blue-500"
                                : "border-neutral-800/80 bg-neutral-950/50 hover:border-neutral-700"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              {/* Botão de Tocar Faixa */}
                              <button
                                onClick={() => handlePlayTrack(idx)}
                                className={`h-9 w-9 rounded-full flex items-center justify-center transition flex-shrink-0 ${
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
                                <div className="text-xs font-semibold text-white truncate flex items-center gap-1.5">
                                  <span className="text-neutral-500 text-[10px] flex-shrink-0">#{idx + 1}</span>
                                  <span className="truncate">{item.title || extractTrackTitle(item.url)}</span>
                                </div>
                                <div className="text-[10px] text-neutral-500 truncate mt-0.5" title={item.url}>
                                  {item.url}
                                </div>
                              </div>
                            </div>

                            {/* Ações: Mover Cima, Baixo, Excluir com touch targets confortáveis */}
                            <div className="flex items-center gap-0.5 flex-shrink-0">
                              <button
                                onClick={() => handleMoveTrack(idx, "up")}
                                disabled={idx === 0}
                                className="p-2 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 disabled:opacity-20 transition"
                                title="Mover para cima"
                              >
                                <ChevronUp className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleMoveTrack(idx, "down")}
                                disabled={idx === activeAudio.items.length - 1}
                                className="p-2 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 disabled:opacity-20 transition"
                                title="Mover para baixo"
                              >
                                <ChevronDown className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleRemoveTrack(idx)}
                                className="p-2 rounded text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition"
                                title="Remover da playlist"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-neutral-800 p-8 text-center text-xs text-neutral-500">
                      Nenhuma música na playlist ainda. Cole o link do Dropbox acima para adicionar.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* SELECIONOU: TAB RÁDIO / STREAM ÚNICO */
              <div className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-950/50 p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RadioIcon className={`h-4 w-4 ${isAudioStreamActive ? "text-blue-400 animate-pulse" : "text-neutral-500"}`} />
                    <span className="text-xs font-semibold text-white">Transmissão Direta / Web Rádio</span>
                    {isAudioStreamActive && (
                      <span className="text-[9px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full font-bold">
                        SINTONIZADO
                      </span>
                    )}
                  </div>

                  {isAudioStreamActive && (
                    <button
                      onClick={handleClearAudioStream}
                      className="text-xs text-red-400 hover:underline flex items-center gap-1"
                    >
                      <X className="h-3 w-3" /> <span className="hidden sm:inline">Desativar Rádio</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
                  <input
                    placeholder="Link da rádio (ex: https://stream.zeno.fm/... ou link .mp3 contínuo)"
                    value={audioStreamInputUrl}
                    onChange={(e) => setAudioStreamInputUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleApplyAudioStream()}
                    className="flex-1 w-full rounded-lg border border-neutral-700 bg-black px-3 py-2.5 text-base sm:text-xs text-white outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={handleApplyAudioStream}
                    disabled={!audioStreamInputUrl.trim() || setState.isPending}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-blue-500 disabled:opacity-40 transition shadow"
                  >
                    <RadioIcon className="h-4 w-4" /> <span>Sintonizar</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Card 3: Dispositivos Conectados (Slots & Retirar para Lobby) */}
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
      ) : (
        /* ============================================================ */
        /* VISÃO 2: MODO AVANÇADO (Completo: Imagens, Vídeos, Editor)  */
        /* ============================================================ */
        <div className="flex flex-col flex-1">
          {/* Status Bar Avançada */}
          <section className={`grid grid-cols-1 sm:grid-cols-2 gap-px bg-neutral-800 border-b border-neutral-800 ${activeTab !== "control" ? "hidden lg:grid" : "grid"}`}>
            <div className="bg-black p-4 md:px-8 py-3">
              <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-500">
                📺 Visual Display
              </div>
              <div className="mt-1 flex items-center justify-between">
                {isSiteActive ? (
                  <span className="truncate text-base text-emerald-400 font-semibold flex items-center gap-2">
                    <Globe className="h-4 w-4" /> {stateQ.data?.siteUrl}
                  </span>
                ) : (
                  <span className="truncate text-base text-white">
                    {activeVisual?.name ? `Playlist: ${activeVisual.name}` : "— Idle (Inativo) —"}
                  </span>
                )}
                <span className="text-xs text-neutral-500 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800 uppercase">
                  {isSiteActive ? "Site Mode" : stateQ.data?.visualStatus || "idle"}
                </span>
              </div>
            </div>

            <div className="bg-black p-4 md:px-8 py-3">
              <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-500">
                🎵 Trilha Sonora de Fundo (BGM)
              </div>
              <div className="mt-1 flex items-center justify-between">
                {isAudioStreamActive ? (
                  <span className="truncate text-base text-blue-400 font-semibold flex items-center gap-2">
                    <RadioIcon className="h-4 w-4" /> Stream: {stateQ.data?.audioStreamUrl}
                  </span>
                ) : (
                  <span className="truncate text-base text-blue-400 font-semibold flex items-center gap-2">
                    <Music className="h-4 w-4" />
                    {activeAudio?.name ? activeAudio.name : "— Sem Áudio —"}
                  </span>
                )}
                <span className="text-xs text-neutral-500 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800 uppercase">
                  {stateQ.data?.audioStatus || "idle"}
                </span>
              </div>
            </div>
          </section>

          {/* Controles de Transporte Avançados */}
          <section className={`grid grid-cols-1 md:grid-cols-2 gap-px bg-neutral-800 border-b border-neutral-800 ${activeTab !== "control" ? "hidden lg:grid" : "grid"}`}>
            {/* Visual Remote */}
            <div className="bg-black p-4 md:px-8 flex items-center justify-between">
              <div className="text-xs uppercase text-neutral-400 flex items-center gap-2">
                <Tv className="h-4 w-4 text-emerald-400" /> Controle Visual
              </div>
              <div className="flex items-center gap-1 bg-neutral-900 rounded p-1 border border-neutral-800">
                <button
                  onClick={() => signageApi.sendCommand(slug, "visual", "prev")}
                  disabled={isSiteActive}
                  className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition disabled:opacity-30"
                  title="Anterior"
                >
                  <SkipBack className="h-4 w-4" />
                </button>
                {stateQ.data?.visualStatus === "paused" ? (
                  <button
                    onClick={() => signageApi.sendCommand(slug, "visual", "play")}
                    disabled={isSiteActive}
                    className="p-2 text-emerald-400 hover:text-emerald-300 hover:bg-neutral-800 rounded transition disabled:opacity-30"
                    title="Play"
                  >
                    <Play className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => signageApi.sendCommand(slug, "visual", "pause")}
                    disabled={isSiteActive}
                    className="p-2 text-yellow-500 hover:text-yellow-400 hover:bg-neutral-800 rounded transition disabled:opacity-30"
                    title="Pause"
                  >
                    <Pause className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => signageApi.sendCommand(slug, "visual", "next")}
                  disabled={isSiteActive}
                  className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition disabled:opacity-30"
                  title="Próximo"
                >
                  <SkipForward className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Audio Remote */}
            <div className="bg-black p-4 md:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="text-xs uppercase text-neutral-400 flex items-center gap-2">
                  <Music className="h-4 w-4 text-blue-400" /> Volume Remoto
                </div>
                <div className="flex items-center gap-2 bg-neutral-900/80 px-2 py-1 rounded border border-neutral-800">
                  <button
                    onClick={() => signageApi.setAudioVolume(slug, currentAudioVolume > 0 ? 0 : 100)}
                    className="text-neutral-400 hover:text-white"
                  >
                    {currentAudioVolume === 0 ? <VolumeX className="h-4 w-4 text-red-400" /> : <Volume2 className="h-4 w-4 text-blue-400" />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={currentAudioVolume}
                    onChange={(e) => signageApi.setAudioVolume(slug, Number(e.target.value))}
                    className="w-20 accent-blue-500 cursor-pointer"
                  />
                  <span className="text-[10px] text-neutral-400 w-7">{currentAudioVolume}%</span>
                </div>
              </div>

              <div className="flex items-center gap-1 bg-neutral-900 rounded p-1 border border-neutral-800 self-end sm:self-auto">
                <button
                  onClick={() => signageApi.sendCommand(slug, "audio", "prev")}
                  disabled={isAudioStreamActive}
                  className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition disabled:opacity-30"
                  title="Faixa Anterior"
                >
                  <SkipBack className="h-4 w-4" />
                </button>
                {stateQ.data?.audioStatus === "paused" ? (
                  <button
                    onClick={() => signageApi.sendCommand(slug, "audio", "play")}
                    className="p-2 text-blue-400 hover:text-blue-300 hover:bg-neutral-800 rounded transition"
                  >
                    <Play className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => signageApi.sendCommand(slug, "audio", "pause")}
                    className="p-2 text-yellow-500 hover:text-yellow-400 hover:bg-neutral-800 rounded transition"
                  >
                    <Pause className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => signageApi.sendCommand(slug, "audio", "next")}
                  disabled={isAudioStreamActive}
                  className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition disabled:opacity-30"
                  title="Próxima Faixa"
                >
                  <SkipForward className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>

          {/* Painel Avançado: Playlists + Editor Completo */}
          <section className="flex flex-col lg:grid lg:grid-cols-[1fr_400px] flex-1 overflow-hidden">
            {/* Aba de Controle no Mobile: Mostra resumo para não ficar vazio */}
            <div className={`p-4 flex-col gap-4 ${activeTab === "control" ? "flex lg:hidden" : "hidden"}`}>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-3">
                <div className="text-xs uppercase tracking-wider text-neutral-400 font-bold">
                  Playlists Ativas
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-black border border-neutral-800">
                    <span className="text-neutral-400">Visual:</span>
                    <span className="text-white font-semibold">{activeVisual?.name || "Nenhuma"}</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-black border border-neutral-800">
                    <span className="text-neutral-400">Áudio:</span>
                    <span className="text-blue-400 font-semibold">{activeAudio?.name || "Nenhuma"}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    onClick={() => setActiveTab("playlists")}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-neutral-800 text-xs font-semibold text-white hover:bg-neutral-700"
                  >
                    <ListVideo className="h-4 w-4" /> Gerenciar Playlists
                  </button>
                  <button
                    onClick={() => setActiveTab("editor")}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold hover:bg-emerald-500/30"
                  >
                    <PenTool className="h-4 w-4" /> Abrir Editor
                  </button>
                </div>
              </div>

              {/* Dispositivos Conectados no Mobile */}
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

            {/* Playlists Visuais e de Áudio */}
            <div className={`overflow-y-auto p-4 md:p-8 flex-col gap-6 ${activeTab !== "playlists" ? "hidden lg:flex" : "flex"}`}>
              {/* Dispositivos Conectados na TV (Limite de 2) */}
              <RoomDevicesCard
                slug={slug}
                devices={devicesQ.data?.devices}
                count={devicesCount}
                max={maxDevices}
                onKick={(clientId, reason) => kickDeviceMut.mutate({ clientId, reason })}
                isKicking={kickDeviceMut.isPending}
                playerUrl={playerUrl}
              />

              {/* Playlists Visuais */}
              <div>
                <div className="mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-400 flex items-center gap-2">
                    <Tv className="h-4 w-4 text-emerald-400" /> Playlists Visuais (Vídeos / Imagens)
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={!selectedVisual || setState.isPending}
                      onClick={() => selectedVisual && setState.mutate({ playlist: selectedVisual, mode: "playlist" })}
                      className="flex-1 sm:flex-none rounded bg-emerald-500 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-black transition hover:bg-emerald-400 disabled:opacity-30"
                    >
                      Aplicar na TV
                    </button>
                    <button
                      disabled={setState.isPending}
                      onClick={() => setState.mutate({ playlist: null })}
                      className="flex-1 sm:flex-none rounded border border-neutral-700 px-3 py-1.5 text-xs uppercase tracking-wider text-neutral-300 transition hover:border-red-500 hover:text-red-400"
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
                        if (confirm(`Apagar a playlist "${p.name}"?`)) {
                          deletePlaylistMut.mutate(p.id);
                          if (selectedVisual === p.id) setSelectedVisual(null);
                        }
                      }}
                    />
                  ))}
                  {visualPlaylists.length === 0 && (
                    <div className="col-span-2 rounded border border-dashed border-neutral-800 p-6 text-center text-xs text-neutral-600">
                      Nenhuma playlist visual criada.
                    </div>
                  )}
                </div>
              </div>

              {/* Playlists de Áudio */}
              <div>
                <div className="mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-400 flex items-center gap-2">
                    <Music className="h-4 w-4 text-blue-400" /> Playlists de Áudio (BGM)
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={!selectedAudio || setState.isPending}
                      onClick={() => selectedAudio && setState.mutate({ audioPlaylist: selectedAudio, audioStreamUrl: null })}
                      className="flex-1 sm:flex-none rounded bg-blue-500 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-black transition hover:bg-blue-400 disabled:opacity-30"
                    >
                      Aplicar Áudio
                    </button>
                    <button
                      disabled={setState.isPending}
                      onClick={() => setState.mutate({ audioPlaylist: null, audioStreamUrl: null })}
                      className="flex-1 sm:flex-none rounded border border-neutral-700 px-3 py-1.5 text-xs uppercase tracking-wider text-neutral-300 transition hover:border-red-500 hover:text-red-400"
                    >
                      Mutar Trilha
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
                        if (confirm(`Apagar a playlist "${p.name}"?`)) {
                          deletePlaylistMut.mutate(p.id);
                          if (selectedAudio === p.id) setSelectedAudio(null);
                        }
                      }}
                    />
                  ))}
                  {audioPlaylists.length === 0 && (
                    <div className="col-span-2 rounded border border-dashed border-neutral-800 p-6 text-center text-xs text-neutral-600">
                      Nenhuma playlist de áudio criada.
                    </div>
                  )}
                </div>
              </div>

              {/* Excluir Sala */}
              <div className="pt-6 border-t border-neutral-900 flex justify-end">
                <button
                  onClick={handleDeleteRoom}
                  disabled={deleteRoomMut.isPending}
                  className="flex items-center gap-1.5 rounded border border-red-500/20 bg-red-500/5 px-3.5 py-2 text-xs text-red-400 hover:bg-red-500 hover:text-white transition"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir esta Sala
                </button>
              </div>
            </div>

            {/* Editor de Playlists do Modo Avançado */}
            <div className={`border-t lg:border-t-0 lg:border-l border-neutral-800 bg-neutral-950/70 p-4 md:p-6 overflow-y-auto ${activeTab !== "editor" ? "hidden lg:block" : "block"}`}>
              <ConfigPlaylistForm
                playlists={playlistsQ.data || []}
                selectedId={editingPlaylistId}
                onSelectId={setEditingPlaylistId}
              />
            </div>
          </section>

          {/* Mobile Bottom Navigation do Modo Avançado */}
          <nav className="fixed bottom-0 left-0 right-0 h-16 bg-neutral-950/95 backdrop-blur-md border-t border-neutral-800 flex lg:hidden z-40">
            <button
              onClick={() => setActiveTab("control")}
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
                activeTab === "control" ? "text-emerald-400 font-bold" : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <Gamepad2 className="h-5 w-5" />
              <span className="text-[10px] uppercase tracking-wider font-semibold">Controle</span>
            </button>
            <button
              onClick={() => setActiveTab("playlists")}
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
                activeTab === "playlists" ? "text-emerald-400 font-bold" : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <ListVideo className="h-5 w-5" />
              <span className="text-[10px] uppercase tracking-wider font-semibold">Playlists</span>
            </button>
            <button
              onClick={() => setActiveTab("editor")}
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
                activeTab === "editor" ? "text-emerald-400 font-bold" : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <PenTool className="h-5 w-5" />
              <span className="text-[10px] uppercase tracking-wider font-semibold">Editor</span>
            </button>
          </nav>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL PARA COLAR MÚLTIPLOS LINKS DE UMA VEZ (DROPBOX)         */}
      {/* ============================================================ */}
      {showMultiLinksModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4">
          <div className="w-full max-w-lg rounded-xl border border-neutral-800 bg-neutral-950 p-4 sm:p-6 flex flex-col shadow-2xl space-y-4 max-h-[90dvh]">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-blue-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Adicionar Vários Links
                </h3>
              </div>
              <button onClick={() => setShowMultiLinksModal(false)} className="p-1.5 text-neutral-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-neutral-400">
              Cole uma lista de links do Dropbox ou links diretos de áudio (um por linha). O sistema converterá cada link e adicionará à playlist.
            </p>

            <textarea
              rows={8}
              placeholder={`https://www.dropbox.com/scl/fi/xyz1/musica1.mp3?dl=0\nhttps://www.dropbox.com/scl/fi/xyz2/musica2.mp3?dl=0\nhttps://meusite.com/audio.mp3`}
              value={multiLinksText}
              onChange={(e) => setMultiLinksText(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-black p-3 text-base sm:text-xs text-white placeholder-neutral-600 outline-none focus:border-blue-500 font-mono"
            />

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
              <button
                onClick={() => setShowMultiLinksModal(false)}
                className="rounded-lg border border-neutral-700 px-4 py-2 text-xs text-neutral-300 hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddMultipleTracks}
                disabled={!multiLinksText.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" /> <span>Adicionar à Playlist</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
    <div
      className={`rounded-xl border transition-all ${
        isFull
          ? "border-amber-500/40 bg-neutral-900/40"
          : count > 0
          ? "border-emerald-500/30 bg-neutral-900/30"
          : "border-neutral-800 bg-neutral-900/20"
      } p-4 sm:p-5 md:p-6 space-y-4`}
    >
      {/* Header do Card de Dispositivos */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800/80">
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-lg ${
              isFull
                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                : count > 0
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "bg-neutral-800 text-neutral-400"
            }`}
          >
            <Tv className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 flex-wrap">
              <span>Dispositivos Conectados</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                  isFull
                    ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                    : count > 0
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                    : "bg-neutral-800 text-neutral-500 border-neutral-700"
                }`}
              >
                {count}/{max} VAGAS OCUPADAS {isFull && "• SALA CHEIA"}
              </span>
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Limite de {max} telas simultâneas por sala. Ao retirar, a tela volta ao lobby (sem banir).
            </p>
          </div>
        </div>

        {/* Botão de Retirar Todos */}
        {count > 0 && (
          <button
            onClick={() => {
              if (
                confirm(
                  `Deseja retirar TODOS os ${count} dispositivo(s) desta sala e enviá-los de volta ao lobby?`
                )
              ) {
                onKick("all", "Todos os dispositivos desta sala foram retirados pelo administrador.");
              }
            }}
            disabled={isKicking}
            className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-3.5 py-2 text-xs font-semibold uppercase tracking-wider transition disabled:opacity-40"
            title="Desconecta todas as telas desta sala e as envia para o lobby"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Retirar Todas as Telas ({count})</span>
          </button>
        )}
      </div>

      {/* Grid de Vagas / Slots */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {/* Telas Conectadas */}
        {devices.map((device, idx) => (
          <div
            key={device.id}
            className="flex flex-col justify-between p-3.5 sm:p-4 rounded-xl border border-neutral-700/80 bg-black/60 shadow-sm space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex-shrink-0">
                  <Monitor className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-white truncate flex items-center gap-1.5">
                    <span>{device.deviceLabel}</span>
                  </div>
                  <div className="text-[11px] text-neutral-400 flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Vaga #{idx + 1}
                    </span>
                    <span className="text-neutral-500">•</span>
                    <span className="text-neutral-300 font-mono text-[10px] bg-neutral-900 px-1.5 py-0.5 rounded border border-neutral-800">
                      IP: {device.ip}
                    </span>
                  </div>
                </div>
              </div>

              <span className="text-[10px] text-neutral-500 flex items-center gap-1 flex-shrink-0">
                <Clock className="h-3 w-3" />
                {formatConnectedTime(device.connectedAt)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-800/80">
              <div className="text-[10px] text-neutral-500 truncate">
                ID: <code className="text-neutral-400">{device.id}</code>
              </div>
              <button
                onClick={() => {
                  if (confirm(`Retirar "${device.deviceLabel}" desta sala e enviá-lo ao lobby?`)) {
                    onKick(
                      device.id,
                      "Você foi retirado da sala pelo administrador e enviado ao lobby."
                    );
                  }
                }}
                disabled={isKicking}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-700 bg-neutral-800 hover:bg-red-500/20 hover:border-red-500/40 hover:text-red-300 text-neutral-300 text-xs font-semibold transition disabled:opacity-40"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Retirar para o Lobby</span>
              </button>
            </div>
          </div>
        ))}

        {/* Vagas Livres (até o limite max) */}
        {Array.from({ length: emptySlotsCount }).map((_, i) => {
          const slotNum = count + i + 1;
          return (
            <div
              key={`empty-slot-${slotNum}`}
              className="flex flex-col items-center justify-center p-4 sm:p-5 rounded-xl border border-dashed border-neutral-800 bg-neutral-950/40 text-center space-y-1.5 min-h-[110px]"
            >
              <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-semibold">
                <Tv className="h-4 w-4 text-neutral-600" />
                <span>Vaga #{slotNum} Disponível</span>
              </div>
              <p className="text-[11px] text-neutral-500 max-w-xs">
                Aguardando conexão da TV ou selecione esta sala no menu do player.
              </p>
              <a
                href={playerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-medium pt-1"
              >
                <span>Conectar TV nesta vaga ↗</span>
              </a>
            </div>
          );
        })}
      </div>

      {/* Dica de ajuda no rodapé */}
      <div className="text-[11px] text-neutral-500 flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-neutral-800/40">
        <span>💡 Não é banimento: a tela retirada pode voltar à sala pelo lobby assim que houver vaga.</span>
        <span>Máximo: {max} telas simultâneas</span>
      </div>
    </div>
  );
}

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
      className={`group relative rounded border text-left transition ${
        selected
          ? playlist.type === "visual"
            ? "border-emerald-500 bg-emerald-500/5 shadow-md"
            : "border-blue-500 bg-blue-500/5 shadow-md"
          : "border-neutral-800 hover:border-neutral-600 bg-neutral-900/30"
      }`}
    >
      <button onClick={onClick} className="w-full p-4 text-left">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-white truncate pr-2">{playlist.name}</div>
          {active && (
            <span
              className={`rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider font-bold ${
                playlist.type === "visual"
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
              }`}
            >
              No Ar
            </span>
          )}
        </div>
        <div className="mt-2 text-[10px] uppercase tracking-wider text-neutral-400 flex items-center gap-2">
          {playlist.type === "visual" ? <Tv className="h-3 w-3 text-emerald-400" /> : <Music className="h-3 w-3 text-blue-400" />}
          {playlist.items.length} item{playlist.items.length === 1 ? "" : "s"} · {playlist.loop ? "loop contínuo" : "tocar uma vez"}
        </div>
      </button>

      {/* Ações do Card */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="rounded p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white transition"
          title="Editar Playlist"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="rounded p-1.5 text-neutral-400 hover:bg-red-500/20 hover:text-red-400 transition"
          title="Apagar Playlist"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

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

  // Modal de Biblioteca de Mídia
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
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-400 font-semibold">
          Editor de Playlists
        </div>
        {selectedId !== "new" && (
          <button
            onClick={() => onSelectId("new")}
            className="text-[10px] text-emerald-400 hover:underline uppercase tracking-wider"
          >
            + Criar Nova
          </button>
        )}
      </div>

      <select
        value={selectedId}
        onChange={(e) => onSelectId(e.target.value)}
        className="mb-3 w-full rounded border border-neutral-800 bg-black px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
      >
        <option value="new">-- Criar Nova Playlist --</option>
        {playlists.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.type})
          </option>
        ))}
      </select>

      <div className="flex bg-neutral-900 rounded p-1 mb-3">
        <button
          type="button"
          onClick={() => setType("visual")}
          className={`flex-1 text-xs font-semibold py-1.5 rounded transition ${
            type === "visual" ? "bg-emerald-500 text-black shadow" : "text-neutral-400 hover:text-white"
          }`}
        >
          Visual (Telas)
        </button>
        <button
          type="button"
          onClick={() => setType("audio")}
          className={`flex-1 text-xs font-semibold py-1.5 rounded transition ${
            type === "audio" ? "bg-blue-500 text-black shadow" : "text-neutral-400 hover:text-white"
          }`}
        >
          Áudio (BGM)
        </button>
      </div>

      <input
        placeholder="Nome da Playlist"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={`mb-3 w-full rounded border border-neutral-800 bg-black px-3 py-2 text-base sm:text-sm text-white outline-none ${
          type === "visual" ? "focus:border-emerald-500" : "focus:border-blue-500"
        }`}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 bg-neutral-900/60 p-2.5 text-xs rounded border border-neutral-800">
        <label className="flex items-center gap-2 text-neutral-300 cursor-pointer">
          <input
            type="checkbox"
            checked={loop}
            onChange={(e) => setLoop(e.target.checked)}
            className={type === "visual" ? "accent-emerald-500" : "accent-blue-500"}
          />
          Loop Contínuo
        </label>

        {type === "visual" && (
          <label className="flex items-center gap-2 text-neutral-400" title="Tempo padrão para imagens e páginas web">
            Tempo:
            <input
              type="number"
              min={1}
              value={globalDuration}
              onChange={(e) => setGlobalDuration(Number(e.target.value))}
              className="w-14 rounded bg-black border border-neutral-800 px-1 py-1 outline-none focus:border-emerald-500 text-center text-white"
            />
            <span>s</span>
          </label>
        )}
      </div>

      {type === "visual" && (
        <div className="space-y-2 mb-3">
          {/* YouTube Link */}
          <div className="flex items-center gap-2">
            <input
              placeholder="Adicionar link do YouTube"
              value={ytUrl}
              onChange={(e) => setYtUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addYt()}
              className="flex-1 rounded border border-neutral-800 bg-black px-3 py-2 text-base sm:text-xs text-white outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={addYt}
              className="rounded bg-neutral-800 p-2.5 text-neutral-300 hover:bg-emerald-500 hover:text-black transition"
              title="Adicionar YouTube"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {/* Web Page Item */}
          <div className="flex items-center gap-2">
            <input
              placeholder="Página web à rotação (ex: https://weather.com)"
              value={webUrl}
              onChange={(e) => setWebUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addWebItem()}
              className="flex-1 rounded border border-neutral-800 bg-black px-3 py-2 text-base sm:text-xs text-white outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={addWebItem}
              className="rounded bg-neutral-800 p-2.5 text-neutral-300 hover:bg-emerald-500 hover:text-black transition"
              title="Adicionar Página Web"
            >
              <Globe className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {type === "audio" && (
        <div className="mb-3 flex items-center gap-2">
          <input
            placeholder="Link de áudio (Dropbox ou MP3 online)"
            value={audioUrl}
            onChange={(e) => setAudioUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addAudioUrl()}
            className="flex-1 rounded border border-neutral-800 bg-black px-3 py-2 text-base sm:text-xs text-white outline-none focus:border-blue-500"
          />
          <button
            type="button"
            onClick={addAudioUrl}
            className="rounded bg-neutral-800 p-2.5 text-neutral-300 hover:bg-blue-500 hover:text-black transition"
            title="Adicionar Link de Áudio"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Botões de Mídia: Upload e Galeria Existente */}
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setShowMediaModal(true)}
          className="flex-1 flex items-center justify-center gap-2 rounded border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-xs font-semibold text-neutral-300 hover:border-neutral-500 hover:text-white transition"
        >
          <FolderOpen className="h-4 w-4 text-emerald-400" />
          Galeria do Servidor
        </button>
      </div>

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
        className={`flex flex-col items-center justify-center rounded border-2 border-dashed px-4 py-5 text-center text-xs transition mb-4 ${
          dragOver
            ? type === "visual"
              ? "border-emerald-500 bg-emerald-500/5 text-emerald-400"
              : "border-blue-500 bg-blue-500/5 text-blue-400"
            : "border-neutral-800 text-neutral-500"
        }`}
      >
        <Upload className="mb-2 h-5 w-5" />
        {uploading ? (
          "Enviando arquivo..."
        ) : type === "visual" ? (
          <span>Arraste Imagens/Vídeos aqui</span>
        ) : (
          <span>Arraste Músicas (MP3/WAV) aqui</span>
        )}
        <label
          className={`mt-1.5 cursor-pointer hover:underline font-semibold p-1 ${
            type === "visual" ? "text-emerald-400" : "text-blue-400"
          }`}
        >
          ou clique para selecionar do dispositivo
          <input
            type="file"
            multiple
            accept={type === "visual" ? "video/*,image/*" : "audio/*"}
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
        </label>
      </div>

      {/* Playlist Items / Fila */}
      <div className="mb-2 text-[10px] uppercase tracking-[0.3em] text-neutral-400 font-semibold flex items-center justify-between">
        <span>Fila ({items.length})</span>
        <span className="text-neutral-600 lowercase font-normal hidden sm:inline">arraste para reordenar</span>
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
              className={`flex items-center gap-2 rounded border border-neutral-800 bg-neutral-900/60 p-2 transition ${
                draggedIdx === i ? "opacity-40" : ""
              }`}
            >
              <div
                className={`cursor-grab active:cursor-grabbing text-neutral-500 p-1 ${
                  type === "visual" ? "hover:text-emerald-400" : "hover:text-blue-400"
                }`}
              >
                <GripVertical className="h-4 w-4" />
              </div>

              {/* Preview Thumbnail / Ícone */}
              <div className="w-8 h-8 rounded bg-black flex-shrink-0 flex items-center justify-center overflow-hidden border border-neutral-800">
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
                <span
                  className={`font-bold mr-1.5 text-[10px] uppercase ${
                    it.type === "youtube"
                      ? "text-red-400"
                      : it.type === "video"
                      ? "text-blue-400"
                      : it.type === "audio"
                      ? "text-blue-500"
                      : it.type === "web"
                      ? "text-emerald-400"
                      : "text-emerald-500"
                  }`}
                >
                  {it.type}
                </span>
                <span className="text-neutral-300 text-[11px] truncate" title={it.url}>
                  {it.title || it.url.split("/").pop()}
                </span>
              </div>

              {it.type === "image" || it.type === "web" ? (
                <div className="flex items-center gap-1 flex-shrink-0" title="Duração em segundos">
                  <input
                    type="number"
                    min={1}
                    value={it.duration ?? globalDuration}
                    onChange={(e) => updateItem(i, { duration: Number(e.target.value) })}
                    className="w-12 rounded bg-black border border-neutral-800 px-1 py-0.5 text-center text-white outline-none focus:border-emerald-500 text-xs"
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
                      className={`w-12 ${type === "visual" ? "accent-emerald-500" : "accent-blue-500"}`}
                      title={`Volume: ${it.volume ?? 100}%`}
                    />
                  )}
                  {type === "visual" && (
                    <button
                      type="button"
                      onClick={() => updateItem(i, { muted: !it.muted })}
                      className={`p-1.5 rounded transition ${
                        it.muted ? "text-neutral-500 hover:text-white" : "text-emerald-400 hover:text-emerald-300"
                      }`}
                      title={it.muted ? "Desmutar vídeo (abaixa BGM)" : "Mutar vídeo (mantém BGM tocando)"}
                    >
                      {it.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => setItems(items.filter((_, j) => j !== i))}
                className="text-neutral-600 hover:text-red-400 p-1.5 transition"
                title="Remover"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        disabled={!name.trim() || items.length === 0 || saveMut.isPending || uploading}
        onClick={() => saveMut.mutate()}
        className={`mt-4 w-full rounded-lg px-4 py-3 text-xs font-bold uppercase tracking-wider text-black transition disabled:opacity-30 ${
          type === "visual" ? "bg-emerald-500 hover:bg-emerald-400" : "bg-blue-500 hover:bg-blue-400"
        }`}
      >
        {saveMut.isPending ? "Salvando..." : selectedId === "new" ? "Criar Playlist" : "Salvar Alterações"}
      </button>

      {/* Modal de Galeria de Mídias Existentes */}
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4">
      <div className="w-full max-w-lg rounded-xl border border-neutral-800 bg-neutral-950 p-4 sm:p-6 flex flex-col max-h-[90dvh] shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-emerald-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Biblioteca de Mídias ({filtered.length})
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
                className="flex items-center justify-between gap-2.5 p-2 rounded-lg border border-neutral-800 bg-neutral-900/60 hover:border-neutral-700 transition"
              >
                <div className="w-10 h-10 rounded bg-black flex-shrink-0 flex items-center justify-center overflow-hidden border border-neutral-800">
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
                    onClick={() => {
                      onSelect(url);
                    }}
                    className="flex items-center gap-1 rounded bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-1 text-xs text-emerald-400 hover:bg-emerald-500 hover:text-black font-semibold transition"
                  >
                    <Plus className="h-3.5 w-3.5" /> <span>Adicionar</span>
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Excluir permanentemente o arquivo "${filename}" do servidor?`)) {
                        deleteMediaMut.mutate(filename);
                      }
                    }}
                    className="p-1.5 rounded text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition"
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
            className="rounded bg-neutral-800 px-4 py-2 text-xs text-white hover:bg-neutral-700 font-semibold"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
}
