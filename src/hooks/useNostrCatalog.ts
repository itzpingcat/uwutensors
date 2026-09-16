import { useEffect, useRef } from "react";
import { KIND, type NostrEvent } from "../types";
import { RelayPool } from "../nostr/relayPool";
import {
  parseApprovalLabel,
  parseClientAnnouncement,
  parseModelRequest,
  parseSeederRequest,
  parseTorrentListing,
} from "../nostr/parse";
import { useCatalogStore } from "../store/catalogStore";
import { useSettingsStore } from "../store/settingsStore";

const LABEL_NAMESPACE = "llama.garden"; // kept for compat with existing curators' labels

/**
 * Subscribes to the configured relays for all catalog-relevant event kinds
 * and streams parsed results into the catalog store. Signature verification
 * happens inside nostr-tools before onEvent ever fires (see relayPool.ts) —
 * there is no unverified "trust mode" fallback here, unlike the original.
 *
 * Deliberately does NOT filter by author here. Filtering by trust tier
 * (allowlist/WoT/NIP-05/anti-spam) happens downstream in the filter
 * pipeline against every event's pubkey, so the allowlist can be edited
 * live in Settings without reopening subscriptions.
 *
 * The pool is created exactly once (empty dep array) and its relay set is
 * updated in place via pool.setRelays() when settings change, instead of
 * being torn down and recreated on every relay-list change. Recreating the
 * pool on each change was the cause of the "connects to 5, then resets to
 * 0" glitch: React StrictMode's mount->cleanup->mount double-invoke (dev
 * only) and the settings store's async localStorage rehydration (dev and
 * prod) both fire this effect a second time shortly after first mount, and
 * a naive [relays] dependency recreated the WebSocket connections from
 * scratch each time, visibly resetting the connected count to 0 mid-flight.
 */
export function useNostrCatalog() {
  const poolRef = useRef<RelayPool | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const relays = useSettingsStore((s) => s.settings.relays.relays);

  // Mount/unmount exactly once. Relay changes are applied to the existing
  // pool below, not by re-running this effect.
  useEffect(() => {
    const initialRelays = useSettingsStore.getState().settings.relays.relays;
    useCatalogStore.getState().setRelayCounts(0, initialRelays.length);

    const pool = new RelayPool(initialRelays, (connected, total, status) => {
      useCatalogStore.getState().setRelayCounts(connected, total);
      useCatalogStore.getState().setRelayStatus(status);
    });
    poolRef.current = pool;

    unsubscribeRef.current = pool.subscribe(
      {
        kinds: [
          KIND.TORRENT_LISTING,
          KIND.CLIENT_ANNOUNCE,
          KIND.SEEDER_REQUEST,
          KIND.MODEL_REQUEST,
          KIND.LABEL,
        ],
      },
      (event: NostrEvent) => handleEvent(event)
    );

    return () => {
      unsubscribeRef.current?.();
      pool.close();
      poolRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply relay-list changes to the already-running pool in place, so a
  // settings edit (or a delayed persisted-store rehydration) adjusts which
  // relays are connected without dropping and re-establishing every
  // existing connection.
  useEffect(() => {
    poolRef.current?.setRelays(relays);
    useCatalogStore.getState().setRelayCounts(poolRef.current?.getConnectedCount() ?? 0, relays.length);
    useCatalogStore.getState().setRelayStatus(poolRef.current?.getRelayStatus() ?? new Map());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relays.join(",")]);
}

function handleEvent(event: NostrEvent) {
  const store = useCatalogStore.getState();

  switch (event.kind) {
    case KIND.TORRENT_LISTING: {
      const listing = parseTorrentListing(event);
      if (listing) store.upsertListing(listing);
      break;
    }
    case KIND.CLIENT_ANNOUNCE: {
      const ann = parseClientAnnouncement(event);
      if (ann) store.setClientAnnouncement(ann);
      break;
    }
    case KIND.SEEDER_REQUEST: {
      const req = parseSeederRequest(event);
      if (req) store.addSeederRequest(req);
      break;
    }
    case KIND.MODEL_REQUEST: {
      const req = parseModelRequest(event);
      if (req) store.addModelRequest(req);
      break;
    }
    case KIND.LABEL: {
      for (const id of parseApprovalLabel(event, LABEL_NAMESPACE)) {
        store.addApprovedId(id);
      }
      break;
    }
  }
}
