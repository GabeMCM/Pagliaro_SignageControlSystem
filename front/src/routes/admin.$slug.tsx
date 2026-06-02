import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { signageApi, type Playlist, type PlaylistItem, API_BASE } from "@/lib/signage-api";
import { Play, Power, Upload, Loader2, Trash2, Volume2, VolumeX, GripVertical, Music, Plus, SkipBack, SkipForward, Pause, Tv, Gamepad2, ListVideo, PenTool } from "lucide-react";

export const Route = createFileRoute("/admin/$slug")({
  component: RoomOperator,
});

function RoomOperator() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"control" | "playlists" | "editor">("control");

  const roomsQ = useQuery({ queryKey: ["rooms"], queryFn: signageApi.listRooms });
  const currentRoom = roomsQ.data?.find((r) => r.slug === slug);

  const stateQ = useQuery({
    queryKey: ["state", slug],
    queryFn: () => signageApi.getState(slug),
    refetchInterval: 3000,
  });

  const playlistsQ = useQuery({
    queryKey: ["playlists"],
    queryFn: signageApi.listPlaylists,
  });

  const setState = useMutation({
    mutationFn: (updates: { playlist?: string | null; audioPlaylist?: string | null }) => signageApi.setState(slug, updates),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["playlists"] }),
  });

  const handleDeleteRoom = () => {
    if (!currentRoom?.id) return;
    if (confirm(`Tem certeza que deseja apagar a sala "${currentRoom.name}"?`)) {
      deleteRoomMut.mutate(currentRoom.id);
    }
  };

  const [selectedVisual, setSelectedVisual] = useState<string | null>(null);
  const [selectedAudio, setSelectedAudio] = useState<string | null>(null);

  const activeVisual = useMemo(() => {
    const id = stateQ.data?.playlist;
    return playlistsQ.data?.find((p) => p.id === id) ?? null;
  }, [stateQ.data, playlistsQ.data]);

  const activeAudio = useMemo(() => {
    const id = stateQ.data?.audioPlaylist;
    return playlistsQ.data?.find((p) => p.id === id) ?? null;
  }, [stateQ.data, playlistsQ.data]);

  const visualPlaylists = playlistsQ.data?.filter(p => p.type === 'visual') || [];
  const audioPlaylists = playlistsQ.data?.filter(p => p.type === 'audio') || [];

  const playerUrl = `${API_BASE}/player/index.html?room=${slug}`;

  useEffect(() => {
    const wsUrl = API_BASE.replace('http', 'ws');
    const ws = new WebSocket(`${wsUrl}/ws/${slug}`);
    
    ws.onmessage = () => {
      qc.invalidateQueries({ queryKey: ["state", slug] });
    };
    
    return () => ws.close();
  }, [slug, qc]);

  return (
    <div className="flex h-full flex-col text-neutral-100 font-mono pb-16 lg:pb-0 relative">
      {/* Header */}
      <header className={`flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-neutral-800 p-4 md:px-8 md:py-5 ${activeTab !== 'control' ? 'hidden lg:flex' : 'flex'}`}>
        <div>
          <div className="text-[10px] uppercase tracking-[0.4em] text-neutral-500">
            Room
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{slug}</h1>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={handleDeleteRoom}
            disabled={deleteRoomMut.isPending}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded border border-neutral-800 px-3 py-2 sm:py-1.5 text-xs uppercase tracking-wider text-neutral-400 hover:border-red-500 hover:text-red-400 transition"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
          <button
            onClick={() => {
              if (confirm("Forçar recarregamento completo da TV?")) signageApi.reloadRoom(slug);
            }}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded border border-neutral-800 px-3 py-2 sm:py-1.5 text-xs uppercase tracking-wider text-neutral-400 hover:border-yellow-500 hover:text-yellow-400 transition"
          >
            Force Reload TV
          </button>
          <a
            href={playerUrl}
            target="_blank"
            rel="noreferrer"
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded border border-neutral-800 px-3 py-2 sm:py-1.5 text-xs uppercase tracking-wider text-neutral-400 hover:border-emerald-500 hover:text-emerald-400 transition"
          >
            Open player ↗
          </a>
        </div>
      </header>

      {/* Status */}
      <section className={`grid-cols-1 sm:grid-cols-2 gap-px bg-neutral-800 border-b border-neutral-800 ${activeTab !== 'control' ? 'hidden lg:grid' : 'grid'}`}>
        <StatusCell label="📺 Visual Now Playing" value={activeVisual?.name ?? "— idle —"} itemsCount={activeVisual?.items.length} />
        <StatusCell label="🎵 Audio Now Playing" value={activeAudio?.name ?? "— idle —"} itemsCount={activeAudio?.items.length} />
      </section>

      {/* Remote Controls */}
      <section className={`grid-cols-1 md:grid-cols-2 gap-px bg-neutral-800 border-b border-neutral-800 ${activeTab !== 'control' ? 'hidden lg:grid' : 'grid'}`}>
        <div className="bg-black p-4 md:px-8 flex items-center justify-between">
          <div className="text-xs uppercase text-neutral-500 flex items-center gap-2"><Tv className="h-4 w-4" /> Visual Remote</div>
          <div className="flex items-center gap-1 bg-neutral-900 rounded p-1 border border-neutral-800">
            <button onClick={() => signageApi.sendCommand(slug, "visual", "prev")} className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition"><SkipBack className="h-4 w-4" /></button>
            {stateQ.data?.visualStatus === 'paused' ? (
              <button onClick={() => signageApi.sendCommand(slug, "visual", "play")} className="p-2 text-emerald-400 hover:text-emerald-300 hover:bg-neutral-800 rounded transition"><Play className="h-4 w-4" /></button>
            ) : (
              <button onClick={() => signageApi.sendCommand(slug, "visual", "pause")} className="p-2 text-yellow-500 hover:text-yellow-400 hover:bg-neutral-800 rounded transition"><Pause className="h-4 w-4" /></button>
            )}
            <button onClick={() => signageApi.sendCommand(slug, "visual", "next")} className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition"><SkipForward className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="bg-black p-4 md:px-8 flex items-center justify-between">
          <div className="text-xs uppercase text-neutral-500 flex items-center gap-2"><Music className="h-4 w-4" /> Audio Remote</div>
          <div className="flex items-center gap-1 bg-neutral-900 rounded p-1 border border-neutral-800">
            <button onClick={() => signageApi.sendCommand(slug, "audio", "prev")} className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition"><SkipBack className="h-4 w-4" /></button>
            {stateQ.data?.audioStatus === 'paused' ? (
              <button onClick={() => signageApi.sendCommand(slug, "audio", "play")} className="p-2 text-blue-400 hover:text-blue-300 hover:bg-neutral-800 rounded transition"><Play className="h-4 w-4" /></button>
            ) : (
              <button onClick={() => signageApi.sendCommand(slug, "audio", "pause")} className="p-2 text-yellow-500 hover:text-yellow-400 hover:bg-neutral-800 rounded transition"><Pause className="h-4 w-4" /></button>
            )}
            <button onClick={() => signageApi.sendCommand(slug, "audio", "next")} className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition"><SkipForward className="h-4 w-4" /></button>
          </div>
        </div>
      </section>

      {/* Playlist picker + create */}
      <section className="flex flex-col lg:grid lg:grid-cols-[1fr_360px] flex-1 overflow-hidden">
        <div className={`overflow-y-auto p-4 md:p-8 flex-col gap-6 ${activeTab !== 'playlists' ? 'hidden lg:flex' : 'flex'}`}>
          
          {/* Visual Playlists */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-500 flex items-center gap-2"><Tv className="h-4 w-4"/> Playlists Visuais</div>
              <div className="flex gap-2">
                <button
                  disabled={!selectedVisual || setState.isPending}
                  onClick={() => selectedVisual && setState.mutate({ playlist: selectedVisual })}
                  className="rounded bg-emerald-500 px-3 py-1 text-xs font-bold uppercase tracking-wider text-black transition hover:bg-emerald-400 disabled:opacity-30"
                >
                  Apply Visual
                </button>
                <button
                  disabled={setState.isPending}
                  onClick={() => setState.mutate({ playlist: null })}
                  className="rounded border border-neutral-700 px-3 py-1 text-xs uppercase tracking-wider text-neutral-300 transition hover:border-red-500 hover:text-red-400"
                >
                  Idle
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {visualPlaylists.map((p) => (
                <PlaylistCard key={p.id} playlist={p} selected={selectedVisual === p.id} active={activeVisual?.id === p.id}
                  onClick={() => setSelectedVisual(p.id)} onDelete={() => {
                    if (confirm(`Apagar a playlist "${p.name}"?`)) {
                      deletePlaylistMut.mutate(p.id);
                      if (selectedVisual === p.id) setSelectedVisual(null);
                    }
                  }}
                />
              ))}
              {visualPlaylists.length === 0 && (
                <div className="col-span-2 rounded border border-dashed border-neutral-800 p-6 text-center text-xs text-neutral-600">Nenhuma playlist visual. Crie uma ao lado →</div>
              )}
            </div>
          </div>

          {/* Audio Playlists */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-500 flex items-center gap-2"><Music className="h-4 w-4"/> Playlists de Áudio</div>
              <div className="flex gap-2">
                <button
                  disabled={!selectedAudio || setState.isPending}
                  onClick={() => selectedAudio && setState.mutate({ audioPlaylist: selectedAudio })}
                  className="rounded bg-blue-500 px-3 py-1 text-xs font-bold uppercase tracking-wider text-black transition hover:bg-blue-400 disabled:opacity-30"
                >
                  Apply Audio
                </button>
                <button
                  disabled={setState.isPending}
                  onClick={() => setState.mutate({ audioPlaylist: null })}
                  className="rounded border border-neutral-700 px-3 py-1 text-xs uppercase tracking-wider text-neutral-300 transition hover:border-red-500 hover:text-red-400"
                >
                  Mute Layer
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {audioPlaylists.map((p) => (
                <PlaylistCard key={p.id} playlist={p} selected={selectedAudio === p.id} active={activeAudio?.id === p.id}
                  onClick={() => setSelectedAudio(p.id)} onDelete={() => {
                    if (confirm(`Apagar a playlist "${p.name}"?`)) {
                      deletePlaylistMut.mutate(p.id);
                      if (selectedAudio === p.id) setSelectedAudio(null);
                    }
                  }}
                />
              ))}
              {audioPlaylists.length === 0 && (
                <div className="col-span-2 rounded border border-dashed border-neutral-800 p-6 text-center text-xs text-neutral-600">Nenhuma playlist de áudio. Crie uma ao lado →</div>
              )}
            </div>
          </div>

        </div>

        <div className={`border-t lg:border-t-0 lg:border-l border-neutral-800 bg-neutral-950/50 p-4 md:p-6 overflow-y-auto ${activeTab !== 'editor' ? 'hidden lg:block' : 'block'}`}>
          <ConfigPlaylistForm playlists={playlistsQ.data || []} />
        </div>
      </section>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-neutral-950 border-t border-neutral-800 flex lg:hidden z-50">
        <button
          onClick={() => setActiveTab('control')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${activeTab === 'control' ? 'text-emerald-400' : 'text-neutral-500 hover:text-neutral-300'}`}
        >
          <Gamepad2 className="h-5 w-5" />
          <span className="text-[10px] uppercase tracking-widest font-semibold">Control</span>
        </button>
        <button
          onClick={() => setActiveTab('playlists')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${activeTab === 'playlists' ? 'text-emerald-400' : 'text-neutral-500 hover:text-neutral-300'}`}
        >
          <ListVideo className="h-5 w-5" />
          <span className="text-[10px] uppercase tracking-widest font-semibold">Playlists</span>
        </button>
        <button
          onClick={() => setActiveTab('editor')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${activeTab === 'editor' ? 'text-emerald-400' : 'text-neutral-500 hover:text-neutral-300'}`}
        >
          <PenTool className="h-5 w-5" />
          <span className="text-[10px] uppercase tracking-widest font-semibold">Editor</span>
        </button>
      </nav>
    </div>
  );
}

function StatusCell({ label, value, itemsCount }: { label: string; value: string; itemsCount?: number }) {
  return (
    <div className="bg-black p-4 md:px-8 md:py-5">
      <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-500">
        {label}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="truncate text-lg text-white">{value}</span>
        {itemsCount !== undefined && <span className="text-xs text-neutral-500 bg-neutral-900 px-2 py-1 rounded">{itemsCount} items</span>}
      </div>
    </div>
  );
}

function PlaylistCard({
  playlist,
  selected,
  active,
  onClick,
  onDelete,
}: {
  playlist: Playlist;
  selected: boolean;
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group relative rounded border text-left transition ${
        selected
          ? playlist.type === "visual" ? "border-emerald-500 bg-emerald-500/5" : "border-blue-500 bg-blue-500/5"
          : "border-neutral-800 hover:border-neutral-600"
      }`}
    >
      <button onClick={onClick} className="w-full p-4 text-left">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-white">{playlist.name}</div>
          {active && (
            <span className={`rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${playlist.type === 'visual' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>
              On air
            </span>
          )}
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-wider text-neutral-500 flex items-center gap-2">
          {playlist.type === 'visual' ? <Tv className="h-3 w-3" /> : <Music className="h-3 w-3" />}
          {playlist.items.length} item{playlist.items.length === 1 ? "" : "s"} ·{" "}
          {playlist.loop ? "loop" : "once"}
        </div>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute bottom-3 right-3 hidden rounded p-1 text-neutral-500 hover:bg-red-500/10 hover:text-red-400 group-hover:block transition"
        title="Delete Playlist"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ConfigPlaylistForm({ playlists }: { playlists: Playlist[] }) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>("new");
  
  const [type, setType] = useState<"visual" | "audio">("visual");
  const [name, setName] = useState("");
  const [loop, setLoop] = useState(true);
  const [globalDuration, setGlobalDuration] = useState(8);
  const [items, setItems] = useState<PlaylistItem[]>([]);
  
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ytUrl, setYtUrl] = useState("");
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  useEffect(() => {
    if (selectedId === "new") {
      setName("");
      setLoop(true);
      setItems([]);
    } else {
      const p = playlists.find(p => p.id === selectedId);
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
      const payload = { name: name || "Untitled", type, items, loop };
      if (selectedId === "new") {
        return signageApi.createPlaylist(payload);
      } else {
        return signageApi.updatePlaylist(selectedId, payload);
      }
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["playlists"] });
      if (selectedId === "new" && data?.id) {
        setSelectedId(data.id);
      }
    },
  });

  const addFiles = async (files: FileList | File[]) => {
    setUploading(true);
    const arr: PlaylistItem[] = [];
    for (const f of Array.from(files)) {
      try {
        if (type === "audio" && !f.type.startsWith("audio")) {
          alert(`File ${f.name} is not an audio file.`);
          continue;
        }
        if (type === "visual" && f.type.startsWith("audio")) {
          alert(`File ${f.name} is an audio file. Upload it to an Audio playlist.`);
          continue;
        }

        const { filename } = await signageApi.uploadMedia(f);
        const url = `/media/uploads/${filename}`;
        
        arr.push({
          url,
          type: type === "audio" ? "audio" : f.type.startsWith("video") ? "video" : "image",
          duration: type === "visual" && !f.type.startsWith("video") ? globalDuration : undefined,
          muted: false,
          volume: 100
        });
      } catch (err) {
        console.error("Failed to upload", f.name);
      }
    }
    if (arr.length > 0) setItems((prev) => [...prev, ...arr]);
    setUploading(false);
  };

  const addYt = () => {
    if (!ytUrl || type === "audio") return;
    setItems((prev) => [...prev, { url: ytUrl, type: "youtube", muted: false, volume: 100 }]);
    setYtUrl("");
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
      <div className="mb-4 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-500">
          Config Playlist
        </div>
      </div>

      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        className="mb-3 w-full rounded border border-neutral-800 bg-black px-3 py-2 text-sm outline-none focus:border-emerald-500"
      >
        <option value="new">-- Criar Nova Playlist --</option>
        {playlists.map((p) => (
          <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
        ))}
      </select>

      <div className="flex bg-neutral-900 rounded p-1 mb-3">
        <button onClick={() => setType("visual")} className={`flex-1 text-xs font-semibold py-2 rounded transition ${type === "visual" ? "bg-emerald-500 text-black" : "text-neutral-500 hover:text-white"}`}>Visual</button>
        <button onClick={() => setType("audio")} className={`flex-1 text-xs font-semibold py-2 rounded transition ${type === "audio" ? "bg-blue-500 text-black" : "text-neutral-500 hover:text-white"}`}>Audio</button>
      </div>

      <input
        placeholder="Playlist name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={`mb-4 w-full rounded border border-neutral-800 bg-black px-3 py-2 text-sm outline-none ${type === 'visual' ? 'focus:border-emerald-500' : 'focus:border-blue-500'}`}
      />

      <div className="mb-4 flex items-center justify-between bg-neutral-900 p-2 text-xs rounded">
        <label className="flex items-center gap-2 text-neutral-400">
          <input
            type="checkbox"
            checked={loop}
            onChange={(e) => setLoop(e.target.checked)}
            className={type === 'visual' ? 'accent-emerald-500' : 'accent-blue-500'}
          />
          Loop Playlist
        </label>
        
        {type === "visual" && (
          <label className="flex items-center gap-2 text-neutral-400" title="Global Image Duration (seconds)">
            Global Time (s):
            <input
              type="number"
              min={1}
              value={globalDuration}
              onChange={(e) => setGlobalDuration(Number(e.target.value))}
              className="w-16 rounded bg-black border border-neutral-800 px-2 py-1 outline-none focus:border-emerald-500 text-center"
            />
          </label>
        )}
      </div>

      {type === "visual" && (
        <div className="mb-4 flex items-center gap-2">
          <input
            placeholder="Paste YouTube Link"
            value={ytUrl}
            onChange={(e) => setYtUrl(e.target.value)}
            className="flex-1 rounded border border-neutral-800 bg-black px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
          <button
            onClick={addYt}
            className="rounded bg-neutral-800 p-2 text-neutral-300 hover:bg-emerald-500 hover:text-black transition"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      )}

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
        className={`flex flex-col items-center justify-center rounded border-2 border-dashed px-4 py-6 text-center text-xs transition mb-4 ${
          dragOver
            ? type === 'visual' ? "border-emerald-500 bg-emerald-500/5 text-emerald-400" : "border-blue-500 bg-blue-500/5 text-blue-400"
            : "border-neutral-800 text-neutral-500"
        }`}
      >
        <Upload className="mb-2 h-5 w-5" />
        {uploading ? "Uploading..." : type === "visual" ? "Drop Images/Videos here" : "Drop Audio files here"}
        <label className={`mt-2 cursor-pointer hover:underline ${type === 'visual' ? 'text-emerald-400' : 'text-blue-400'}`}>
          or browse
          <input
            type="file"
            multiple
            accept={type === "visual" ? "video/*,image/*" : "audio/*"}
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
        </label>
      </div>

      {/* Playlist Items */}
      <div className="mb-2 text-[10px] uppercase tracking-[0.3em] text-neutral-500">
        Queue ({items.length})
      </div>
      {items.length > 0 && (
        <ul className="space-y-2 text-xs">
          {items.map((it, i) => (
            <li
              key={i}
              draggable
              onDragStart={() => setDraggedIdx(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDropItem(i)}
              className={`flex items-center gap-2 rounded border border-neutral-800 bg-neutral-900/50 p-2 transition ${draggedIdx === i ? "opacity-50" : ""}`}
            >
              <div className={`cursor-grab active:cursor-grabbing text-neutral-500 ${type === 'visual' ? 'hover:text-emerald-400' : 'hover:text-blue-400'}`}>
                <GripVertical className="h-4 w-4" />
              </div>
              
              <div className="flex-1 truncate">
                <span className={`font-semibold mr-2 ${it.type === 'youtube' ? 'text-red-400' : it.type === 'video' ? 'text-blue-400' : it.type === 'audio' ? 'text-blue-500' : 'text-emerald-400'}`}>
                  {it.type?.toUpperCase()}
                </span>
                {it.url.slice(-30)}
              </div>

              {it.type === 'image' ? (
                <div className="flex items-center gap-1" title="Duration (s)">
                  <input
                    type="number"
                    min={1}
                    value={it.duration ?? globalDuration}
                    onChange={(e) => updateItem(i, { duration: Number(e.target.value) })}
                    className="w-14 rounded bg-black border border-neutral-800 px-1 py-1 text-center outline-none focus:border-emerald-500"
                  />
                  <span className="text-neutral-500">s</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {!it.muted && (
                    <input 
                      type="range" min="0" max="100" value={it.volume ?? 100} 
                      onChange={(e) => updateItem(i, { volume: Number(e.target.value) })} 
                      className={`w-16 ${type === 'visual' ? 'accent-emerald-500' : 'accent-blue-500'}`} 
                      title="Volume"
                    />
                  )}
                  {type === "visual" && (
                    <button
                      onClick={() => updateItem(i, { muted: !it.muted })}
                      className={`p-1 rounded transition ${it.muted ? "text-neutral-500 hover:text-white" : "text-emerald-400 hover:text-emerald-300"}`}
                      title={it.muted ? "Unmute Video (Pauses BGM)" : "Mute Video (Keeps BGM playing)"}
                    >
                      {it.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              )}

              <button
                onClick={() => setItems(items.filter((_, j) => j !== i))}
                className="text-neutral-600 hover:text-red-400 ml-2"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        disabled={!name || items.length === 0 || saveMut.isPending || uploading}
        onClick={() => saveMut.mutate()}
        className={`mt-6 w-full rounded px-3 py-3 text-xs font-bold uppercase tracking-wider text-black transition disabled:opacity-30 disabled:bg-white disabled:hover:bg-white ${type === 'visual' ? 'bg-emerald-500 hover:bg-emerald-400' : 'bg-blue-500 hover:bg-blue-400'}`}
      >
        {selectedId === "new" ? "Create Playlist" : "Save Changes"}
      </button>
    </div>
  );
}
