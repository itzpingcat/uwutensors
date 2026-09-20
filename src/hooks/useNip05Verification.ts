import { useEffect, useRef } from "react";
import type { TorrentListing } from "../types";
import { getSharedRelayPool } from "./useNostrCatalog";
import { parseProfileMetadata } from "../nostr/parse";
import { verifyNip05 } from "../lib/nip05";
import { useCatalogStore } from "../store/catalogStore";
import { KIND } from "../types";

const CONCURRENCY = 3; // NIP-05 checks are two network round-trips each (profile fetch + HTTP fetch) — keep this modest
const PROFILE_FETCH_TIMEOUT_MS = 5000;

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

/**
 * Resolves and verifies NIP-05 for every listing author we haven't already
 * checked, writing the pass/fail result into catalogStore.nip05Verified.
 * This is what the "Require NIP-05 verified publishers" filter actually
 * reads (see filterPipeline.ts's checkNip05 / ListingTrustContext.nip05Verified) —
 * before this hook existed, nothing ever populated that value, so the
 * filter always saw it as "not resolved yet" and silently skipped every
 * listing, regardless of whether its author had a real NIP-05 or none at
 * all. Runs over ALL listings (not just currently-visible ones), since
 * visibility for this tier depends on the very result being computed here.
 *
 * Two steps per unverified pubkey: fetch their kind 0 (for the claimed
 * `nip05` field, reusing catalogStore.profiles as a cache the same way
 * useProfile does), then actually resolve https://domain/.well-known/
 * nostr.json and compare pubkeys. An author with no nip05 field at all is
 * recorded as `false` (not verified) rather than left unresolved, so the
 * filter can actually exclude them instead of skipping forever.
 */
export function useNip05Verification(listings: TorrentListing[]) {
  const profiles = useCatalogStore((s) => s.profiles);
  const setProfile = useCatalogStore((s) => s.setProfile);
  const nip05Verified = useCatalogStore((s) => s.nip05Verified);
  const setNip05Verified = useCatalogStore((s) => s.setNip05Verified);
  const inFlightRef = useRef<Set<string>>(new Set());

  const authorPubkeys = Array.from(new Set(listings.map((l) => l.event.pubkey)));

  useEffect(() => {
    let cancelled = false;

    const candidates = authorPubkeys.filter(
      (pk) => !nip05Verified.has(pk) && !inFlightRef.current.has(pk)
    );

    let idx = 0;
    async function worker() {
      while (!cancelled && idx < candidates.length) {
        const pubkey = candidates[idx++];
        inFlightRef.current.add(pubkey);
        try {
          let profile = profiles.get(pubkey);
          if (!profile) {
            const pool = getSharedRelayPool();
            if (!pool) {
              // No shared pool yet (still mounting) — this author's
              // pubkey is left off nip05Verified so a later run (once the
              // pool exists) can pick it back up, rather than being
              // wrongly recorded as verified-false forever. It correctly
              // stays "skipped" for this pass, same as before — the
              // actual bug this fixes is every OTHER continue below,
              // which used to also silently skip instead of recording a
              // real failure.
              continue;
            }
            // withTimeout matters here, not just for latency: pool.fetchEvent
            // (nostr-tools' SimplePool.get) can hang indefinitely on a relay
            // that never sends EOSE, and with only CONCURRENCY workers each
            // hang permanently starves verification for every author queued
            // behind it (same class of bug useProfile.ts documents for its
            // own fetches).
            const event = await withTimeout(
              pool.fetchEvent({ kinds: [KIND.METADATA], authors: [pubkey] }),
              PROFILE_FETCH_TIMEOUT_MS
            );
            if (cancelled) return;
            if (event) {
              const parsed = parseProfileMetadata(event);
              if (parsed) {
                setProfile(parsed);
                profile = parsed;
              }
            }
          }

          // No profile at all (never published kind 0, or the fetch timed
          // out/found nothing) and no nip05 field on a profile that does
          // exist both mean the same thing for this filter: there is no
          // verifiable identifier, so this author fails NIP-05 — this
          // must always resolve to `false`, never silently skip, or an
          // author with no profile at all (extremely common) passes the
          // "Require NIP-05" filter for free, which is backwards.
          if (!profile?.nip05) {
            if (!cancelled) setNip05Verified(pubkey, false);
            continue;
          }

          const verified = await verifyNip05(profile.nip05, pubkey);
          if (!cancelled) setNip05Verified(pubkey, verified);
        } catch {
          // A per-author failure must not kill this worker loop (it would
          // reject Promise.all with no handler and leave every later
          // candidate never verified) — treat it the same as a fetch
          // failure: this author just stays unresolved this pass.
        } finally {
          inFlightRef.current.delete(pubkey);
        }
      }
    }

    const workers = Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, () => worker());
    // Workers can no longer reject (try/catch above), but keep the catch so
    // an unexpected throw still isn't an unhandled rejection.
    Promise.all(workers).catch(() => undefined);

    return () => {
      cancelled = true;
    };
    // Re-run when the set of authors changes, not on every listings
    // re-render (listing objects change identity on every upsert, author
    // pubkey membership doesn't).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorPubkeys.join(","), profiles, nip05Verified, setProfile, setNip05Verified]);
}
