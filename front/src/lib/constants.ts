export interface RadioPreset {
  name: string;
  url: string;
  desc: string;
}

export const VERIFIED_GOSPEL_PRESETS: RadioPreset[] = [
  {
    name: "Rádio Instrumental Gospel 24h",
    url: "http://live8.livemus.com.br:27142/stream",
    desc: "Hinos e louvores instrumentais suaves (Ideal para Velório)",
  },
  {
    name: "Rádio Shekinah Só Louvor 24h",
    url: "https://player.voxpainel.com.br/proxy/7076",
    desc: "Louvores e adoração contínua sem comerciais",
  },
  {
    name: "Rádio Doce Louvor 24h",
    url: "https://servidor28-2.brlogic.com:7204/live",
    desc: "Seleção contínua de reflexão e paz",
  },
  {
    name: "Rádio Novas de Paz 24h",
    url: "https://radio.saopaulo01.com.br/8304/stream",
    desc: "Louvores tradicionais em MP3 compatível",
  },
  {
    name: "Rádio Melodia FM 97.5 (RJ)",
    url: "https://streaming.radiomelodia.com.br/stream",
    desc: "A rádio de maior audiência do segmento no Brasil",
  },
  {
    name: "Rádio 93 FM Gospel (RJ)",
    url: "https://icecast.93fm.com.br/stream",
    desc: "Líder em Louvor & Notícias",
  },
];

export const DEFAULT_ADIAU_URLS = [
  {
    label: "Adiaŭ Mensagens (Homenagem Flores)",
    url: "https://www.adiau.com.br/v2/messages/?hash=pLwCBfBbbtbxAB3SON1JldHP&code=pt-br&screenName=Flores",
  },
  {
    label: "Adiaŭ Informações (Frente da Sala)",
    url: "https://www.adiau.com.br/v2/information/?hash=pLwCBfBbbtbxAB3SON1JldHP&code=pt-br&screenName=Flores",
  },
];

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
