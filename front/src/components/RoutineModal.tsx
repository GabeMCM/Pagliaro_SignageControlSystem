import React, { useState } from "react";
import {
  Clock,
  Calendar,
  Monitor,
  Radio,
  Music,
  Volume2,
  X,
  Check,
  Moon,
  Tv,
  Globe,
  Sliders,
} from "lucide-react";
import type { RoomRoutine, Playlist } from "@/lib/signage-api";
import {
  VERIFIED_GOSPEL_PRESETS,
  DEFAULT_ADIAU_URLS,
  ROUTINE_DAYS,
  formatRoutineDaysSummary,
  VOLUME_PRESETS,
} from "@/lib/constants";

export interface RoutineModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableRooms: { slug: string; name: string }[];
  defaultRoomSlug?: string;
  initialData?: RoomRoutine | null;
  initialTargetRooms?: string[];
  audioPlaylists?: Playlist[];
  onSave: (data: Partial<RoomRoutine>, targetRooms: string[]) => void;
}

export function RoutineModal({
  isOpen,
  onClose,
  availableRooms,
  defaultRoomSlug,
  initialData,
  initialTargetRooms,
  audioPlaylists = [],
  onSave,
}: RoutineModalProps) {
  if (!isOpen) return null;

  const isEditing = Boolean(initialData);

  // Seleção de Salas Alvo (Módulo Agnóstico)
  const [selectedRooms, setSelectedRooms] = useState<string[]>(() => {
    if (initialTargetRooms && initialTargetRooms.length > 0) return initialTargetRooms;
    if (initialData?.roomSlug) return [initialData.roomSlug];
    if (defaultRoomSlug) return [defaultRoomSlug];
    if (availableRooms.length > 0) return availableRooms.map((r) => r.slug);
    return [];
  });

  const [title, setTitle] = useState(initialData?.title || "");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(
    initialData?.daysOfWeek && initialData.daysOfWeek.length > 0
      ? initialData.daysOfWeek
      : [0, 1, 2, 3, 4, 5, 6]
  );
  const [startTime, setStartTime] = useState(initialData?.startTime || "07:00");
  const [endTime, setEndTime] = useState(initialData?.endTime || "19:00");

  const [screenAction, setScreenAction] = useState<"standby" | "site" | "playlist" | "none">(() => {
    if (initialData?.actions?.standby === true) return "standby";
    if (initialData?.actions?.mode === "site" || initialData?.actions?.siteUrl) return "site";
    if (initialData?.actions?.mode === "playlist" && initialData?.actions?.playlist) return "playlist";
    return "site";
  });

  const [siteUrl, setSiteUrl] = useState(initialData?.actions?.siteUrl || DEFAULT_ADIAU_URLS[0].url);

  const [audioType, setAudioType] = useState<"radio" | "playlist" | "none">(() => {
    if (initialData?.actions?.audioStreamUrl) return "radio";
    if (initialData?.actions?.audioPlaylist) return "playlist";
    if (initialData?.actions?.audioStatus === "paused") return "none";
    return "radio";
  });

  const [selectedRadioPreset, setSelectedRadioPreset] = useState<string>(() => {
    if (initialData?.actions?.audioStreamUrl) {
      const match = VERIFIED_GOSPEL_PRESETS.find(
        (p) => p.url === initialData.actions.audioStreamUrl
      );
      return match ? match.url : "custom";
    }
    return VERIFIED_GOSPEL_PRESETS[0]?.url || "";
  });

  const [customRadioUrl, setCustomRadioUrl] = useState<string>(() => {
    if (initialData?.actions?.audioStreamUrl) {
      const match = VERIFIED_GOSPEL_PRESETS.find(
        (p) => p.url === initialData.actions.audioStreamUrl
      );
      return match ? "" : initialData.actions.audioStreamUrl;
    }
    return "";
  });

  const [audioPlaylist, setAudioPlaylist] = useState<string>(
    initialData?.actions?.audioPlaylist || (audioPlaylists[0]?.id ?? "")
  );

  const [audioVolume, setAudioVolume] = useState<number>(
    initialData?.actions?.audioVolume ?? 25
  );

  const toggleDay = (d: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    );
  };

  const handleSelectAllRooms = () => {
    if (selectedRooms.length === availableRooms.length) {
      setSelectedRooms(availableRooms.slice(0, 1).map((r) => r.slug));
    } else {
      setSelectedRooms(availableRooms.map((r) => r.slug));
    }
  };

  const handleSave = () => {
    if (selectedRooms.length === 0) {
      alert("Por favor, selecione ao menos uma sala para executar esta rotina.");
      return;
    }
    if (!daysOfWeek || daysOfWeek.length === 0) {
      alert("Por favor, selecione ao menos um dia da semana.");
      return;
    }
    if (!startTime || !endTime) {
      alert("Por favor, defina o horário de início e fim da rotina.");
      return;
    }

    const autoTitle =
      title.trim() ||
      initialData?.title ||
      (() => {
        if (screenAction === "standby") return `Repouso Noturno (${startTime} às ${endTime})`;
        if (audioType === "radio") return `Rádio & Memorial (${startTime} às ${endTime})`;
        return `Rotina Base (${startTime} às ${endTime})`;
      })();

    const actions: RoomRoutine["actions"] = {
      standby: screenAction === "standby",
      audioVolume,
      audioStatus: audioType === "none" ? "paused" : "playing",
    };

    if (screenAction === "site") {
      actions.mode = "site";
      actions.siteUrl = siteUrl.trim() || null;
    } else if (screenAction === "playlist") {
      actions.mode = "playlist";
    }

    if (audioType === "radio") {
      const stream = (selectedRadioPreset === "custom" ? customRadioUrl : selectedRadioPreset || "").trim();
      actions.audioStreamUrl = stream || null;
      actions.audioPlaylist = null;
    } else if (audioType === "playlist") {
      actions.audioPlaylist = audioPlaylist || null;
      actions.audioStreamUrl = null;
    } else {
      actions.audioStreamUrl = null;
      actions.audioPlaylist = null;
      actions.audioStatus = "paused";
    }

    onSave(
      {
        title: autoTitle,
        daysOfWeek: [...daysOfWeek].sort((a, b) => a - b),
        startTime,
        endTime,
        enabled: initialData ? initialData.enabled : true,
        priority: 0,
        actions,
      },
      selectedRooms
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-none border border-neutral-900 bg-neutral-950 p-3 sm:p-5 flex flex-col shadow-2xl space-y-3.5 max-h-[94dvh] my-auto overflow-y-auto font-sans text-neutral-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-neutral-900">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-none bg-neutral-900 text-neutral-200 border border-neutral-900">
              <Clock className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white font-mono uppercase tracking-wide">
                {isEditing ? "Editar Rotina Agnóstica" : "Nova Rotina Agnóstica"}
              </h3>
              <p className="text-[10px] text-neutral-400 font-mono">
                Regra semanal recorrente aplicável a uma ou múltiplas salas
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-neutral-400 hover:text-white transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="space-y-3 text-xs">
          {/* Seleção de Salas Alvo */}
          <div className="space-y-1.5 bg-neutral-900/40 p-2.5 border border-neutral-900">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-neutral-300 flex items-center gap-1.5 font-mono">
                <Monitor className="h-3.5 w-3.5 text-neutral-400" />
                <span>Salas Atribuídas:</span>
              </label>
              {availableRooms.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAllRooms}
                  className="text-[10px] text-neutral-300 hover:text-white font-mono underline"
                >
                  {selectedRooms.length === availableRooms.length
                    ? "Desmarcar Todas"
                    : "Selecionar Todas"}
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              {availableRooms.map((r) => {
                const isSelected = selectedRooms.includes(r.slug);
                return (
                  <button
                    key={r.slug}
                    type="button"
                    onClick={() => {
                      setSelectedRooms((prev) =>
                        prev.includes(r.slug)
                          ? prev.filter((s) => s !== r.slug)
                          : [...prev, r.slug]
                      );
                    }}
                    className={`px-2 py-1 text-xs font-mono transition flex items-center gap-1.5 ${
                      isSelected
                        ? "bg-white text-black font-bold"
                        : "bg-black text-neutral-400 hover:text-white border border-neutral-900"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-black" : "bg-neutral-600"}`} />
                    <span>{r.name}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-neutral-400 font-mono">
              {selectedRooms.length === 0
                ? "Nenhuma sala selecionada."
                : selectedRooms.length === availableRooms.length
                ? "Aplicando em TODAS as salas cadastradas."
                : `Aplicando em ${selectedRooms.length} sala(s) selecionada(s).`}
            </p>
          </div>

          {/* Nome da Rotina */}
          <div>
            <label className="text-[11px] font-semibold text-neutral-300 block mb-1 font-mono">
              Identificação / Nome da Rotina:
            </label>
            <input
              type="text"
              placeholder="Ex: Rádio Melodia & Memorial Diurno, Standby Madrugada..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-none border border-neutral-900 bg-black px-2.5 py-1.5 text-white text-xs outline-none focus:border-neutral-600 font-mono"
            />
          </div>

          {/* Dias da Semana */}
          <div className="space-y-1.5 bg-neutral-900/40 p-2.5 border border-neutral-900">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-neutral-300 flex items-center gap-1.5 font-mono">
                <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                <span>Dias de Execução:</span>
              </label>
              <span className="text-[10px] text-emerald-400 font-mono font-medium">
                {formatRoutineDaysSummary(daysOfWeek)}
              </span>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {ROUTINE_DAYS.map((opt) => {
                const isSelected = daysOfWeek.includes(opt.day);
                return (
                  <button
                    key={opt.day}
                    type="button"
                    onClick={() => toggleDay(opt.day)}
                    className={`py-1.5 text-xs font-mono font-bold transition text-center ${
                      isSelected
                        ? "bg-white text-black"
                        : "bg-black border border-neutral-900 text-neutral-400 hover:text-white"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* Atalhos de Dias */}
            <div className="flex items-center gap-1.5 pt-1 text-[10px] font-mono">
              <button
                type="button"
                onClick={() => setDaysOfWeek([0, 1, 2, 3, 4, 5, 6])}
                className="px-2 py-0.5 border border-neutral-900 bg-black text-neutral-300 hover:text-white"
              >
                Todos os Dias
              </button>
              <button
                type="button"
                onClick={() => setDaysOfWeek([1, 2, 3, 4, 5])}
                className="px-2 py-0.5 border border-neutral-900 bg-black text-neutral-300 hover:text-white"
              >
                Segunda a Sexta
              </button>
              <button
                type="button"
                onClick={() => setDaysOfWeek([0, 6])}
                className="px-2 py-0.5 border border-neutral-900 bg-black text-neutral-300 hover:text-white"
              >
                Fim de Semana
              </button>
            </div>
          </div>

          {/* Horários */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-neutral-300 block mb-1 font-mono">
                Início (HH:MM):
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-none border border-neutral-900 bg-black px-2.5 py-1.5 text-white text-xs outline-none focus:border-neutral-600 font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-neutral-300 block mb-1 font-mono">
                Término (HH:MM):
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-none border border-neutral-900 bg-black px-2.5 py-1.5 text-white text-xs outline-none focus:border-neutral-600 font-mono"
              />
            </div>
          </div>

          {/* Ação na Tela / Vídeo */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-neutral-300 block font-mono">
              Ação na Tela da TV:
            </label>
            <div className="grid grid-cols-3 gap-1.5 font-mono">
              <button
                type="button"
                onClick={() => setScreenAction("site")}
                className={`p-2 border text-center transition flex flex-col items-center gap-1 ${
                  screenAction === "site"
                    ? "bg-white text-black border-white font-bold"
                    : "bg-black border-neutral-900 text-neutral-400 hover:text-white"
                }`}
              >
                <Globe className="h-3.5 w-3.5" />
                <span className="text-[10px]">Memorial / Site</span>
              </button>

              <button
                type="button"
                onClick={() => setScreenAction("standby")}
                className={`p-2 border text-center transition flex flex-col items-center gap-1 ${
                  screenAction === "standby"
                    ? "bg-white text-black border-white font-bold"
                    : "bg-black border-neutral-900 text-neutral-400 hover:text-white"
                }`}
              >
                <Moon className="h-3.5 w-3.5" />
                <span className="text-[10px]">Standby OLED</span>
              </button>

              <button
                type="button"
                onClick={() => setScreenAction("playlist")}
                className={`p-2 border text-center transition flex flex-col items-center gap-1 ${
                  screenAction === "playlist"
                    ? "bg-white text-black border-white font-bold"
                    : "bg-black border-neutral-900 text-neutral-400 hover:text-white"
                }`}
              >
                <Tv className="h-3.5 w-3.5" />
                <span className="text-[10px]">Playlist Fotos</span>
              </button>
            </div>

            {/* Configuração de Site / Memorial */}
            {screenAction === "site" && (
              <div className="space-y-1.5 p-2 border border-neutral-900 bg-neutral-900/30">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-neutral-400 font-mono">URL do Memorial / Site:</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSiteUrl(DEFAULT_ADIAU_URLS[0].url)}
                      className="text-[9px] font-mono px-1.5 py-0.5 bg-black border border-neutral-900 text-neutral-300 hover:text-white"
                    >
                      Adiaŭ Flores
                    </button>
                    <button
                      type="button"
                      onClick={() => setSiteUrl(DEFAULT_ADIAU_URLS[1].url)}
                      className="text-[9px] font-mono px-1.5 py-0.5 bg-black border border-neutral-900 text-neutral-300 hover:text-white"
                    >
                      Adiaŭ Info
                    </button>
                  </div>
                </div>
                <input
                  type="url"
                  placeholder="https://www.adiau.com.br/v2/messages/..."
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                  className="w-full rounded-none border border-neutral-900 bg-black px-2 py-1 text-white text-xs font-mono outline-none focus:border-neutral-600"
                />
              </div>
            )}
          </div>

          {/* Ação de Áudio & Web Rádio */}
          <div className="space-y-1.5 pt-1 border-t border-neutral-900">
            <label className="text-[11px] font-semibold text-neutral-300 block font-mono">
              Ação de Áudio & Rádio:
            </label>
            <div className="grid grid-cols-3 gap-1.5 font-mono">
              <button
                type="button"
                onClick={() => setAudioType("radio")}
                className={`p-2 border text-center transition flex flex-col items-center gap-1 ${
                  audioType === "radio"
                    ? "bg-white text-black border-white font-bold"
                    : "bg-black border-neutral-900 text-neutral-400 hover:text-white"
                }`}
              >
                <Radio className="h-3.5 w-3.5" />
                <span className="text-[10px]">Web Rádio 24h</span>
              </button>

              <button
                type="button"
                onClick={() => setAudioType("playlist")}
                className={`p-2 border text-center transition flex flex-col items-center gap-1 ${
                  audioType === "playlist"
                    ? "bg-white text-black border-white font-bold"
                    : "bg-black border-neutral-900 text-neutral-400 hover:text-white"
                }`}
              >
                <Music className="h-3.5 w-3.5" />
                <span className="text-[10px]">Playlist Áudio</span>
              </button>

              <button
                type="button"
                onClick={() => setAudioType("none")}
                className={`p-2 border text-center transition flex flex-col items-center gap-1 ${
                  audioType === "none"
                    ? "bg-white text-black border-white font-bold"
                    : "bg-black border-neutral-900 text-neutral-400 hover:text-white"
                }`}
              >
                <Volume2 className="h-3.5 w-3.5" />
                <span className="text-[10px]">Silenciar / Pausa</span>
              </button>
            </div>

            {/* Detalhes de Rádio */}
            {audioType === "radio" && (
              <div className="space-y-1.5 p-2 border border-neutral-900 bg-neutral-900/30">
                <label className="text-[10px] text-neutral-400 font-mono block">
                  Selecione a Emissora Gospel / Instrumental:
                </label>
                <select
                  value={selectedRadioPreset}
                  onChange={(e) => setSelectedRadioPreset(e.target.value)}
                  className="w-full rounded-none border border-neutral-900 bg-black px-2 py-1 text-white text-xs font-mono outline-none focus:border-neutral-600"
                >
                  {VERIFIED_GOSPEL_PRESETS.map((p) => (
                    <option key={p.url} value={p.url}>
                      {p.name}
                    </option>
                  ))}
                  <option value="custom">-- Link Personalizado de Rádio --</option>
                </select>
                {selectedRadioPreset === "custom" && (
                  <input
                    type="url"
                    placeholder="https://link-da-radio.com/stream"
                    value={customRadioUrl}
                    onChange={(e) => setCustomRadioUrl(e.target.value)}
                    className="w-full rounded-none border border-neutral-900 bg-black px-2 py-1 text-white text-xs font-mono outline-none focus:border-neutral-600 mt-1"
                  />
                )}
              </div>
            )}

            {/* Detalhes de Playlist de Áudio */}
            {audioType === "playlist" && (
              <div className="space-y-1.5 p-2 border border-neutral-900 bg-neutral-900/30">
                <label className="text-[10px] text-neutral-400 font-mono block">
                  Selecione a Playlist Cadastrada:
                </label>
                <select
                  value={audioPlaylist}
                  onChange={(e) => setAudioPlaylist(e.target.value)}
                  className="w-full rounded-none border border-neutral-900 bg-black px-2 py-1 text-white text-xs font-mono outline-none focus:border-neutral-600"
                >
                  {audioPlaylists.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.items?.length || 0} faixas)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Volume do Áudio */}
            {audioType !== "none" && (
              <div className="space-y-1.5 pt-1.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-neutral-400 flex items-center gap-1">
                    <Volume2 className="h-3 w-3" />
                    <span>Volume do Som:</span>
                  </span>
                  <span className="font-bold text-white bg-neutral-900 px-2 py-0.5 border border-neutral-900">
                    {audioVolume}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={audioVolume}
                  onChange={(e) => setAudioVolume(Number(e.target.value))}
                  className="w-full accent-white h-1.5 bg-neutral-900 cursor-pointer"
                />
                <div className="flex items-center gap-1 flex-wrap">
                  {VOLUME_PRESETS.map((p) => (
                    <button
                      key={p.val}
                      type="button"
                      onClick={() => setAudioVolume(p.val)}
                      className={`px-1.5 py-0.5 text-[10px] font-mono border transition ${
                        audioVolume === p.val
                          ? "bg-white text-black border-white font-bold"
                          : "bg-neutral-900 border-neutral-900 text-neutral-400 hover:text-white"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-neutral-900 font-mono">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[34px] px-3 border border-neutral-900 bg-neutral-900 text-xs text-neutral-300 hover:text-white transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="min-h-[34px] flex items-center gap-1.5 px-4 bg-white hover:bg-neutral-200 text-black text-xs font-bold transition shadow"
          >
            <Check className="h-3.5 w-3.5" />
            <span>{isEditing ? "Salvar Alterações" : "Salvar Rotina"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
