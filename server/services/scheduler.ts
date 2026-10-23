import { db } from "./db.ts";
import { wsManager } from "../ws/manager.ts";

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
 * Executa uma ação agendada no estado da sala e notifica os players via WebSocket
 */
export async function executeSchedule(task: ScheduleTask, markExecuted = true): Promise<boolean> {
  if (!task || !task.roomSlug) return false;

  try {
    const room = task.roomSlug;
    const state = await db.getState();

    if (typeof state[room] === "string") {
      state[room] = { playlist: state[room], audioPlaylist: null };
    } else if (!state[room]) {
      state[room] = {
        playlist: null,
        audioPlaylist: null,
        audioStreamUrl: null,
        siteUrl: null,
        mode: "playlist",
        visualStatus: "idle",
        audioStatus: "idle",
        audioVolume: 100,
        audioLoopMode: "all",
        audioShuffle: false,
        currentAudioIndex: 0,
      };
    }

    const actions = task.actions || {};

    // 1. Standby (Modo Suspenso / Tela Ativa)
    if (actions.standby !== undefined) {
      state[room].standby = Boolean(actions.standby);
    }

    // 2. Site de Homenagem
    if (actions.siteUrl !== undefined) {
      state[room].siteUrl = actions.siteUrl ? String(actions.siteUrl).trim() : null;
      if (state[room].siteUrl) {
        state[room].mode = "site";
        state[room].visualStatus = "playing";
      } else {
        state[room].mode = "playlist";
        if (!state[room].playlist) {
          state[room].visualStatus = "idle";
        }
      }
    }

    if (actions.mode !== undefined) {
      state[room].mode = actions.mode;
    }

    // 3. Playlist Visual
    if (actions.playlist !== undefined) {
      state[room].playlist = actions.playlist;
      if (actions.playlist) {
        state[room].visualStatus = "playing";
      }
    }

    // 4. Playlist de Áudio
    if (actions.audioPlaylist !== undefined) {
      state[room].audioPlaylist = actions.audioPlaylist;
      if (actions.audioPlaylist) {
        state[room].audioStatus = actions.audioStatus || "playing";
        state[room].audioStreamUrl = null;
      }
    }

    // 5. Stream de Áudio Direto / Web Rádio
    if (actions.audioStreamUrl !== undefined) {
      state[room].audioStreamUrl = actions.audioStreamUrl ? String(actions.audioStreamUrl).trim() : null;
      if (state[room].audioStreamUrl) {
        state[room].audioStatus = actions.audioStatus || "playing";
      }
    }

    // 6. Volume de Áudio
    if (actions.audioVolume !== undefined) {
      state[room].audioVolume = Math.max(0, Math.min(100, Number(actions.audioVolume)));
    }

    // 7. Status do Áudio (Play / Pause / Idle)
    if (actions.audioStatus !== undefined) {
      state[room].audioStatus = actions.audioStatus;
    }

    // 8. Índice da Música / Loop / Shuffle
    if (actions.currentAudioIndex !== undefined) {
      state[room].currentAudioIndex = Number(actions.currentAudioIndex);
    }
    if (actions.audioLoopMode !== undefined) {
      state[room].audioLoopMode = actions.audioLoopMode;
    }
    if (actions.audioShuffle !== undefined) {
      state[room].audioShuffle = Boolean(actions.audioShuffle);
    }

    // Salva o novo estado consolidado
    await db.saveState(state);

    // Emite atualização imediata via WebSocket para as telas da sala
    wsManager.broadcast(room, JSON.stringify({ type: "updateState", state: state[room] }));

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
        const targetTime = new Date(task.scheduledAt).getTime();
        // Se a hora do agendamento já chegou (com tolerância de 2 horas retroativas)
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
