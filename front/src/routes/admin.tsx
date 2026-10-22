import { createFileRoute, Outlet, Link, useParams, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { signageApi, type Room } from "@/lib/signage-api";
import { Radio, Plus, Circle, Menu, X, PanelLeftClose, PanelLeftOpen, Globe, Radio as RadioIcon, Copy, Check, Monitor } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Signage Admin" }] }),
  component: AdminLayout,
});

function AdminLayout() {
  const qc = useQueryClient();
  const router = useRouter();
  const { data: rooms = [], isLoading } = useQuery({
    queryKey: ["rooms"],
    queryFn: signageApi.listRooms,
    refetchInterval: 3000,
  });

  const { data: devices = [] } = useQuery<any[]>({
    queryKey: ["devices"],
    queryFn: async () => {
      const res = await fetch("/api/devices");
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 4000,
  });

  const onlineDevicesCount = devices.filter((d: any) => d.online).length;

  const { data: systemInfo } = useQuery({
    queryKey: ["systemIp"],
    queryFn: signageApi.getIp,
  });

  const [creating, setCreating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // active slug from URL
  const params = useParams({ strict: false }) as { slug?: string };
  const activeSlug = params.slug;
  const activeRoom = rooms.find((r) => r.slug === activeSlug);

  // Determina o link de acesso para as TVs / Player (nuvem Render ou rede interna)
  const currentOrigin = typeof window !== "undefined" && window.location.origin
    ? window.location.origin
    : (systemInfo?.publicUrl || `http://${systemInfo?.ip || "localhost"}:8001`);

  const isLocal = currentOrigin.includes("localhost") || currentOrigin.includes("127.0.0.1");
  const rawBase = (!isLocal || systemInfo?.publicUrl)
    ? (systemInfo?.publicUrl || currentOrigin)
    : (systemInfo?.ip ? `http://${systemInfo.ip}:${typeof window !== "undefined" && window.location.port ? window.location.port : "8001"}` : currentOrigin);

  const cleanBase = rawBase.replace(/\/player\/?$/, "").replace(/\/+$/, "");
  const playerAccessUrl = `${cleanBase}/player`;

  const handleCopyLink = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(playerAccessUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen h-[100dvh] w-full bg-neutral-950 text-neutral-100 font-sans antialiased overflow-hidden">
      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between border-b border-neutral-800 bg-black px-4 py-3 flex-shrink-0 z-30">
        <div className="flex items-center gap-2 min-w-0">
          <Radio className="h-4 w-4 text-emerald-400 flex-shrink-0" />
          <span className="text-xs uppercase tracking-[0.2em] text-neutral-300 font-bold truncate">
            {activeRoom ? activeRoom.name : "Signage Control"}
          </span>
          {activeRoom?.online && (
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
          )}
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="flex items-center gap-1.5 p-1.5 text-neutral-300 hover:text-white rounded-lg bg-neutral-900 border border-neutral-800 text-xs font-semibold"
          aria-label="Menu de Salas"
        >
          {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          <span className="text-[11px]">Salas</span>
        </button>
      </div>

      {/* Mobile Drawer Backdrop Overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/75 backdrop-blur-xs z-40 md:hidden"
        />
      )}

      {/* Sidebar / Mobile Drawer */}
      <aside
        className={`
        ${sidebarOpen ? "fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] flex shadow-2xl" : "hidden"} 
        md:flex md:relative md:z-auto ${collapsed ? "md:w-16" : "md:w-72"} flex-col border-r border-neutral-800 bg-neutral-950 md:bg-black flex-shrink-0
        h-full md:h-screen md:h-[100dvh] transition-all duration-300
      `}
      >
        <div className="flex flex-col border-b border-neutral-800 px-4 py-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Radio className="h-4 w-4 text-emerald-400 flex-shrink-0" />
              {(!collapsed || sidebarOpen) && (
                <span className="text-xs uppercase tracking-[0.25em] text-neutral-300 font-bold truncate">
                  Signage
                </span>
              )}
            </div>
            {/* Desktop Collapse Toggle */}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="hidden md:block text-neutral-500 hover:text-white transition p-1"
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
            {/* Mobile Close Button */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden text-neutral-400 hover:text-white p-1"
              aria-label="Fechar menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {(!collapsed || sidebarOpen) && (
            <div className="mt-2 text-[10px] text-neutral-500 flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-1 flex-wrap">
                <span className="text-neutral-400 font-medium">Link do Player (TVs):</span>
                {systemInfo?.db && (
                  <span className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                    systemInfo.db.driver === "mongodb"
                      ? "bg-emerald-950/60 text-emerald-400 border border-emerald-500/30"
                      : "bg-neutral-900 text-neutral-500 border border-neutral-800"
                  }`}>
                    {systemInfo.db.driver === "mongodb" ? "MongoDB Atlas" : "JSON Local"}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-1.5 bg-neutral-900/80 px-2 py-1.5 rounded-lg border border-neutral-800 min-w-0">
                <a
                  href={playerAccessUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate min-w-0 flex-1 hover:underline"
                  title="Abrir Kiosk Player em nova aba"
                >
                  <span className="text-emerald-400/90 font-semibold truncate block">
                    {playerAccessUrl}
                  </span>
                </a>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="text-neutral-400 hover:text-white p-1 rounded hover:bg-neutral-800 transition flex-shrink-0"
                  title={copiedLink ? "Link copiado!" : "Copiar link do Player"}
                >
                  {copiedLink ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Link Global para Aparelhos / Telas Conectadas */}
        <div className="px-2 pt-3 pb-2 border-b border-neutral-800/80">
          <Link
            to="/admin/devices"
            onClick={() => setSidebarOpen(false)}
            className={`group flex items-center justify-between gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
              router.state.location.pathname === "/admin/devices"
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 shadow-xs"
                : "text-neutral-300 hover:bg-neutral-900 hover:text-white"
            } ${collapsed ? "justify-center px-0" : ""}`}
            title={collapsed ? `Aparelhos (${onlineDevicesCount} online)` : undefined}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Monitor className={`h-4 w-4 flex-shrink-0 ${router.state.location.pathname === "/admin/devices" ? "text-emerald-400" : "text-neutral-400 group-hover:text-emerald-400 transition"}`} />
              {!collapsed && <span>Aparelhos / Telas</span>}
            </div>
            {!collapsed && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                onlineDevicesCount > 0
                  ? "bg-emerald-950 text-emerald-400 border border-emerald-500/30"
                  : "bg-neutral-900 text-neutral-500"
              }`}>
                {onlineDevicesCount > 0 && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                <span>{onlineDevicesCount}</span>
              </span>
            )}
          </Link>
        </div>

        <div className={`px-5 pt-4 pb-2 text-[10px] uppercase tracking-[0.25em] text-neutral-500 flex items-center justify-between ${collapsed ? "hidden" : ""}`}>
          <span>Rooms ({rooms.length})</span>
          <span className="text-[9px] text-neutral-600">
            {rooms.filter(r => r.online).length} online
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 space-y-1">
          {isLoading && (
            <div className="px-3 py-2 text-xs text-neutral-500">{collapsed ? "..." : "Loading…"}</div>
          )}
          {rooms.map((r) => (
            <RoomItem key={r.slug} room={r} active={activeSlug === r.slug} onClick={() => setSidebarOpen(false)} collapsed={collapsed} />
          ))}
          {!isLoading && rooms.length === 0 && (
            <div className={`px-3 py-2 text-xs text-neutral-600 ${collapsed ? "text-center" : ""}`}>
              {collapsed ? "0" : "Nenhuma sala criada"}
            </div>
          )}
        </nav>

        <div className="border-t border-neutral-800 p-3">
          {creating && !collapsed ? (
            <CreateRoomForm 
              onSuccess={(newRoom) => {
                qc.invalidateQueries({ queryKey: ["rooms"] });
                setCreating(false);
                if (newRoom?.slug) {
                  router.navigate({ to: "/admin/$slug", params: { slug: newRoom.slug } });
                }
              }}
              onCancel={() => setCreating(false)} 
            />
          ) : (
            <button
              onClick={() => {
                setCollapsed(false);
                setCreating(true);
              }}
              title={collapsed ? "Nova Sala" : undefined}
              className="flex w-full items-center justify-center gap-2 rounded border border-dashed border-neutral-700 px-3 py-2 text-xs uppercase tracking-wider text-neutral-400 hover:border-emerald-500 hover:text-emerald-400 transition"
            >
              <Plus className="h-4 w-4 flex-shrink-0" />
              {!collapsed && <span>Nova Sala</span>}
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-hidden min-w-0 w-full max-w-full">
        <Outlet />
      </main>
    </div>
  );
}

function RoomItem({ room, active, onClick, collapsed }: { room: Room; active: boolean; onClick?: () => void; collapsed: boolean }) {
  const online = Boolean(room.online);
  const clientsCount = room.clientsCount ?? 0;
  const maxClients = room.maxClients ?? 2;
  const isFull = clientsCount >= maxClients;
  
  return (
    <Link
      to="/admin/$slug"
      params={{ slug: room.slug }}
      onClick={onClick}
      title={collapsed ? `${room.name} (${online ? `${clientsCount}/${maxClients} TVs online` : "offline"})` : undefined}
      className={`group flex items-center gap-2.5 rounded px-3 py-2 text-sm transition overflow-hidden ${
        active
          ? "bg-neutral-900 text-white shadow-sm"
          : "text-neutral-400 hover:bg-neutral-900/60 hover:text-white"
      } ${collapsed ? "justify-center px-0" : ""}`}
    >
      <div className="relative flex items-center justify-center">
        <Circle
          className={`h-2.5 w-2.5 flex-shrink-0 transition-colors ${
            online
              ? isFull
                ? "fill-amber-400 text-amber-400 animate-pulse"
                : "fill-emerald-400 text-emerald-400 animate-pulse"
              : "fill-neutral-700 text-neutral-700"
          }`}
        />
      </div>
      {!collapsed && (
        <div className="flex flex-1 items-center justify-between min-w-0">
          <div className="flex flex-col min-w-0">
            <span className="truncate font-medium">{room.name}</span>
            <span className="text-[10px] text-neutral-600 truncate">{room.slug}</span>
          </div>
          {online ? (
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded border flex-shrink-0 font-medium ${
                isFull
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              }`}
            >
              {clientsCount}/{maxClients} TVs
            </span>
          ) : (
            <span className="text-[9px] text-neutral-600 px-1 py-0.5 flex-shrink-0">
              0/{maxClients}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

function CreateRoomForm({ onSuccess, onCancel }: { onSuccess: (newRoom?: Room) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    defaultSiteUrl: "",
    defaultAudioStreamUrl: "",
  });

  const createRoom = useMutation({
    mutationFn: signageApi.createRoom,
    onSuccess: (data) => {
      onSuccess(data?.room);
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        createRoom.mutate(form);
      }}
      className="space-y-2"
    >
      <div className="text-[10px] uppercase tracking-wider text-neutral-400 font-semibold mb-1">
        Criar Sala / Display
      </div>
      <input
        placeholder="Nome da sala (ex: Recepção)"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        required
        className="w-full rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs outline-none focus:border-emerald-500 text-white"
      />
      <div className="relative">
        <input
          placeholder="URL do Site (opcional, ex: https://meusite.com)"
          value={form.defaultSiteUrl}
          onChange={(e) => setForm({ ...form, defaultSiteUrl: e.target.value })}
          className="w-full rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs outline-none focus:border-emerald-500 text-white pl-6"
        />
        <Globe className="h-3 w-3 text-neutral-500 absolute left-2 top-2.5" />
      </div>
      <div className="relative">
        <input
          placeholder="URL de Rádio/Áudio (opcional, ex: Zeno.fm)"
          value={form.defaultAudioStreamUrl}
          onChange={(e) => setForm({ ...form, defaultAudioStreamUrl: e.target.value })}
          className="w-full rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 text-white pl-6"
        />
        <RadioIcon className="h-3 w-3 text-neutral-500 absolute left-2 top-2.5" />
      </div>
      <input
        placeholder="Descrição (opcional)"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        className="w-full rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs outline-none focus:border-emerald-500 text-white"
      />
      {createRoom.isError && (
        <div className="text-[10px] font-semibold text-red-400">
          {createRoom.error?.message || "Erro ao criar sala."}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={!form.name.trim() || createRoom.isPending}
          className="flex-1 rounded bg-emerald-500 px-2 py-1.5 text-xs font-semibold text-black hover:bg-emerald-400 disabled:opacity-40 transition"
        >
          {createRoom.isPending ? "Criando..." : "Criar"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-neutral-800 px-2 py-1.5 text-xs text-neutral-400 hover:bg-neutral-900"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
