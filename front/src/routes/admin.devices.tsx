import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import {
  Monitor,
  Tv,
  Pencil,
  Link2,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  Search,
  Wifi,
  ExternalLink,
  Clock,
  Smartphone,
  Laptop,
  Radio,
  X,
} from "lucide-react";

export const Route = createFileRoute("/admin/devices")({
  head: () => ({
    meta: [
      { title: "Telas & Aparelhos • Pagliaro Signage" },
      { name: "description", content: "Gerencie, identifique e vincule telas remotamente." },
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
  if (seconds < 15) return "Agora";
  if (seconds < 60) return `há ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}

function getDeviceIcon(label: string) {
  const l = (label || "").toLowerCase();
  if (l.includes("tv")) return <Tv className="h-4 w-4 text-neutral-300 flex-shrink-0" />;
  if (l.includes("iphone") || l.includes("android") || l.includes("smartphone"))
    return <Smartphone className="h-4 w-4 text-neutral-300 flex-shrink-0" />;
  if (l.includes("pc") || l.includes("windows") || l.includes("mac") || l.includes("linux"))
    return <Laptop className="h-4 w-4 text-neutral-300 flex-shrink-0" />;
  return <Monitor className="h-4 w-4 text-neutral-300 flex-shrink-0" />;
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

  // WebSocket para sincronização em tempo real
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
          text: "Configuração sincronizada com o aparelho.",
          type: "success",
        });
        setTimeout(() => setFeedbackMsg(null), 3000);
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
          ? "Sinal enviado. A tela está exibindo a identificação."
          : "Aparelho não conectado no momento.",
        type: data?.success ? "success" : "error",
      });
      setTimeout(() => setFeedbackMsg(null), 3500);
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
        text: data?.success ? "Comando de recarregar enviado." : "Aparelho offline.",
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["devices"] });
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

  const totalCount = devices.length;
  const onlineCount = devices.filter((d) => d.online).length;
  const boundCount = devices.filter((d) => d.assignedRoomSlug).length;
  const unboundCount = devices.filter((d) => !d.assignedRoomSlug).length;

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

  // Ordenação fixa e estável: Online primeiro > Alfabético por nome > ID
  const sortedAndFilteredDevices = useMemo(() => {
    return [...filteredDevices].sort((a, b) => {
      if (a.online !== b.online) {
        return a.online ? -1 : 1;
      }
      const nameComp = (a.name || "").localeCompare(b.name || "", "pt-BR", { sensitivity: "base" });
      if (nameComp !== 0) return nameComp;
      return a.id.localeCompare(b.id);
    });
  }, [filteredDevices]);

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-950 overflow-y-auto pb-16 md:pb-6 text-neutral-100 font-sans antialiased">
      {/* Header Compacto e Direto */}
      <header className="border-b border-neutral-900 bg-black px-3.5 sm:px-6 py-2.5 sticky top-0 z-20 flex-shrink-0">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 font-mono">
                DISPOSITIVOS
              </span>
              <span className="inline-flex items-center gap-1.5 px-1.5 py-0.2 bg-neutral-950 border border-neutral-900 text-[10px] font-mono text-neutral-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span>{onlineCount} Online</span>
              </span>
            </div>
            <h1 className="text-base sm:text-lg font-bold text-white tracking-tight mt-0.5 font-mono uppercase">
              Telas & Aparelhos Conectados
            </h1>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {devices.some((d) => !d.online) && (
              <button
                onClick={() => {
                  if (confirm(`Remover da lista todos os aparelhos desconectados (${devices.filter((d) => !d.online).length})?`)) {
                    cleanOfflineDevices.mutate();
                  }
                }}
                disabled={cleanOfflineDevices.isPending}
                className="min-h-[30px] px-2.5 py-1 bg-neutral-950 border border-neutral-900 text-neutral-400 hover:text-red-400 hover:border-red-900 text-xs font-mono transition flex items-center gap-1.5"
                title="Limpar todos os aparelhos offline"
              >
                <Trash2 className="h-3 w-3" />
                <span>Limpar Offline ({devices.filter((d) => !d.online).length})</span>
              </button>
            )}

            <button
              onClick={() => qc.invalidateQueries({ queryKey: ["devices"] })}
              className="min-h-[30px] px-2.5 py-1 bg-neutral-950 border border-neutral-900 text-neutral-300 hover:text-white hover:bg-neutral-900 text-xs font-mono transition flex items-center gap-1.5"
              title="Atualizar lista agora"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Atualizar</span>
            </button>

            <a
              href="/player/index.html"
              target="_blank"
              rel="noreferrer"
              className="min-h-[30px] px-3 py-1 bg-white text-black hover:bg-neutral-200 text-xs font-bold transition flex items-center gap-1.5 font-mono"
            >
              <Tv className="h-3 w-3" />
              <span>Abrir Player</span>
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>
        </div>

        {/* Faixa Horizontal Compacta de Métricas (Sem cards inchados) */}
        <div className="max-w-6xl mx-auto mt-2 pt-2 border-t border-neutral-900 flex items-center gap-3 sm:gap-6 text-[10px] sm:text-xs font-mono text-neutral-400 overflow-x-auto pb-0.5">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-neutral-400 uppercase">Cadastrados:</span>
            <span className="text-white font-bold">{totalCount}</span>
          </div>
          <span className="text-neutral-800">•</span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="text-neutral-300 uppercase">Online:</span>
            <span className="text-emerald-400 font-bold">{onlineCount}</span>
          </div>
          <span className="text-neutral-800">•</span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-neutral-400 uppercase">Vinculados:</span>
            <span className="text-neutral-200 font-bold">{boundCount}</span>
          </div>
          <span className="text-neutral-800">•</span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-neutral-400 uppercase">No Lobby:</span>
            <span className="text-neutral-200 font-bold">{unboundCount}</span>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <div className="max-w-6xl mx-auto w-full px-3.5 sm:px-6 py-3.5 space-y-3">
        {/* Barra de Filtros e Busca */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-neutral-950 p-1.5 border border-neutral-900">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, ID, sala ou IP..."
              className="w-full pl-8 pr-3 py-1.5 bg-black border border-neutral-900 text-xs text-white placeholder-neutral-400 focus:outline-none focus:border-neutral-600 transition"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 sm:pb-0">
            <button
              onClick={() => setFilterMode("all")}
              className={`px-2.5 py-1 text-xs font-mono transition ${
                filterMode === "all"
                  ? "bg-white text-black font-bold"
                  : "bg-black text-neutral-400 hover:text-white border border-neutral-900"
              }`}
            >
              Todos ({totalCount})
            </button>
            <button
              onClick={() => setFilterMode("online")}
              className={`px-2.5 py-1 text-xs font-mono transition flex items-center gap-1.5 ${
                filterMode === "online"
                  ? "bg-white text-black font-bold"
                  : "bg-black text-neutral-400 hover:text-white border border-neutral-900"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${filterMode === "online" ? "bg-black" : "bg-emerald-400"}`} />
              <span>Online ({onlineCount})</span>
            </button>
            <button
              onClick={() => setFilterMode("unbound")}
              className={`px-2.5 py-1 text-xs font-mono transition ${
                filterMode === "unbound"
                  ? "bg-white text-black font-bold"
                  : "bg-black text-neutral-400 hover:text-white border border-neutral-900"
              }`}
            >
              Sem Sala ({unboundCount})
            </button>
            <button
              onClick={() => setFilterMode("offline")}
              className={`px-2.5 py-1 text-xs font-mono transition ${
                filterMode === "offline"
                  ? "bg-white text-black font-bold"
                  : "bg-black text-neutral-400 hover:text-white border border-neutral-900"
              }`}
            >
              Offline ({totalCount - onlineCount})
            </button>
          </div>
        </div>

        {/* Modal de Renomear Aparelho */}
        {editingDevice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
            <div className="bg-neutral-950 border border-neutral-900 p-4 max-w-md w-full shadow-2xl space-y-3">
              <div className="flex items-center justify-between border-b border-neutral-900 pb-2">
                <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-neutral-300 uppercase">
                  <Pencil className="h-3.5 w-3.5" />
                  <span>Renomear Aparelho</span>
                </div>
                <button onClick={() => setEditingDevice(null)} className="text-neutral-400 hover:text-white p-1">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div>
                <label className="text-[11px] font-mono text-neutral-400 block mb-1">
                  Nome amigável do aparelho
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Ex: TV Principal - Sala 01"
                  className="w-full px-3 py-1.5 bg-black border border-neutral-900 text-xs text-white focus:outline-none focus:border-neutral-500"
                  autoFocus
                />
                <span className="text-[10px] text-neutral-400 mt-1 block font-mono">ID: {editingDevice.id}</span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-900">
                <button
                  type="button"
                  onClick={() => setEditingDevice(null)}
                  className="px-3 py-1 bg-neutral-900 hover:bg-neutral-900 text-neutral-300 text-xs font-mono border border-neutral-900 transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateDevice.mutate({ id: editingDevice.id, updates: { name: editName } });
                  }}
                  disabled={updateDevice.isPending}
                  className="px-4 py-1 bg-white hover:bg-neutral-200 text-black text-xs font-bold font-mono transition"
                >
                  {updateDevice.isPending ? "Salvando..." : "Salvar Nome"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Feedback Banner */}
        {feedbackMsg && (
          <div
            className={`p-2.5 border text-xs font-mono flex items-center justify-between gap-2 transition ${
              feedbackMsg.type === "success"
                ? "bg-neutral-950 border-emerald-500/40 text-emerald-300"
                : "bg-neutral-950 border-red-500/40 text-red-300"
            }`}
          >
            <span>{feedbackMsg.text}</span>
            <button onClick={() => setFeedbackMsg(null)} className="text-neutral-400 hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Lista de Aparelhos: Layout de 2 a 3 linhas bem espaçadas */}
        {devicesQ.isLoading ? (
          <div className="py-12 text-center text-xs text-neutral-400 font-mono">
            Carregando aparelhos conectados...
          </div>
        ) : sortedAndFilteredDevices.length === 0 ? (
          <div className="p-8 text-center border border-neutral-900 bg-neutral-950">
            <Monitor className="h-8 w-8 text-neutral-400 mx-auto mb-2" />
            <h3 className="text-xs font-bold text-neutral-300 uppercase font-mono">Nenhum aparelho encontrado</h3>
            <p className="text-[11px] text-neutral-400 mt-1 max-w-md mx-auto">
              Assim que uma TV ou navegador abrir o link do player ou a raiz do sistema, o dispositivo aparecerá automaticamente aqui.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-900 border border-neutral-900 bg-neutral-950">
            {sortedAndFilteredDevices.map((device) => {
              const isIdentifying = identifyingId === device.id;
              return (
                <div
                  key={device.id}
                  className={`p-3 sm:p-4 transition flex flex-col gap-2.5 w-full max-w-full min-w-0 overflow-hidden ${
                    device.online
                      ? "hover:bg-neutral-900/40"
                      : "opacity-60 hover:opacity-85"
                  }`}
                >
                  {/* LINHA 1: Ícone + Identificação + Ações Rápidas */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 w-full min-w-0">
                    <div className="flex items-center gap-2.5 min-w-0 w-full sm:w-auto">
                      <div className="relative p-2 bg-neutral-900 border border-neutral-900 flex-shrink-0 text-neutral-200">
                        {getDeviceIcon(device.detectedLabel)}
                        <span
                          className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ${
                            device.online ? "bg-emerald-400" : "bg-neutral-600"
                          }`}
                          title={device.online ? "Online" : "Desconectado"}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs sm:text-sm font-bold text-white truncate max-w-[180px] sm:max-w-md font-mono">
                            {device.name}
                          </span>
                          <button
                            onClick={() => {
                              setEditingDevice(device);
                              setEditName(device.name);
                            }}
                            className="text-neutral-400 hover:text-white transition p-0.5 flex-shrink-0"
                            title="Renomear aparelho"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <span
                            className={`text-[9px] font-bold uppercase font-mono px-1 py-0.2 border flex-shrink-0 ${
                              device.online
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                                : "bg-neutral-900 text-neutral-400 border-neutral-900"
                            }`}
                          >
                            {device.online ? "Online" : "Offline"}
                          </span>
                        </div>
                        <div className="text-[11px] text-neutral-400 truncate mt-0.5">
                          {device.detectedLabel}
                        </div>
                      </div>
                    </div>

                    {/* Botões de Ação */}
                    <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap flex-shrink-0 w-full sm:w-auto justify-end pt-1 sm:pt-0 border-t sm:border-t-0 border-neutral-900/50">
                      <button
                        onClick={() => identifyDevice.mutate(device.id)}
                        disabled={!device.online || isIdentifying}
                        className={`min-h-[28px] px-2.5 py-1 text-xs font-mono font-bold transition flex items-center gap-1.5 ${
                          isIdentifying
                            ? "bg-amber-400 text-black font-extrabold"
                            : device.online
                            ? "bg-white text-black hover:bg-neutral-200"
                            : "bg-neutral-900 border border-neutral-900 text-neutral-400 cursor-not-allowed"
                        }`}
                        title="Piscar tela da TV para identificação física"
                      >
                        <Radio className="h-3 w-3 flex-shrink-0" />
                        <span>{isIdentifying ? "Sinalizando..." : "Identificar"}</span>
                      </button>

                      {(() => {
                        const isReloading = reloadDevice.isPending && reloadDevice.variables === device.id;
                        return (
                          <button
                            onClick={() => reloadDevice.mutate(device.id)}
                            disabled={!device.online || isReloading}
                            className={`min-h-[28px] px-2 py-1 text-xs font-mono transition flex items-center gap-1 ${
                              device.online && !isReloading
                                ? "bg-neutral-900 border border-neutral-900 text-neutral-300 hover:text-white hover:bg-neutral-800"
                                : "bg-neutral-900 border border-neutral-900 text-neutral-500 cursor-not-allowed opacity-60"
                            }`}
                            title="Recarregar tela remotamente"
                          >
                            <RefreshCw className={`h-3 w-3 flex-shrink-0 ${isReloading ? "animate-spin text-white" : ""}`} />
                            <span className="hidden sm:inline">{isReloading ? "Recarregando..." : "Recarregar"}</span>
                          </button>
                        );
                      })()}

                      <button
                        onClick={() => {
                          if (confirm(`Remover o aparelho "${device.name}" da lista?`)) {
                            deleteDevice.mutate(device.id);
                          }
                        }}
                        className="min-h-[28px] px-2 py-1 bg-neutral-900 border border-neutral-900 text-neutral-400 hover:text-red-400 hover:border-red-900 text-xs transition flex items-center justify-center"
                        title="Remover aparelho"
                      >
                        <Trash2 className="h-3 w-3 flex-shrink-0" />
                      </button>
                    </div>
                  </div>

                  {/* LINHA 2: Metadados Técnicos (ID, IP, Local da Tela, Visto por Último) */}
                  <div className="flex items-center gap-2 sm:gap-4 text-[11px] text-neutral-400 flex-wrap bg-black px-2.5 py-1.5 border border-neutral-900 w-full min-w-0 overflow-hidden">
                    <div className="flex items-center gap-1 font-mono min-w-0">
                      <span className="text-[10px] uppercase text-neutral-400 flex-shrink-0">ID:</span>
                      <span className="text-neutral-200 truncate max-w-[100px] sm:max-w-none">{device.id}</span>
                      <button
                        onClick={() => handleCopyId(device.id)}
                        className="text-neutral-400 hover:text-white p-0.5 transition flex-shrink-0"
                        title="Copiar ID"
                      >
                        {copiedId === device.id ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>

                    <div className="flex items-center gap-1 font-mono flex-shrink-0">
                      <Wifi className="h-3 w-3 text-neutral-400" />
                      <span className="text-neutral-300">{device.ip || "localhost"}</span>
                    </div>

                    <div className="flex items-center gap-1 min-w-0 flex-1 truncate">
                      <span className="text-[10px] uppercase text-neutral-400 font-mono flex-shrink-0">Local:</span>
                      <span className="text-neutral-300 truncate">
                        {device.currentPath === "/"
                          ? "Na Raiz (/)"
                          : device.currentPath?.includes("?room=")
                          ? `Reproduzindo TV (${device.assignedRoomSlug || "sala"})`
                          : "No Lobby"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-neutral-400 ml-auto font-mono text-[10px] flex-shrink-0">
                      <Clock className="h-2.5 w-2.5 text-neutral-400" />
                      <span>{timeAgo(device.lastSeenAt)}</span>
                    </div>
                  </div>

                  {/* LINHA 3: Vinculação de Sala */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-0.5 w-full min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 flex-1 min-w-0 w-full max-w-full sm:max-w-xl">
                      <span className="text-[11px] font-mono text-neutral-400 flex items-center gap-1 flex-shrink-0">
                        <Link2 className="h-3 w-3 text-neutral-400" />
                        <span>Vincular Sala:</span>
                      </span>
                      <select
                        value={device.assignedRoomSlug || ""}
                        onChange={(e) => {
                          const val = e.target.value || null;
                          updateDevice.mutate({
                            id: device.id,
                            updates: { assignedRoomSlug: val },
                          });
                        }}
                        className="w-full sm:flex-1 min-w-0 max-w-full bg-black border border-neutral-900 px-2 py-1 text-xs text-white focus:outline-none focus:border-neutral-600 transition cursor-pointer hover:border-neutral-700 font-sans truncate"
                      >
                        <option value="">Lobby / Nenhuma sala vinculada</option>
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

                    {device.assignedRoomSlug && (
                      <Link
                        to="/admin/$slug"
                        params={{ slug: device.assignedRoomSlug }}
                        className="text-[11px] text-neutral-300 hover:text-white flex items-center gap-1 font-mono flex-shrink-0 self-start sm:self-auto"
                      >
                        <span>Ir para a Sala</span>
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
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
