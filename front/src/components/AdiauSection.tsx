import React, { useState, useEffect, useCallback } from "react";
import {
  ExternalLink,
  RefreshCw,
  Settings,
  Tv,
  Check,
  Copy,
  Plus,
  Trash2,
  X,
  Church,
  MessageSquare,
  AlertCircle,
  Clock,
  MapPin,
} from "lucide-react";
import {
  AdiauAttendance,
  AdiauClientInfo,
  AdiauConfig,
  getAdiauConfig,
  saveAdiauConfig,
  fetchAdiauAttendances,
  buildAdiauTransmissionUrl,
  formatAdiauSchedule,
  formatAdiauDateTime,
  DEFAULT_ADIAU_CONFIG,
} from "../lib/adiau";
import { copyToClipboard } from "../lib/clipboard";

interface AdiauSectionProps {
  currentSiteUrl?: string | null;
  onApplySiteUrl: (url: string) => void;
  isApplying?: boolean;
}

export function AdiauSection({
  currentSiteUrl,
  onApplySiteUrl,
  isApplying = false,
}: AdiauSectionProps) {
  const [config, setConfig] = useState<AdiauConfig>(getAdiauConfig);
  const [activeType, setActiveType] = useState<"homenagem" | "informacao">("homenagem");
  const [attendances, setAttendances] = useState<AdiauAttendance[]>([]);
  const [clientInfo, setClientInfo] = useState<AdiauClientInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Estados de gestão rápida de design / screenName
  const [isAddingDesign, setIsAddingDesign] = useState(false);
  const [newDesignName, setNewDesignName] = useState("");

  // Estado do modal de configurações avançadas
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

  // Busca cerimônias na Adiaŭ
  const loadAttendances = useCallback(
    async (typeToLoad: "homenagem" | "informacao", targetConfig: AdiauConfig) => {
      setIsLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetchAdiauAttendances(typeToLoad, targetConfig);
        setAttendances(res.attendances);
        setClientInfo(res.client);
      } catch (err: any) {
        console.error("Erro ao carregar cerimônias da Adiaŭ:", err);
        setErrorMsg(
          err?.message ||
            "Não foi possível obter as transmissões da Adiaŭ. Verifique sua conexão ou as configurações do link."
        );
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Carrega ao montar ou ao alterar tipo ou screenName
  useEffect(() => {
    loadAttendances(activeType, config);
  }, [activeType, config.selectedScreenName, loadAttendances]);

  // Troca o design de tela selecionado
  const handleSelectScreenName = (screenName: string) => {
    const updated = { ...config, selectedScreenName: screenName };
    setConfig(updated);
    saveAdiauConfig(updated);
  };

  // Adiciona novo design de tela
  const handleAddDesign = () => {
    const trimmed = newDesignName.trim();
    if (!trimmed) return;
    if (config.screenNames.includes(trimmed)) {
      handleSelectScreenName(trimmed);
      setIsAddingDesign(false);
      setNewDesignName("");
      return;
    }
    const updatedScreenNames = [...config.screenNames, trimmed];
    const updated: AdiauConfig = {
      ...config,
      screenNames: updatedScreenNames,
      selectedScreenName: trimmed,
    };
    setConfig(updated);
    saveAdiauConfig(updated);
    setIsAddingDesign(false);
    setNewDesignName("");
  };

  // Remove um design de tela da lista
  const handleRemoveDesign = (nameToRemove: string) => {
    if (config.screenNames.length <= 1) return;
    const filtered = config.screenNames.filter((n) => n !== nameToRemove);
    const newSelected =
      config.selectedScreenName === nameToRemove ? filtered[0] : config.selectedScreenName;
    const updated: AdiauConfig = {
      ...config,
      screenNames: filtered,
      selectedScreenName: newSelected,
    };
    setConfig(updated);
    saveAdiauConfig(updated);
  };

  // Aplica a transmissão na sala
  const handleApplyAttendance = (att: AdiauAttendance) => {
    const finalUrl = buildAdiauTransmissionUrl(activeType, config, att, clientInfo);
    onApplySiteUrl(finalUrl);
  };

  // Copia o link da transmissão
  const handleCopyLink = async (att: AdiauAttendance) => {
    const finalUrl = buildAdiauTransmissionUrl(activeType, config, att, clientInfo);
    const ok = await copyToClipboard(finalUrl);
    if (ok) {
      setCopiedId(String(att.id));
      setTimeout(() => setCopiedId(null), 2500);
    }
  };

  return (
    <div className="rounded-none border border-neutral-900 bg-neutral-950 p-3 sm:p-4 space-y-3.5">
      {/* CABEÇALHO DA SEÇÃO ADIAŬ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-neutral-900">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-7 w-7 bg-neutral-900 border border-neutral-900 flex items-center justify-center flex-shrink-0 text-neutral-300">
            {activeType === "homenagem" ? (
              <MessageSquare className="h-3.5 w-3.5" />
            ) : (
              <Church className="h-3.5 w-3.5" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white font-mono flex items-center gap-2">
              <span>Transmissões Adiaŭ</span>
              <span className="text-[10px] text-neutral-400 font-normal lowercase tracking-normal">
                (captura automática)
              </span>
            </h3>
            <p className="text-[11px] text-neutral-400 truncate">
              Selecione o falecido para exibir o memorial ou informações diretamente na TV.
            </p>
          </div>
        </div>

        {/* Ações no topo: Atualizar e Configurações */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto flex-shrink-0">
          <button
            type="button"
            onClick={() => loadAttendances(activeType, config)}
            disabled={isLoading}
            className="min-h-[28px] px-2.5 py-1 rounded-none border border-neutral-900 bg-neutral-900 hover:bg-neutral-850 text-neutral-300 hover:text-white text-xs font-mono transition flex items-center gap-1.5 disabled:opacity-50"
            title="Atualizar transmissões da Adiaŭ"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin text-white" : ""}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>

          <button
            type="button"
            onClick={() => setIsConfigModalOpen(true)}
            className="min-h-[28px] px-2 py-1 rounded-none border border-neutral-900 bg-neutral-900 hover:bg-neutral-850 text-neutral-400 hover:text-white text-xs transition flex items-center gap-1"
            title="Configurar links base e temas de tela"
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline font-mono text-[11px]">Configurar</span>
          </button>
        </div>
      </div>

      {/* BARRA DE CONTROLE: Tipo de Exibição & Design de Tela (screenName) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-black p-2 border border-neutral-900">
        {/* Alternador de Tipo: Homenagem vs Informação */}
        <div className="flex items-center gap-1 bg-neutral-950 p-0.5 border border-neutral-900 flex-1 sm:flex-initial">
          <button
            type="button"
            onClick={() => setActiveType("homenagem")}
            className={`flex-1 sm:flex-initial min-h-[28px] px-3 py-1 text-xs font-mono uppercase tracking-wider transition flex items-center justify-center gap-1.5 ${
              activeType === "homenagem"
                ? "bg-white text-black font-bold shadow-xs"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <MessageSquare className="h-3 w-3" />
            <span>Homenagem</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveType("informacao")}
            className={`flex-1 sm:flex-initial min-h-[28px] px-3 py-1 text-xs font-mono uppercase tracking-wider transition flex items-center justify-center gap-1.5 ${
              activeType === "informacao"
                ? "bg-white text-black font-bold shadow-xs"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Church className="h-3 w-3" />
            <span>Informação</span>
          </button>
        </div>

        {/* Seletor de Design de Tela / screenName */}
        <div className="flex items-center gap-1.5 flex-1 sm:flex-initial min-w-0">
          <span className="text-[10px] uppercase font-mono text-neutral-400 flex-shrink-0">
            Design de Tela:
          </span>

          {!isAddingDesign ? (
            <div className="flex items-center gap-1 flex-1 sm:flex-initial min-w-0">
              <select
                value={config.selectedScreenName}
                onChange={(e) => handleSelectScreenName(e.target.value)}
                className="w-full sm:w-auto min-h-[28px] bg-neutral-950 border border-neutral-900 px-2 py-0.5 text-xs text-white font-mono focus:outline-none focus:border-neutral-600 transition cursor-pointer"
              >
                {config.screenNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setIsAddingDesign(true)}
                className="min-h-[28px] px-1.5 py-1 bg-neutral-950 border border-neutral-900 hover:border-neutral-700 text-neutral-400 hover:text-white text-xs transition flex items-center justify-center flex-shrink-0"
                title="Cadastrar novo design de tela"
              >
                <Plus className="h-3 w-3" />
              </button>

              {config.screenNames.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveDesign(config.selectedScreenName)}
                  className="min-h-[28px] px-1.5 py-1 bg-neutral-950 border border-neutral-900 hover:border-red-900 text-neutral-400 hover:text-red-400 text-xs transition flex items-center justify-center flex-shrink-0"
                  title={`Remover design "${config.selectedScreenName}"`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1 flex-1 sm:flex-initial min-w-0">
              <input
                type="text"
                autoFocus
                placeholder="Ex: Sala01, Flores..."
                value={newDesignName}
                onChange={(e) => setNewDesignName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddDesign();
                  if (e.key === "Escape") setIsAddingDesign(false);
                }}
                className="w-full sm:w-36 min-h-[28px] bg-neutral-950 border border-neutral-900 px-2 py-0.5 text-xs text-white font-mono outline-none focus:border-neutral-500"
              />
              <button
                type="button"
                onClick={handleAddDesign}
                className="min-h-[28px] px-2 py-1 bg-white text-black font-bold text-xs font-mono transition flex-shrink-0"
              >
                Salvar
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAddingDesign(false);
                  setNewDesignName("");
                }}
                className="min-h-[28px] px-1.5 py-1 text-neutral-400 hover:text-white transition flex-shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* FEEDBACK DE ERRO SE HOUVER */}
      {errorMsg && (
        <div className="flex items-center gap-2 p-2.5 bg-red-950/30 border border-red-900/60 text-red-300 text-xs">
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-400" />
          <span className="flex-1">{errorMsg}</span>
          <button
            type="button"
            onClick={() => loadAttendances(activeType, config)}
            className="underline font-mono text-[11px] text-red-200 hover:text-white ml-2 flex-shrink-0"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* LISTAGEM DE TRANSMISSÕES CAPTURADAS */}
      <div className="space-y-2">
        {isLoading && (
          <div className="p-6 text-center text-xs font-mono text-neutral-400 flex flex-col items-center justify-center gap-2 bg-black border border-neutral-900">
            <RefreshCw className="h-4 w-4 animate-spin text-neutral-400" />
            <span>Consultando cerimônias ativas na Adiaŭ...</span>
          </div>
        )}

        {!isLoading && !errorMsg && attendances.length === 0 && (
          <div className="p-5 text-center text-xs text-neutral-400 bg-black border border-neutral-900 space-y-1">
            <p className="font-semibold text-neutral-300">Nenhuma cerimônia ativa encontrada</p>
            <p className="text-[11px] text-neutral-400">
              Não há transmissões no momento para o tema &quot;{config.selectedScreenName}&quot;. Você pode
              trocar de design ou colar um link manual logo abaixo.
            </p>
          </div>
        )}

        {!isLoading &&
          attendances.map((att) => {
            const isCurrentlyPlaying =
              Boolean(currentSiteUrl) &&
              (currentSiteUrl?.includes(`transmission=${att.id}`) ||
                currentSiteUrl?.includes(`transmission%3D${att.id}`));

            const transmissionUrl = buildAdiauTransmissionUrl(
              activeType,
              config,
              att,
              clientInfo
            );

            const scheduleText = formatAdiauSchedule(
              att.attendanceStartDate,
              att.attendanceEndDate
            );

            return (
              <div
                key={att.id}
                className={`p-3 border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isCurrentlyPlaying
                    ? "bg-emerald-950/15 border-emerald-500/40"
                    : "bg-black border-neutral-900 hover:border-neutral-800"
                }`}
              >
                {/* Dados da Cerimônia */}
                <div className="min-w-0 space-y-1 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-sm font-sans truncate">
                      {att.deceasedName || "Cerimônia sem nome"}
                    </span>
                    {isCurrentlyPlaying && (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.2 font-mono font-bold uppercase tracking-wider flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>No Ar Nesta Sala</span>
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-[11px] text-neutral-400 flex-wrap">
                    {scheduleText && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-neutral-400 flex-shrink-0" />
                        <span className="text-neutral-300">{scheduleText}</span>
                      </span>
                    )}

                    {(att.burialPlace || att.location?.name) && (
                      <span className="flex items-center gap-1 truncate">
                        <MapPin className="h-3 w-3 text-neutral-400 flex-shrink-0" />
                        <span className="truncate text-neutral-300">
                          {att.burialPlace || att.location?.name}
                          {att.burialDate && !att.toBeDefined && (
                            <span className="text-neutral-400 font-mono ml-1">
                              ({formatAdiauDateTime(att.burialDate)})
                            </span>
                          )}
                        </span>
                      </span>
                    )}

                    <span className="text-neutral-400 font-mono text-[10px]">
                      ID: {att.id}
                    </span>
                  </div>
                </div>

                {/* Botões de Ação */}
                <div className="flex items-center gap-1.5 flex-shrink-0 self-end sm:self-auto w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-900">
                  <a
                    href={transmissionUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="min-h-[30px] px-2 py-1 bg-neutral-900 border border-neutral-900 hover:border-neutral-700 text-neutral-300 hover:text-white text-xs font-mono transition flex items-center justify-center gap-1"
                    title="Conferir página da Adiaŭ em nova aba"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span className="hidden sm:inline">Visualizar</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => handleCopyLink(att)}
                    className="min-h-[30px] px-2 py-1 bg-neutral-900 border border-neutral-900 hover:border-neutral-700 text-neutral-300 hover:text-white text-xs font-mono transition flex items-center justify-center gap-1"
                    title="Copiar URL gerada"
                  >
                    {copiedId === String(att.id) ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-400" />
                        <span className="text-emerald-400 hidden sm:inline">Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span className="hidden sm:inline">Copiar</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyAttendance(att)}
                    disabled={isApplying || isCurrentlyPlaying}
                    className={`min-h-[30px] px-3.5 py-1 text-xs font-mono font-bold uppercase tracking-wider transition flex items-center justify-center gap-1.5 shadow-xs ${
                      isCurrentlyPlaying
                        ? "bg-neutral-900 border border-neutral-900 text-neutral-400 cursor-default"
                        : "bg-white text-black hover:bg-neutral-200"
                    }`}
                  >
                    <Tv className="h-3.5 w-3.5" />
                    <span>{isCurrentlyPlaying ? "Exibindo Agora" : "Exibir na TV"}</span>
                  </button>
                </div>
              </div>
            );
          })}
      </div>

      {/* MODAL DE CONFIGURAÇÃO DE LINKS & TEMAS ADIAŬ */}
      {isConfigModalOpen && (
        <AdiauConfigModal
          isOpen={isConfigModalOpen}
          initialConfig={config}
          onClose={() => setIsConfigModalOpen(false)}
          onSave={(newCfg) => {
            setConfig(newCfg);
            saveAdiauConfig(newCfg);
            setIsConfigModalOpen(false);
            loadAttendances(activeType, newCfg);
          }}
        />
      )}
    </div>
  );
}

/**
 * Modal para edição dos Links Base e gerenciamento da lista de temas de tela
 */
function AdiauConfigModal({
  isOpen,
  initialConfig,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  initialConfig: AdiauConfig;
  onClose: () => void;
  onSave: (config: AdiauConfig) => void;
}) {
  const [homenagemUrl, setHomenagemUrl] = useState(initialConfig.homenagemBaseUrl);
  const [informacaoUrl, setInformacaoUrl] = useState(initialConfig.informacaoBaseUrl);
  const [screenNames, setScreenNames] = useState<string[]>([...initialConfig.screenNames]);
  const [newScreenName, setNewScreenName] = useState("");

  if (!isOpen) return null;

  const handleAddName = () => {
    const trimmed = newScreenName.trim();
    if (!trimmed || screenNames.includes(trimmed)) return;
    setScreenNames([...screenNames, trimmed]);
    setNewScreenName("");
  };

  const handleRemoveName = (name: string) => {
    if (screenNames.length <= 1) return;
    setScreenNames(screenNames.filter((n) => n !== name));
  };

  const handleRestoreDefaults = () => {
    setHomenagemUrl(DEFAULT_ADIAU_CONFIG.homenagemBaseUrl);
    setInformacaoUrl(DEFAULT_ADIAU_CONFIG.informacaoBaseUrl);
    setScreenNames([...DEFAULT_ADIAU_CONFIG.screenNames]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalSelected = screenNames.includes(initialConfig.selectedScreenName)
      ? initialConfig.selectedScreenName
      : screenNames[0] || "Flores";

    onSave({
      homenagemBaseUrl: homenagemUrl.trim() || DEFAULT_ADIAU_CONFIG.homenagemBaseUrl,
      informacaoBaseUrl: informacaoUrl.trim() || DEFAULT_ADIAU_CONFIG.informacaoBaseUrl,
      screenNames: screenNames.length > 0 ? screenNames : ["Flores"],
      selectedScreenName: finalSelected,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-neutral-950 border border-neutral-900 p-4 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-900 pb-2">
          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-white uppercase">
            <Settings className="h-3.5 w-3.5" />
            <span>Configurações de Links da Adiaŭ</span>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-white p-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Link Homenagem */}
          <div className="space-y-1">
            <label className="text-[11px] font-mono text-neutral-300 font-semibold block">
              Link Base de Homenagem (Mensagens):
            </label>
            <input
              type="url"
              value={homenagemUrl}
              onChange={(e) => setHomenagemUrl(e.target.value)}
              className="w-full min-h-[30px] bg-black border border-neutral-900 px-2.5 py-1 text-xs text-white font-mono outline-none focus:border-neutral-500"
              placeholder="https://www.adiau.com.br/v2/messages/?hash=...&code=pt-br&screenName=Flores"
              required
            />
            <p className="text-[10px] text-neutral-400">
              Usado para capturar mensagens e gerar o link interativo de homenagens na TV.
            </p>
          </div>

          {/* Link Informação */}
          <div className="space-y-1">
            <label className="text-[11px] font-mono text-neutral-300 font-semibold block">
              Link Base de Informações (Obituário / Cerimônia):
            </label>
            <input
              type="url"
              value={informacaoUrl}
              onChange={(e) => setInformacaoUrl(e.target.value)}
              className="w-full min-h-[30px] bg-black border border-neutral-900 px-2.5 py-1 text-xs text-white font-mono outline-none focus:border-neutral-500"
              placeholder="https://www.adiau.com.br/v2/information/?hash=...&code=pt-br&screenName=Flores"
              required
            />
            <p className="text-[10px] text-neutral-400">
              Usado para exibir os dados de velório, sepultamento e homenagens formais.
            </p>
          </div>

          {/* Gerenciamento de Temas / screenNames */}
          <div className="space-y-1.5 pt-1 border-t border-neutral-900">
            <label className="text-[11px] font-mono text-neutral-300 font-semibold block">
              Opções de Design de Tela (parâmetro screenName):
            </label>
            <div className="flex flex-wrap gap-1.5">
              {screenNames.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-900 border border-neutral-900 text-neutral-200 text-xs font-mono"
                >
                  <span>{name}</span>
                  {screenNames.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveName(name)}
                      className="text-neutral-400 hover:text-red-400 p-0.5"
                      title={`Remover ${name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-1.5 pt-1">
              <input
                type="text"
                placeholder="Novo tema (ex: Sala02, Dourado...)"
                value={newScreenName}
                onChange={(e) => setNewScreenName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddName();
                  }
                }}
                className="flex-1 min-h-[28px] bg-black border border-neutral-900 px-2 py-1 text-xs text-white font-mono outline-none focus:border-neutral-500"
              />
              <button
                type="button"
                onClick={handleAddName}
                disabled={!newScreenName.trim()}
                className="min-h-[28px] px-3 py-1 bg-neutral-900 border border-neutral-900 text-neutral-200 hover:text-white text-xs font-mono disabled:opacity-40"
              >
                + Adicionar
              </button>
            </div>
          </div>

          {/* Rodapé com Ações */}
          <div className="flex items-center justify-between pt-3 border-t border-neutral-900">
            <button
              type="button"
              onClick={handleRestoreDefaults}
              className="text-[11px] font-mono text-neutral-400 hover:text-white underline"
            >
              Restaurar Padrões Pagliaro
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[30px] px-3 py-1 border border-neutral-900 bg-neutral-900 text-neutral-300 hover:text-white text-xs font-mono"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[30px] px-4 py-1 bg-white text-black font-mono font-bold text-xs uppercase tracking-wider hover:bg-neutral-200"
              >
                Salvar Configurações
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
