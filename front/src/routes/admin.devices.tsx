import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  Monitor,
  Tv,
  Radio,
  Pencil,
  Link2,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  Search,
  Wifi,
  ExternalLink,
  Info,
  Clock,
  Sparkles,
  Smartphone,
  Laptop,
} from "lucide-react";

export const Route = createFileRoute("/admin/devices")({
  head: () => ({
    meta: [
      { title: "Aparelhos Conectados • Signage CMS" },
      { name: "description", content: "Gerencie, identifique e vincule telas e aparelhos remotamente." },
    ],
  }),
  component: DevicesAdminPage,
});

interface Device {
  id: string;
  name: string;
  detectedLabel: string;
  userAgent: string;
  ip: string;
  screenResolution?: string;
  assignedRoomSlug: string | null;
  assignedRoomName?: string | null;
  currentPath: string;
  lastSeenAt: number;
  firstSeenAt: number;
  online: boolean;
}

interface Room {
  id: string;
  slug: string;
  name: string;
  online?: boolean;
  clientsCount?: number;
  maxClients?: number;
}

function timeAgo(timestamp: number): string {
  if (!timestamp) return "Nunca";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 15) return "Agora mesmo";
  if (seconds < 60) return `há ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}

function getDeviceIcon(label: string) {
  const l = (label || "").toLowerCase();
  if (l.includes("tv")) return <Tv className="h-5 w-5 text-emerald-400 flex-shrink-0" />;
  if (l.includes("iphone") || l.includes("android") || l.includes("smartphone"))
    return <Smartphone className="h-5 w-5 text-sky-400 flex-shrink-0" />;
  if (l.includes("pc") || l.includes("windows") || l.includes("mac") || l.includes("linux"))
    return <Laptop className="h-5 w-5 text-purple-400 flex-shrink-0" />;
  return <Monitor className="h-5 w-5 text-amber-400 flex-shrink-0" />;
}

function DevicesAdminPage() {
  const qc = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "online" | "offline" | "unbound">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [identifyingId, setIdentifyingId] = useState<string | null>(null);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [editName, setEditName] = useState("");
  const [feedbackMsg, setFeedbackMsg] = useState<{ id: string; text: string; type: "success" | "error" } | null>(null);

  // Queries
  const devicesQ = useQuery<Device[]>({
    queryKey: ["devices"],
    queryFn: async () => {
      const res = await fetch("/api/devices");
      if (!res.ok) throw new Error("Falha ao buscar aparelhos");
      return res.json();
    },
    refetchInterval: 3000,
  });

  const roomsQ = useQuery<Room[]>({
    queryKey: ["rooms"],
    queryFn: async () => {
      const res = await fetch("/api/rooms");
      if (!res.ok) throw new Error("Falha ao buscar salas");
      return res.json();
    },
  });

  // Conexão WebSocket para receber atualizações instantâneas de aparelhos
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/admin/devices`;
    let ws: WebSocket | null = null;

    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "devicesUpdate" || msg.type === "devicesList") {
            qc.setQueryData(["devices"], msg.devices);
          }
        } catch (_e) {}
      };
    } catch (_e) {}

    return () => {
      if (ws) {
        try {
          ws.close();
        } catch (_e) {}
      }
    };
  }, [qc]);

  // Mutations
  const updateDevice = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: { name?: string; assignedRoomSlug?: string | null } }) => {
      const res = await fetch(`/api/devices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Falha ao atualizar aparelho");
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["devices"] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
      setEditingDevice(null);
      if (data?.device?.id) {
        setFeedbackMsg({
          id: data.device.id,
          text: "Configurações salvas e transmitidas ao aparelho!",
          type: "success",
        });
        setTimeout(() => setFeedbackMsg(null), 3500);
      }
    },
  });

  const identifyDevice = useMutation({
    mutationFn: async (id: string) => {
      setIdentifyingId(id);
      const res = await fetch(`/api/devices/${id}/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duration: 15 }),
      });
      return res.json();
    },
    onSuccess: (data, id) => {
      setTimeout(() => setIdentifyingId(null), 2000);
      setFeedbackMsg({
        id,
        text: data?.success
          ? "Sinal enviado com sucesso! A tela do aparelho está exibindo a identificação."
          : "Aparelho não está conectado no momento.",
        type: data?.success ? "success" : "error",
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
    },
    onError: (_err, id) => {
      setIdentifyingId(null);
      setFeedbackMsg({ id, text: "Falha ao enviar sinal de identificação.", type: "error" });
      setTimeout(() => setFeedbackMsg(null), 3000);
    },
  });

  const reloadDevice = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/devices/${id}/reload`, { method: "POST" });
      return res.json();
    },
    onSuccess: (data, id) => {
      setFeedbackMsg({
        id,
        text: data?.success ? "Comando de recarregar enviado à tela." : "Aparelho indisponível.",
        type: data?.success ? "success" : "error",
      });
      setTimeout(() => setFeedbackMsg(null), 3000);
    },
  });

  const deleteDevice = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/devices/${id}`, { method: "DELETE" });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["devices"] });
    },
  });

  const cleanOfflineDevices = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/devices/clean-offline", { method: "POST" });
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["devices"] });
      alert(data?.message || "Faxina concluída!");
    },
  });

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const devices = devicesQ.data || [];
  const rooms = roomsQ.data || [];

  // Contadores
  const totalCount = devices.length;
  const onlineCount = devices.filter((d) => d.online).length;
  const boundCount = devices.filter((d) => d.assignedRoomSlug).length;
  const unboundCount = devices.filter((d) => !d.assignedRoomSlug).length;

  // Filtros
  const filteredDevices = devices.filter((device) => {
    const matchesSearch =
      device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.ip.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (device.assignedRoomName && device.assignedRoomName.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    if (filterMode === "online") return device.online;
    if (filterMode === "offline") return !device.online;
    if (filterMode === "unbound") return !device.assignedRoomSlug;
    return true;
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 overflow-y-auto pb-20 sm:pb-14 text-neutral-100">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-neutral-950 px-4 sm:px-6 py-3.5 sticky top-0 z-20 flex-shrink-0">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
                Gerenciamento de Telas
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.2 rounded-[2px] text-[10px] font-medium bg-neutral-900 text-neutral-300 border border-neutral-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span>{onlineCount} Online</span>
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight mt-0.5">
              Aparelhos Conectados
            </h1>
            <p className="text-xs text-neutral-400 mt-0.5 max-w-2xl">
              Monitore, identifique fisicamente e vincule salas remotamente para cada TV conectada.
            </p>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {devices.some((d) => !d.online) && (
              <button
                onClick={() => {
                  if (confirm(`Deseja remover da lista todos os aparelhos desconectados (${devices.filter((d) => !d.online).length})? Telas que conectarem no futuro serão detectadas novamente automaticamente.`)) {
                    cleanOfflineDevices.mutate();
                  }
                }}
                disabled={cleanOfflineDevices.isPending}
                className="min-h-[32px] px-2.5 py-1 rounded-[2px] bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-red-400 hover:bg-red-500/10 text-xs font-medium transition flex items-center gap-1.5"
                title="Limpar todos os aparelhos offline"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Limpar Desconectados ({devices.filter((d) => !d.online).length})</span>
              </button>
            )}
            <button
              onClick={() => qc.invalidateQueries({ queryKey: ["devices"] })}
              className="min-h-[32px] px-2.5 py-1 rounded-[2px] bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 text-xs font-medium transition flex items-center gap-1.5"
              title="Atualizar lista agora"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Atualizar</span>
            </button>
            <a
              href="/player/index.html"
              target="_blank"
              rel="noreferrer"
              className="min-h-[32px] px-3 py-1 rounded-[2px] bg-white text-black hover:bg-neutral-200 text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
            >
              <Tv className="h-3.5 w-3.5" />
              <span>Abrir Player</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-4 space-y-4">
        {/* Cards de Métricas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-[2px] p-3 flex flex-col justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Total Cadastrados</div>
            <div className="text-xl sm:text-2xl font-bold text-white mt-1">{totalCount}</div>
            <div className="text-[10px] text-neutral-500 mt-0.5">Histórico completo</div>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800 rounded-[2px] p-3 flex flex-col justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-300">Online Agora</div>
            <div className="text-xl sm:text-2xl font-bold text-white mt-1 flex items-baseline gap-2">
              <span>{onlineCount}</span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </div>
            <div className="text-[10px] text-neutral-500 mt-0.5">Tempo real</div>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800 rounded-[2px] p-3 flex flex-col justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Vinculados a Salas</div>
            <div className="text-xl sm:text-2xl font-bold text-white mt-1">{boundCount}</div>
            <div className="text-[10px] text-neutral-500 mt-0.5">Exibindo homenagens</div>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800 rounded-[2px] p-3 flex flex-col justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">No Lobby / Raiz</div>
            <div className="text-xl sm:text-2xl font-bold text-white mt-1">{unboundCount}</div>
            <div className="text-[10px] text-neutral-500 mt-0.5">Aguardando vinculação</div>
          </div>
        </div>

        {/* Barra de Filtros e Busca */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-neutral-900/40 p-2.5 rounded-[2px] border border-neutral-800">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, ID, sala ou IP..."
              className="w-full pl-8 pr-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-[2px] text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-500 transition"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setFilterMode("all")}
              className={`px-2.5 py-1 rounded-[2px] text-xs font-semibold transition ${
                filterMode === "all"
                  ? "bg-white text-black shadow-xs font-bold"
                  : "bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800"
              }`}
            >
              Todos ({totalCount})
            </button>
            <button
              onClick={() => setFilterMode("online")}
              className={`px-2.5 py-1 rounded-[2px] text-xs font-semibold transition flex items-center gap-1.5 ${
                filterMode === "online"
                  ? "bg-white text-black shadow-xs font-bold"
                  : "bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${filterMode === "online" ? "bg-black" : "bg-emerald-400"}`} />
              <span>Online ({onlineCount})</span>
            </button>
            <button
              onClick={() => setFilterMode("unbound")}
              className={`px-2.5 py-1 rounded-[2px] text-xs font-semibold transition ${
                filterMode === "unbound"
                  ? "bg-white text-black shadow-xs font-bold"
                  : "bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800"
              }`}
            >
              Sem Sala ({unboundCount})
            </button>
            <button
              onClick={() => setFilterMode("offline")}
              className={`px-2.5 py-1 rounded-[2px] text-xs font-semibold transition ${
                filterMode === "offline"
                  ? "bg-white text-black shadow-xs font-bold"
                  : "bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800"
              }`}
            >
              Offline ({totalCount - onlineCount})
            </button>
          </div>
        </div>

        {/* Modal de Renomear Aparelho */}
        {editingDevice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-4">
            <div className="bg-neutral-950 border border-neutral-800 rounded-[2px] p-5 max-w-md w-full shadow-2xl space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-300 uppercase tracking-wider">
                <Pencil className="h-3.5 w-3.5" />
                <span>Renomear Aparelho</span>
              </div>
              <h3 className="text-sm font-bold text-white">Editar Nome do Dispositivo</h3>
              <p className="text-xs text-neutral-400">
                Dê um nome intuitivo para facilitar a localização física na funerária (ex: "TV Parede - Sala 01", "TV Entrada Recepção").
              </p>

              <div>
                <label className="text-xs font-semibold text-neutral-300 block mb-1">Nome do Aparelho</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Ex: TV Principal - Sala 01"
                  className="w-full px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-[2px] text-xs text-white focus:outline-none focus:border-neutral-500"
                  autoFocus
                />
                <span className="text-[10px] text-neutral-500 mt-1 block font-mono">ID: {editingDevice.id}</span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setEditingDevice(null)}
                  className="px-3.5 py-1.5 rounded-[2px] bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs font-medium border border-neutral-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateDevice.mutate({ id: editingDevice.id, updates: { name: editName } });
                  }}
                  disabled={updateDevice.isPending}
                  className="px-4 py-1.5 rounded-[2px] bg-white hover:bg-neutral-200 text-black text-xs font-bold transition flex items-center gap-1.5"
                >
                  {updateDevice.isPending ? "Salvando..." : "Salvar Nome"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Feedback Banner flutuante */}
        {feedbackMsg && (
          <div
            className={`p-2.5 rounded-[2px] border text-xs font-medium flex items-center gap-2 transition ${
              feedbackMsg.type === "success"
                ? "bg-neutral-900 border-emerald-500/40 text-emerald-300"
                : "bg-neutral-900 border-red-500/40 text-red-300"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        {/* Lista de Aparelhos em Formato de Lista / Tabela */}
        {devicesQ.isLoading ? (
          <div className="p-8 text-center text-xs text-neutral-500">Carregando aparelhos conectados...</div>
        ) : filteredDevices.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-neutral-800 rounded-[2px] bg-neutral-900/30">
            <Monitor className="h-8 w-8 text-neutral-600 mx-auto mb-2" />
            <h3 className="text-xs font-bold text-neutral-300">Nenhum aparelho encontrado</h3>
            <p className="text-[11px] text-neutral-500 mt-0.5 max-w-md mx-auto">
              Assim que uma TV, computador ou celular abrir o link do player ou a raiz do sistema, ele aparecerá automaticamente nesta tela.
            </p>
          </div>
        ) : (
          <div className="rounded-[2px] border border-neutral-800 bg-neutral-950/70 overflow-hidden shadow-sm">
            {/* Cabeçalho da Lista (visível em telas médias e grandes) */}
            <div className="hidden lg:grid lg:grid-cols-12 gap-3 px-4 py-2.5 bg-neutral-900/80 border-b border-neutral-800 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              <div className="lg:col-span-4">Dispositivo / Modelo</div>
              <div className="lg:col-span-2">ID & Endereço IP</div>
              <div className="lg:col-span-3">Sala Vinculada</div>
              <div className="lg:col-span-1">Status / Visto</div>
              <div className="lg:col-span-2 text-right">Ações Remotas</div>
            </div>

            {/* Linhas de Aparelhos */}
            <div className="divide-y divide-neutral-800/80">
              {filteredDevices.map((device) => {
                const isIdentifying = identifyingId === device.id;
                return (
                  <div
                    key={device.id}
                    className={`p-3.5 sm:px-4 sm:py-3 transition flex flex-col lg:grid lg:grid-cols-12 lg:items-center gap-3 ${
                      device.online
                        ? "hover:bg-neutral-900/40 bg-neutral-950/50"
                        : "bg-neutral-950/90 opacity-60 hover:opacity-85"
                    }`}
                  >
                    {/* Coluna 1: Dispositivo, Ícone, Nome e Modelo */}
                    <div className="lg:col-span-4 flex items-center gap-3 min-w-0">
                      <div className="relative p-2 rounded-[2px] bg-neutral-900 border border-neutral-800 flex-shrink-0">
                        {getDeviceIcon(device.detectedLabel)}
                        <span
                          className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border border-neutral-950 ${
                            device.online ? "bg-emerald-400 animate-pulse" : "bg-neutral-600"
                          }`}
                          title={device.online ? "Online agora" : "Desconectado"}
                        />
                      </div>

                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs sm:text-sm font-bold text-white truncate max-w-[220px]">
                            {device.name}
                          </span>
                          <button
                            onClick={() => {
                              setEditingDevice(device);
                              setEditName(device.name);
                            }}
                            className="text-neutral-500 hover:text-white transition p-0.5"
                            title="Renomear aparelho"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <span
                            className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded-[2px] border ${
                              device.online
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                                : "bg-neutral-900 text-neutral-500 border-neutral-800"
                            }`}
                          >
                            {device.online ? "Online" : "Offline"}
                          </span>
                        </div>
                        <div className="text-[11px] text-neutral-400 truncate">
                          {device.detectedLabel}
                        </div>
                      </div>
                    </div>

                    {/* Coluna 2: ID & IP */}
                    <div className="lg:col-span-2 text-xs flex flex-row lg:flex-col items-center lg:items-start justify-between lg:justify-center gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-neutral-300 font-semibold text-[11px]">
                          {device.id}
                        </span>
                        <button
                          onClick={() => handleCopyId(device.id)}
                          className="text-neutral-500 hover:text-white p-0.5 transition"
                          title="Copiar ID"
                        >
                          {copiedId === device.id ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-neutral-500 font-mono">
                        <Wifi className="h-3 w-3 text-neutral-500 flex-shrink-0" />
                        <span>{device.ip || "localhost"}</span>
                      </div>
                    </div>

                    {/* Coluna 3: Sala Vinculada (Seletor inline) */}
                    <div className="lg:col-span-3 flex flex-col justify-center gap-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-neutral-400 font-medium lg:hidden">Sala:</span>
                        {device.assignedRoomSlug && (
                          <Link
                            to="/admin/$slug"
                            params={{ slug: device.assignedRoomSlug }}
                            className="text-[10px] text-neutral-400 hover:text-white hover:underline flex items-center gap-1 font-mono ml-auto"
                          >
                            <span>Abrir Painel</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </Link>
                        )}
                      </div>

                      <select
                        value={device.assignedRoomSlug || ""}
                        onChange={(e) => {
                          const val = e.target.value || null;
                          updateDevice.mutate({
                            id: device.id,
                            updates: { assignedRoomSlug: val },
                          });
                        }}
                        className="w-full bg-neutral-900/80 border border-neutral-800 rounded-[2px] px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-neutral-500 transition cursor-pointer hover:border-neutral-700"
                      >
                        <option value="">Lobby / Não vinculado</option>
                        {rooms.map((room) => {
                          const clients = room.clientsCount ?? 0;
                          const max = room.maxClients ?? 2;
                          return (
                            <option key={room.slug} value={room.slug}>
                              {room.name} ({clients}/{max} telas)
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {/* Coluna 4: Local da Tela & Tempo */}
                    <div className="lg:col-span-1 text-xs flex flex-row lg:flex-col items-center lg:items-start justify-between lg:justify-center gap-0.5">
                      <span className="text-[11px] text-neutral-300 font-medium truncate">
                        {device.currentPath === "/"
                          ? "Raiz (/)"
                          : device.currentPath?.includes("?room=")
                          ? "Na TV"
                          : "Lobby"}
                      </span>
                      <span className="text-[10px] text-neutral-500 flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        <span>{timeAgo(device.lastSeenAt)}</span>
                      </span>
                    </div>

                    {/* Coluna 5: Ações Rápidas */}
                    <div className="lg:col-span-2 flex items-center justify-end gap-1.5 pt-1 lg:pt-0 border-t lg:border-t-0 border-neutral-900">
                      {/* Botão Identificar */}
                      <button
                        onClick={() => identifyDevice.mutate(device.id)}
                        disabled={!device.online || isIdentifying}
                        className={`min-h-[30px] px-2.5 py-1 rounded-[2px] text-xs font-bold transition flex items-center justify-center gap-1 shadow-xs truncate ${
                          isIdentifying
                            ? "bg-amber-400 text-black font-extrabold animate-pulse"
                            : device.online
                            ? "bg-white text-black hover:bg-neutral-200"
                            : "bg-neutral-900 border border-neutral-800 text-neutral-600 cursor-not-allowed"
                        }`}
                        title="Faz a tela da TV piscar com a identificação remota"
                      >
                        <Radio className="h-3 w-3 flex-shrink-0" />
                        <span>{isIdentifying ? "Sinalizando..." : "Identificar"}</span>
                      </button>

                      {/* Botão Recarregar TV */}
                      <button
                        onClick={() => reloadDevice.mutate(device.id)}
                        disabled={!device.online}
                        className={`min-h-[30px] px-2 py-1 rounded-[2px] text-xs font-medium transition flex items-center justify-center gap-1 ${
                          device.online
                            ? "bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-850"
                            : "bg-neutral-900 border border-neutral-800 text-neutral-600 cursor-not-allowed"
                        }`}
                        title="Recarregar tela remotamente"
                      >
                        <RefreshCw className="h-3 w-3 flex-shrink-0" />
                        <span className="hidden sm:inline">Recarregar</span>
                      </button>

                      {/* Botão Excluir */}
                      <button
                        onClick={() => {
                          if (confirm(`Remover o aparelho "${device.name}" da lista?`)) {
                            deleteDevice.mutate(device.id);
                          }
                        }}
                        className="min-h-[30px] px-2 py-1 rounded-[2px] bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-red-400 hover:bg-red-500/10 text-xs font-medium transition flex items-center justify-center"
                        title="Remover aparelho"
                      >
                        <Trash2 className="h-3 w-3 flex-shrink-0" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
