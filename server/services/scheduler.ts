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
  durationMinutes?: number; // Duração opcional da automação em minutos (override)
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

/**
 * Rotina Base da Sala (Programação diária / semanal contínua estilo alarme de smartphone)
 * Funciona por baixo das automações: quando nenhuma automação estiver ativa, a rotina assume.
 */
export interface RoomRoutine {
  id: string;
  roomSlug: string;
  title: string;
  daysOfWeek: number[]; // 0=Domingo, 1=Segunda, ..., 6=Sábado (livre como alarme)
  startTime: string;    // "HH:mm" (ex: "07:00")
  endTime: string;      // "HH:mm" (ex: "19:00", suporta atravessar meia-noite como "22:00" até "06:00")
  enabled: boolean;
  priority?: number;
  actions: {
    standby?: boolean;
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
  createdAt: number;
  updatedAt?: number;
}

let tickerTimer: any = null;
let isChecking = false;

// Controle de Prioridade: Automações ativas que bloqueiam rotinas temporariamente
export const activeRoomAutomationOverrides = new Map<string, { id: string; title: string; expiresAt: number }>();
// Última rotina aplicada em cada sala (para não reenviar comandos repetidos desnecessários)
export const lastAppliedRoutinePerRoom = new Map<string, string>();

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

    // Registra como Override de Prioridade Ativo nesta sala
    const durationMs = (task.durationMinutes && task.durationMinutes > 0 ? task.durationMinutes : 120) * 60_000;
    activeRoomAutomationOverrides.set(room, {
      id: task.id,
      title: task.title,
      expiresAt: Date.now() + durationMs,
    });
    // Limpa a rotina anterior para forçar reaplicação suave quando a cerimônia acabar
    lastAppliedRoutinePerRoom.delete(room);

    // Atualiza status do agendamento
    if (markExecuted) {
      task.executed = true;
      task.executedAt = Date.now();
      await db.saveSchedule(task);
    }

    console.log(`[Scheduler] Agendamento executado: "${task.title}" na sala "${room}" (override até ${new Date(Date.now() + durationMs).toLocaleTimeString("pt-BR")})`);
    return true;
  } catch (err) {
    console.error(`[Scheduler] Erro ao executar agendamento "${task.title}":`, err);
    return false;
  }
}

/**
 * Remove qualquer override de automação e devolve a sala imediatamente à Rotina Base
 */
export function clearAutomationOverride(roomSlug: string): void {
  activeRoomAutomationOverrides.delete(roomSlug);
  lastAppliedRoutinePerRoom.delete(roomSlug);
}

/**
 * Retorna o dia da semana (0=Dom a 6=Sáb) e hora "HH:mm" no horário de Brasília (UTC-3)
 */
export function getBrasiliaTime(): { dayOfWeek: number; timeStr: string; nowMs: number } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  let hour = "00";
  let min = "00";
  let weekday = "Sun";
  for (const p of parts) {
    if (p.type === "hour") hour = p.value;
    else if (p.type === "minute") min = p.value;
    else if (p.type === "weekday") weekday = p.value;
  }
  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dayOfWeek = dayMap[weekday] ?? now.getDay();
  return {
    dayOfWeek,
    timeStr: `${hour.padStart(2, "0")}:${min.padStart(2, "0")}`,
    nowMs: now.getTime(),
  };
}

/**
 * Verifica se um slot de rotina está ativo no dia e horário informados.
 * Suporta horários regulares (ex: 07:00 às 19:00) e noturnos que cruzam a meia-noite (ex: 22:00 às 06:00).
 */
export function isRoutineSlotActive(routine: RoomRoutine, dayOfWeek: number, timeStr: string): boolean {
  if (!routine.enabled) return false;
  if (!Array.isArray(routine.daysOfWeek) || !routine.daysOfWeek.includes(dayOfWeek)) {
    return false;
  }
  const start = routine.startTime || "00:00";
  const end = routine.endTime || "23:59";
  if (start <= end) {
    return timeStr >= start && timeStr < end;
  }
  // Horário noturno atravessando a meia-noite (ex: 22:00 até 07:00)
  return timeStr >= start || timeStr < end;
}

/**
 * Executa uma rotina base na sala
 */
export async function executeRoutine(routine: RoomRoutine): Promise<boolean> {
  if (!routine || !routine.roomSlug) return false;

  try {
    const room = routine.roomSlug;
    const actions = routine.actions || {};
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

    // Enfileira na fila do servidor
    await roomEventQueue.enqueueSetState(room, updates, `routine:${routine.id}`);
    lastAppliedRoutinePerRoom.set(room, routine.id);
    console.log(`[Scheduler] Rotina Base ativada: "${routine.title}" na sala "${room}"`);
    return true;
  } catch (err) {
    console.error(`[Scheduler] Erro ao executar rotina "${routine.title}":`, err);
    return false;
  }
}

/**
 * Avaliador Central:
 * 1. Processa Agendamentos / Automações (Prioridade Alta)
 * 2. Em segundo plano, garante que a sala esteja seguindo a Rotina Base do dia/horário atual
 */
async function checkPendingSchedulesAndRoutines() {
  if (isChecking) return;
  isChecking = true;

  try {
    const now = Date.now();
    const { dayOfWeek, timeStr } = getBrasiliaTime();

    // -------------------------------------------------------------
    // ETAPA 1: Processar Agendamentos / Cerimônias Pontuais (PRIORIDADE ALTA)
    // -------------------------------------------------------------
    const schedules = await db.getSchedules();

    for (const task of schedules) {
      if (task.enabled && !task.executed) {
        const targetTime = parseScheduledTime(task.scheduledAt);
        if (!isNaN(targetTime) && targetTime <= now) {
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

    // Limpa overrides expirados
    for (const [room, override] of activeRoomAutomationOverrides.entries()) {
      if (now >= override.expiresAt) {
        console.log(`[Scheduler] Fim da automação prioritária "${override.title}" na sala "${room}". Retomando Rotina Base...`);
        activeRoomAutomationOverrides.delete(room);
        lastAppliedRoutinePerRoom.delete(room);
      }
    }

    // -------------------------------------------------------------
    // ETAPA 2: Avaliar Rotina Base (Funciona por baixo das automações)
    // -------------------------------------------------------------
    const rooms = await db.getRooms();

    for (const room of rooms) {
      const slug = room.slug;
      if (!slug) continue;

      // Se há uma automação/cerimônia ATIVA com prioridade nesta sala, não aplica rotina
      if (activeRoomAutomationOverrides.has(slug)) {
        continue;
      }

      // Busca todas as rotinas cadastradas para esta sala
      const routines: RoomRoutine[] = await db.getRoutines(slug);
      if (!routines || routines.length === 0) continue;

      // Encontra a rotina correspondente ao dia da semana e horário atual
      const activeSlot = routines.find((r) => isRoutineSlotActive(r, dayOfWeek, timeStr));

      if (activeSlot) {
        const lastApplied = lastAppliedRoutinePerRoom.get(slug);
        if (lastApplied !== activeSlot.id) {
          await executeRoutine(activeSlot);
        }
      }
    }
  } catch (e) {
    console.error("[Scheduler] Erro durante verificação de agendamentos e rotinas:", e);
  } finally {
    isChecking = false;
  }
}

/**
 * Inicializa o motor de agendamentos e rotinas
 */
export function initScheduler() {
  if (tickerTimer) return;
  console.log("[Scheduler] Motor de automações e rotinas base iniciado (checagem a cada 10s).");
  // Executa imediatamente uma verificação na inicialização
  checkPendingSchedulesAndRoutines();
  // Configura checagem recorrente a cada 10 segundos
  tickerTimer = setInterval(checkPendingSchedulesAndRoutines, 10_000);
}

/**
 * Encerra o motor de agendamentos e rotinas
 */
export function stopScheduler() {
  if (tickerTimer) {
    clearInterval(tickerTimer);
    tickerTimer = null;
  }
}
