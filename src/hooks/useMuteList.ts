import { useEffect } from "react";
import { KIND } from "../types";
import { getSharedRelayPool } from "./useNostrCatalog";
import { parseMuteList } from "../nostr/parse";
import { useCatalogStore } from "../store/catalogStore";
import { getSigningPubkey, isLoggedIn } from "../nostr/identity";

/**
 * Fetches the signed-in user's own NIP-51 mute list (kind 10000) and keeps
 * catalogStore.mutedPubkeys in sync with it. This is deliberately NOT a
 * settings toggle like the trust-tier filters — a block is a decision the
 * user already made about a specific person elsewhere (in this app or any
 * other Nostr client sharing their mute list), so it's enforced
 * unconditionally whenever signed in, the same way muting someone on any
 * social platform doesn't come with an "ignore my mutes" checkbox.
 *
 * Re-fetches whenever the signed-in pubkey changes (login/logout/switch),
 * and clears the mute set on logout rather than leaving a stale list
 * enforced for whoever's browsing anonymously after.
 */
const POLL_INTERVAL_MS = 60_000; // mute lists can change in another client; poll occasionally rather than only once per session

/**
 * `loggedIn` is passed in explicitly (rather than read via isLoggedIn()
 * inside the effect) because isLoggedIn() isn't itself reactive — same
 * reasoning as useOwnProfile(loggedIn ? activePubkey : null) in App.tsx,
 * which this hook is called alongside. Without it, logging in or out
 * wouldn't re-trigger the fetch/clear until something unrelated happened
 * to remount the component.
 */
export function useMuteList(loggedIn: boolean) {
  const setMutedPubkeys = useCatalogStore((s) => s.setMutedPubkeys);

  useEffect(() => {
    if (!loggedIn) {
      setMutedPubkeys(new Set());
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function fetchOnce() {
      if (!isLoggedIn()) return;
      const pubkey = await getSigningPubkey();
      if (cancelled || !pubkey) return;

      const pool = getSharedRelayPool();
      if (!pool) return; // not up yet — next poll tick will retry

      const event = await pool.fetchEvent({ kinds: [KIND.MUTE_LIST], authors: [pubkey] });
      if (cancelled || !event) return;
      setMutedPubkeys(parseMuteList(event));
    }

    fetchOnce();
    timer = setInterval(fetchOnce, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [loggedIn, setMutedPubkeys]);
}
