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
export function useProfile(pubkeyHex: string | null | undefined) {
  const setProfile = useCatalogStore((s) => s.setProfile);
  const profile = useCatalogStore((s) => (pubkeyHex ? s.profiles.get(pubkeyHex) : undefined));

  useEffect(() => {
    if (!pubkeyHex || profile) return; // already cached — no re-fetch
    let cancelled = false;

    const pool = getSharedRelayPool();
    if (!pool) return;

    pool.fetchEvent({ kinds: [KIND.METADATA], authors: [pubkeyHex] }).then((event) => {
      if (cancelled || !event) return;
      const parsed = parseProfileMetadata(event);
      if (parsed) setProfile(parsed);
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
