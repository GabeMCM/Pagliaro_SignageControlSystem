import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { signageApi, type RoomRoutine, type Room, type Playlist } from "@/lib/signage-api";
import { RoutineModal } from "@/components/RoutineModal";
import {
  CalendarClock,
  Clock,
  Plus,
  Play,
  Pencil,
  Trash2,
  RefreshCw,
  Monitor,
  Radio,
  Music,
  Moon,
  Globe,
  Sliders,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  ROUTINE_DAYS,
  formatRoutineDaysSummary,
  VERIFIED_GOSPEL_PRESETS,
} from "@/lib/constants";

export const Route = createFileRoute("/admin/routines")({
  head: () => ({ meta: [{ title: "Rotinas Globais | Pagliaro Signage" }] }),
  component: AdminRoutinesPage,
});

interface AgnosticRoutineGroup {
  groupKey: string;
  title: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  enabled: boolean;
  actions: RoomRoutine["actions"];
  assignedRooms: string[];
  routineIds: string[];
  rawRoutines: RoomRoutine[];
}

function AdminRoutinesPage() {
  const qc = useQueryClient();

  const [filterRoom, setFilterRoom] = useState<string>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<AgnosticRoutineGroup | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  // 1. Salas
  const { data: rooms = [], isLoading: loadingRooms } = useQuery<Room[]>({
    queryKey: ["rooms"],
    queryFn: signageApi.listRooms,
    refetchInterval: 5000,
  });

  // 2. Playlists
  const { data: playlists = [] } = useQuery<Playlist[]>({
    queryKey: ["playlists"],
    queryFn: signageApi.listPlaylists,
  });
  const audioPlaylists = useMemo(() => playlists.filter((p) => p.type === "audio"), [playlists]);

  // 3. Todas as Rotinas
  const {
    data: allRoutines = [],
    isLoading: loadingRoutines,
    refetch: refetchRoutines,
  } = useQuery<RoomRoutine[]>({
    queryKey: ["all-routines"],
    queryFn: () => signageApi.listRoutines(),
    refetchInterval: 6000,
  });

  // Agrupamento agnóstico de rotinas (módulo agnóstico de salas)
  const groupedRoutines = useMemo<AgnosticRoutineGroup[]>(() => {
    const map = new Map<string, AgnosticRoutineGroup>();

    for (const r of allRoutines) {
      const daysKey = (r.daysOfWeek || []).slice().sort().join(",");
      const key = `${r.title}__${r.startTime}__${r.endTime}__${daysKey}`;

      if (!map.has(key)) {
        map.set(key, {
          groupKey: key,
          title: r.title,
          daysOfWeek: r.daysOfWeek || [],
          startTime: r.startTime,
          endTime: r.endTime,
          enabled: r.enabled,
          actions: r.actions || {},
          assignedRooms: [r.roomSlug],
          routineIds: [r.id],
          rawRoutines: [r],
        });
      } else {
        const item = map.get(key)!;
        if (!item.assignedRooms.includes(r.roomSlug)) {
          item.assignedRooms.push(r.roomSlug);
        }
        item.routineIds.push(r.id);
        item.rawRoutines.push(r);
        if (r.enabled) item.enabled = true;
      }
    }

    return Array.from(map.values()).sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [allRoutines]);

  // Filtragem
  const filteredRoutines = useMemo(() => {
    if (filterRoom === "all") return groupedRoutines;
    return groupedRoutines.filter((g) => g.assignedRooms.includes(filterRoom));
  }, [groupedRoutines, filterRoom]);

  // Alternar Ativação da Rotina
  const toggleMutation = useMutation({
    mutationFn: async (group: AgnosticRoutineGroup) => {
      const promises = group.rawRoutines.map((r) => signageApi.toggleRoutine(r.id));
      await Promise.all(promises);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-routines"] });
      showToast("Status da rotina atualizado em todas as salas atribuídas.");
    },
    onError: () => {
      showToast("Falha ao alternar status da rotina.", "error");
    },
  });

  // Executar Rotina Imediatamente
  const runMutation = useMutation({
    mutationFn: async (group: AgnosticRoutineGroup) => {
      const promises = group.routineIds.map((id) => signageApi.runRoutineNow(id));
      await Promise.all(promises);
    },
    onSuccess: () => {
      showToast("Comando emitido: Rotina executada agora nas salas atribuídas!");
    },
    onError: () => {
      showToast("Erro ao executar rotina nas telas.", "error");
    },
  });

  // Excluir Rotina
  const deleteMutation = useMutation({
    mutationFn: async (group: AgnosticRoutineGroup) => {
      const promises = group.routineIds.map((id) => signageApi.deleteRoutine(id));
      await Promise.all(promises);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-routines"] });
      showToast("Rotina excluída com sucesso.");
    },
    onError: () => {
      showToast("Erro ao excluir rotina.", "error");
    },
  });

  // Salvar (Criar ou Atualizar)
  const saveRoutine = async (data: Partial<RoomRoutine>, targetRooms: string[]) => {
    try {
      if (editingGroup) {
        // Exclui instâncias de salas que foram removidas
        const removed = editingGroup.rawRoutines.filter(
          (r) => !targetRooms.includes(r.roomSlug)
        );
        for (const rem of removed) {
          await signageApi.deleteRoutine(rem.id);
        }

        // Atualiza instâncias existentes que continuam
        for (const roomSlug of targetRooms) {
          const existing = editingGroup.rawRoutines.find((r) => r.roomSlug === roomSlug);
          if (existing) {
            await signageApi.updateRoutine(existing.id, {
              ...data,
              roomSlug,
            });
          } else {
            // Nova sala adicionada a esta rotina
            await signageApi.createRoutine({
              ...data,
              roomSlug,
            });
          }
        }
        showToast("Rotina atualizada com sucesso!");
      } else {
        // Nova rotina: cria uma instância para cada sala selecionada
        for (const roomSlug of targetRooms) {
          await signageApi.createRoutine({
            ...data,
            roomSlug,
          });
        }
        showToast(`Rotina criada e atribuída a ${targetRooms.length} sala(s)!`);
      }
      qc.invalidateQueries({ queryKey: ["all-routines"] });
    } catch (err: any) {
      showToast("Erro ao salvar rotina: " + (err.message || "Falha de rede"), "error");
    }
  };

  const availableRoomsList = useMemo(
    () => rooms.map((r) => ({ slug: r.slug, name: r.name })),
    [rooms]
  );

  return (
    <div className="h-full flex flex-col bg-neutral-950 font-sans overflow-hidden">
      {/* Top Banner Feedback Toast */}
      {toastMsg && (
        <div
          className={`fixed top-4 right-4 z-50 px-3.5 py-2 text-xs font-mono border shadow-2xl transition flex items-center gap-2 ${
            toastMsg.type === "success"
              ? "bg-black border-emerald-500/60 text-emerald-300"
              : "bg-black border-red-500/60 text-red-300"
          }`}
        >
          {toastMsg.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
          )}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Header da Página */}
      <div className="flex-shrink-0 border-b border-neutral-900 bg-black px-3.5 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-neutral-900 border border-neutral-900 text-neutral-200">
              <CalendarClock className="h-4 w-4 text-neutral-300" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-bold text-white font-mono uppercase tracking-wider">
                Rotinas Globais
              </h1>
              <p className="text-[10px] text-neutral-400 font-mono">
                Módulo agnóstico de salas: crie regras semanais e atribua a uma ou mais telas simultaneamente
              </p>
            </div>
          </div>
        </div>

        {/* Ações do Topo */}
        <div className="flex items-center gap-2">
          {/* Filtro de Sala */}
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className="text-[10px] text-neutral-400 hidden md:inline">Filtrar:</span>
            <select
              value={filterRoom}
              onChange={(e) => setFilterRoom(e.target.value)}
              className="bg-black border border-neutral-900 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-neutral-600 font-mono cursor-pointer"
            >
              <option value="all">Todas as Salas ({rooms.length})</option>
              {rooms.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* Botão Nova Rotina */}
          <button
            type="button"
            onClick={() => {
              setEditingGroup(null);
              setModalOpen(true);
            }}
            className="flex items-center gap-1.5 bg-white hover:bg-neutral-200 text-black px-3 py-1.5 text-xs font-mono font-bold transition shadow-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Nova Rotina</span>
          </button>
        </div>
      </div>

      {/* Lista de Rotinas */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3">
        {loadingRoutines ? (
          <div className="p-8 text-center text-xs font-mono text-neutral-400 flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin text-neutral-400" />
            <span>Carregando rotinas do sistema...</span>
          </div>
        ) : filteredRoutines.length === 0 ? (
          <div className="p-8 text-center border border-neutral-900 bg-neutral-900/20 max-w-md mx-auto my-8 space-y-3">
            <Clock className="h-8 w-8 text-neutral-600 mx-auto" />
            <div>
              <p className="text-xs font-mono font-bold text-neutral-300 uppercase">
                Nenhuma rotina configurada
              </p>
              <p className="text-[11px] text-neutral-400 font-mono mt-1">
                Rotinas são horários automáticos recorrentes (ex: rádio gospel das 07:00 às 19:00 e standby noturno).
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingGroup(null);
                setModalOpen(true);
              }}
              className="px-3.5 py-1.5 bg-white text-black font-mono font-bold text-xs hover:bg-neutral-200 transition"
            >
              Criar Primeira Rotina
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredRoutines.map((group) => {
              const radioPreset = VERIFIED_GOSPEL_PRESETS.find(
                (p) => p.url === group.actions.audioStreamUrl
              );
              const isOvernight = group.startTime && group.endTime && group.startTime > group.endTime;

              return (
                <div
                  key={group.groupKey}
                  className={`border bg-black p-3.5 flex flex-col justify-between transition space-y-3 ${
                    group.enabled
                      ? "border-neutral-900 hover:border-neutral-800"
                      : "border-neutral-900/60 opacity-60"
                  }`}
                >
                  {/* Cabeçalho do Card */}
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full flex-shrink-0 ${
                              group.enabled ? "bg-emerald-500" : "bg-neutral-600"
                            }`}
                          />
                          <h3 className="text-xs sm:text-sm font-bold text-white font-mono truncate">
                            {group.title}
                          </h3>
                        </div>
                        <p className="text-[10px] text-neutral-400 font-mono mt-0.5">
                          {formatRoutineDaysSummary(group.daysOfWeek)}
                        </p>
                      </div>

                      {/* Horário */}
                      <div className="text-right flex-shrink-0">
                        <span className="text-xs font-mono font-bold text-white bg-neutral-900 px-2 py-0.5 border border-neutral-900 inline-block">
                          {group.startTime} → {group.endTime}
                        </span>
                        {isOvernight && (
                          <div className="text-[9px] font-mono text-amber-400 mt-0.5">
                            Atravessa meia-noite
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Pílulas dos 7 Dias da Semana */}
                    <div className="grid grid-cols-7 gap-1 pt-1 font-mono text-[9px] text-center font-bold">
                      {ROUTINE_DAYS.map((d) => {
                        const active = group.daysOfWeek.includes(d.day);
                        return (
                          <div
                            key={d.day}
                            className={`py-0.5 border ${
                              active
                                ? "bg-white text-black border-white"
                                : "bg-neutral-950 border-neutral-900 text-neutral-600"
                            }`}
                          >
                            {d.label}
                          </div>
                        );
                      })}
                    </div>

                    {/* Salas Atribuídas */}
                    <div className="space-y-1 pt-1 border-t border-neutral-900">
                      <div className="text-[10px] text-neutral-400 font-mono flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Monitor className="h-3 w-3 text-neutral-400" />
                          <span>Salas Atribuídas ({group.assignedRooms.length}):</span>
                        </span>
                        {group.assignedRooms.length === rooms.length && rooms.length > 0 && (
                          <span className="text-[9px] text-emerald-400 uppercase font-bold">
                            Todas as Telas
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 flex-wrap pt-0.5">
                        {group.assignedRooms.map((rSlug) => {
                          const roomObj = rooms.find((r) => r.slug === rSlug);
                          return (
                            <span
                              key={rSlug}
                              className="text-[10px] font-mono px-1.5 py-0.5 bg-neutral-900 border border-neutral-900 text-neutral-300"
                            >
                              {roomObj?.name || rSlug}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    {/* Detalhes de Ações da Rotina */}
                    <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-neutral-900 text-[10px] font-mono">
                      {/* Tela */}
                      <div className="p-1.5 bg-neutral-950 border border-neutral-900 flex items-center gap-1.5 min-w-0">
                        {group.actions.standby ? (
                          <>
                            <Moon className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
                            <span className="truncate text-amber-200">Standby OLED</span>
                          </>
                        ) : group.actions.siteUrl ? (
                          <>
                            <Globe className="h-3.5 w-3.5 text-neutral-300 flex-shrink-0" />
                            <span className="truncate text-neutral-200">
                              {group.actions.siteUrl.includes("adiau") ? "Adiaŭ Memorial" : "Site Web"}
                            </span>
                          </>
                        ) : (
                          <>
                            <Monitor className="h-3.5 w-3.5 text-neutral-400 flex-shrink-0" />
                            <span className="truncate text-neutral-400">Playlist Fotos</span>
                          </>
                        )}
                      </div>

                      {/* Áudio */}
                      <div className="p-1.5 bg-neutral-950 border border-neutral-900 flex items-center gap-1.5 min-w-0">
                        {group.actions.audioStreamUrl ? (
                          <>
                            <Radio className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                            <span className="truncate text-emerald-200">
                              {radioPreset?.name || "Rádio Web"} ({group.actions.audioVolume ?? 25}%)
                            </span>
                          </>
                        ) : group.actions.audioPlaylist ? (
                          <>
                            <Music className="h-3.5 w-3.5 text-neutral-300 flex-shrink-0" />
                            <span className="truncate text-neutral-200">
                              Playlist ({group.actions.audioVolume ?? 25}%)
                            </span>
                          </>
                        ) : (
                          <>
                            <Sliders className="h-3.5 w-3.5 text-neutral-500 flex-shrink-0" />
                            <span className="truncate text-neutral-400">Silencioso</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Barra de Ações do Card */}
                  <div className="pt-2 border-t border-neutral-900 flex items-center justify-between gap-1.5 font-mono text-xs">
                    {/* Switch Ativar / Desativar */}
                    <button
                      type="button"
                      onClick={() => toggleMutation.mutate(group)}
                      disabled={toggleMutation.isPending}
                      className={`px-2 py-1 border text-[11px] transition flex items-center gap-1.5 ${
                        group.enabled
                          ? "bg-neutral-900 border-neutral-900 text-neutral-200 hover:text-white"
                          : "bg-black border-neutral-900 text-neutral-400 hover:text-white"
                      }`}
                      title={group.enabled ? "Desativar rotina" : "Ativar rotina"}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${group.enabled ? "bg-emerald-400" : "bg-neutral-600"}`} />
                      <span>{group.enabled ? "Ativa" : "Pausada"}</span>
                    </button>

                    <div className="flex items-center gap-1">
                      {/* Executar Agora */}
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Deseja forçar a execução imediata da rotina "${group.title}" em todas as ${group.assignedRooms.length} telas atribuídas?`)) {
                            runMutation.mutate(group);
                          }
                        }}
                        disabled={runMutation.isPending}
                        className="p-1.5 bg-neutral-950 border border-neutral-900 text-neutral-300 hover:text-white hover:bg-neutral-900 transition"
                        title="Testar / Executar agora nas salas"
                      >
                        <Play className="h-3 w-3" />
                      </button>

                      {/* Editar */}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingGroup(group);
                          setModalOpen(true);
                        }}
                        className="p-1.5 bg-neutral-950 border border-neutral-900 text-neutral-300 hover:text-white hover:bg-neutral-900 transition"
                        title="Editar rotina e salas"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>

                      {/* Excluir */}
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Deseja excluir permanentemente a rotina "${group.title}" de todas as salas?`)) {
                            deleteMutation.mutate(group);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        className="p-1.5 bg-neutral-950 border border-neutral-900 text-red-400 hover:text-red-300 hover:bg-neutral-900 transition"
                        title="Excluir rotina"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Agnóstico de Criação / Edição */}
      <RoutineModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingGroup(null);
        }}
        availableRooms={availableRoomsList}
        initialData={editingGroup?.rawRoutines[0] || null}
        initialTargetRooms={editingGroup?.assignedRooms || (filterRoom !== "all" ? [filterRoom] : undefined)}
        audioPlaylists={audioPlaylists}
        onSave={saveRoutine}
      />
    </div>
  );
}
