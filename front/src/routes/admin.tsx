import { createFileRoute, Outlet, Link, useParams, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { signageApi, type Room } from "@/lib/signage-api";
import { copyToClipboard } from "@/lib/clipboard";
import { useAuth, ROLE_LABELS } from "@/lib/auth";
import { UserPermissionsModal } from "@/components/UserPermissionsModal";
import { LoginModal } from "@/components/LoginModal";
import { ChangePinModal } from "@/components/ChangePinModal";
import {
  Radio,
  Plus,
  Circle,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Globe,
  Radio as RadioIcon,
  Copy,
  Check,
  Monitor,
  Shield,
  User,
  Users,
  Settings,
  Tv,
  Key,
  LayoutGrid,
  ChevronRight,
  LogOut,
  CalendarClock,
} from "lucide-react";

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

  const { currentUser } = useAuth();
  const [creating, setCreating] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [changePinModalOpen, setChangePinModalOpen] = useState(false);

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

  const handleCopyLink = async () => {
    const success = await copyToClipboard(playerAccessUrl);
    if (success) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen h-[100dvh] w-full bg-black text-neutral-100 font-sans antialiased overflow-hidden selection:bg-neutral-800">
      {/* Mobile Top Header - Ultra-compact, clean brand and active room */}
      <div className="md:hidden flex items-center justify-between border-b border-neutral-900 bg-black px-3 py-2 flex-shrink-0 z-30">
        <div className="flex items-center gap-2 min-w-0">
          <Link to="/admin" className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-[11px] font-bold tracking-[0.25em] text-white uppercase font-mono">
              PAGLIARO
            </span>
          </Link>
          {activeRoom && (
            <div className="flex items-center gap-1.5 pl-2 border-l border-neutral-900 min-w-0">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
              <span className="text-[11px] font-mono text-neutral-300 truncate">
                {activeRoom.name}
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setLoginModalOpen(true)}
          className="flex items-center gap-1.5 px-2 py-1 bg-neutral-900 border border-neutral-900 hover:border-neutral-700 text-neutral-300 hover:text-white transition flex-shrink-0"
          title="Trocar operador de plantão (Login / PIN)"
        >
          <User className="h-3 w-3 text-neutral-400" />
          <span className="text-[10px] font-mono font-semibold truncate max-w-[100px]">
            {currentUser?.name || "Operador"}
          </span>
        </button>
      </div>

      {/* Sidebar (Desktop only - Mobile uses bottom bar & direct modals) */}
      <aside
        className={`hidden md:flex md:relative md:z-auto ${collapsed ? "md:w-16" : "md:w-64"} flex-col border-r border-neutral-900 bg-black flex-shrink-0 h-full md:h-screen md:h-[100dvh] transition-all duration-200`}
      >
        {/* Brand / Header */}
        <div className="flex flex-col border-b border-neutral-900 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <Link to="/admin" className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs uppercase tracking-[0.25em] text-white font-bold font-mono">
                PAGLIARO
              </span>
              {!collapsed && (
                <span className="text-[10px] uppercase tracking-wider text-neutral-400 font-mono">
                  SIGNAGE
                </span>
              )}
            </Link>

            {/* Desktop Collapse Toggle */}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="hidden md:block text-neutral-400 hover:text-white transition p-1"
            >
              {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
            </button>
          </div>

          {/* Quick Player URL */}
          {!collapsed && (
            <div className="mt-2 text-[10px] text-neutral-400 flex flex-col gap-1">
              <div className="flex items-center justify-between gap-1 flex-wrap">
                <span className="text-neutral-400 font-mono text-[9px] uppercase tracking-wider">Acesso das TVs:</span>
                {systemInfo?.db && (
                  <span
                    className="text-[9px] px-1 py-0.2 font-mono text-neutral-400"
                    title={
                      systemInfo.db.driver === "mongodb"
                        ? `Conectado ao MongoDB Atlas (${systemInfo.db.database}).`
                        : ((systemInfo.db as any).error || "Armazenamento local em JSON.")
                    }
                  >
                    {systemInfo.db.driver === "mongodb" ? "Atlas Online" : "JSON Local"}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-1.5 bg-neutral-950 px-2 py-1 border border-neutral-900 min-w-0">
                <a
                  href={playerAccessUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate min-w-0 flex-1 hover:underline text-neutral-300 font-mono text-[10px]"
                  title="Abrir Kiosk Player em nova aba"
                >
                  {playerAccessUrl}
                </a>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="text-neutral-400 hover:text-white p-0.5 hover:bg-neutral-900 transition flex-shrink-0"
                  title={copiedLink ? "Link copiado!" : "Copiar link do Player"}
                >
                  {copiedLink ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Global Navigation Links */}
        <div className="px-2 pt-2 pb-1.5 space-y-0.5 border-b border-neutral-900">
          <Link
            to="/admin"
            className={`group flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs font-medium transition ${
              router.state.location.pathname === "/admin" || router.state.location.pathname === "/admin/"
                ? "bg-neutral-900 text-white font-semibold"
                : "text-neutral-400 hover:bg-neutral-950 hover:text-white"
            } ${collapsed ? "justify-center px-0" : ""}`}
            title={collapsed ? "Visão Geral" : undefined}
          >
            <div className="flex items-center gap-2 min-w-0">
              <LayoutGrid className="h-3.5 w-3.5 flex-shrink-0 text-neutral-400 group-hover:text-white" />
              {!collapsed && <span>Visão Geral</span>}
            </div>
          </Link>

          <Link
            to="/admin/devices"
            className={`group flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs font-medium transition ${
              router.state.location.pathname === "/admin/devices"
                ? "bg-neutral-900 text-white font-semibold"
                : "text-neutral-400 hover:bg-neutral-950 hover:text-white"
            } ${collapsed ? "justify-center px-0" : ""}`}
            title={collapsed ? `Aparelhos (${onlineDevicesCount} online)` : undefined}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Monitor className="h-3.5 w-3.5 flex-shrink-0 text-neutral-400 group-hover:text-white" />
              {!collapsed && <span>Telas & Aparelhos</span>}
            </div>
            {!collapsed && (
              <span className="text-[10px] font-mono flex items-center gap-1 text-neutral-400">
                {onlineDevicesCount > 0 && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                <span>{onlineDevicesCount}</span>
              </span>
            )}
          </Link>

          <Link
            to="/admin/routines"
            className={`group flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs font-medium transition ${
              router.state.location.pathname.startsWith("/admin/routines")
                ? "bg-neutral-900 text-white font-semibold"
                : "text-neutral-400 hover:bg-neutral-950 hover:text-white"
            } ${collapsed ? "justify-center px-0" : ""}`}
            title={collapsed ? "Rotinas Globais" : undefined}
          >
            <div className="flex items-center gap-2 min-w-0">
              <CalendarClock className="h-3.5 w-3.5 flex-shrink-0 text-neutral-400 group-hover:text-white" />
              {!collapsed && <span>Rotinas Globais</span>}
            </div>
          </Link>
        </div>

        {/* Salas Header */}
        <div className={`px-3 pt-2.5 pb-1 text-[9px] uppercase tracking-[0.2em] text-neutral-400 font-mono flex items-center justify-between ${collapsed ? "hidden" : ""}`}>
          <span>Salas ({rooms.length})</span>
          <span>{rooms.filter((r) => r.online).length} ativas</span>
        </div>

        {/* Salas Nav List */}
        <nav className="flex-1 overflow-y-auto px-1.5 space-y-0.5">
          {isLoading && (
            <div className="px-3 py-2 text-xs text-neutral-400 font-mono">{collapsed ? "..." : "Carregando..."}</div>
          )}
          {rooms.map((r) => (
            <RoomItem key={r.slug} room={r} active={activeSlug === r.slug} collapsed={collapsed} />
          ))}
          {!isLoading && rooms.length === 0 && (
            <div className={`px-3 py-2 text-xs text-neutral-400 ${collapsed ? "text-center" : ""}`}>
              {collapsed ? "0" : "Nenhuma sala criada"}
            </div>
          )}
        </nav>

        {/* Criar Sala & User Footer */}
        <div className="border-t border-neutral-900 p-2 space-y-2">
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
              className="flex w-full items-center justify-center gap-1.5 bg-neutral-950 border border-neutral-900 hover:bg-neutral-900 hover:text-white px-2 py-1.5 text-xs font-semibold text-neutral-300 transition rounded-none"
            >
              <Plus className="h-3 w-3 flex-shrink-0" />
              {!collapsed && <span>Nova Sala</span>}
            </button>
          )}

          {/* User Session Widget */}
          {!collapsed && (
            <div className="pt-1 border-t border-neutral-900/60 flex items-center justify-between text-xs font-mono">
              <button
                type="button"
                onClick={() => setLoginModalOpen(true)}
                className="flex items-center gap-2 text-left min-w-0 flex-1 hover:opacity-80 transition py-1"
                title="Clique para alternar operador ou autenticar"
              >
                <div className="h-6 w-6 bg-neutral-900 border border-neutral-900 text-neutral-200 flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                  {currentUser?.name ? currentUser.name.substring(0, 2).toUpperCase() : "OP"}
                </div>
                <div className="min-w-0 truncate">
                  <div className="text-[11px] font-semibold text-white truncate">
                    {currentUser?.name || "Operador"}
                  </div>
                  <div className="text-[9px] text-neutral-400 uppercase tracking-wider">
                    {ROLE_LABELS[currentUser?.role || "operator"]?.badge || "Operador"}
                  </div>
                </div>
              </button>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setChangePinModalOpen(true)}
                  className="text-neutral-400 hover:text-white p-1 hover:bg-neutral-900 transition"
                  title="Alterar Meu PIN (6 dígitos)"
                >
                  <Key className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setPermissionsModalOpen(true)}
                  className="text-neutral-400 hover:text-white p-1 hover:bg-neutral-900 transition"
                  title="Gestão de Usuários & Permissões"
                >
                  <Settings className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden min-w-0 w-full max-w-full pb-14 md:pb-0 bg-neutral-950">
        <Outlet />
      </main>

      {/* Mobile Bottom Navigation Bar (High density, sharp, ergonomic) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-black/95 border-t border-neutral-900 backdrop-blur-md grid grid-cols-5 items-center h-13 px-1 text-[9px]">
        <Link
          to="/admin"
          className={`flex flex-col items-center justify-center gap-1 py-1 transition ${
            router.state.location.pathname === "/admin" || router.state.location.pathname === "/admin/"
              ? "text-white font-bold"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          <LayoutGrid className="h-4 w-4" />
          <span>Salas</span>
        </Link>

        <Link
          to="/admin/routines"
          className={`flex flex-col items-center justify-center gap-1 py-1 transition ${
            router.state.location.pathname.startsWith("/admin/routines")
              ? "text-white font-bold"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          <CalendarClock className="h-4 w-4" />
          <span>Rotinas</span>
        </Link>

        <Link
          to="/admin/devices"
          className={`flex flex-col items-center justify-center gap-1 py-1 transition relative ${
            router.state.location.pathname === "/admin/devices"
              ? "text-white font-bold"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          <Monitor className="h-4 w-4" />
          <span>Aparelhos</span>
          {onlineDevicesCount > 0 && (
            <span className="absolute top-1 right-2 sm:right-5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
          )}
        </Link>

        <button
          type="button"
          onClick={() => setCreateModalOpen(true)}
          className="flex flex-col items-center justify-center gap-1 py-1 text-neutral-400 hover:text-white transition"
        >
          <Plus className="h-4 w-4" />
          <span>Nova Sala</span>
        </button>

        <button
          type="button"
          onClick={() => setPermissionsModalOpen(true)}
          className="flex flex-col items-center justify-center gap-1 py-1 text-neutral-400 hover:text-white transition"
        >
          <Shield className="h-4 w-4" />
          <span>Acessos</span>
        </button>
      </nav>

      {/* Modal de Criação de Sala */}
      <CreateRoomModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={(newRoom) => {
          qc.invalidateQueries({ queryKey: ["rooms"] });
          if (newRoom?.slug) {
            router.navigate({ to: "/admin/$slug", params: { slug: newRoom.slug } });
          }
        }}
      />

      {/* Modal de Gestão de Usuários & Permissões */}
      <UserPermissionsModal
        isOpen={permissionsModalOpen}
        onClose={() => setPermissionsModalOpen(false)}
        availableRooms={rooms.map((r) => ({ slug: r.slug, name: r.name }))}
      />

      {/* Modal de Login e Troca Rápida de Operador */}
      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
        onOpenChangePin={() => setChangePinModalOpen(true)}
        onSuccess={(_user, mustChange) => {
          if (mustChange || _user?.mustChangePin) {
            setChangePinModalOpen(true);
          }
        }}
      />

      {/* Modal de Alteração de PIN (6 dígitos) */}
      <ChangePinModal
        isOpen={changePinModalOpen || Boolean(currentUser?.mustChangePin)}
        isMandatory={Boolean(currentUser?.mustChangePin)}
        onClose={() => setChangePinModalOpen(false)}
        onOpenSwitchUser={() => {
          setChangePinModalOpen(false);
          setLoginModalOpen(true);
        }}
      />
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
      className={`group flex items-center gap-2 px-2.5 py-1.5 text-xs transition overflow-hidden ${
        active
          ? "bg-neutral-900 text-white font-semibold"
          : "text-neutral-400 hover:bg-neutral-950 hover:text-white"
      } ${collapsed ? "justify-center px-0" : ""}`}
    >
      <div className="relative flex items-center justify-center">
        <Circle
          className={`h-1.5 w-1.5 flex-shrink-0 transition-colors ${
            online
              ? isFull
                ? "fill-amber-400 text-amber-400"
                : "fill-emerald-400 text-emerald-400"
              : "fill-neutral-700 text-neutral-700"
          }`}
        />
      </div>
      {!collapsed && (
        <div className="flex flex-1 items-center justify-between min-w-0">
          <div className="flex flex-col min-w-0">
            <span className="truncate font-medium text-white text-[11px]">{room.name}</span>
            <span className="text-[9px] text-neutral-400 truncate font-mono">{room.slug}</span>
          </div>
          {online ? (
            <span className="text-[9px] font-mono text-neutral-400 flex-shrink-0">
              {clientsCount}/{maxClients}
            </span>
          ) : (
            <span className="text-[9px] text-neutral-400 px-1 py-0.5 flex-shrink-0 font-mono">
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
      className="space-y-1.5"
    >
      <div className="text-[9px] uppercase tracking-wider text-neutral-400 font-mono mb-1">
        Criar Sala
      </div>
      <input
        placeholder="Nome da sala (ex: Sala Master)"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        required
        className="w-full rounded-none border border-neutral-900 bg-black px-2 py-1 text-xs outline-none focus:border-neutral-500 text-white font-sans"
      />
      <div className="relative">
        <input
          placeholder="URL do Memorial (opcional)"
          value={form.defaultSiteUrl}
          onChange={(e) => setForm({ ...form, defaultSiteUrl: e.target.value })}
          className="w-full rounded-none border border-neutral-900 bg-black px-2 py-1 text-xs outline-none focus:border-neutral-500 text-white pl-6 font-mono text-[11px]"
        />
        <Globe className="h-3 w-3 text-neutral-400 absolute left-2 top-2" />
      </div>
      <div className="relative">
        <input
          placeholder="URL de Rádio/Stream (opcional)"
          value={form.defaultAudioStreamUrl}
          onChange={(e) => setForm({ ...form, defaultAudioStreamUrl: e.target.value })}
          className="w-full rounded-none border border-neutral-900 bg-black px-2 py-1 text-xs outline-none focus:border-neutral-500 text-white pl-6 font-mono text-[11px]"
        />
        <RadioIcon className="h-3 w-3 text-neutral-400 absolute left-2 top-2" />
      </div>
      {createRoom.isError && (
        <div className="text-[10px] font-semibold text-red-400">
          {createRoom.error?.message || "Erro ao criar sala."}
        </div>
      )}
      <div className="flex gap-1.5 pt-1">
        <button
          type="submit"
          disabled={!form.name.trim() || createRoom.isPending}
          className="flex-1 rounded-none bg-white px-2 py-1 text-xs font-bold text-black hover:bg-neutral-200 disabled:opacity-40 transition"
        >
          {createRoom.isPending ? "Criando..." : "Criar"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-none border border-neutral-900 px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-900 hover:text-white"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function CreateRoomModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newRoom?: Room) => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-neutral-950 border border-neutral-900 p-4 space-y-3 shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-900 pb-2">
          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-white uppercase">
            <Plus className="h-3.5 w-3.5" />
            <span>Cadastrar Nova Sala</span>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-white p-1">
            <X className="h-4 w-4" />
          </button>
        </div>
        <CreateRoomForm
          onSuccess={(newRoom) => {
            onSuccess(newRoom);
            onClose();
          }}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}

