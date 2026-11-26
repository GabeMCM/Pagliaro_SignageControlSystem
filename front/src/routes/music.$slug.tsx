import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  signageApi,
  type DropboxTrack,
} from "@/lib/signage-api";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Plus,
  Minus,
  Search,
  Music,
  ListMusic,
  Folder,
  FolderOpen,
  Check,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";

export const Route = createFileRoute("/music/$slug")({
  component: FamilyMusicPlayer,
});

function FamilyMusicPlayer() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();

  // Abas: "dropbox" (Músicas na nuvem) ou "queue" (Fila da sala)
  const [activeTab, setActiveTab] = useState<"dropbox" | "queue">("dropbox");

  // Filtros de busca e pasta no Dropbox
  const [selectedFolder, setSelectedFolder] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [feedbackMsg, setFeedbackMsg] = useState<{ id: string; text: string } | null>(null);

  // Consulta do estado público de reprodução (atualiza a cada 2s)
  const musicStateQ = useQuery({
    queryKey: ["publicMusicState", slug],
    queryFn: () => signageApi.getPublicMusicState(slug),
    refetchInterval: 2000,
  });

  // Consulta das músicas do Dropbox
  const dropboxTracksQ = useQuery({
    queryKey: ["dropboxTracks", selectedFolder],
    queryFn: () => signageApi.getDropboxTracks(selectedFolder || undefined),
    staleTime: 60 * 1000,
  });

  // Consulta das pastas do Dropbox
  const dropboxFoldersQ = useQuery({
    queryKey: ["dropboxFolders"],
    queryFn: () => signageApi.getDropboxFolders(),
    staleTime: 5 * 60 * 1000,
  });

  // Mutação para envio de comandos de áudio
  const controlMut = useMutation({
    mutationFn: (body: any) => signageApi.controlPublicMusic(slug, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["publicMusicState", slug] });
    },
  });

  const state = musicStateQ.data;
  const isAudioPlaying = state?.audioStatus === "playing";
  const currentVolume = state?.audioVolume ?? 0;
  const currentTrack = state?.currentTrack;
  const queue = state?.queue || [];
  const folders = dropboxFoldersQ.data?.folders || state?.folders || [];

  // Filtragem local das faixas por termo de pesquisa
  const filteredTracks = useMemo(() => {
    const list = dropboxTracksQ.data?.tracks || [];
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.folder && t.folder.toLowerCase().includes(q))
    );
  }, [dropboxTracksQ.data?.tracks, searchQuery]);

  const showFeedback = (id: string, text: string) => {
    setFeedbackMsg({ id, text });
    setTimeout(() => setFeedbackMsg(null), 2500);
  };

  // Ações de controle
  const handlePlay = () => controlMut.mutate({ command: "play" });
  const handlePause = () => controlMut.mutate({ command: "pause" });
  const handleNext = () => controlMut.mutate({ command: "next" });
  const handlePrev = () => controlMut.mutate({ command: "prev" });

  const handleVolumeStep = (direction: "up" | "down") => {
    controlMut.mutate({ command: "volumeStep", direction, step: 5 });
  };

  const handleMuteToggle = () => {
    const newVol = currentVolume > 0 ? 0 : 30;
    controlMut.mutate({ command: "setVolume", value: newVol });
  };

  const handlePlayDropboxTrack = (track: DropboxTrack) => {
    showFeedback(track.id, "Tocando na TV!");
    controlMut.mutate({
      command: "playDropboxTrack",
      track: {
        id: track.id,
        title: track.title,
        streamUrl: track.streamUrl,
        duration: track.duration,
        folder: track.folder,
      },
    });
  };

  const handleEnqueueDropboxTrack = (track: DropboxTrack) => {
    showFeedback(track.id, "Adicionado à fila!");
    controlMut.mutate({
      command: "enqueueDropboxTrack",
      track: {
        id: track.id,
        title: track.title,
        streamUrl: track.streamUrl,
        duration: track.duration,
        folder: track.folder,
      },
    });
  };

  const handleSelectQueueIndex = (index: number) => {
    controlMut.mutate({ command: "selectTrackIndex", index });
  };

  const handleRemoveQueueItem = (index: number, title: string) => {
    if (confirm(`Remover "${title}" da fila da sala?`)) {
      controlMut.mutate({ command: "removeTrack", index });
    }
  };

  const handleClearQueue = () => {
    if (confirm("Deseja remover todas as músicas da fila da sala?")) {
      controlMut.mutate({ command: "clearQueue" });
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans flex flex-col selection:bg-amber-500 selection:text-black">
      {/* ============================================================ */}
      {/* CABEÇALHO LIMPO E INSTITUCIONAL (APENAS "PAGLIARO")          */}
      {/* ============================================================ */}
      <header className="sticky top-0 z-40 bg-black/90 backdrop-blur-md border-b border-neutral-900 px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-black font-black text-sm shadow-md">
            P
          </div>
          <div>
            <h1 className="text-lg font-extrabold uppercase tracking-widest text-white leading-tight">
              Pagliaro
            </h1>
            <p className="text-[11px] text-neutral-400 font-medium">
              {state?.room?.name || `Sala ${slug}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAudioPlaying ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Na TV
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-400 text-xs font-semibold">
              Pausado
            </span>
          )}
        </div>
      </header>

      {/* ============================================================ */}
      {/* REPRODUTOR FIXO / "TOCANDO AGORA"                            */}
      {/* ============================================================ */}
      <section className="bg-neutral-900/60 border-b border-neutral-900 p-4 space-y-3.5">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-neutral-800 border border-neutral-700/60 flex items-center justify-center text-amber-400 flex-shrink-0 shadow-inner">
            <Music className={`h-6 w-6 ${isAudioPlaying ? "animate-pulse" : ""}`} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400/90 block mb-0.5">
              {isAudioPlaying ? "Tocando Agora na Sala" : "Áudio da Sala"}
            </span>
            <h2 className="text-base font-bold text-white truncate leading-snug">
              {currentTrack?.title || "Nenhuma música selecionada"}
            </h2>
            <p className="text-xs text-neutral-400 truncate">
              {state?.room?.name || "Transmissão da Sala"} • {queue.length} faixa{queue.length !== 1 ? "s" : ""} na fila
            </p>
          </div>
        </div>

        {/* Botões de Reprodução (Prev / Play-Pause / Next) */}
        <div className="grid grid-cols-[1fr_2fr_1fr] gap-2 items-center">
          <button
            type="button"
            onClick={handlePrev}
            disabled={controlMut.isPending || queue.length === 0}
            className="min-h-[48px] rounded-xl bg-neutral-800/90 border border-neutral-700/60 text-neutral-200 active:scale-95 hover:bg-neutral-700 flex items-center justify-center transition disabled:opacity-40"
            title="Música Anterior"
          >
            <SkipBack className="h-5 w-5" />
          </button>

          {isAudioPlaying ? (
            <button
              type="button"
              onClick={handlePause}
              disabled={controlMut.isPending}
              className="min-h-[48px] rounded-xl bg-amber-500/20 border border-amber-500/50 text-amber-300 active:scale-95 hover:bg-amber-500/30 font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition"
            >
              <Pause className="h-5 w-5" />
              <span>Pausar</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePlay}
              disabled={controlMut.isPending}
              className="min-h-[48px] rounded-xl bg-white text-black font-bold active:scale-95 hover:bg-neutral-200 text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition"
            >
              <Play className="h-5 w-5 fill-current ml-0.5" />
              <span>Tocar</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleNext}
            disabled={controlMut.isPending || queue.length === 0}
            className="min-h-[48px] rounded-xl bg-neutral-800/90 border border-neutral-700/60 text-neutral-200 active:scale-95 hover:bg-neutral-700 flex items-center justify-center transition disabled:opacity-40"
            title="Próxima Música"
          >
            <SkipForward className="h-5 w-5" />
          </button>
        </div>

        {/* ============================================================ */}
        {/* CONTROLE DE VOLUME (SEM SLIDER, APENAS BOTÕES)              */}
        {/* ============================================================ */}
        <div className="bg-black/40 border border-neutral-800/80 rounded-xl p-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={handleMuteToggle}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white transition"
              title="Mudo"
            >
              {currentVolume === 0 ? (
                <VolumeX className="h-4 w-4 text-red-400" />
              ) : (
                <Volume2 className="h-4 w-4 text-amber-400" />
              )}
            </button>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                Volume TV
              </span>
              <span className="text-sm font-extrabold text-white font-mono">
                {currentVolume}%
              </span>
            </div>
          </div>

          {/* Botões de Aumentar e Diminuir (Passo de 5%) */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleVolumeStep("down")}
              disabled={currentVolume <= 0 || controlMut.isPending}
              className="min-h-[42px] px-3.5 rounded-lg bg-neutral-800 border border-neutral-700 active:scale-95 hover:bg-neutral-700 text-white font-bold text-sm flex items-center justify-center gap-1 transition disabled:opacity-30"
              title="Diminuir Volume (-5%)"
            >
              <Minus className="h-4 w-4" />
              <span>-5%</span>
            </button>

            <button
              type="button"
              onClick={() => handleVolumeStep("up")}
              disabled={currentVolume >= 100 || controlMut.isPending}
              className="min-h-[42px] px-3.5 rounded-lg bg-neutral-800 border border-neutral-700 active:scale-95 hover:bg-neutral-700 text-white font-bold text-sm flex items-center justify-center gap-1 transition disabled:opacity-30"
              title="Aumentar Volume (+5%)"
            >
              <Plus className="h-4 w-4" />
              <span>+5%</span>
            </button>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* SELETOR DE ABAS: MÚSICAS DROPBOX vs FILA DA SALA             */}
      {/* ============================================================ */}
      <div className="sticky top-[57px] z-30 bg-neutral-950/95 backdrop-blur-sm border-b border-neutral-900 px-4 py-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("dropbox")}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
            activeTab === "dropbox"
              ? "bg-amber-500 text-black shadow-md font-extrabold"
              : "bg-neutral-900 text-neutral-400 hover:text-white"
          }`}
        >
          <Music className="h-3.5 w-3.5" />
          <span>Músicas</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("queue")}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
            activeTab === "queue"
              ? "bg-amber-500 text-black shadow-md font-extrabold"
              : "bg-neutral-900 text-neutral-400 hover:text-white"
          }`}
        >
          <ListMusic className="h-3.5 w-3.5" />
          <span>Fila da Sala ({queue.length})</span>
        </button>
      </div>

      {/* ============================================================ */}
      {/* CONTEÚDO PRINCIPAL: MÚSICAS                                  */}
      {/* ============================================================ */}
      {activeTab === "dropbox" && (
        <main className="p-4 space-y-3.5 flex-1 pb-16">
          {/* ============================================================ */}
          {/* SEÇÃO PRÓPRIA DE PASTAS DE MÚSICAS                          */}
          {/* ============================================================ */}
          {folders.length > 0 && (
            <section className="bg-neutral-900/70 border border-neutral-800/90 rounded-2xl p-3.5 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <FolderOpen className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                      Pastas de Músicas
                    </h3>
                    <p className="text-[10px] text-neutral-400">
                      Selecione uma pasta para filtrar o repertório
                    </p>
                  </div>
                </div>

                {selectedFolder && (
                  <button
                    type="button"
                    onClick={() => setSelectedFolder("")}
                    className="text-[11px] text-amber-400 hover:text-amber-300 font-bold px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/30 transition"
                  >
                    Ver Todas
                  </button>
                )}
              </div>

              {/* Menu de Cards das Pastas */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedFolder("")}
                  className={`p-2.5 rounded-xl border text-left transition flex items-center gap-2.5 active:scale-98 ${
                    !selectedFolder
                      ? "bg-amber-500/15 border-amber-500 text-white shadow-sm ring-1 ring-amber-500/40"
                      : "bg-neutral-950/80 border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-900"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      !selectedFolder
                        ? "bg-amber-500 text-black font-extrabold"
                        : "bg-neutral-800 text-neutral-400"
                    }`}
                  >
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold truncate">Todas</div>
                    <div className="text-[10px] text-neutral-400 truncate">Todas as faixas</div>
                  </div>
                </button>

                {folders.map((folderName) => {
                  const isSelected = selectedFolder === folderName;
                  return (
                    <button
                      key={folderName}
                      type="button"
                      onClick={() => setSelectedFolder(isSelected ? "" : folderName)}
                      className={`p-2.5 rounded-xl border text-left transition flex items-center gap-2.5 active:scale-98 ${
                        isSelected
                          ? "bg-amber-500/15 border-amber-500 text-white shadow-sm ring-1 ring-amber-500/40"
                          : "bg-neutral-950/80 border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-900"
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          isSelected
                            ? "bg-amber-500 text-black font-extrabold"
                            : "bg-neutral-800 text-amber-400"
                        }`}
                      >
                        <Folder className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold truncate">{folderName}</div>
                        <div className="text-[10px] text-neutral-400 truncate">Pasta</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Barra de Busca de Músicas */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={selectedFolder ? `Buscar em "${selectedFolder}"...` : "Buscar por título de música..."}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-amber-500 transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-white bg-neutral-800 px-1.5 py-0.5 rounded"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Lista de Faixas */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-neutral-400 px-1">
              <div className="flex items-center gap-1.5 truncate">
                <span>
                  {filteredTracks.length} música{filteredTracks.length !== 1 ? "s" : ""}
                </span>
                {selectedFolder ? (
                  <span className="text-amber-400 font-semibold truncate">
                    em "{selectedFolder}"
                  </span>
                ) : (
                  <span className="text-neutral-500">(todas as pastas)</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => dropboxTracksQ.refetch()}
                className="flex items-center gap-1 text-amber-400 hover:text-amber-300 font-medium"
              >
                <RefreshCw className={`h-3 w-3 ${dropboxTracksQ.isFetching ? "animate-spin" : ""}`} />
                <span>Atualizar</span>
              </button>
            </div>

            {dropboxTracksQ.isLoading ? (
              <div className="py-12 text-center text-neutral-400 space-y-2">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto text-amber-400" />
                <p className="text-xs">Carregando músicas...</p>
              </div>
            ) : filteredTracks.length === 0 ? (
              <div className="py-12 text-center text-neutral-500 bg-neutral-900/30 rounded-2xl border border-neutral-900 p-6 space-y-2">
                <Music className="h-8 w-8 mx-auto text-neutral-600" />
                <p className="text-sm font-semibold text-neutral-300">Nenhuma música encontrada</p>
                <p className="text-xs text-neutral-500">
                  {searchQuery
                    ? `Nenhum resultado para "${searchQuery}". Tente outro termo.`
                    : "Esta pasta não contém arquivos de áudio compatíveis."}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredTracks.map((track) => {
                  const isFeedback = feedbackMsg?.id === track.id;
                  return (
                    <div
                      key={track.id}
                      className="bg-neutral-900/80 border border-neutral-800/80 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:border-neutral-700 transition"
                    >
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-white truncate">
                          {track.title}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-neutral-400">
                          {track.folder && (
                            <span className="px-1.5 py-0.2 bg-neutral-800 rounded text-[10px] text-amber-300 font-medium">
                              {track.folder}
                            </span>
                          )}
                          {track.durationFormatted && (
                            <span>{track.durationFormatted}</span>
                          )}
                        </div>
                      </div>

                      {/* Botões de Ação na Música */}
                      <div className="flex items-center gap-2 flex-shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-neutral-800">
                        {isFeedback ? (
                          <div className="min-h-[38px] px-3 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5">
                            <Check className="h-4 w-4" />
                            <span>{feedbackMsg.text}</span>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleEnqueueDropboxTrack(track)}
                              disabled={controlMut.isPending}
                              className="min-h-[38px] px-3 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-200 active:scale-95 hover:bg-neutral-700 text-xs font-semibold flex items-center gap-1.5 transition"
                              title="Adicionar à fila de reprodução"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span>+ Fila</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handlePlayDropboxTrack(track)}
                              disabled={controlMut.isPending}
                              className="min-h-[38px] px-3.5 rounded-lg bg-amber-500 active:scale-95 text-black hover:bg-amber-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition"
                              title="Tocar agora imediatamente na TV"
                            >
                              <Play className="h-3.5 w-3.5 fill-current" />
                              <span>Tocar Agora</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      )}

      {/* ============================================================ */}
      {/* ABA 2: FILA DA SALA (QUEUE)                                  */}
      {/* ============================================================ */}
      {activeTab === "queue" && (
        <main className="p-4 space-y-3.5 flex-1 pb-16">
          <div className="flex items-center justify-between text-xs text-neutral-400 px-1">
            <span>{queue.length} faixa{queue.length !== 1 ? "s" : ""} programada{queue.length !== 1 ? "s" : ""} na TV</span>
            <div className="flex items-center gap-3">
              {queue.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearQueue}
                  className="text-red-400/80 hover:text-red-300 transition"
                  title="Remover todas as faixas da fila"
                >
                  Limpar fila
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveTab("dropbox")}
                className="text-amber-400 hover:text-amber-300 font-semibold"
              >
                + Adicionar mais músicas
              </button>
            </div>
          </div>

          {queue.length === 0 ? (
            <div className="py-12 text-center text-neutral-500 bg-neutral-900/30 rounded-2xl border border-neutral-900 p-6 space-y-3">
              <ListMusic className="h-10 w-10 mx-auto text-neutral-600" />
              <p className="text-base font-semibold text-neutral-300">A fila de músicas está vazia</p>
              <p className="text-xs text-neutral-500 max-w-xs mx-auto">
                Escolha faixas na aba de Músicas para tocar agora ou adicionar à fila da cerimônia.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("dropbox")}
                className="mt-2 px-4 py-2 rounded-xl bg-amber-500 text-black font-bold text-xs uppercase tracking-wider shadow"
              >
                Explorar Músicas
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {queue.map((item) => {
                const isCurrent = item.current;
                return (
                  <div
                    key={item.index}
                    onClick={() => handleSelectQueueIndex(item.index)}
                    className={`cursor-pointer rounded-xl p-3 flex items-center justify-between gap-3 transition ${
                      isCurrent
                        ? "bg-amber-500/10 border-2 border-amber-500/70 text-white shadow-md"
                        : "bg-neutral-900/70 border border-neutral-800 text-neutral-300 hover:border-neutral-700"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                          isCurrent
                            ? "bg-amber-500 text-black font-extrabold"
                            : "bg-neutral-800 text-neutral-400"
                        }`}
                      >
                        {isCurrent ? (
                          <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
                        ) : (
                          item.index + 1
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold truncate leading-tight">
                          {item.title}
                        </h4>
                        {isCurrent && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                            Tocando Agora
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {!isCurrent && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectQueueIndex(item.index);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 font-semibold transition"
                          title="Tocar esta faixa agora"
                        >
                          Tocar
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveQueueItem(item.index, item.title);
                        }}
                        className="p-2 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-red-500/10 active:scale-95 transition"
                        title="Excluir faixa da fila"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      )}

      {/* Rodapé simples e limpo */}
      <footer className="mt-auto border-t border-neutral-900 bg-black/60 px-4 py-3 text-center text-[11px] text-neutral-500">
        PAGLIARO • Controle de Homenagem
      </footer>
    </div>
  );
}
