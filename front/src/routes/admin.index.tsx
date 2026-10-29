import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { signageApi, type Room, type RoomState } from "@/lib/signage-api";
import { getAdiauConfig, fetchAdiauAttendances } from "@/lib/adiau";
import {
  Monitor,
  Circle,
  ArrowRight,
  Volume2,
  VolumeX,
  Plus,
  Minus,
  Moon,
  Sun,
  Radio,
  Music,
  Pause,
  Play,
  Globe,
  User,
  ExternalLink,
  Sliders,
  Tv,
  Lock,
  Shield,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import { useAuth, ROLE_LABELS } from "@/lib/auth";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Painel de Controle • Pagliaro Signage" },
      { name: "description", content: "Visão geral e controle rápido de volume, standby e homenagens das salas." },
    ],
  }),
  component: AdminHome,
});

function AdminHome() {
  const { data: rooms = [], isLoading } = useQuery({
    queryKey: ["rooms"],
    queryFn: signageApi.listRooms,
    refetchInterval: 3000,
  });

  const config = useMemo(() => getAdiauConfig(), []);
  const attendancesQ = useQuery({
    queryKey: ["adiau-attendances", "homenagem", config.selectedScreenName],
    queryFn: () => fetchAdiauAttendances("homenagem", config),
    staleTime: 60 * 1000,
  });

  const attendances = attendancesQ.data?.attendances || [];

  const totalOnlineRooms = rooms.filter((r) => r.online).length;
  const totalClients = rooms.reduce((acc, r) => acc + (r.clientsCount || 0), 0);

  return (
    <div className="flex h-full flex-col justify-start items-center p-3 sm:p-6 text-neutral-100 font-sans antialiased overflow-y-auto">
      <div className="w-full max-w-4xl space-y-4">
        {/* Header Resumo Geral */}
        <div className="border-b border-neutral-900 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-[0.25em] text-neutral-400 font-mono font-bold">
              PAINEL OPERACIONAL DE VELÓRIOS
            </span>
            <div className="flex items-center gap-3 font-mono text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-neutral-300">
                  {totalOnlineRooms}/{rooms.length} Salas Online
                </span>
              </span>
              <span className="text-neutral-600">•</span>
              <span className="text-neutral-400">
                {totalClients} TVs Conectadas
              </span>
            </div>
          </div>
          <h1 className="mt-1 text-base sm:text-xl font-bold tracking-tight text-white uppercase font-mono">
            Monitoramento & Controle das Salas
          </h1>
          <p className="mt-0.5 text-xs text-neutral-400">
            Ajuste volume, ligue/desligue standby e acompanhe as homenagens e áudios ativos em tempo real.
          </p>
        </div>

        {/* Lista de Salas com Painel Interativo */}
        {isLoading ? (
          <div className="py-12 text-center text-xs text-neutral-400 font-mono">
            Carregando status das salas...
          </div>
        ) : rooms.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {rooms.map((room) => (
              <RoomDashboardCard
                key={room.slug}
                room={room}
                attendances={attendances}
              />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center border border-neutral-900 bg-neutral-950 text-xs text-neutral-400 font-mono">
            Nenhuma sala cadastrada no sistema. Crie salas no menu inferior ou lateral.
          </div>
        )}
      </div>
    </div>
  );
}

function RoomDashboardCard({
  room,
  attendances,
}: {
  room: Room;
  attendances: any[];
}) {
  const qc = useQueryClient();

  const stateQ = useQuery({
    queryKey: ["state", room.slug],
    queryFn: () => signageApi.getState(room.slug),
    refetchInterval: 3000,
  });

  const state = stateQ.data;
  const isOnline = Boolean(room.online);
  const clientsCount = room.clientsCount ?? 0;
  const maxClients = room.maxClients ?? 2;

  const isStandby = Boolean(state?.standby);
  const currentVolume = typeof state?.audioVolume === "number" ? state.audioVolume : 25;
  const isAudioPlaying = state?.audioStatus === "playing";
  const hasAudioStream = Boolean(state?.audioStreamUrl);

  const { canAccessRoom, hasPermission } = useAuth();
  const isRoomAllowed = canAccessRoom(room.slug);
  const canControlPlayback = hasPermission("control_playback", room.slug);

  // Local optimistic states para cliques rápidos
  const [optimisticVolume, setOptimisticVolume] = useState<number | null>(null);
  const [optimisticStandby, setOptimisticStandby] = useState<boolean | null>(null);

  const displayVolume = optimisticVolume !== null ? optimisticVolume : currentVolume;
  const displayStandby = optimisticStandby !== null ? optimisticStandby : isStandby;

  // Mutação de Standby
  const toggleStandby = useMutation({
    mutationFn: async (newVal: boolean) => {
      setOptimisticStandby(newVal);
      return await signageApi.setStandby(room.slug, newVal);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["state", room.slug] });
      setOptimisticStandby(null);
    },
    onError: () => {
      setOptimisticStandby(null);
    },
  });

  // Mutação de Volume
  const changeVolume = useMutation({
    mutationFn: async (newVol: number) => {
      setOptimisticVolume(newVol);
      return await signageApi.setAudioVolume(room.slug, newVol);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["state", room.slug] });
      setTimeout(() => setOptimisticVolume(null), 800);
    },
    onError: () => {
      setOptimisticVolume(null);
    },
  });

  const handleVolumeStep = (delta: number) => {
    const next = Math.max(0, Math.min(100, displayVolume + delta));
    changeVolume.mutate(next);
  };

  const handleToggleMute = () => {
    if (displayVolume > 0) {
      changeVolume.mutate(0);
    } else {
      changeVolume.mutate(25);
    }
  };

  // Identificação do Falecido / Homenagem
  const deceasedInfo = useMemo(() => {
    const siteUrl = state?.siteUrl || "";
    if (!siteUrl) return null;

    const match = attendances.find((att) => {
      const tid = String(att.id);
      return (
        siteUrl.includes(`transmission=${tid}`) ||
        siteUrl.includes(`transmission%3D${tid}`) ||
        siteUrl.includes(`/${tid}`)
      );
    });

    if (match) {
      return {
        name: match.deceasedName,
        place: match.burialPlace || match.location?.name,
        isAdiau: true,
      };
    }

    if (siteUrl.includes("adiau.com.br")) {
      return {
        name: "Adiaŭ Transmissão Ativa",
        isAdiau: true,
      };
    }

    return {
      name: "Site Personalizado",
      isAdiau: false,
    };
  }, [state?.siteUrl, attendances]);

  return (
    <div
      className={`border rounded-none p-3.5 flex flex-col justify-between transition-colors bg-neutral-950 ${
        displayStandby
          ? "border-neutral-900 opacity-90"
          : isOnline
          ? "border-neutral-800 hover:border-neutral-700"
          : "border-neutral-900 opacity-80"
      }`}
    >
      <div className="space-y-3">
        {/* TOPO: Nome da Sala + Status TVs + Link Painel */}
        <div className="flex items-start justify-between gap-2 border-b border-neutral-900 pb-2.5">
          <div className="min-w-0">
            <Link
              to="/admin/$slug"
              params={{ slug: room.slug }}
              className="text-xs sm:text-sm font-bold text-white hover:text-neutral-300 font-mono tracking-tight truncate flex items-center gap-1.5 group"
            >
              <Monitor className="h-3.5 w-3.5 text-neutral-400 group-hover:text-white flex-shrink-0" />
              <span className="truncate">{room.name}</span>
            </Link>

            <div className="flex items-center gap-2 mt-1 text-[10px] font-mono">
              <span className="flex items-center gap-1">
                <Circle
                  className={`h-1.5 w-1.5 flex-shrink-0 ${
                    isOnline
                      ? "fill-emerald-400 text-emerald-400"
                      : "fill-neutral-700 text-neutral-700"
                  }`}
                />
                <span className={isOnline ? "text-emerald-400 font-semibold" : "text-neutral-500"}>
                  {isOnline ? `${clientsCount}/${maxClients} TVs online` : "Nenhuma TV conectada"}
                </span>
              </span>
              <span className="text-neutral-700">•</span>
              <span className="text-neutral-500">{room.slug}</span>
              {!isRoomAllowed && (
                <>
                  <span className="text-neutral-700">•</span>
                  <span className="text-amber-400 font-semibold flex items-center gap-0.5">
                    <Lock className="h-2.5 w-2.5" />
                    <span>Restrita</span>
                  </span>
                </>
              )}
            </div>
          </div>

          <Link
            to="/admin/$slug"
            params={{ slug: room.slug }}
            className="px-2 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-900 text-neutral-300 hover:text-white text-[10px] font-mono transition flex items-center gap-1 flex-shrink-0"
            title="Abrir painel completo do operador"
          >
            <span>Painel</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {/* CONTROLES RÁPIDOS: STANDBY ON/OFF & VOLUME + / - */}
        <div className="grid grid-cols-2 gap-2 bg-black p-2 border border-neutral-900">
          {/* Botão ON/OFF Standby */}
          <div className="space-y-1">
            <span className="text-[9px] uppercase font-mono text-neutral-500 block">
              Modo da TV (OLED):
            </span>
            <button
              type="button"
              onClick={() => toggleStandby.mutate(!displayStandby)}
              disabled={toggleStandby.isPending || !isRoomAllowed || !canControlPlayback}
              className={`w-full min-h-[34px] px-2 py-1 border text-xs font-mono font-bold transition flex items-center justify-center gap-1.5 ${
                !isRoomAllowed || !canControlPlayback
                  ? "bg-neutral-950 text-neutral-600 border-neutral-900 cursor-not-allowed opacity-50"
                  : displayStandby
                  ? "bg-amber-950/40 text-amber-300 border-amber-600/40 hover:bg-amber-950/60"
                  : "bg-neutral-900 text-neutral-200 border-neutral-900 hover:bg-neutral-850 hover:text-white"
              }`}
            >
              {displayStandby ? (
                <>
                  <Moon className="h-3.5 w-3.5 text-amber-400" />
                  <span className="text-[11px] truncate">Standby (ON)</span>
                </>
              ) : (
                <>
                  <Sun className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-[11px] truncate">No Ar (OFF)</span>
                </>
              )}
            </button>
          </div>

          {/* Controle de Volume (+ e -) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[9px] uppercase font-mono text-neutral-500">
              <span>Volume Som:</span>
              <span className="text-white font-bold">{displayVolume}%</span>
            </div>
            <div className="grid grid-cols-3 items-center border border-neutral-900 bg-neutral-950">
              <button
                type="button"
                onClick={() => handleVolumeStep(-5)}
                disabled={displayVolume <= 0 || changeVolume.isPending || !isRoomAllowed || !canControlPlayback}
                className="min-h-[34px] flex items-center justify-center text-neutral-300 hover:text-white hover:bg-neutral-900 disabled:opacity-30 transition border-r border-neutral-900"
                title="Diminuir volume (-5%)"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={handleToggleMute}
                disabled={!isRoomAllowed || !canControlPlayback}
                className="min-h-[34px] flex items-center justify-center font-mono text-xs font-bold text-neutral-200 hover:text-white hover:bg-neutral-900 disabled:opacity-30 transition border-r border-neutral-900"
                title="Clique para alternar mudo"
              >
                {displayVolume === 0 ? (
                  <VolumeX className="h-3.5 w-3.5 text-red-400" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5 text-neutral-400" />
                )}
              </button>

              <button
                type="button"
                onClick={() => handleVolumeStep(5)}
                disabled={displayVolume >= 100 || changeVolume.isPending || !isRoomAllowed || !canControlPlayback}
                className="min-h-[34px] flex items-center justify-center text-neutral-300 hover:text-white hover:bg-neutral-900 disabled:opacity-30 transition"
                title="Aumentar volume (+5%)"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* STATUS AO VIVO: HOMENAGEM & ÁUDIO */}
        <div className="space-y-1.5 text-xs font-mono">
          {/* Linha de Homenagem / Falecido */}
          <div className="p-2 border border-neutral-900 bg-black flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-neutral-400 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] text-neutral-500 uppercase">Homenagem na Tela:</div>
                {deceasedInfo ? (
                  <div className="text-white font-bold text-xs truncate">
                    {deceasedInfo.name}
                  </div>
                ) : displayStandby ? (
                  <div className="text-amber-400 text-[11px] truncate">
                    Modo Standby OLED (Relógio & Clima)
                  </div>
                ) : (
                  <div className="text-neutral-400 text-[11px] truncate">
                    Sem homenagem no momento
                  </div>
                )}
              </div>
            </div>

            {state?.siteUrl && (
              <a
                href={state.siteUrl}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 text-neutral-400 hover:text-white transition flex-shrink-0"
                title="Ver página da cerimônia"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {/* Linha de Áudio / Rádio */}
          <div className="p-2 border border-neutral-900 bg-black flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2">
              {hasAudioStream ? (
                <Radio className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
              ) : isAudioPlaying ? (
                <Music className="h-3.5 w-3.5 text-neutral-300 flex-shrink-0" />
              ) : (
                <Pause className="h-3.5 w-3.5 text-neutral-500 flex-shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-[10px] text-neutral-500 uppercase">Tocando Agora:</div>
                <div className="text-neutral-200 text-xs truncate">
                  {hasAudioStream ? (
                    <span className="text-white font-semibold flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      <span>Web Rádio Ao Vivo</span>
                    </span>
                  ) : isAudioPlaying ? (
                    <span className="text-white font-semibold">Trilha Sonora Ativa</span>
                  ) : (
                    <span className="text-neutral-500">Áudio Pausado</span>
                  )}
                </div>
              </div>
            </div>

            <div className="text-[10px] text-neutral-500 flex-shrink-0 font-bold">
              {displayVolume === 0 ? "Mudo" : `${displayVolume}%`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
