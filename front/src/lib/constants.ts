export interface RadioPreset {
  name: string;
  url: string;
  desc: string;
}

export const VERIFIED_GOSPEL_PRESETS: RadioPreset[] = [
  {
    name: "Piano Landscapes (Música Instrumental)",
    url: "https://playerservices.streamtheworld.com/api/livestream-redirect/ACIR23_s01AAC.aac",
    desc: "Piano e arranjos serenos de paz (Ideal para Velório e Homenagens)",
  },
  {
    name: "MGT Rádio Gospel 24h",
    url: "https://cast.mgtradio.net/radio/8040/aac",
    desc: "Canal 100% louvores gospel contínuos sem comerciais",
  },
  {
    name: "Rádio Shekinah Só Louvor 24h",
    url: "https://player.voxpainel.com.br/proxy/7076",
    desc: "Louvores e adoração contínua sem comerciais",
  },
  {
    name: "Rádio Instrumental Gospel 24h",
    url: "http://live8.livemus.com.br:27142/stream",
    desc: "Hinos e louvores instrumentais suaves",
  },
  {
    name: "Rádio Doce Louvor 24h",
    url: "https://servidor28-2.brlogic.com:7204/live",
    desc: "Seleção contínua de reflexão e paz",
  },
  {
    name: "Rádio Melodia 97.5 FM (RJ)",
    url: "https://26573.live.streamtheworld.com/MELODIAFMAAC.aac",
    desc: "A rádio de maior audiência do segmento no Brasil (CDN Oficial)",
  },
  {
    name: "Gospel FM 24h",
    url: "https://stream3.svrdedicado.org/8070/stream",
    desc: "Transmissão gospel 24h em MP3 padrão",
  },
  {
    name: "Rádio Swiss Classic (Clássica Suave)",
    url: "https://stream.srg-ssr.ch/m/rsc_de/mp3_128",
    desc: "Música clássica suave e serena 24 horas em MP3",
  },
];

/**
 * URLs padrão da Adiaŭ — sem hash fixo.
 * Use `getDefaultAdiauUrlsFromServer()` para obter com hash real vindo do .env do servidor.
 * Mantido como array estático vazio para retrocompatibilidade com importações existentes.
 */
export const DEFAULT_ADIAU_URLS: { label: string; url: string }[] = [];

/**
 * Busca as URLs padrão da Adiaŭ com hash real do servidor (via /api/adiau/config).
 */
export async function getDefaultAdiauUrlsFromServer(): Promise<{ label: string; url: string }[]> {
  try {
    const res = await fetch("/api/adiau/config");
    if (!res.ok) return DEFAULT_ADIAU_URLS;
    const data = await res.json();
    if (!data.configured || !data.homenagemBaseUrl) return DEFAULT_ADIAU_URLS;
    return [
      { label: "Adiaŭ Mensagens (Homenagem)", url: data.homenagemBaseUrl },
      { label: "Adiaŭ Informações (Frente da Sala)", url: data.informacaoBaseUrl },
    ];
  } catch {
    return DEFAULT_ADIAU_URLS;
  }
}

export const ROUTINE_DAYS = [
  { day: 0, label: "Dom", full: "Domingo" },
  { day: 1, label: "Seg", full: "Segunda-feira" },
  { day: 2, label: "Ter", full: "Terça-feira" },
  { day: 3, label: "Qua", full: "Quarta-feira" },
  { day: 4, label: "Qui", full: "Quinta-feira" },
  { day: 5, label: "Sex", full: "Sexta-feira" },
  { day: 6, label: "Sáb", full: "Sábado" },
];

export function formatRoutineDaysSummary(days: number[]): string {
  if (!days || days.length === 0) return "Nenhum dia selecionado";
  if (days.length === 7) return "Todos os dias";
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 5 && [1, 2, 3, 4, 5].every((d) => sorted.includes(d))) {
    return "Segunda a Sexta";
  }
  if (sorted.length === 2 && sorted.includes(0) && sorted.includes(6)) {
    return "Finais de Semana";
  }
  if (sorted.length === 1 && sorted[0] === 0) {
    return "Apenas Domingo";
  }
  return sorted.map((d) => ROUTINE_DAYS[d]?.label || `Dia ${d}`).join(", ");
}

export const VOLUME_PRESETS = [
  { label: "Mudo", val: 0 },
  { label: "10%", val: 10 },
  { label: "20%", val: 20 },
  { label: "30%", val: 30 },
  { label: "50%", val: 50 },
  { label: "80%", val: 80 },
];
