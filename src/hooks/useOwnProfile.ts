import { useEffect } from "react";
import { KIND } from "../types";
import { getSharedRelayPool } from "./useNostrCatalog";
import { parseProfileMetadata } from "../nostr/parse";
import { useCatalogStore } from "../store/catalogStore";

/**
 * One-shot fetch of the logged-in identity's own kind 0 metadata (name,
 * picture) so the account avatar can show a real profile picture instead
 * of the identicon placeholder, once one exists on the configured relays.
 * Re-fetches whenever the active pubkey changes (login/logout/switch).
 */
export function useOwnProfile(pubkeyHex: string | null) {
  const setProfile = useCatalogStore((s) => s.setProfile);

  useEffect(() => {
    if (!pubkeyHex) return;
    let cancelled = false;

    const pool = getSharedRelayPool();
    if (!pool) return;

    pool.fetchEvent({ kinds: [KIND.METADATA], authors: [pubkeyHex] }).then((event) => {
      if (cancelled || !event) return;
      const profile = parseProfileMetadata(event);
      if (profile) setProfile(profile);
    });

    return () => {
      cancelled = true;
    };
  }, [pubkeyHex, setProfile]);
}
