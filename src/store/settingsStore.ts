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
//
// `version` + `migrate` matter here: early builds persisted an empty
// allowlist/relay default before llama.garden's real relays/curators were
// added as defaults. Without a version bump, persist() silently keeps
// loading that stale empty state forever and the new defaults never take
// effect for anyone who already had the app open. Bumping SETTINGS_VERSION
// forces exactly one migration for existing installs.
const SETTINGS_VERSION = 1;

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
    {
      name: "uwutensors-settings",
      version: SETTINGS_VERSION,
      // Version 0 (unversioned) -> 1: relay/allowlist defaults changed from
      // empty to llama.garden's real values. Anyone still on an untouched
      // empty allowlist/relay set (i.e. they never customized it) gets
      // migrated onto the new defaults; anyone who already added their own
      // entries keeps them untouched.
      migrate: (persisted) => {
        const state = persisted as { settings: AppSettings } | undefined;
        if (!state?.settings) return { settings: DEFAULT_SETTINGS };
        const s = state.settings;
        return {
          settings: {
            ...s,
            relays: {
              relays: s.relays?.relays?.length ? s.relays.relays : DEFAULT_SETTINGS.relays.relays,
            },
            filters: {
              ...s.filters,
              allowlist: {
                ...s.filters?.allowlist,
                pubkeys: s.filters?.allowlist?.pubkeys?.length
                  ? s.filters.allowlist.pubkeys
                  : DEFAULT_SETTINGS.filters.allowlist.pubkeys,
              },
            },
          },
        };
      },
    }
  )
);
