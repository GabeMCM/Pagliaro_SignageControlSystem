import { db } from "./db.ts";
import { roomEventQueue } from "./event-queue.ts";
import { wsManager } from "../ws/manager.ts";

export interface ScheduleTask {
  id: string;
  roomSlug: string;
  title: string;
  scheduledAt: string;
  enabled: boolean;
  executed?: boolean;
  executedAt?: number | null;
  durationMinutes?: number;
  createdAt?: number;
  actions?: Record<string, any>;
}

export interface RoomRoutine {
  id: string;
  roomSlug: string;
  title: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  enabled: boolean;
  priority?: number;
  actions?: Record<string, any>;
  createdAt?: number;
  updatedAt?: number;
}

// Stubs para retrocompatibilidade com endpoints legados
export const activeRoomAutomationOverrides = new Map<string, { id: string; title: string; expiresAt: number }>();
export const lastAppliedRoutinePerRoom = new Map<string, string>();

export function clearAutomationOverride(_roomSlug: string): void {
  // Rotinas antigas descontinuadas
}

export async function executeSchedule(_task: ScheduleTask, _markExecuted = true): Promise<boolean> {
  return true;
}

export async function executeRoutine(_routine: RoomRoutine): Promise<boolean> {
  return true;
}

/**
 * Retorna o dia da semana (0=Dom a 6=Sáb), hora, minuto e timestamp no fuso de Brasília (America/Sao_Paulo / UTC-3)
 */
export function getBrasiliaTime(): {
  dayOfWeek: number;
  hour: number;
  minute: number;
  timeStr: string;
  nowMs: number;
} {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  let hourStr = "00";
  let minStr = "00";
  let weekday = "Sun";
  for (const p of parts) {
    if (p.type === "hour") hourStr = p.value;
    else if (p.type === "minute") minStr = p.value;
    else if (p.type === "weekday") weekday = p.value;
  }
  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dayOfWeek = dayMap[weekday] ?? now.getDay();
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minStr, 10);

  return {
    dayOfWeek,
    hour,
    minute,
    timeStr: `${hourStr.padStart(2, "0")}:${minStr.padStart(2, "0")}`,
    nowMs: now.getTime(),
  };
}

let tickerTimer: any = null;
let isChecking = false;
let lastAdiauCheckSlot = "";
let isAdiauInitialRun = true;
const knownAdiauAttendanceIds = new Set<string | number>();

function getAdiauCheckUrl(): string | null {
  const hash = (Deno.env.get("ADIAU_HASH") || "").trim();
  const screenName = (Deno.env.get("ADIAU_SCREEN_NAME") || "Flores").trim();
  if (!hash) return null;
  return `https://www.adiau.com.br/v2/messages/messages-v2.php?action=getAttendances&hashcode=${encodeURIComponent(hash)}&screenName=${encodeURIComponent(screenName)}`;
}

/**
 * Consulta a lista da Adiaŭ e notifica os admins conectados caso haja novas homenagens
 */
export async function checkAdiauForNewCeremonies(forceAlert = false): Promise<void> {
  const checkUrl = getAdiauCheckUrl();
  if (!checkUrl) {
    if (forceAlert) {
      console.warn("[AdiauMonitor] Verificação cancelada: ADIAU_HASH não configurado no .env");
    }
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(checkUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 PagliaroSignage/2.0",
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      console.warn(`[AdiauMonitor] Servidor Adiaŭ retornou status HTTP ${res.status}`);
      return;
    }

    const data = await res.json();
    if (!data || data.status !== true || !data.services) {
      return;
    }

    const rawList = data.services.attendances || data.services.data || [];
    if (!Array.isArray(rawList)) return;

    if (isAdiauInitialRun && !forceAlert) {
      for (const item of rawList) {
        if (item && item.id) knownAdiauAttendanceIds.add(item.id);
      }
      isAdiauInitialRun = false;
      console.log(`[AdiauMonitor] Inicializado com ${knownAdiauAttendanceIds.size} homenagens conhecidas na Adiaŭ.`);
      return;
    }

    // Detecta novas homenagens que não estavam registradas
    const newAttendances = rawList.filter((item: any) => item && item.id && !knownAdiauAttendanceIds.has(item.id));

    if (newAttendances.length > 0) {
      for (const item of newAttendances) {
        knownAdiauAttendanceIds.add(item.id);
      }

      console.log(
        `[AdiauMonitor] 🔔 Detectada(s) ${newAttendances.length} nova(s) homenagem(ns) disponível(is) na Adiaŭ!`
      );

      // Envia notificação em tempo real via WebSocket para todos os dispositivos de Admin conectados
      wsManager.broadcastAdmins(
        JSON.stringify({
          type: "adiauAlert",
          title: "Novas Homenagens Disponíveis",
          message: `${newAttendances.length} nova(s) homenagem(ns) disponível(is) na Adiaŭ para abertura em salas.`,
          newCount: newAttendances.length,
          attendances: newAttendances.map((a: any) => ({
            id: a.id,
            deceasedName: a.deceasedName || "Sem Nome",
            startDate: a.attendanceStartDate,
            endDate: a.attendanceEndDate || a.burialDate,
            location: a.location?.name || a.burialPlace || "",
          })),
          timestamp: Date.now(),
        })
      );
    }
  } catch (err: any) {
    console.warn(`[AdiauMonitor] Erro ao consultar lista da Adiaŭ:`, err?.message || err);
  }
}

/**
 * Encerra automaticamente a exibição e coloca a sala em Standby exatamente no horário marcado
 */
async function checkCeremonyAutoStandby(): Promise<void> {
  try {
    const allStates = await db.getState();
    const now = Date.now();

    for (const [slug, rawState] of Object.entries(allStates)) {
      if (!slug || !rawState || typeof rawState !== "object") continue;
      const roomState = rawState as Record<string, any>;

      // Apenas salas que possuem site ativo e horário de término definido
      if (roomState.siteUrl && roomState.ceremonyEndAt) {
        const endTimestamp = Number(roomState.ceremonyEndAt);
        if (!isNaN(endTimestamp) && now >= endTimestamp) {
          const ceremonyName = roomState.ceremonyTitle || "Homenagem Adiaŭ";
          console.log(
            `[AdiauScheduler] ⏰ Horário programado atingido na sala "${slug}" (${new Date(endTimestamp).toLocaleTimeString("pt-BR")}). Encerrando "${ceremonyName}" e ativando Standby...`
          );

          // 1. Enfileira o encerramento da exibição e ativa o modo Standby
          await roomEventQueue.enqueueSetState(
            slug,
            {
              siteUrl: null,
              mode: "playlist",
              standby: true,
              ceremonyEndAt: null,
              ceremonyTitle: null,
            },
            "adiau:auto-standby"
          );

          // 2. Avisa os administradores conectados sobre o encerramento automático da sala
          wsManager.broadcastAdmins(
            JSON.stringify({
              type: "notification",
              title: "Cerimônia Concluída",
              message: `A cerimônia "${ceremonyName}" na sala "${slug}" atingiu o horário previsto e foi encerrada automaticamente. A TV entrou em Standby.`,
              room: slug,
              timestamp: Date.now(),
            })
          );
        }
      }
    }
  } catch (err: any) {
    console.error("[AdiauScheduler] Erro ao verificar encerramento automático das salas:", err);
  }
}

/**
 * Ticker principal do Scheduler:
 * - A cada 10 segundos: verifica salas ativas para encerramento automático pontual
 * - Nos minutos :01 e :31 de cada hora: consulta a Adiaŭ para detectar novas homenagens
 */
async function schedulerTicker() {
  if (isChecking) return;
  isChecking = true;

  try {
    // 1. Verifica salas ativas com horário de término alcançado (precisão de 10s)
    await checkCeremonyAutoStandby();

    // 2. Verifica a Adiaŭ aos minutos :01 e :31 de cada hora (Horário de Brasília)
    const { hour, minute } = getBrasiliaTime();
    if (minute === 1 || minute === 31) {
      const slotKey = `${hour}:${minute}`;
      if (lastAdiauCheckSlot !== slotKey) {
        lastAdiauCheckSlot = slotKey;
        console.log(`[AdiauScheduler] Executando verificação periódica da Adiaŭ aos :${String(minute).padStart(2, "0")} (Brasília: ${hour}:${minute})...`);
        await checkAdiauForNewCeremonies();
      }
    }
  } catch (err: any) {
    console.error("[AdiauScheduler] Erro no ticker:", err);
  } finally {
    isChecking = false;
  }
}

/**
 * Inicializa o motor de monitoramento Adiaŭ e encerramento automático
 */
export function initScheduler() {
  if (tickerTimer) return;
  console.log("[Scheduler] Motor Adiaŭ iniciado (verificação :01/:31 e encerramento automático ativo).");

  // Primeira checagem para popular homenagens conhecidas
  checkAdiauForNewCeremonies().catch(() => {});

  // Ticker recorrente a cada 10 segundos
  tickerTimer = setInterval(schedulerTicker, 10_000);
}

/**
 * Encerra o motor
 */
export function stopScheduler() {
  if (tickerTimer) {
    clearInterval(tickerTimer);
    tickerTimer = null;
  }
}
