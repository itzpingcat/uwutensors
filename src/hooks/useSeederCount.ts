import { useEffect, useRef } from "react";
import type { TorrentListing } from "../types";
import { scrapeWsTrackers } from "../lib/wsTracker";
import { useCatalogStore } from "../store/catalogStore";

const CACHE_TTL_MS = 5 * 60_000; // trackers are cheap to re-ask and change faster than pump data — 5 min, not the pump's 1hr
const CONCURRENCY = 4; // don't open dozens of WebSocket connections at once

/**
 * For each visible listing, tries to get a real seeder count by scraping
 * that torrent's own wss:// trackers directly (decentralized, no
 * third-party API) — see src/lib/wsTracker.ts for why this exists instead
 * of relying solely on the pump API. Falls back to whatever pump data is
 * already in the store (usePumpPolling populates that separately) only
 * when no wss:// tracker is listed or none responds in time, and always
 * labels the result's source in catalogStore.seederInfo so the UI can be
 * honest about where a count came from.
 */
export function useSeederCount(listings: TorrentListing[]) {
  const setSeederInfo = useCatalogStore((s) => s.setSeederInfo);
  const lastScrapeRef = useRef<Map<string, number>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const now = Date.now();

    const candidates = listings.filter((l) => {
      if (inFlightRef.current.has(l.infohash)) return false;
      const last = lastScrapeRef.current.get(l.infohash);
      if (last && now - last < CACHE_TTL_MS) return false;
      return l.trackers.some((t) => t.startsWith("wss://") || t.startsWith("ws://"));
    });

    let idx = 0;
    async function worker() {
      while (!cancelled && idx < candidates.length) {
        const listing = candidates[idx++];
        inFlightRef.current.add(listing.infohash);
        try {
          const result = await scrapeWsTrackers(listing.trackers, listing.infohash);
          if (cancelled) return;
          lastScrapeRef.current.set(listing.infohash, Date.now());
          if (result) {
            setSeederInfo({
              infohash: listing.infohash,
              seeders: result.seeders,
              leechers: result.leechers,
              source: "tracker",
            });
          }
          // A failed/empty scrape falls through to whatever pump data
          // useSeederFallback below already wrote — we don't overwrite
          // with a "none" here, since a transient tracker timeout
          // shouldn't blank out a still-valid pump-derived count.
        } finally {
          inFlightRef.current.delete(listing.infohash);
        }
      }
    }

    const workers = Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, () => worker());
    Promise.all(workers);

    return () => {
      cancelled = true;
    };
    // Re-run when the set of visible infohashes changes, not on every
    // listings re-render (listing objects change identity on every
    // upsert, infohash membership doesn't).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings.map((l) => l.infohash).join(","), setSeederInfo]);
}

/**
 * Keeps seederInfo filled from pump data for listings that have no usable
 * tracker scrape result yet (no wss:// tracker, or the scrape hasn't
 * resolved/failed) — this is the fallback half of the "do both" approach.
 * Runs separately from useSeederCount so a pump update can supply a count
 * immediately without waiting on tracker scrape timeouts, and a later
 * tracker result (source: "tracker") always takes priority when it
 * arrives, since it's the more decentralized, more authoritative source.
 */
export function usePumpFallbackSeederInfo() {
  const pumpStatus = useCatalogStore((s) => s.pumpStatus);
  const seederInfo = useCatalogStore((s) => s.seederInfo);
  const setSeederInfo = useCatalogStore((s) => s.setSeederInfo);

  useEffect(() => {
    for (const [infohash, pump] of pumpStatus) {
      const existing = seederInfo.get(infohash);
      if (existing?.source === "tracker") continue; // tracker data wins when present
      const seeders = pump.seeders.length;
      if (existing?.source === "pump" && existing.seeders === seeders) continue; // no-op, avoid render loop
      setSeederInfo({ infohash, seeders, source: seeders > 0 ? "pump" : "none" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pumpStatus, setSeederInfo]);
}
