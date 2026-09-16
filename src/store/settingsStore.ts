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
  addBlossomServer: (url: string) => void;
  removeBlossomServer: (url: string) => void;
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
//
// v1: relay/allowlist defaults, empty -> llama.garden's real values.
// v2: pump API default, empty/disabled -> llama.garden's real endpoint,
// enabled by default (same "additive, not critical" framing as the pump
// fleet — safe to enable by default since a failure here only affects
// the seeder/download counts on cards, not the catalog or downloads).
const SETTINGS_VERSION = 2;

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
      addBlossomServer: (url) =>
        set((s) => {
          if (s.settings.blossom.servers.includes(url)) return s;
          return {
            settings: {
              ...s.settings,
              blossom: { servers: [...s.settings.blossom.servers, url] },
            },
          };
        }),
      removeBlossomServer: (url) =>
        set((s) => ({
          settings: {
            ...s.settings,
            blossom: { servers: s.settings.blossom.servers.filter((b) => b !== url) },
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
            blossom: {
              servers: s.blossom?.servers?.length ? s.blossom.servers : DEFAULT_SETTINGS.blossom.servers,
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
            // Only fill in the pump API URL if it was never set (still
            // empty) — an empty apiUrl means "user never touched this",
            // since a user who set their own URL (or explicitly cleared
            // it) should keep that choice, not have it silently
            // overwritten by a version bump.
            pumps: {
              enabled: s.pumps?.apiUrl ? s.pumps.enabled : DEFAULT_SETTINGS.pumps.enabled,
              apiUrl: s.pumps?.apiUrl || DEFAULT_SETTINGS.pumps.apiUrl,
            },
          },
        };
      },
    }
  )
);
