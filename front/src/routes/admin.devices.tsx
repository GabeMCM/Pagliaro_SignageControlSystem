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
    <div className="flex-1 flex flex-col h-full bg-neutral-950 overflow-y-auto pb-24 sm:pb-16 text-neutral-100">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-neutral-900/60 px-4 sm:px-8 py-5 backdrop-blur-md sticky top-0 z-20 flex-shrink-0">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-emerald-400">
                Gerenciamento de Telas
              </span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-neutral-900 text-neutral-300 border border-neutral-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>{onlineCount} Online</span>
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-1">
              Aparelhos Conectados
            </h1>
            <p className="text-xs sm:text-sm text-neutral-400 mt-1 max-w-2xl leading-relaxed">
              Monitore, identifique fisicamente em segundos e vincule salas remotamente para cada TV, celular ou computador conectado.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {devices.some((d) => !d.online) && (
              <button
                onClick={() => {
                  if (confirm(`Deseja remover da lista todos os aparelhos desconectados (${devices.filter((d) => !d.online).length})? Telas que conectarem no futuro serão detectadas novamente automaticamente.`)) {
                    cleanOfflineDevices.mutate();
                  }
                }}
                disabled={cleanOfflineDevices.isPending}
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-red-400 hover:border-red-500/50 text-xs font-medium transition flex items-center gap-2"
                title="Limpar todos os aparelhos offline"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Limpar Desconectados ({devices.filter((d) => !d.online).length})</span>
              </button>
            )}
            <button
              onClick={() => qc.invalidateQueries({ queryKey: ["devices"] })}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700 text-xs font-medium transition flex items-center gap-2"
              title="Atualizar lista agora"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Atualizar</span>
            </button>
            <a
              href="/player/index.html"
              target="_blank"
              rel="noreferrer"
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500 hover:text-black text-xs font-bold transition flex items-center gap-2"
            >
              <Tv className="h-4 w-4" />
              <span>Abrir Novo Player</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <div className="max-w-6xl mx-auto w-full px-4 sm:px-8 py-6 space-y-6">
        {/* Cards de Métricas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-neutral-900/80 border border-neutral-800/80 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">Total Cadastrados</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white mt-2">{totalCount}</div>
            <div className="text-[11px] text-neutral-500 mt-1">Histórico completo</div>
          </div>

          <div className="bg-neutral-900/80 border border-emerald-500/20 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="text-[11px] font-medium uppercase tracking-wider text-emerald-400">Online Agora</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 mt-2 flex items-baseline gap-2">
              <span>{onlineCount}</span>
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">Comunicando em tempo real</div>
          </div>

          <div className="bg-neutral-900/80 border border-neutral-800/80 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="text-[11px] font-medium uppercase tracking-wider text-sky-400">Vinculados a Salas</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-sky-300 mt-2">{boundCount}</div>
            <div className="text-[11px] text-neutral-500 mt-1">Exibindo homenagens</div>
          </div>

          <div className="bg-neutral-900/80 border border-neutral-800/80 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="text-[11px] font-medium uppercase tracking-wider text-amber-400">No Lobby / Raiz</div>
            <div className="text-2xl sm:text-3xl font-extrabold text-amber-300 mt-2">{unboundCount}</div>
            <div className="text-[11px] text-neutral-500 mt-1">Aguardando vinculação</div>
          </div>
        </div>

        {/* Barra de Filtros e Busca */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-neutral-900/40 p-3 rounded-xl border border-neutral-800">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, ID, sala ou IP..."
              className="w-full pl-9 pr-4 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setFilterMode("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filterMode === "all"
                  ? "bg-emerald-500 text-black"
                  : "bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800"
              }`}
            >
              Todos ({totalCount})
            </button>
            <button
              onClick={() => setFilterMode("online")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                filterMode === "online"
                  ? "bg-emerald-500 text-black"
                  : "bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${filterMode === "online" ? "bg-black" : "bg-emerald-400"}`} />
              <span>Online ({onlineCount})</span>
            </button>
            <button
              onClick={() => setFilterMode("unbound")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filterMode === "unbound"
                  ? "bg-amber-500 text-black"
                  : "bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800"
              }`}
            >
              Sem Sala ({unboundCount})
            </button>
            <button
              onClick={() => setFilterMode("offline")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filterMode === "offline"
                  ? "bg-neutral-700 text-white"
                  : "bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800"
              }`}
            >
              Offline ({totalCount - onlineCount})
            </button>
          </div>
        </div>

        {/* Modal de Renomear Aparelho */}
        {editingDevice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
            <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in fade-in">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">
                <Pencil className="h-4 w-4" />
                <span>Renomear Aparelho</span>
              </div>
              <h3 className="text-lg font-bold text-white">Editar Nome do Dispositivo</h3>
              <p className="text-xs text-neutral-400 mt-1">
                Dê um nome intuitivo para facilitar a localização física na funerária (ex: "TV Parede - Sala 01", "TV Entrada Recepção").
              </p>

              <div className="mt-4">
                <label className="text-xs font-semibold text-neutral-300 block mb-1.5">Nome do Aparelho</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Ex: TV Principal - Sala 01"
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
                  autoFocus
                />
                <span className="text-[11px] text-neutral-500 mt-1 block">ID persistente: {editingDevice.id}</span>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingDevice(null)}
                  className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateDevice.mutate({ id: editingDevice.id, updates: { name: editName } });
                  }}
                  disabled={updateDevice.isPending}
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition flex items-center gap-2"
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
            className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2.5 transition animate-in fade-in ${
              feedbackMsg.type === "success"
                ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-200"
                : "bg-red-950/60 border-red-500/40 text-red-200"
            }`}
          >
            <Sparkles className="h-4 w-4 flex-shrink-0" />
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        {/* Lista de Aparelhos */}
        {devicesQ.isLoading ? (
          <div className="p-12 text-center text-sm text-neutral-500">Carregando aparelhos conectados...</div>
        ) : filteredDevices.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-neutral-800 rounded-2xl bg-neutral-900/30">
            <Monitor className="h-10 w-10 text-neutral-600 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-neutral-300">Nenhum aparelho encontrado</h3>
            <p className="text-xs text-neutral-500 mt-1 max-w-md mx-auto">
              Assim que uma TV, computador ou celular abrir o link do player ou a raiz do sistema, ele aparecerá automaticamente nesta tela.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredDevices.map((device) => {
              const isIdentifying = identifyingId === device.id;
              return (
                <div
                  key={device.id}
                  className={`border rounded-2xl p-5 transition flex flex-col justify-between gap-4 ${
                    device.online
                      ? "bg-neutral-900/90 border-neutral-800 hover:border-neutral-700 shadow-md"
                      : "bg-neutral-950/60 border-neutral-900/80 opacity-75"
                  }`}
                >
                  {/* Cabeçalho do Aparelho */}
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {getDeviceIcon(device.detectedLabel)}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-base font-bold text-white truncate max-w-[220px] sm:max-w-[300px]">
                              {device.name}
                            </h2>
                            <button
                              onClick={() => {
                                setEditingDevice(device);
                                setEditName(device.name);
                              }}
                              className="text-neutral-500 hover:text-neutral-300 transition p-1"
                              title="Renomear aparelho"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          </div>
                          <div className="text-[11px] text-neutral-400 mt-0.5 truncate">
                            {device.detectedLabel}
                          </div>
                        </div>
                      </div>

                      {/* Badge de Status Online */}
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold flex-shrink-0 ${
                          device.online
                            ? "bg-emerald-950/80 text-emerald-300 border border-emerald-500/30"
                            : "bg-neutral-900 text-neutral-500 border border-neutral-800"
                        }`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${
                            device.online ? "bg-emerald-400 animate-pulse" : "bg-neutral-600"
                          }`}
                        />
                        <span>{device.online ? "Online" : "Offline"}</span>
                      </span>
                    </div>

                    {/* Metadados: ID, IP, Sala, Local */}
                    <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] bg-neutral-950/70 p-3 rounded-xl border border-neutral-800/80">
                      <div>
                        <span className="text-neutral-500 block text-[10px] uppercase font-semibold">Identificador (ID)</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-emerald-400 font-semibold truncate">{device.id}</span>
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
                      </div>

                      <div>
                        <span className="text-neutral-500 block text-[10px] uppercase font-semibold">IP na Rede</span>
                        <div className="flex items-center gap-1.5 mt-0.5 font-mono text-neutral-300">
                          <Wifi className="h-3 w-3 text-neutral-500" />
                          <span>{device.ip || "localhost"}</span>
                        </div>
                      </div>

                      <div>
                        <span className="text-neutral-500 block text-[10px] uppercase font-semibold">Local Atual da Tela</span>
                        <span className="text-neutral-300 truncate block mt-0.5">
                          {device.currentPath === "/"
                            ? "Na Raiz do Site (/)"
                            : device.currentPath?.includes("?room=")
                            ? "Reproduzindo TV"
                            : "No Lobby de Seleção"}
                        </span>
                      </div>

                      <div>
                        <span className="text-neutral-500 block text-[10px] uppercase font-semibold">Última Atividade</span>
                        <div className="flex items-center gap-1 mt-0.5 text-neutral-400">
                          <Clock className="h-3 w-3 text-neutral-600" />
                          <span>{timeAgo(device.lastSeenAt)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Seletor de Vinculação de Sala e Botões de Ação */}
                  <div className="space-y-3 pt-1 border-t border-neutral-800/80">
                    {/* Seletor de Sala */}
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-semibold text-neutral-300 flex items-center gap-1.5">
                          <Link2 className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Sala Vinculada:</span>
                        </span>
                        {device.assignedRoomSlug && (
                          <Link
                            to="/admin/$slug"
                            params={{ slug: device.assignedRoomSlug }}
                            className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
                          >
                            <span>Abrir no Painel</span>
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
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 transition cursor-pointer"
                      >
                        <option value="">Nenhuma sala vinculada (Lobby / Livre)</option>
                        {rooms.map((room) => {
                          const clients = room.clientsCount ?? 0;
                          const max = room.maxClients ?? 2;
                          return (
                            <option key={room.slug} value={room.slug}>
                              {room.name} ({clients}/{max} telas ativas)
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {/* Botões de Ação Rápida */}
                    <div className="grid grid-cols-3 gap-2">
                      {/* Botão Identificar */}
                      <button
                        onClick={() => identifyDevice.mutate(device.id)}
                        disabled={!device.online || isIdentifying}
                        className={`min-h-[38px] px-2 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm text-center truncate ${
                          isIdentifying
                            ? "bg-emerald-500 text-black font-extrabold animate-pulse"
                            : device.online
                            ? "bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500 hover:text-black"
                            : "bg-neutral-900 border border-neutral-800 text-neutral-600 cursor-not-allowed"
                        }`}
                        title="Faz a tela deste aparelho piscar com a identificação para você localizá-lo fisicamente"
                      >
                        <Radio className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">{isIdentifying ? "Sinalizando..." : "Identificar"}</span>
                      </button>

                      {/* Botão Recarregar TV */}
                      <button
                        onClick={() => reloadDevice.mutate(device.id)}
                        disabled={!device.online}
                        className={`min-h-[38px] px-2 py-1.5 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 text-center truncate ${
                          device.online
                            ? "bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700"
                            : "bg-neutral-900 border border-neutral-800 text-neutral-600 cursor-not-allowed"
                        }`}
                        title="Recarrega a página da TV remotamente"
                      >
                        <RefreshCw className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">Recarregar</span>
                      </button>

                      {/* Botão Excluir */}
                      <button
                        onClick={() => {
                          if (confirm(`Remover o aparelho "${device.name}" da lista?`)) {
                            deleteDevice.mutate(device.id);
                          }
                        }}
                        className="min-h-[38px] px-2 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-red-400 hover:border-red-900/50 text-xs font-medium transition flex items-center justify-center gap-1.5 text-center truncate"
                        title="Remove o registro deste aparelho do sistema"
                      >
                        <Trash2 className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">Excluir</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
