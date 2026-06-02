import { createFileRoute, Outlet, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { signageApi, type Room } from "@/lib/signage-api";
import { Radio, Plus, Circle, Menu, X, PanelLeftClose, PanelLeftOpen } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Signage Admin" }] }),
  component: AdminLayout,
});

function AdminLayout() {
  const qc = useQueryClient();
  const { data: rooms = [], isLoading } = useQuery({
    queryKey: ["rooms"],
    queryFn: signageApi.listRooms,
    refetchInterval: 5000,
  });

  const { data: systemInfo } = useQuery({
    queryKey: ["systemIp"],
    queryFn: signageApi.getIp,
  });

  const [creating, setCreating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // active slug from URL
  const params = useParams({ strict: false }) as { slug?: string };
  const activeSlug = params.slug;

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-neutral-950 text-neutral-100 font-mono overflow-hidden">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between border-b border-neutral-800 bg-black p-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-emerald-400" />
          <span className="text-xs uppercase tracking-[0.3em] text-neutral-400">
            Signage Control
          </span>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1">
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`
        ${sidebarOpen ? "flex" : "hidden"} 
        md:flex w-full ${collapsed ? "md:w-16" : "md:w-72"} flex-col border-b md:border-b-0 md:border-r border-neutral-800 bg-black flex-shrink-0
        absolute md:relative z-50 h-[calc(100vh-61px)] md:h-screen top-[61px] md:top-0 transition-all duration-300
      `}>
        <div className="hidden md:flex flex-col border-b border-neutral-800 px-4 py-4">
          <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between"} gap-2`}>
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-emerald-400 flex-shrink-0" />
              {!collapsed && (
                <span className="text-xs uppercase tracking-[0.3em] text-neutral-400">
                  Signage
                </span>
              )}
            </div>
            <button onClick={() => setCollapsed(!collapsed)} className="text-neutral-500 hover:text-white transition">
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>
          {!collapsed && systemInfo && (
            <div className="mt-3 text-[10px] text-neutral-500">
              Player IP: <span className="text-emerald-400/80 font-semibold">{systemInfo.ip}:8000</span>
            </div>
          )}
        </div>
        {/* Mobile IP display */}
        <div className="md:hidden border-b border-neutral-800 px-5 py-3">
          {systemInfo && (
            <div className="text-[10px] text-neutral-500">
              Player IP: <span className="text-emerald-400/80 font-semibold">{systemInfo.ip}:8000</span>
            </div>
          )}
        </div>

        <div className={`px-5 pt-5 pb-2 text-[10px] uppercase tracking-[0.25em] text-neutral-500 ${collapsed ? "hidden" : ""}`}>
          Rooms
        </div>

        <nav className="flex-1 overflow-y-auto px-2">
          {isLoading && (
            <div className="px-3 py-2 text-xs text-neutral-500">{collapsed ? "..." : "Loading…"}</div>
          )}
          {rooms.map((r) => (
            <RoomItem key={r.slug} room={r} active={activeSlug === r.slug} onClick={() => setSidebarOpen(false)} collapsed={collapsed} />
          ))}
          {!isLoading && rooms.length === 0 && (
            <div className={`px-3 py-2 text-xs text-neutral-600 ${collapsed ? "text-center" : ""}`}>
              {collapsed ? "0" : "No rooms yet"}
            </div>
          )}
        </nav>

        <div className="border-t border-neutral-800 p-3">
          {creating && !collapsed ? (
            <CreateRoomForm 
              onSuccess={() => {
                qc.invalidateQueries({ queryKey: ["rooms"] });
                setCreating(false);
              }}
              onCancel={() => setCreating(false)} 
            />
          ) : (
            <button
              onClick={() => {
                setCollapsed(false);
                setCreating(true);
              }}
              title={collapsed ? "New Room" : undefined}
              className={`flex w-full items-center justify-center gap-2 rounded border border-dashed border-neutral-700 px-3 py-2 text-xs uppercase tracking-wider text-neutral-400 hover:border-emerald-500 hover:text-emerald-400 transition`}
            >
              <Plus className="h-4 w-4 flex-shrink-0" />
              {!collapsed && <span>New Room</span>}
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}

function RoomItem({ room, active, onClick, collapsed }: { room: Room; active: boolean; onClick?: () => void; collapsed: boolean }) {
  const online = room.online ?? false;
  return (
    <Link
      to="/admin/$slug"
      params={{ slug: room.slug }}
      onClick={onClick}
      title={collapsed ? room.name : undefined}
      className={`group flex items-center gap-2 rounded px-3 py-2 text-sm transition overflow-hidden ${
        active
          ? "bg-neutral-900 text-white"
          : "text-neutral-400 hover:bg-neutral-900/60 hover:text-white"
      } ${collapsed ? "justify-center px-0" : ""}`}
    >
      <Circle
        className={`h-2 w-2 flex-shrink-0 ${
          online ? "fill-emerald-400 text-emerald-400" : "fill-neutral-700 text-neutral-700"
        }`}
      />
      {!collapsed && (
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <span className="truncate">{room.name}</span>
          <span className="text-[10px] text-neutral-600 truncate">{room.slug}</span>
        </div>
      )}
    </Link>
  );
}

function CreateRoomForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: "", description: "" });

  const createRoom = useMutation({
    mutationFn: signageApi.createRoom,
    onSuccess,
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const slug = form.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
        createRoom.mutate({ ...form, slug });
      }}
      className="space-y-2"
    >
      <input
        placeholder="Name"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs outline-none focus:border-emerald-500"
      />
      <input
        placeholder="Description (optional)"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs outline-none focus:border-emerald-500"
      />
      {createRoom.isError && (
        <div className="text-[10px] font-semibold text-red-400">
          {createRoom.error?.message || "Erro ao criar sala."}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!form.name || createRoom.isPending}
          className="flex-1 rounded bg-emerald-500 px-2 py-1.5 text-xs font-semibold text-black hover:bg-emerald-400 disabled:opacity-40"
        >
          Create
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-neutral-800 px-2 py-1.5 text-xs text-neutral-400 hover:bg-neutral-900"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
