import { db } from "./db.ts";
import { roomEventQueue } from "./event-queue.ts";

export interface ScheduleTask {
  id: string;
  roomSlug: string;
  title: string;
  scheduledAt: string; // ISO string ou formato "YYYY-MM-DDTHH:mm"
  enabled: boolean;
  executed?: boolean;
  executedAt?: number | null;
  createdAt: number;
  actions: {
    standby?: boolean; // false = liga tela / sai de suspensão, true = modo suspenso
    siteUrl?: string | null;
    mode?: "site" | "playlist";
    playlist?: string | null;
    audioPlaylist?: string | null;
    audioStreamUrl?: string | null;
    audioVolume?: number;
    audioStatus?: "playing" | "paused" | "idle";
    currentAudioIndex?: number;
    audioLoopMode?: "all" | "one" | "none";
    audioShuffle?: boolean;
  };
}

let tickerTimer: any = null;
let isChecking = false;

/**
 * Converte qualquer formato de data/hora de agendamento para timestamp UTC com proteção de timezone.
 * Evita que servidores em nuvem rodando em UTC (como o Render) interpretem horários do Brasil como UTC.
 */
export function parseScheduledTime(scheduledAt: string | number | undefined | null): number {
  if (typeof scheduledAt === "number") return scheduledAt;
  if (!scheduledAt) return NaN;
  const str = String(scheduledAt).trim();
  // Se for timestamp numérico em string
  if (/^\d{10,13}$/.test(str)) {
    const num = Number(str);
    return str.length === 10 ? num * 1000 : num;
  }
  // Se já tiver indicação de timezone ('Z' ou '+HH:MM' ou '-HH:MM')
  if (str.endsWith("Z") || /[+-]\d{2}(:?\d{2})?$/.test(str)) {
    return new Date(str).getTime();
  }
  // Se for "YYYY-MM-DDTHH:mm" sem fuso explícito, o servidor pode estar em UTC (Render).
  // Assume o fuso de Brasília (UTC-3 / -03:00) para evitar que o Render interprete como UTC
  const safeStr = str.length === 16 ? `${str}:00-03:00` : `${str}-03:00`;
  const parsed = new Date(safeStr).getTime();
  if (!isNaN(parsed)) return parsed;
  return new Date(str).getTime();
}

/**
 * Executa uma ação agendada no estado da sala através da Fila de Eventos do Servidor
 */
export async function executeSchedule(task: ScheduleTask, markExecuted = true): Promise<boolean> {
  if (!task || !task.roomSlug) return false;

  try {
    const room = task.roomSlug;
    const actions = task.actions || {};
    const updates: Record<string, any> = {};

    if (actions.standby !== undefined) updates.standby = Boolean(actions.standby);
    if (actions.siteUrl !== undefined) updates.siteUrl = actions.siteUrl ? String(actions.siteUrl).trim() : null;
    if (actions.mode !== undefined) updates.mode = actions.mode;
    if (actions.playlist !== undefined) updates.playlist = actions.playlist;
    if (actions.audioPlaylist !== undefined) updates.audioPlaylist = actions.audioPlaylist;
    if (actions.audioStreamUrl !== undefined) updates.audioStreamUrl = actions.audioStreamUrl ? String(actions.audioStreamUrl).trim() : null;
    if (actions.audioVolume !== undefined) updates.audioVolume = Math.max(0, Math.min(100, Number(actions.audioVolume)));
    if (actions.audioStatus !== undefined) updates.audioStatus = actions.audioStatus;
    if (actions.currentAudioIndex !== undefined) updates.currentAudioIndex = Number(actions.currentAudioIndex);
    if (actions.audioLoopMode !== undefined) updates.audioLoopMode = actions.audioLoopMode;
    if (actions.audioShuffle !== undefined) updates.audioShuffle = Boolean(actions.audioShuffle);

    // Enfileira na Fila de Eventos Central do Servidor (garante prioridade e versão monotônica)
    await roomEventQueue.enqueueSetState(room, updates, `schedule:${task.id}`);

    // Atualiza status do agendamento
    if (markExecuted) {
      task.executed = true;
      task.executedAt = Date.now();
      await db.saveSchedule(task);
    }

    console.log(`[Scheduler] Agendamento executado: "${task.title}" na sala "${room}"`);
    return true;
  } catch (err) {
    console.error(`[Scheduler] Erro ao executar agendamento "${task.title}":`, err);
    return false;
  }
}

/**
 * Verifica periodicamente agendamentos pendentes
 */
async function checkPendingSchedules() {
  if (isChecking) return;
  isChecking = true;

  try {
    const schedules = await db.getSchedules();
    const now = Date.now();

    for (const task of schedules) {
      if (task.enabled && !task.executed) {
        const targetTime = parseScheduledTime(task.scheduledAt);
        // Se a hora do agendamento já chegou
        if (!isNaN(targetTime) && targetTime <= now) {
          // Se já passou mais de 24h e o servidor estava desligado, marca como expirado para não disparar sustos
          if (now - targetTime > 24 * 60 * 60 * 1000) {
            console.log(`[Scheduler] Agendamento antigo expirado: "${task.title}" (${task.scheduledAt})`);
            task.executed = true;
            task.executedAt = null;
            await db.saveSchedule(task);
          } else {
            await executeSchedule(task, true);
          }
        }
      }
    }
  } catch (e) {
    console.error("[Scheduler] Erro durante verificação de agendamentos:", e);
  } finally {
    isChecking = false;
  }
}

/**
 * Inicializa o motor de agendamentos
 */
export function initScheduler() {
  if (tickerTimer) return;
  console.log("[Scheduler] Motor de automações e agendamentos iniciado (checagem a cada 10s).");
  // Executa imediatamente uma verificação na inicialização
  checkPendingSchedules();
  // Configura checagem recorrente a cada 10 segundos
  tickerTimer = setInterval(checkPendingSchedules, 10_000);
}

/**
 * Encerra o motor de agendamentos
 */
export function stopScheduler() {
  if (tickerTimer) {
    clearInterval(tickerTimer);
    tickerTimer = null;
  }
}
