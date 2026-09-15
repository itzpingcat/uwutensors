import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppSettings } from "../types";
import { DEFAULT_SETTINGS } from "../lib/defaults";

interface SettingsState {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  updateFilters: (patch: Partial<AppSettings["filters"]>) => void;
  addAllowlistPubkey: (pubkeyHex: string) => void;
  removeAllowlistPubkey: (pubkeyHex: string) => void;
  addRelay: (url: string) => void;
  removeRelay: (url: string) => void;
  resetToDefaults: () => void;
}

// Persisted to localStorage — this is deliberate: filter/relay/allowlist
// config is per-user state that should survive reloads, unlike the
// original HTML viewer which held everything in-memory only.
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      update: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),
      updateFilters: (patch) =>
        set((s) => ({
          settings: { ...s.settings, filters: { ...s.settings.filters, ...patch } },
        })),
      addAllowlistPubkey: (pubkeyHex) =>
        set((s) => {
          const pubkeys = s.settings.filters.allowlist.pubkeys;
          if (pubkeys.includes(pubkeyHex)) return s;
          return {
            settings: {
              ...s.settings,
              filters: {
                ...s.settings.filters,
                allowlist: {
                  ...s.settings.filters.allowlist,
                  pubkeys: [...pubkeys, pubkeyHex],
                },
              },
            },
          };
        }),
      removeAllowlistPubkey: (pubkeyHex) =>
        set((s) => ({
          settings: {
            ...s.settings,
            filters: {
              ...s.settings.filters,
              allowlist: {
                ...s.settings.filters.allowlist,
                pubkeys: s.settings.filters.allowlist.pubkeys.filter((p) => p !== pubkeyHex),
              },
            },
          },
        })),
      addRelay: (url) =>
        set((s) => {
          if (s.settings.relays.relays.includes(url)) return s;
          return {
            settings: {
              ...s.settings,
              relays: { relays: [...s.settings.relays.relays, url] },
            },
          };
        }),
      removeRelay: (url) =>
        set((s) => ({
          settings: {
            ...s.settings,
            relays: { relays: s.settings.relays.relays.filter((r) => r !== url) },
          },
        })),
      resetToDefaults: () => set({ settings: DEFAULT_SETTINGS }),
    }),
    { name: "uwutensors-settings" }
  )
);
