// Core domain types for UwUTensors.
//
// This mirrors the data model of the original waifu-magnet-22.html viewer
// (kind 30099 torrent listings, 30100 client announcements, 30102 seeder
// requests, 30103 model requests, 1985 NIP-32 labels) but typed, and with
// an explicit place for the HF cross-reference verification tier that the
// original file doesn't have.

export type NostrEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
};

export type UnsignedEvent = Omit<NostrEvent, "id" | "sig" | "pubkey"> & {
  pubkey?: string;
};

/** Nostr event kinds this app cares about. */
export const KIND = {
  METADATA: 0,
  TORRENT_LISTING: 30099,
  CLIENT_ANNOUNCE: 30100,
  SEEDER_REQUEST: 30102,
  MODEL_REQUEST: 30103,
  LABEL: 1985,
  BLOSSOM_AUTH: 24242,
  RELAY_LIST: 10002, // NIP-65
  BLOSSOM_SERVER_LIST: 10063,
  FOLLOW_LIST: 3, // NIP-02
  MUTE_LIST: 10000, // NIP-51 — the signed-in user's own block/mute list
} as const;

export type FileClass = "base" | "fine-tune" | "quant" | "n/a";
export type ModelKind = "base" | "fine-tune" | "n/a";
export type QuantType =
  | "gguf" | "mlx" | "awq" | "gptq" | "fp8" | "nvfp4" | "mxfp4" | "bnb" | "onnx" | "n/a";

/** Parsed, typed view of a kind 30099 event's tags. */
export interface TorrentListing {
  event: NostrEvent;
  infohash: string;
  magnet: string;
  name: string;
  totalSize: number;
  pieces?: number;
  pieceLength?: number;
  torrentSha256?: string;
  torrentSize?: number;
  torrentCreatedAt?: string;
  urls: string[]; // Blossom download URLs for the .torrent file
  webseeds: string[];
  trackers: string[];
  source?: string; // e.g. "huggingface.co/org/repo"

  // Enriched (optional) metadata
  displayName?: string;
  fileClass?: FileClass;
  modelKind?: ModelKind;
  quantType?: QuantType;
  quantDev?: string;
  quantDetail?: string;
  quantBpw?: number;
  lab?: string;
  modelName?: string;
  repoId?: string;
  baseModel?: string;
  subfolder?: string;
  torrentName?: string;
  createdAt?: string; // HF createdAt
  version?: string; // HF revision
  commitSha?: string;
}

export interface ClientAnnouncement {
  event: NostrEvent;
  version: number;
  sha256: string;
  size: number;
  urls: string[];
}

export interface SeederRequest {
  event: NostrEvent;
  torrentEventId: string;
  infohash: string;
  name?: string;
}

export interface ModelRequest {
  event: NostrEvent;
  name: string;
  links: string[];
  type: string;
  vram?: string;
}

/** Live per-infohash pump data, polled from the (optional) pump API. */
export interface PumpStatus {
  infohash: string;
  seeders: { percentDone: number }[];
  downloads: number;
}

/**
 * Unified seeder count for display, regardless of which source it came
 * from. "tracker" means a real BitTorrent WebSocket tracker was scraped
 * directly (decentralized — see src/lib/wsTracker.ts); "pump" means it
 * came from llama.garden's pump API (a single centralized fleet, not the
 * whole swarm); "none" means neither source had data. The UI shows this
 * source so a pump-derived count isn't presented as more authoritative
 * than it is.
 */
export interface SeederInfo {
  infohash: string;
  seeders: number;
  leechers?: number;
  source: "tracker" | "pump" | "none";
}

/** Parsed kind 0 profile metadata (NIP-01). Kept minimal — only what the UI uses. */
export interface ProfileMetadata {
  pubkey: string;
  name?: string;
  displayName?: string;
  picture?: string;
  nip05?: string;
  about?: string; // kind 0's bio/description field
  updatedAt: number; // event created_at, so a newer kind 0 replaces an older one
}

// ---------------------------------------------------------------------------
// Trust / verification model
// ---------------------------------------------------------------------------

/**
 * Result of the tier-0 check: does this listing's claimed HF source
 * (repoId + commitSha) actually match what HuggingFace serves, based on
 * a client-side hash comparison against downloaded bytes.
 *
 * This is NEVER derived from anything the publisher asserts — only from
 * (a) bytes the local client actually holds after download, and
 * (b) HF's own API response for the claimed repo/commit.
 */
export type HfVerificationStatus =
  | "unverified" // not checked yet / no local bytes to check
  | "verifying"
  | "match" // per-file hash matched HF's reported hash
  | "mismatch" // hash did not match — likely mislabeled or tampered
  | "no-hf-data" // repoId/commitSha missing, or HF has no record of this file
  | "error";

export interface FileVerification {
  filename: string;
  localSha256?: string;
  hfExpectedHash?: string;
  hfHashKind?: "lfs-sha256" | "git-blob-sha1";
  status: HfVerificationStatus;
}

/** Settings-driven filter pipeline. */
export interface FilterSettings {
  /** Tier 1: NIP-05 verified identity (username@domain). */
  requireNip05: boolean;
  /** Tier 2: Web of Trust — requires a signed-in identity with a follow list. */
  webOfTrust: {
    enabled: boolean;
    maxHops: 1 | 2;
    minScore: number;
  };
  /** Tier 3: anti-spam heuristics (PoW difficulty, metadata completeness, etc). */
  antiSpam: {
    enabled: boolean;
    minPowBits: number;
    threshold: number; // 0-100 composite score
  };
  /** Tier 4: user-editable allowlist of trusted pubkeys (hex). */
  allowlist: {
    enabled: boolean;
    pubkeys: string[];
  };
  /**
   * Three independent profile-completeness checks, each weak on its own
   * (trivial to fake — anyone can put anything in a kind 0) but combining
   * with the real tiers above to filter out the laziest throwaway
   * accounts, which very often skip profile setup entirely. Each is its
   * own tier for the threshold below — "has a name" and "has a picture"
   * are different, independently-toggleable signals, not one bundled
   * checkbox.
   */
  requireProfilePicture: boolean;
  requireProfileName: boolean;
  requireProfileDescription: boolean;
  /**
   * How multiple enabled (non-allowlist) tiers combine: a listing must
   * pass at least this many of the tiers that were actually evaluated
   * (enabled AND resolved — a skipped/unresolved tier doesn't count
   * toward either the total or the threshold). 1 behaves like the old
   * "ANY" mode; a threshold >= the number of enabled tiers behaves like
   * the old "ALL" mode. Always clamped to at least 1 at evaluation time,
   * since a threshold of 0 would trivially pass everything.
   */
  combineMinPass: number;
}

export interface RelaySettings {
  relays: string[];
}

export interface BlossomSettings {
  servers: string[];
}

export interface PumpSettings {
  enabled: boolean;
  apiUrl: string;
}

export interface AppSettings {
  filters: FilterSettings;
  relays: RelaySettings;
  blossom: BlossomSettings;
  pumps: PumpSettings;
}
