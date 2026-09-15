import type { AppSettings } from "../types";

// These are DEFAULTS, not hardcoded trust roots. Everything here is
// user-editable from Settings and persisted to localStorage — see
// src/store/settingsStore.ts. Nothing in the app is allowed to treat these
// as authoritative the way waifu-magnet-22.html's `const NPUBS` was.

export const APP_VERSION = "0.1.0";

/**
 * Default relay set — llama.garden's own relay list (from waifu-magnet-22.html
 * / relays.txt), so this app works with real data out of the box. Still
 * fully user-editable in Settings — this is a starting point, not a fixed
 * trust root; see the "critical vs. non-critical infrastructure" framing
 * in the project notes. If all of these become unreachable, the user can
 * add a different relay in Settings with no code change required.
 */
export const DEFAULT_RELAYS: string[] = [
  "wss://nos.lol/",
  "wss://relay.damus.io/",
  "wss://relay.primal.net/",
  "wss://nostr-01.yakihonne.com/",
  "wss://nostr.mom/",
  "wss://relay.mostr.pub",
  "wss://no.str.cr",
  "wss://offchain.pub",
];

/** Bootstrap Blossom servers for fetching/uploading .torrent files. */
export const DEFAULT_BLOSSOM_SERVERS: string[] = [
  "https://nostr.download",
  "https://blossom.primal.net",
  "https://cdn.hzrd149.com",
];

/**
 * Default allowlist — llama.garden's two curator npubs (hex-decoded), so
 * the catalog isn't empty on first load. Unlike the original's hardcoded
 * `const NPUBS`, this is just a starting value in Settings > Filtering >
 * Allowlist: the user can remove, replace, or clear it entirely (an empty
 * allowlist means the tier is not enforced — see filterPipeline.ts), and
 * doing so requires no rebuild, unlike editing NPUBS in the original HTML.
 *
 *   npub1zyal4wt4f86rlgxwjzkmdmcr70ejee66z7crfmy5dpxyentzc0zsspedcr
 *   npub1wajfudpyx3xudgrglj8jjfjnxmvyk2u0j3yknpsfss6z04rgcdqs7g50e5
 */
export const DEFAULT_ALLOWLIST_PUBKEYS: string[] = [
  "113bfab97549f43fa0ce90adb6ef03f3f32ce75a17b034ec94684c4ccd62c3c5",
  "77649e3424344dc6a068fc8f29265336d84b2b8f9449698609843427d468c341",
];

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
