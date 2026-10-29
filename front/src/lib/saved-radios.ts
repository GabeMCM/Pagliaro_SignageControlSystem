import { useState, useEffect, useCallback } from "react";
import { VERIFIED_GOSPEL_PRESETS } from "./constants";

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

function getInitialPresets(): SavedRadio[] {
  return VERIFIED_GOSPEL_PRESETS.map((p, idx) => ({
    id: `preset-${idx}-${p.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
    name: p.name,
    url: p.url,
    desc: p.desc,
    isCustom: false,
    createdAt: 1700000000000 + idx,
  }));
}

export function getSavedRadios(): SavedRadio[] {
  if (typeof window === "undefined") return getInitialPresets();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      const presets = getInitialPresets();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
      return presets;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    const presets = getInitialPresets();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    return presets;
  } catch (err) {
    console.error("Erro ao carregar rádios salvas:", err);
    return getInitialPresets();
  }
}

export function resetSavedRadiosToDefaults(): SavedRadio[] {
  const presets = getInitialPresets();
  persistSavedRadios(presets);
  return presets;
}

function persistSavedRadios(radios: SavedRadio[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(radios));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch (err) {
    console.error("Erro ao salvar rádios no localStorage:", err);
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
    persistSavedRadios(radios);
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
  persistSavedRadios(updated);
  return newRadio;
}

export function deleteSavedRadio(idOrUrl: string): boolean {
  const radios = getSavedRadios();
  const filtered = radios.filter(
    (r) => r.id !== idOrUrl && r.url.trim().toLowerCase() !== idOrUrl.trim().toLowerCase()
  );
  if (filtered.length !== radios.length) {
    persistSavedRadios(filtered);
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
