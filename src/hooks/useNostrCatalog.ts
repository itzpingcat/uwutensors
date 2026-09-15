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
 */
export function useNostrCatalog() {
  const relays = useSettingsStore((s) => s.settings.relays.relays);
  const poolRef = useRef<RelayPool | null>(null);

  useEffect(() => {
    const store = useCatalogStore.getState();
    store.setRelayCounts(0, relays.length);

    const pool = new RelayPool(relays, (connected, total) => {
      useCatalogStore.getState().setRelayCounts(connected, total);
    });
    poolRef.current = pool;

    const unsubscribe = pool.subscribe(
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
      unsubscribe();
      pool.close();
    };
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
