/**
 * Scrapes a BitTorrent WebSocket tracker directly from the browser for a
 * live peer/seeder count — no third-party API involved.
 *
 * Why this exists: the pump API (usePumpPolling.ts) only reports seeders
 * from llama.garden's own Transmission fleet, which is a single company's
 * private view of its own infrastructure — a centralized dependency for a
 * project whose whole point is decentralizing model distribution. BitTorrent
 * already has a standard, decentralized answer to "how many peers have
 * this torrent": ask a tracker (or the DHT). The catch is that classic
 * BitTorrent trackers speak UDP or plain HTTP, neither of which a browser
 * can originate — WebSocket trackers (the protocol WebTorrent popularized,
 * used for WebRTC peer signaling) are the one tracker flavor a browser can
 * actually talk to, and only for torrents whose publisher listed a wss://
 * tracker URL in the first place.
 *
 * This uses the tracker's `scrape` action (BEP 48's WebSocket
 * equivalent, mirroring what bittorrent-tracker's own client does) rather
 * than announcing — scrape is a pure read: "how many peers do you have
 * for this infohash", with no side effect on the swarm at all, unlike an
 * announce (which registers us, however briefly, as a peer). Falls back
 * to nothing (null) if no wss:// tracker is listed or the tracker doesn't
 * respond in time; the caller (useSeederCount) merges this with pump data
 * and labels the source so the UI stays honest about where a count came
 * from.
 */

export interface TrackerScrapeResult {
  seeders: number;
  leechers: number;
  trackerUrl: string;
}

const SCRAPE_TIMEOUT_MS = 4000;

/** Convert a 40-char hex infohash to the raw 20-byte binary form trackers expect. */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function bytesToBinaryString(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => String.fromCharCode(b)).join("");
}

/**
 * Scrape a single wss:// tracker for one infohash's peer counts, using
 * the tracker's `scrape` action — a pure read with no announce side
 * effect. Response shape (per bittorrent-tracker's own websocket client):
 * `{ action: "scrape", files: { [infoHashBinary]: { complete, incomplete, downloaded } } }`.
 */
export function scrapeWsTracker(trackerUrl: string, infohashHex: string): Promise<TrackerScrapeResult | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: TrackerScrapeResult | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // already closed/closing
      }
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), SCRAPE_TIMEOUT_MS);

    let ws: WebSocket;
    try {
      ws = new WebSocket(trackerUrl);
    } catch {
      clearTimeout(timer);
      resolve(null);
      return;
    }

    const infoHashBinary = bytesToBinaryString(hexToBytes(infohashHex));

    ws.onopen = () => {
      ws.send(JSON.stringify({ action: "scrape", info_hash: infoHashBinary }));
    };

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(typeof msg.data === "string" ? msg.data : "");
        if (data.action !== "scrape" || !data.files) return;
        const entry = data.files[infoHashBinary];
        if (!entry) return;
        const seeders = typeof entry.complete === "number" ? entry.complete : 0;
        const leechers = typeof entry.incomplete === "number" ? entry.incomplete : 0;
        finish({ seeders, leechers, trackerUrl });
      } catch {
        // ignore malformed frames
      }
    };

    ws.onerror = () => finish(null);
    ws.onclose = () => finish(null);
  });
}

/**
 * Scrape all wss:// trackers listed for a torrent and take the highest
 * seeder count seen (different trackers see different, possibly
 * overlapping, slices of the swarm — max is the least-wrong single number
 * to show, same convention most torrent clients use for multi-tracker
 * swarms).
 */
export async function scrapeWsTrackers(
  trackerUrls: string[],
  infohashHex: string
): Promise<TrackerScrapeResult | null> {
  const wsTrackers = trackerUrls.filter((t) => t.startsWith("wss://") || t.startsWith("ws://"));
  if (wsTrackers.length === 0) return null;

  const results = await Promise.all(wsTrackers.map((t) => scrapeWsTracker(t, infohashHex)));
  let best: TrackerScrapeResult | null = null;
  for (const r of results) {
    if (r && (!best || r.seeders > best.seeders)) best = r;
  }
  return best;
}
