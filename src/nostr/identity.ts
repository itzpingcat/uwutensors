import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";

/**
 * Ephemeral-but-persisted local identity for publishing (requests, seeder
 * pings, torrent listings). Same idea as the original's getOrCreateUserKeys:
 * a throwaway key is generated once and stashed in localStorage so a user's
 * own submissions stay consistently attributed to the same pubkey across
 * a session, without requiring a NIP-07 extension.
 *
 * This is NOT the identity used for Web-of-Trust scoring — that requires
 * an actual signed-in NIP-07 signer with a real social graph (see
 * src/nostr/signer.ts, not yet wired). This local key has no followers
 * and is not meant to be trusted by anyone; it exists only so this user's
 * own publishes are self-consistent.
 */

const STORAGE_KEY = "uwutensors-local-nsec";
const LOGGED_OUT_KEY = "uwutensors-logged-out";

export interface LocalIdentity {
  privKey: Uint8Array;
  pubkeyHex: string;
  npub: string;
}

let cached: LocalIdentity | null = null;

export function getOrCreateLocalIdentity(): LocalIdentity {
  if (cached) return cached;

  let privKey: Uint8Array | null = null;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const decoded = nip19.decode(stored);
      if (decoded.type === "nsec") privKey = decoded.data;
    } catch {
      // fall through to generating a fresh key
    }
  }

  if (!privKey) {
    privKey = generateSecretKey();
    localStorage.setItem(STORAGE_KEY, nip19.nsecEncode(privKey));
  }

  const pubkeyHex = getPublicKey(privKey);
  cached = { privKey, pubkeyHex, npub: nip19.npubEncode(pubkeyHex) };
  return cached;
}

/**
 * "Logged in" here means the user has an active identity they've chosen to
 * use — either a NIP-07 extension signer, or the auto-generated local key
 * once they've explicitly acknowledged it (or just never logged out). There
 * is always a local key sitting in storage (getOrCreateLocalIdentity keeps
 * publishing/PoW working regardless), but the account UI treats the user as
 * "logged out" once they explicitly log out, until they log back in.
 */
export function isLoggedIn(): boolean {
  return localStorage.getItem(LOGGED_OUT_KEY) !== "1";
}

export function logOut(): void {
  localStorage.setItem(LOGGED_OUT_KEY, "1");
}

export function logIn(): void {
  localStorage.removeItem(LOGGED_OUT_KEY);
}

/** True if a NIP-07 browser extension signer (Alby, nos2x, etc.) is present. */
export function hasNip07(): boolean {
  return typeof window !== "undefined" && !!(window as unknown as { nostr?: unknown }).nostr;
}
