import { useState, useEffect, useCallback } from "react";
import { VERIFIED_GOSPEL_PRESETS } from "./constants";
import { API_BASE } from "./signage-api";

export interface SavedRadio {
  id: string;
  name: string;
  url: string;
  desc?: string;
  isCustom?: boolean;
  createdAt?: number;
}

const STORAGE_KEY = "pagliaro_saved_radios_v1";
const CHANGE_EVENT = "pagliaro:saved-radios-changed";

let serverSyncInitialized = false;
let isFetchingFromServer = false;

function getInitialPresets(): SavedRadio[] {
  return [];
}

export function getSavedRadios(): SavedRadio[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      return [];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Remove presets antigos pré-carregados (apenas rádios salvas pelo operador devem permanecer)
      const cleaned = parsed.filter(
        (r) => r && !String(r.id || "").startsWith("preset-") && r.isCustom !== false
      );
      if (cleaned.length !== parsed.length) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
      }
      return cleaned;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    return [];
  } catch (err) {
    console.error("Erro ao carregar rádios salvas:", err);
    return [];
  }
}

async function syncRadiosToServer(radios: SavedRadio[]) {
  try {
    await fetch(`${API_BASE}/api/radio/saved`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ radios }),
    });
  } catch (err) {
    console.warn("Aviso ao sincronizar rádios salvas com o servidor:", err);
  }
}

export async function fetchSavedRadiosFromServer(): Promise<SavedRadio[] | null> {
  if (typeof window === "undefined" || isFetchingFromServer) return null;
  isFetchingFromServer = true;
  try {
    const res = await fetch(`${API_BASE}/api/radio/saved?_t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && Array.isArray(data.radios)) {
      const cleaned = data.radios.filter(
        (r: any) => r && !String(r.id || "").startsWith("preset-") && r.isCustom !== false
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
      return cleaned;
    }
  } catch {
    // fallback para localStorage
  } finally {
    isFetchingFromServer = false;
  }
  return null;
}

export function resetSavedRadiosToDefaults(): SavedRadio[] {
  const presets = getInitialPresets();
  persistSavedRadios(presets, true);
  return presets;
}

function persistSavedRadios(radios: SavedRadio[], syncServer = true) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(radios));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
    if (syncServer) {
      syncRadiosToServer(radios);
    }
  } catch (err) {
    console.error("Erro ao salvar rádios:", err);
  }
}

export function saveRadio(item: { name: string; url: string; desc?: string; isCustom?: boolean }): SavedRadio {
  const cleanUrl = item.url.trim();
  const cleanName = item.name.trim() || "Nova Rádio";
  const radios = getSavedRadios();

  // Se já existe com essa URL, atualiza
  const existingIdx = radios.findIndex((r) => r.url.trim().toLowerCase() === cleanUrl.toLowerCase());
  if (existingIdx >= 0) {
    radios[existingIdx] = {
      ...radios[existingIdx],
      name: cleanName,
      desc: item.desc ?? radios[existingIdx].desc,
    };
    persistSavedRadios(radios, true);
    return radios[existingIdx];
  }

  const newRadio: SavedRadio = {
    id: `radio-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: cleanName,
    url: cleanUrl,
    desc: item.desc || "Rádio salva pelo operador",
    isCustom: item.isCustom ?? true,
    createdAt: Date.now(),
  };

  const updated = [newRadio, ...radios];
  persistSavedRadios(updated, true);
  return newRadio;
}

export function deleteSavedRadio(idOrUrl: string): boolean {
  const radios = getSavedRadios();
  const target = (idOrUrl || "").trim().toLowerCase();
  const filtered = radios.filter(
    (r) =>
      String(r.id || "").trim().toLowerCase() !== target &&
      String(r.url || "").trim().toLowerCase() !== target
  );
  if (filtered.length !== radios.length) {
    persistSavedRadios(filtered, true);
    return true;
  }
  return false;
}

export function isRadioSaved(url: string): boolean {
  if (!url) return false;
  const clean = url.trim().toLowerCase();
  const radios = getSavedRadios();
  return radios.some((r) => r.url.trim().toLowerCase() === clean);
}

export function useSavedRadios() {
  const [radios, setRadios] = useState<SavedRadio[]>(() => getSavedRadios());

  const refresh = useCallback(() => {
    setRadios(getSavedRadios());
  }, []);

  useEffect(() => {
    const handleCustomChange = () => refresh();
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) refresh();
    };

    window.addEventListener(CHANGE_EVENT, handleCustomChange);
    window.addEventListener("storage", handleStorageChange);

    // Sincroniza sempre com o banco do servidor ao abrir ou trocar de sala
    if (!serverSyncInitialized) {
      serverSyncInitialized = true;
      fetchSavedRadiosFromServer();
    } else {
      fetchSavedRadiosFromServer();
    }

    return () => {
      window.removeEventListener(CHANGE_EVENT, handleCustomChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [refresh]);

  const add = useCallback((item: { name: string; url: string; desc?: string; isCustom?: boolean }) => {
    const r = saveRadio(item);
    refresh();
    return r;
  }, [refresh]);

  const remove = useCallback((idOrUrl: string) => {
    const success = deleteSavedRadio(idOrUrl);
    refresh();
    return success;
  }, [refresh]);

  const checkSaved = useCallback((url: string) => {
    return isRadioSaved(url);
  }, []);

  const reset = useCallback(() => {
    resetSavedRadiosToDefaults();
    refresh();
  }, [refresh]);

  return {
    radios,
    saveRadio: add,
    deleteRadio: remove,
    resetToDefaults: reset,
    isSaved: checkSaved,
    refresh,
  };
}
