import type { AppSettings } from "../types";

// These are DEFAULTS, not hardcoded trust roots. Everything here is
// user-editable from Settings and persisted to localStorage — see
// src/store/settingsStore.ts. Nothing in the app is allowed to treat these
// as authoritative the way waifu-magnet-22.html's `const NPUBS` was.

export const APP_VERSION = "0.1.0";

/** Bootstrap relay set — just enough to find people's NIP-65 relay lists. */
export const DEFAULT_RELAYS: string[] = [
  "wss://nos.lol/",
  "wss://relay.primal.net/",
  "wss://nostr.mom/",
  "wss://relay.damus.io/",
  "wss://offchain.pub",
];

/** Bootstrap Blossom servers for fetching/uploading .torrent files. */
export const DEFAULT_BLOSSOM_SERVERS: string[] = [
  "https://nostr.download",
  "https://blossom.primal.net",
  "https://cdn.hzrd149.com",
];

/**
 * Optional seed curators for the allowlist tier — equivalent in spirit to
 * llama.garden's two hardcoded NPUBS, but here they're just a starting
 * allowlist entry the user can remove in Settings > Filtering > Allowlist.
 * Empty by default: ship with no baked-in trust root, let the user add
 * their own or import a curator's list.
 */
export const DEFAULT_ALLOWLIST_PUBKEYS: string[] = [];

export const DEFAULT_PUMPS_API_URL = "";

export const DEFAULT_SETTINGS: AppSettings = {
  filters: {
    hfVerification: {
      enabled: true,
      requireVerifiable: false,
    },
    requireNip05: false,
    webOfTrust: {
      enabled: false,
      maxHops: 1,
      minScore: 1,
    },
    antiSpam: {
      enabled: true,
      minPowBits: 8,
      threshold: 40,
    },
    allowlist: {
      enabled: true,
      pubkeys: DEFAULT_ALLOWLIST_PUBKEYS,
    },
    combineMode: "any",
  },
  relays: {
    relays: DEFAULT_RELAYS,
  },
  blossom: {
    servers: DEFAULT_BLOSSOM_SERVERS,
  },
  pumps: {
    enabled: false,
    apiUrl: DEFAULT_PUMPS_API_URL,
  },
};
