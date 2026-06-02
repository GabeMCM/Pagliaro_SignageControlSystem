// API client for the Deno signage backend.
// Configure with VITE_API_BASE (defaults to http://localhost:8000).

export const API_BASE =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE) ||
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:8000");

export interface Room {
  id?: string;
  name: string;
  slug: string;
  description?: string;
  online?: boolean;
}

export interface PlaylistItem {
  url: string;
  type?: "video" | "image" | "youtube" | "audio";
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
}

export interface RoomState {
  playlist: string | null;
  audioPlaylist: string | null;
  visualStatus?: "playing" | "paused";
  audioStatus?: "playing" | "paused";
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
    } catch (e) {}
    throw new Error(msg);
  }
  return res.json();
};

export const signageApi = {
  listRooms: () => request<Room[]>("/api/rooms"),
  createRoom: (room: Partial<Room>) =>
    request<Room>("/api/rooms", {
      method: "POST",
      body: JSON.stringify(room),
    }),
  updateRoom: (id: string, updates: Partial<Room>) =>
    request<Room>(`/api/rooms/${id}`, {
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
    loop: boolean;
  }) =>
    request<Playlist>("/api/playlists", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updatePlaylist: (
    id: string,
    data: {
      name: string;
      type: "visual" | "audio";
      items: PlaylistItem[];
      loop: boolean;
    }
  ) =>
    request<Playlist>(`/api/playlists/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getState: (slug: string) => request<RoomState>(`/api/state/${slug}`),
  setState: (slug: string, stateUpdate: { playlist?: string | null; audioPlaylist?: string | null }) =>
    request<RoomState>(`/api/state/${slug}`, {
      method: "POST",
      body: JSON.stringify(stateUpdate),
    }),

  reloadRoom: (slug: string) =>
    request<{ success: boolean }>(`/api/reload/${slug}`, { method: "POST" }),
    
  sendCommand: (slug: string, target: "visual" | "audio", command: "play" | "pause" | "next" | "prev") =>
    request<{ success: boolean }>(`/api/control/${slug}`, {
      method: "POST",
      body: JSON.stringify({ target, command }),
    }),

  deletePlaylist: (id: string) => request(`/api/playlists/${id}`, { method: "DELETE" }),
  getIp: () => request<{ ip: string }>("/api/system/ip"),

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
};
