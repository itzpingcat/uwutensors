import { useEffect, useRef } from "react";
import { useCatalogStore } from "../store/catalogStore";
import { useSettingsStore } from "../store/settingsStore";

const CACHE_TTL_MS = 3_600_000; // 1 hour, same as original PUMPS_CACHE_TTL
const DEBOUNCE_MS = 2000;

interface PumpApiResponse {
  results: Record<string, { percent_done: number }[]>;
  downloads: Record<string, number>;
}

/**
 * Polls the pump API for seeder/download counts of currently-visible
 * infohashes. Ported from fetchPumps/triggerPumpFetch: debounced, and
 * skips infohashes fetched within the last hour. Entirely optional —
 * disabled by default (settings.pumps.enabled), since the pump fleet is
 * additive infrastructure, not load-bearing for the catalog (see the
 * "critical vs non-critical infrastructure" discussion this app's
 * architecture doc is based on).
 */
export function usePumpPolling(visibleInfohashes: string[]) {
  const enabled = useSettingsStore((s) => s.settings.pumps.enabled);
  const apiUrl = useSettingsStore((s) => s.settings.pumps.apiUrl);
  const setPumpStatus = useCatalogStore((s) => s.setPumpStatus);
  const setPumpHealth = useCatalogStore((s) => s.setPumpHealth);
  const lastFetchRef = useRef<Map<string, number>>(new Map());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    if (!enabled || !apiUrl || visibleInfohashes.length === 0) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const now = Date.now();
      const needed = visibleInfohashes.filter((ih) => {
        const last = lastFetchRef.current.get(ih);
        return !last || now - last >= CACHE_TTL_MS;
      });
      if (needed.length === 0) return;
      fetchPumps(apiUrl, needed).then((result) => {
        if (requestId !== requestIdRef.current) return;
        if (!result) {
          setPumpHealth("failed");
          return;
        }
        setPumpHealth("available");
        const data = result;
        for (const ih of needed) {
          lastFetchRef.current.set(ih, Date.now());
          setPumpStatus({
            infohash: ih,
            seeders: (data.results[ih] ?? []).map((s) => ({ percentDone: s.percent_done })),
            downloads: data.downloads[ih] ?? 0,
          });
        }
      });
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      requestIdRef.current++;
    };
  }, [enabled, apiUrl, visibleInfohashes.join(","), setPumpStatus, setPumpHealth]);
}

async function fetchPumps(apiUrl: string, infohashes: string[]): Promise<PumpApiResponse | null> {
  try {
    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ infohashes }),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget: tell the pump API a download was initiated for this
 * infohash (increments its counter), same as the original's recordDownload.
 * Never awaited by callers — must not slow down the verified-download flow.
 */
export function recordDownload(apiUrl: string, infohash: string) {
  if (!apiUrl || !infohash) return;
  fetch(`${apiUrl}?downloading=1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ infohashes: [infohash] }),
  }).catch(() => {
    // fire-and-forget — failures are non-fatal
  });
}
