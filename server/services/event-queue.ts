import { db } from "./db.ts";
import { wsManager } from "../ws/manager.ts";

export interface RoomEvent {
  type: "setState" | "control";
  roomSlug: string;
  payload: any;
  timestamp: number;
}

/**
 * Fila de Eventos Sequencial (FIFO) por Sala + Controle de Versão Monotônico (Server-Authoritative State).
 * Garante que:
 * 1. O estado no servidor seja sempre a única fonte da verdade (prioridade absoluta).
 * 2. Comandos concorrentes de múltiplos dispositivos (PC, smartphone, TV, automação) sejam processados em fila ordenada sem condição de corrida (race conditions).
 * 3. Cada transição de estado receba um número de versão sequencial (`version` / `seq`) para evitar que respostas HTTP antigas sobrescrevam estados mais novos nos clientes.
 */
class RoomEventQueueManager {
  private queues = new Map<string, Promise<any>>();
  private versions = new Map<string, number>();
  private lastAutoTrackChange = new Map<string, number>();

  private getNextVersion(room: string, currentVersion?: number): number {
    const base = Math.max(this.versions.get(room) || 0, Number(currentVersion) || 0);
    const next = base + 1;
    this.versions.set(room, next);
    return next;
  }

  public getDefaultRoomState(roomSlug: string) {
    return {
      playlist: null,
      audioPlaylist: null,
      audioStreamUrl: null,
      siteUrl: null,
      mode: "playlist",
      visualStatus: "idle",
      audioStatus: "idle",
      audioVolume: 0,
      audioLoopMode: "all",
      audioShuffle: false,
      currentAudioIndex: 0,
      standby: false,
      version: this.versions.get(roomSlug) || 1,
      updatedAt: Date.now(),
    };
  }

  public async getAuthoritativeRoomState(roomSlug: string) {
    const state = await db.getState();
    let roomState = state[roomSlug];
    if (typeof roomState === "string") {
      roomState = { playlist: roomState, audioPlaylist: null };
    }
    const defaults = this.getDefaultRoomState(roomSlug);
    const merged = { ...defaults, ...(roomState || {}) };
    if (!merged.version || merged.version < (this.versions.get(roomSlug) || 1)) {
      merged.version = this.versions.get(roomSlug) || 1;
    } else {
      this.versions.set(roomSlug, merged.version);
    }
    return merged;
  }

  /**
   * Enfileira uma operação de mutação na sala, garantindo execução estritamente sequencial (FIFO).
   */
  public enqueue<T>(roomSlug: string, task: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(roomSlug) || Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(() => task());
    this.queues.set(roomSlug, next);
    return next;
  }

  /**
   * Processa atualização de estado (`POST /api/state/:roomSlug` ou Automação) na fila da sala.
   */
  public enqueueSetState(room: string, body: any, _source?: string) {
    return this.enqueue(room, async () => {
      const state = await db.getState();
      if (typeof state[room] === "string") {
        state[room] = { playlist: state[room], audioPlaylist: null };
      } else if (!state[room]) {
        state[room] = this.getDefaultRoomState(room);
      }

      const current = state[room];

      // Atualização da URL de Site
      if (body.siteUrl !== undefined) {
        current.siteUrl = body.siteUrl ? String(body.siteUrl).trim() : null;
        if (current.siteUrl) {
          current.mode = "site";
          current.visualStatus = "playing";
        } else {
          current.mode = "playlist";
          if (!current.playlist) {
            current.visualStatus = "idle";
          }
        }
      }

      if (body.mode !== undefined) {
        current.mode = body.mode;
      }

      // Atualização de URL Direta de Stream de Áudio
      if (body.audioStreamUrl !== undefined) {
        current.audioStreamUrl = body.audioStreamUrl ? String(body.audioStreamUrl).trim() : null;
        if (current.audioStreamUrl) {
          current.audioStatus = "playing";
        } else if (!current.audioPlaylist) {
          current.audioStatus = "idle";
        }
      }

      // Atualização de Playlist Visual
      if (body.playlist !== undefined) {
        current.playlist = body.playlist;
        if (body.playlist) {
          current.visualStatus = "playing";
          if (body.mode === undefined && !body.siteUrl) {
            current.mode = "playlist";
          }
        } else if (!current.siteUrl || current.mode !== "site") {
          current.visualStatus = "idle";
        }
      }

      // Atualização de Playlist de Áudio
      if (body.audioPlaylist !== undefined) {
        current.audioPlaylist = body.audioPlaylist;
        if (body.audioPlaylist) {
          current.audioStatus = "playing";
        } else if (!current.audioStreamUrl) {
          current.audioStatus = "idle";
        }
      }

      // Atualização de Volume de Áudio Remoto
      if (body.audioVolume !== undefined) {
        current.audioVolume = Math.max(0, Math.min(100, Number(body.audioVolume)));
      }

      // Atualização de Modo de Repetição, Shuffle e Índice
      if (body.audioLoopMode !== undefined) current.audioLoopMode = body.audioLoopMode;
      if (body.audioShuffle !== undefined) current.audioShuffle = Boolean(body.audioShuffle);
      if (body.currentAudioIndex !== undefined) current.currentAudioIndex = Number(body.currentAudioIndex);

      // Standby / Blackout Virtual
      if (body.standby !== undefined) {
        current.standby = Boolean(body.standby);
      }

      // Atualização manual de status
      if (body.visualStatus !== undefined) current.visualStatus = body.visualStatus;
      if (body.audioStatus !== undefined) current.audioStatus = body.audioStatus;

      current.version = this.getNextVersion(room, current.version);
      current.updatedAt = Date.now();

      state[room] = current;

      // 1. Broadcast canônico com estado autoritativo e versão sequencial
      wsManager.broadcast(
        room,
        JSON.stringify({
          type: "updateState",
          state: current,
          version: current.version,
        })
      );

      // 2. Persiste no banco
      await db.saveRoomState(room, current);

      return current;
    });
  }

  /**
   * Processa comando de controle (`POST /api/control/:roomSlug`) na fila da sala.
   */
  public enqueueControl(room: string, body: { target: string; command: string; value?: any }) {
    return this.enqueue(room, async () => {
      const state = await db.getState();
      if (typeof state[room] === "string") {
        state[room] = { playlist: state[room], audioPlaylist: null };
      } else if (!state[room]) {
        state[room] = this.getDefaultRoomState(room);
      }

      const current = state[room];

      // Proteção contra avanço automático indevido (trackChanged) vindo de players:
      if (body.target === "audio" && body.command === "trackChanged") {
        if (current.audioStatus !== "playing") {
          return { ignored: true, reason: "Audio is not playing", state: current };
        }
        if (Number(body.value) === Number(current.currentAudioIndex || 0)) {
          return { ignored: true, reason: "Track already current", state: current };
        }
        const now = Date.now();
        const lastChange = this.lastAutoTrackChange.get(room) || 0;
        if (now - lastChange < 8000) {
          return { ignored: true, reason: "Rate limited auto trackChanged", state: current };
        }
        this.lastAutoTrackChange.set(room, now);
      }

      if (body.target === "site") {
        if (body.command === "reload") {
          wsManager.broadcast(room, JSON.stringify({ type: "reloadSite", version: current.version || 1 }));
          return { ignored: false, state: current };
        }
      } else if (body.target === "visual") {
        if (body.command === "play" || body.command === "next" || body.command === "prev") {
          current.visualStatus = "playing";
        } else if (body.command === "pause") {
          current.visualStatus = "paused";
        }
      } else if (body.target === "audio") {
        if (body.command === "play") {
          current.audioStatus = "playing";
        } else if (body.command === "next") {
          current.audioStatus = "playing";
          if (body.value !== undefined && !isNaN(Number(body.value))) {
            current.currentAudioIndex = Number(body.value);
          } else {
            const playlists = await db.getPlaylists();
            const pl = playlists.find((p: any) => p.id === current.audioPlaylist);
            const len = pl?.items?.length || 0;
            if (len > 0) {
              current.currentAudioIndex = ((current.currentAudioIndex || 0) + 1) % len;
            }
          }
          this.lastAutoTrackChange.set(room, Date.now());
        } else if (body.command === "prev") {
          current.audioStatus = "playing";
          if (body.value !== undefined && !isNaN(Number(body.value))) {
            current.currentAudioIndex = Number(body.value);
          } else {
            const playlists = await db.getPlaylists();
            const pl = playlists.find((p: any) => p.id === current.audioPlaylist);
            const len = pl?.items?.length || 0;
            if (len > 0) {
              const idx = current.currentAudioIndex || 0;
              current.currentAudioIndex = idx <= 0 ? len - 1 : idx - 1;
            }
          }
          this.lastAutoTrackChange.set(room, Date.now());
        } else if (body.command === "pause") {
          current.audioStatus = "paused";
        } else if (body.command === "setVolume") {
          current.audioVolume = Math.max(0, Math.min(100, Number(body.value ?? 0)));
        } else if (body.command === "setLoopMode") {
          current.audioLoopMode = body.value;
        } else if (body.command === "setShuffle") {
          current.audioShuffle = Boolean(body.value);
        } else if (body.command === "setTrackIndex") {
          current.currentAudioIndex = Number(body.value ?? 0);
          current.audioStatus = "playing";
          this.lastAutoTrackChange.set(room, Date.now());
        } else if (body.command === "trackChanged") {
          current.currentAudioIndex = Number(body.value ?? 0);
        }
      } else if (body.target === "room") {
        if (body.command === "setStandby") {
          current.standby = Boolean(body.value);
        }
      }

      current.version = this.getNextVersion(room, current.version);
      current.updatedAt = Date.now();
      state[room] = current;

      // 1. Broadcast atômico: envia tanto o comando quanto o estado autoritativo completo e versão do servidor
      wsManager.broadcast(
        room,
        JSON.stringify({
          type: "control",
          target: body.target,
          command: body.command,
          value: body.value,
          state: current,
          version: current.version,
        })
      );

      // 2. Persiste no banco em ordem estrita da fila
      await db.saveRoomState(room, current);

      return { ignored: false, state: current };
    });
  }
}

export const roomEventQueue = new RoomEventQueueManager();
