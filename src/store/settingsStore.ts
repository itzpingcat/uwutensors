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
// v3: added filters.requireProfileBasics (new field, defaults to false —
// this bump exists mainly for clarity/documentation, since a genuinely
// missing boolean field on old persisted state is already undefined,
// which behaves identically to false everywhere it's read).
// v4: changed the *default* recommended filter set (requireNip05 and
// requireProfileBasics now default to true, alongside the pre-existing
// allowlist-enabled default) to match what a fresh install should ship
// with. This only affects state that still matches the OLD defaults
// exactly (i.e. an install nobody has customized yet) — see the migrate
// logic below; anyone who already changed a filter setting keeps their
// own choice untouched.
// v5: combineMode ("any"|"all") replaced with combineMinPass (a plain
// "must pass at least N of the evaluated tiers" threshold — "any" was
// threshold 1, "all" doesn't have a fixed N since it depends on how many
// tiers end up enabled/resolved, so it's approximated as a high threshold
// that evaluateListing then clamps down to however many tiers actually
// evaluated). requireProfileBasics (one bundled "picture AND name" check)
// split into three independent checks: requireProfilePicture,
// requireProfileName (both keep requireProfileBasics's old value, so a
// bundled requirement stays equally strict after the split), and the new
// requireProfileDescription (defaults to off — nobody asked for this
// before it existed, so there's no old value to carry forward).
const SETTINGS_VERSION = 5;

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
        // The persisted shape may still carry pre-v5 fields (combineMode,
        // requireProfileBasics) that no longer exist on FilterSettings —
        // read it loosely rather than typed as the current AppSettings.
        const state = persisted as { settings: Record<string, any> } | undefined;
        if (!state?.settings) return { settings: DEFAULT_SETTINGS };
        const s = state.settings;
        const oldFilters = (s.filters ?? {}) as Record<string, any>;
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
              ...oldFilters,
              allowlist: {
                ...oldFilters.allowlist,
                pubkeys: oldFilters.allowlist?.pubkeys?.length
                  ? oldFilters.allowlist.pubkeys
                  : DEFAULT_SETTINGS.filters.allowlist.pubkeys,
              },
              // v3->v4: requireNip05 previously defaulted to false; the
              // new recommended default is true. A persisted boolean can't
              // be told apart from "still on the old default" vs.
              // "explicitly chosen" — same limitation as every earlier
              // default-bump migration here — so this forces it to true
              // for everyone once, as a one-time reset onto the new
              // recommended default, not a repeated override.
              requireNip05: true,
              // v4->v5: requireProfileBasics (bundled picture+name) split
              // into independent checks. Its old value (if present) carries
              // forward as equally strict for both; a fresh/never-migrated
              // install has no old value, so both default true per the
              // same v3->v4 reasoning above. requireProfileDescription is
              // brand new — no prior value to carry forward, defaults off.
              requireProfilePicture: oldFilters.requireProfileBasics ?? true,
              requireProfileName: oldFilters.requireProfileBasics ?? true,
              requireProfileDescription: oldFilters.requireProfileDescription ?? false,
              // v4->v5: combineMode ("any"|"all") -> combineMinPass (N).
              // "any" was threshold 1; "all" had no fixed N, so it's
              // approximated with a high threshold that evaluateListing
              // clamps down to however many tiers are actually enabled —
              // functionally identical to the old "all" behavior.
              combineMinPass:
                oldFilters.combineMinPass ?? (oldFilters.combineMode === "all" ? 99 : 1),
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
      // zustand's default merge is a SHALLOW `{...currentState,
      // ...persistedState}` — fine for top-level keys, but `settings` is
      // one big nested object, so a shallow merge would replace the
      // entire `settings` tree with whatever came back from
      // migrate/localStorage, silently dropping any field the persisted
      // blob doesn't have (e.g. a key added after that blob was last
      // saved, before its own version bump lands). This does a proper
      // nested merge instead, layering persisted values over
      // DEFAULT_SETTINGS field-by-field so a missing/malformed nested
      // field falls back to its default instead of becoming undefined.
      merge: (persisted, current) => {
        const p = (persisted as { settings?: Partial<AppSettings> } | undefined)?.settings ?? {};
        return {
          ...current,
          settings: {
            filters: { ...DEFAULT_SETTINGS.filters, ...p.filters },
            relays: { ...DEFAULT_SETTINGS.relays, ...p.relays },
            blossom: { ...DEFAULT_SETTINGS.blossom, ...p.blossom },
            pumps: { ...DEFAULT_SETTINGS.pumps, ...p.pumps },
          },
        };
      },
    }
  )
);
