import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  User,
  Clock,
  MapPin,
  Check,
  RefreshCw,
  ExternalLink,
  Link as LinkIcon,
  X,
  AlertCircle,
  Loader2,
} from "lucide-react";
import {
  getAdiauConfig,
  fetchAdiauAttendances,
  buildAdiauTransmissionUrl,
  formatAdiauSchedule,
  type AdiauAttendance,
} from "@/lib/adiau";

export interface AdiauDeceasedPickerProps {
  value: string;
  onChange: (url: string, deceasedName?: string) => void;
  defaultMode?: "adiau" | "manual";
}

export function AdiauDeceasedPicker({
  value,
  onChange,
  defaultMode = "adiau",
}: AdiauDeceasedPickerProps) {
  const [mode, setMode] = useState<"adiau" | "manual">(() => {
    // Se o valor inicial não parecer uma URL de transmissão da Adiaŭ ou estiver vazio, mas tiver link customizado
    if (value && !value.includes("adiau.com.br")) return "manual";
    return defaultMode;
  });

  const [searchTerm, setSearchTerm] = useState("");
  const config = useMemo(() => getAdiauConfig(), []);

  const attendancesQ = useQuery({
    queryKey: ["adiau-attendances", "homenagem", config.selectedScreenName],
    queryFn: async () => {
      return await fetchAdiauAttendances("homenagem", config);
    },
    staleTime: 45 * 1000,
  });

  const attendances = attendancesQ.data?.attendances || [];
  const clientInfo = attendancesQ.data?.client || null;

  // Falecido selecionado atualmente (se a URL bater com algum ID)
  const selectedAttendance = useMemo(() => {
    if (!value) return null;
    return attendances.find((att) => {
      const tid = String(att.id);
      return (
        value.includes(`transmission=${tid}`) ||
        value.includes(`transmission%3D${tid}`) ||
        value.includes(`/${tid}`)
      );
    });
  }, [value, attendances]);

  // Filtro de busca por nome ou local
  const filteredAttendances = useMemo(() => {
    if (!searchTerm.trim()) return attendances;
    const q = searchTerm.toLowerCase().trim();
    return attendances.filter((att) => {
      const name = (att.deceasedName || "").toLowerCase();
      const place = (att.burialPlace || att.location?.name || "").toLowerCase();
      return name.includes(q) || place.includes(q);
    });
  }, [attendances, searchTerm]);

  const handleSelectAttendance = (att: AdiauAttendance) => {
    const url = buildAdiauTransmissionUrl("homenagem", config, att, clientInfo);
    onChange(url, att.deceasedName);
  };

  const handleClear = () => {
    onChange("");
  };

  return (
    <div className="space-y-2 border border-neutral-900 bg-black p-2.5 rounded-none font-sans">
      {/* MODO: SELEÇÃO DA ADIAŬ VS LINK MANUAL */}
      <div className="flex items-center justify-between gap-2 border-b border-neutral-900 pb-2">
        <div className="flex items-center gap-1 bg-neutral-950 p-0.5 border border-neutral-900">
          <button
            type="button"
            onClick={() => setMode("adiau")}
            className={`px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider transition flex items-center gap-1.5 ${
              mode === "adiau"
                ? "bg-white text-black font-bold shadow-xs"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <User className="h-3 w-3" />
            <span>Buscar Homenageado</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={`px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider transition flex items-center gap-1.5 ${
              mode === "manual"
                ? "bg-white text-black font-bold shadow-xs"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <LinkIcon className="h-3 w-3" />
            <span>Link Manual / Outro</span>
          </button>
        </div>

        {mode === "adiau" && (
          <button
            type="button"
            onClick={() => attendancesQ.refetch()}
            disabled={attendancesQ.isFetching}
            className="px-2 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-900 text-neutral-300 hover:text-white text-[10px] font-mono transition flex items-center gap-1"
            title="Atualizar lista de falecidos da Adiaŭ"
          >
            <RefreshCw className={`h-2.5 w-2.5 ${attendancesQ.isFetching ? "animate-spin text-white" : ""}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
        )}
      </div>

      {mode === "adiau" ? (
        <div className="space-y-2">
          {/* Card de Falecido Selecionado */}
          {selectedAttendance ? (
            <div className="p-2 border border-emerald-500/40 bg-emerald-950/20 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 font-mono">
                    Homenageado Vinculado:
                  </span>
                </div>
                <div className="text-xs font-bold text-white truncate">
                  {selectedAttendance.deceasedName}
                </div>
                {selectedAttendance.burialPlace && (
                  <div className="text-[10px] text-neutral-400 truncate">
                    {selectedAttendance.burialPlace}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleClear}
                className="px-2 py-1 text-[10px] font-mono bg-neutral-900 hover:bg-red-950 hover:text-red-300 border border-neutral-900 text-neutral-400 transition flex items-center gap-1 flex-shrink-0"
              >
                <X className="h-3 w-3" />
                <span>Desvincular</span>
              </button>
            </div>
          ) : value ? (
            <div className="p-2 border border-neutral-900 bg-neutral-950 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] font-mono text-neutral-400">URL Ativa:</div>
                <div className="text-[11px] font-mono text-white truncate">{value}</div>
              </div>
              <button
                type="button"
                onClick={handleClear}
                className="px-2 py-1 text-[10px] font-mono bg-neutral-900 border border-neutral-900 text-neutral-400 hover:text-white transition flex items-center gap-1 flex-shrink-0"
              >
                <X className="h-3 w-3" />
                <span>Limpar</span>
              </button>
            </div>
          ) : null}

          {/* Campo de Busca por Nome */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Digite o nome do falecido para filtrar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-900 pl-8 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 outline-none focus:border-neutral-600 font-mono"
            />
          </div>

          {/* Lista de Falecidos Disponíveis */}
          {attendancesQ.isLoading ? (
            <div className="p-4 border border-neutral-900 bg-neutral-950 text-center text-xs text-neutral-400 flex items-center justify-center gap-2 font-mono">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
              <span>Buscando cerimônias no sistema Adiaŭ...</span>
            </div>
          ) : attendancesQ.isError ? (
            <div className="p-2.5 border border-red-900/40 bg-red-950/20 text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-400" />
              <span>Não foi possível carregar cerimônias da Adiaŭ. Verifique sua conexão.</span>
            </div>
          ) : filteredAttendances.length === 0 ? (
            <div className="p-3 border border-neutral-900 bg-neutral-950 text-center text-xs text-neutral-400 font-mono">
              {searchTerm ? "Nenhum falecido encontrado com este nome." : "Nenhuma cerimônia ativa no momento na Adiaŭ."}
            </div>
          ) : (
            <div className="max-h-44 overflow-y-auto space-y-1 pr-1 border border-neutral-900 p-1 bg-neutral-950/50">
              {filteredAttendances.map((att) => {
                const isSelected = selectedAttendance?.id === att.id;
                const schedule = formatAdiauSchedule(att.attendanceStartDate, att.attendanceEndDate);
                return (
                  <button
                    key={att.id}
                    type="button"
                    onClick={() => handleSelectAttendance(att)}
                    className={`w-full text-left p-2 border transition flex items-center justify-between gap-2 ${
                      isSelected
                        ? "bg-white text-black border-white font-semibold"
                        : "bg-black border-neutral-900 hover:border-neutral-700 text-neutral-200"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate flex items-center gap-1.5">
                        <User className="h-3 w-3 flex-shrink-0 opacity-70" />
                        <span className="truncate">{att.deceasedName}</span>
                      </div>
                      <div
                        className={`text-[10px] truncate font-mono ${
                          isSelected ? "text-neutral-700" : "text-neutral-400"
                        }`}
                      >
                        {schedule || att.burialPlace || "Cerimônia em andamento"}
                      </div>
                    </div>

                    <div className="flex-shrink-0">
                      {isSelected ? (
                        <span className="px-2 py-0.5 text-[10px] font-mono bg-black text-white font-bold uppercase">
                          Selecionado
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] font-mono bg-neutral-900 text-neutral-300 border border-neutral-900 hover:text-white uppercase">
                          Escolher
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* MODO: DIGITAR LINK MANUAL */
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono text-neutral-400 block">
            Cole a URL completa do site ou transmissão:
          </label>
          <input
            type="url"
            placeholder="https://www.adiau.com.br/v2/messages/?hash=..."
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-900 px-2.5 py-1.5 text-xs text-white placeholder-neutral-600 outline-none focus:border-neutral-600 font-mono"
          />
        </div>
      )}
    </div>
  );
}
