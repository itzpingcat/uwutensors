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

// getSharedRelayPool() returning non-null only means the RelayPool object
// has been constructed — not that any of its relays have finished their
// WebSocket handshake yet (see useNostrCatalog: `sharedPool = pool` happens
// synchronously, right when the pool is `new`'d, before any connection
// exists). So on a fresh page load, the pool is "ready" from
// waitForSharedPool()'s point of view almost immediately, but
// pool.fetchEvent() (nostr-tools' SimplePool.get) can then sit waiting on
// relays that are still connecting — and if a relay never sends EOSE (a
// dead relay, or one still mid-reconnect), get() has no timeout of its own
// and can hang indefinitely. That silent hang — not the pool being null —
// is why a profile fetch kicked off right on mount (as it is for the
// account avatar) would previously never resolve on a plain refresh, while
// logging in later in the session worked fine because relays were already
// warmed up by then. Wrapping the fetch in its own timeout, with a couple
// of retries against whatever relays have connected by then, fixes this
// without needing to detect "N relays are up" explicitly.
const FETCH_TIMEOUT_MS = 5000;
const FETCH_RETRIES = 3;
const FETCH_RETRY_DELAY_MS = 2000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    p.then((v) => {
      clearTimeout(timer);
      resolve(v);
    }).catch(() => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useProfile(pubkeyHex: string | null | undefined) {
  const setProfile = useCatalogStore((s) => s.setProfile);
  const profile = useCatalogStore((s) => (pubkeyHex ? s.profiles.get(pubkeyHex) : undefined));

  useEffect(() => {
    if (!pubkeyHex || profile) return; // already cached — no re-fetch
    let cancelled = false;

    (async () => {
      const pool = await waitForSharedPool();
      if (cancelled || !pool) return;

      for (let attempt = 0; attempt < FETCH_RETRIES; attempt++) {
        if (cancelled) return;
        const event = await withTimeout(
          pool.fetchEvent({ kinds: [KIND.METADATA], authors: [pubkeyHex] }),
          FETCH_TIMEOUT_MS
        );
        if (cancelled) return;
        if (event) {
          const parsed = parseProfileMetadata(event);
          if (parsed) setProfile(parsed);
          return;
        }
        // Timed out or no event yet (relays likely still connecting on a
        // fresh load) — wait a beat for more relays to come up, then retry.
        if (attempt < FETCH_RETRIES - 1) await delay(FETCH_RETRY_DELAY_MS);
      }
    })();

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
