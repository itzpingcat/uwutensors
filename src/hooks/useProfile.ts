import { useEffect } from "react";
import { KIND } from "../types";
import { getSharedRelayPool } from "./useNostrCatalog";
import { parseProfileMetadata } from "../nostr/parse";
import { useCatalogStore } from "../store/catalogStore";

/**
 * One-shot fetch of any pubkey's kind 0 metadata (name, picture), cached
 * in catalogStore.profiles so repeated lookups of the same pubkey (e.g.
 * the same submitter across many cards) don't re-fetch. Used both for the
 * account avatar (see useOwnProfile) and for showing "submitted by
 * <name>" in the torrent detail modal instead of a bare hex pubkey.
 */
// How long to keep retrying for the shared relay pool to exist before
// giving up on one fetch attempt. On a fresh page load this hook can run
// before useNostrCatalog's effect has created the pool (or before any
// relay in it has finished connecting) — without a retry, that single
// early getSharedRelayPool() === null check made the fetch silently never
// happen at all, which is why a profile picture (including your own
// account avatar) would vanish after a refresh until something else
// (like logging out and back in) re-ran this effect later, after the pool
// was finally up.
const POOL_WAIT_TIMEOUT_MS = 8000;
const POOL_WAIT_INTERVAL_MS = 250;

function waitForSharedPool(): Promise<ReturnType<typeof getSharedRelayPool>> {
  return new Promise((resolve) => {
    const pool = getSharedRelayPool();
    if (pool) {
      resolve(pool);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      const p = getSharedRelayPool();
      if (p || Date.now() - start > POOL_WAIT_TIMEOUT_MS) {
        clearInterval(interval);
        resolve(p);
      }
    }, POOL_WAIT_INTERVAL_MS);
  });
}

export function useProfile(pubkeyHex: string | null | undefined) {
  const setProfile = useCatalogStore((s) => s.setProfile);
  const profile = useCatalogStore((s) => (pubkeyHex ? s.profiles.get(pubkeyHex) : undefined));

  useEffect(() => {
    if (!pubkeyHex || profile) return; // already cached — no re-fetch
    let cancelled = false;

    waitForSharedPool().then((pool) => {
      if (cancelled || !pool) return;
      pool.fetchEvent({ kinds: [KIND.METADATA], authors: [pubkeyHex] }).then((event) => {
        if (cancelled || !event) return;
        const parsed = parseProfileMetadata(event);
        if (parsed) setProfile(parsed);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [pubkeyHex, profile, setProfile]);

  return profile;
}

/** Thin wrapper kept for the account-avatar callsite (App.tsx). */
export function useOwnProfile(pubkeyHex: string | null) {
  useProfile(pubkeyHex);
}
