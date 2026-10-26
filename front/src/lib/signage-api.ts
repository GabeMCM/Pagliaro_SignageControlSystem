// API client for the Deno signage backend.
// Configure with VITE_API_BASE (defaults to http://localhost:8001).

export const API_BASE =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE) ||
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:8001");

export interface DeviceInfo {
  id: string;
  room: string;
  connectedAt: number;
  ip: string;
  userAgent: string;
  deviceLabel: string;
}

export interface Room {
  id?: string;
  name: string;
  slug: string;
  description?: string;
  defaultSiteUrl?: string;
  defaultAudioStreamUrl?: string;
  online?: boolean;
  clientsCount?: number;
  maxClients?: number;
}

export interface PlaylistItem {
  url: string;
  title?: string;
  type?: "video" | "image" | "youtube" | "audio" | "web";
  duration?: number;
  muted?: boolean;
  volume?: number;
}

export interface Playlist {
  id: string;
  name: string;
  type: "visual" | "audio";
  items: PlaylistItem[];
  loop?: boolean;
  loopMode?: "all" | "one" | "none";
  shuffle?: boolean;
}

export interface YoutubeTrackResult {
  id: string;
  title: string;
  author?: string;
  durationSeconds: number;
  durationFormatted: string;
  thumbnailUrl?: string;
  url: string;
}

export interface YoutubePlaylistResult {
  id: string;
  title: string;
  videoCount: number;
  videos: YoutubeTrackResult[];
}

export interface RoomState {
  playlist: string | null;
  audioPlaylist: string | null;
  audioStreamUrl?: string | null;
  siteUrl?: string | null;
  mode?: "playlist" | "site";
  visualStatus?: "playing" | "paused" | "idle";
  audioStatus?: "playing" | "paused" | "idle";
  audioVolume?: number;
  audioLoopMode?: "all" | "one" | "none";
  audioShuffle?: boolean;
  currentAudioIndex?: number;
  standby?: boolean;
  version?: number;
  updatedAt?: number;
}

export interface ScheduleTask {
  id: string;
  roomSlug: string;
  title: string;
  scheduledAt: string; // ISO ou "YYYY-MM-DDTHH:mm"
  enabled: boolean;
  executed?: boolean;
  executedAt?: number | null;
  createdAt?: number;
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

const request = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    let msg = `HTTP error! status: ${res.status}`;
    try {
      const errBody = await res.json();
      if (errBody && errBody.error) msg = errBody.error;
    } catch (_e) {}
    throw new Error(msg);
  }
  return res.json();
};

export const signageApi = {
  listRooms: () => request<Room[]>("/api/rooms"),
  createRoom: (room: Partial<Room>) =>
    request<{ success: boolean; room: Room }>("/api/rooms", {
      method: "POST",
      body: JSON.stringify(room),
    }),
  updateRoom: (id: string, updates: Partial<Room>) =>
    request<{ success: boolean; room: Room }>(`/api/rooms/${id}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    }),
  deleteRoom: (id: string) =>
    request<{ success: boolean }>(`/api/rooms/${id}`, { method: "DELETE" }),

  listPlaylists: () => request<Playlist[]>("/api/playlists"),
  createPlaylist: (data: {
    name: string;
    type: "visual" | "audio";
    items: PlaylistItem[];
    loop?: boolean;
    loopMode?: "all" | "one" | "none";
    shuffle?: boolean;
  }) =>
    request<{ success: boolean; playlist: Playlist }>("/api/playlists", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updatePlaylist: (
    id: string,
    data: {
      name: string;
      type: "visual" | "audio";
      items: PlaylistItem[];
      loop?: boolean;
      loopMode?: "all" | "one" | "none";
      shuffle?: boolean;
    }
  ) =>
    request<{ success: boolean; playlist: Playlist }>(`/api/playlists/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deletePlaylist: (id: string) =>
    request<{ success: boolean }>(`/api/playlists/${id}`, { method: "DELETE" }),

  getState: (slug: string) => request<RoomState>(`/api/state/${slug}`),
  setState: (
    slug: string,
    stateUpdate: {
      playlist?: string | null;
      audioPlaylist?: string | null;
      audioStreamUrl?: string | null;
      siteUrl?: string | null;
      mode?: "playlist" | "site";
      audioVolume?: number;
      audioLoopMode?: "all" | "one" | "none";
      audioShuffle?: boolean;
      currentAudioIndex?: number;
      visualStatus?: "playing" | "paused" | "idle";
      audioStatus?: "playing" | "paused" | "idle";
      standby?: boolean;
    }
  ) =>
    request<{ success: boolean; state: RoomState; version?: number }>(`/api/state/${slug}`, {
      method: "POST",
      body: JSON.stringify(stateUpdate),
    }),

  setStandby: (slug: string, standby: boolean) =>
    request<{ success: boolean; state: RoomState; version?: number }>(`/api/state/${slug}`, {
      method: "POST",
      body: JSON.stringify({ standby }),
    }),

  reloadRoom: (slug: string) =>
    request<{ success: boolean }>(`/api/reload/${slug}`, { method: "POST" }),
    
  sendCommand: (
    slug: string,
    target: "visual" | "audio" | "site" | "room",
    command: "play" | "pause" | "next" | "prev" | "reload" | "setVolume" | "setLoopMode" | "setShuffle" | "setTrackIndex" | "setStandby",
    value?: any
  ) =>
    request<{ success: boolean; state?: RoomState; version?: number }>(`/api/control/${slug}`, {
      method: "POST",
      body: JSON.stringify({ target, command, value }),
    }),

  setAudioVolume: (slug: string, value: number) =>
    request<{ success: boolean; state?: RoomState; version?: number }>(`/api/control/${slug}`, {
      method: "POST",
      body: JSON.stringify({ target: "audio", command: "setVolume", value }),
    }),

  setLoopMode: (slug: string, mode: "all" | "one" | "none") =>
    request<{ success: boolean; state?: RoomState; version?: number }>(`/api/control/${slug}`, {
      method: "POST",
      body: JSON.stringify({ target: "audio", command: "setLoopMode", value: mode }),
    }),

  setShuffle: (slug: string, shuffle: boolean) =>
    request<{ success: boolean; state?: RoomState; version?: number }>(`/api/control/${slug}`, {
      method: "POST",
      body: JSON.stringify({ target: "audio", command: "setShuffle", value: shuffle }),
    }),

  setTrackIndex: (slug: string, index: number) =>
    request<{ success: boolean; state?: RoomState; version?: number }>(`/api/control/${slug}`, {
      method: "POST",
      body: JSON.stringify({ target: "audio", command: "setTrackIndex", value: index }),
    }),

  reloadSite: (slug: string) =>
    request<{ success: boolean; state?: RoomState; version?: number }>(`/api/control/${slug}`, {
      method: "POST",
      body: JSON.stringify({ target: "site", command: "reload" }),
    }),

  getIp: () =>
    request<{
      ip: string;
      publicUrl?: string | null;
      db?: { driver: string; database: string };
    }>("/api/system/ip"),

  listMedia: () => request<string[]>("/api/media"),
  deleteMedia: (filename: string) =>
    request<{ success: boolean }>(`/api/media/${filename}`, { method: "DELETE" }),

  uploadMedia: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE}/api/media/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error("Upload falhou");
    return res.json() as Promise<{ success: boolean; filename: string }>;
  },

  listRoomDevices: (slug: string) =>
    request<{
      success: boolean;
      room: string;
      count: number;
      max: number;
      devices: DeviceInfo[];
    }>(`/api/rooms/${slug}/devices`),

  kickDevice: (slug: string, clientId?: string, reason?: string) =>
    request<{ success: boolean; message: string; count?: number }>(`/api/rooms/${slug}/kick`, {
      method: "POST",
      body: JSON.stringify({ clientId, reason }),
    }),

  searchYoutube: (query: string, limit = 15) =>
    request<{ success: boolean; results: YoutubeTrackResult[] }>(
      `/api/youtube/search?q=${encodeURIComponent(query)}&limit=${limit}`
    ),

  getYoutubePlaylist: (urlOrId: string) =>
    request<{ success: boolean; playlist: YoutubePlaylistResult }>(
      `/api/youtube/playlist?url=${encodeURIComponent(urlOrId)}`
    ),

  getYoutubeVideo: (urlOrId: string) =>
    request<{ success: boolean; video: YoutubeTrackResult }>(
      `/api/youtube/video?url=${encodeURIComponent(urlOrId)}`
    ),

  listSchedules: (roomSlug?: string) =>
    request<ScheduleTask[]>(roomSlug ? `/api/schedules?room=${encodeURIComponent(roomSlug)}` : `/api/schedules`),

  getSchedule: (id: string) =>
    request<ScheduleTask>(`/api/schedules/${id}`),

  createSchedule: (data: Partial<ScheduleTask>) =>
    request<{ success: boolean; schedule: ScheduleTask }>("/api/schedules", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateSchedule: (id: string, data: Partial<ScheduleTask>) =>
    request<{ success: boolean; schedule: ScheduleTask }>(`/api/schedules/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteSchedule: (id: string) =>
    request<{ success: boolean }>(`/api/schedules/${id}`, {
      method: "DELETE",
    }),

  toggleSchedule: (id: string) =>
    request<{ success: boolean; enabled: boolean; schedule: ScheduleTask }>(`/api/schedules/${id}/toggle`, {
      method: "POST",
    }),

  runScheduleNow: (id: string) =>
    request<{ success: boolean; message: string }>(`/api/schedules/${id}/run`, {
      method: "POST",
    }),
};
