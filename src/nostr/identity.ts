import { finalizeEvent, generateSecretKey, getPublicKey, nip19, type EventTemplate } from "nostr-tools";
import type { NostrEvent } from "../types";

/**
 * Ephemeral-but-persisted local identity for publishing (requests, seeder
 * pings, torrent listings). Same idea as the original's getOrCreateUserKeys:
 * a throwaway key is generated once and stashed in localStorage so a user's
 * own submissions stay consistently attributed to the same pubkey across
 * a session, without requiring a NIP-07 extension.
 *
 * This always exists and is always usable for signing (mining/publishing
 * never blocks on whether the user is "logged in") — it's the fallback
 * identity. A NIP-07 login (see below) is a separate, real identity with
 * its own pubkey and a real follow graph, used when present.
 */

const STORAGE_KEY = "uwutensors-local-nsec";
const LOGIN_MODE_KEY = "uwutensors-login-mode"; // "nip07" | "local" | absent (logged out)

export interface LocalIdentity {
  privKey: Uint8Array;
  pubkeyHex: string;
  npub: string;
  nsec: string;
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
  cached = { privKey, pubkeyHex, npub: nip19.npubEncode(pubkeyHex), nsec: nip19.nsecEncode(privKey) };
  return cached;
}

/** True if a NIP-07 browser extension signer (Alby, nos2x, etc.) is present. */
export function hasNip07(): boolean {
  return typeof window !== "undefined" && !!(window as unknown as { nostr?: unknown }).nostr;
}

function nip07(): { getPublicKey(): Promise<string>; signEvent(e: EventTemplate): Promise<NostrEvent> } | null {
  if (!hasNip07()) return null;
  return (window as unknown as { nostr: { getPublicKey(): Promise<string>; signEvent(e: EventTemplate): Promise<NostrEvent> } }).nostr;
}

export type LoginMode = "nip07" | "local" | "out";

export function getLoginMode(): LoginMode {
  const mode = localStorage.getItem(LOGIN_MODE_KEY);
  return mode === "nip07" || mode === "local" ? mode : "out";
}

export function isLoggedIn(): boolean {
  return getLoginMode() !== "out";
}

/**
 * Attempt to log in. Prefers a NIP-07 extension if one is present (asks it
 * for its pubkey — this is what actually pops the extension's own
 * permission prompt); falls back to the local generated key otherwise.
 * Throws if a NIP-07 extension is present but the user declines/it errors,
 * so the caller can show that failure rather than silently no-op'ing.
 */
export async function logIn(): Promise<{ mode: LoginMode; pubkeyHex: string }> {
  const ext = nip07();
  if (ext) {
    const pubkeyHex = await ext.getPublicKey(); // throws on decline
    localStorage.setItem(LOGIN_MODE_KEY, "nip07");
    return { mode: "nip07", pubkeyHex };
  }
  const identity = getOrCreateLocalIdentity();
  localStorage.setItem(LOGIN_MODE_KEY, "local");
  return { mode: "local", pubkeyHex: identity.pubkeyHex };
}

export function logOut(): void {
  localStorage.setItem(LOGIN_MODE_KEY, "out");
}

/** The pubkey of whichever identity is currently logged in, or null if logged out. */
export function getActivePubkey(): string | null {
  const mode = getLoginMode();
  if (mode === "out") return null;
  if (mode === "local") return getOrCreateLocalIdentity().pubkeyHex;
  // nip07: we don't cache the extension's pubkey (it can change out from
  // under us if the user switches accounts in the extension), so callers
  // needing it synchronously should use useActiveIdentity, which resolves
  // it async on login and keeps it in state.
  return null;
}

/**
 * Sign a finalized event template with whichever identity is active for
 * publishing. mineAndPublish calls this after PoW mining has already fixed
 * the nonce tag — NIP-07 extensions sign, they don't mine, so all mining
 * happens locally first regardless of login mode, and only the final sign
 * step is delegated to the extension.
 */
export async function signWithActiveIdentity(template: EventTemplate): Promise<NostrEvent> {
  const mode = getLoginMode();
  if (mode === "nip07") {
    const ext = nip07();
    if (!ext) throw new Error("NIP-07 extension not available for signing.");
    return ext.signEvent(template);
  }
  // "local" or "out" both fall back to the local key — logged-out users can
  // still publish (as an anonymous local identity), same as before login
  // existed as a concept.
  const identity = getOrCreateLocalIdentity();
  return finalizeEvent(template, identity.privKey) as NostrEvent;
}

/** The pubkey that will be used to sign the next published event. */
export async function getSigningPubkey(): Promise<string> {
  const mode = getLoginMode();
  if (mode === "nip07") {
    const ext = nip07();
    if (ext) return ext.getPublicKey();
  }
  return getOrCreateLocalIdentity().pubkeyHex;
}
