import { SimplePool, type Filter } from "nostr-tools";
import type { NostrEvent } from "../types";

/**
 * Thin wrapper around nostr-tools' SimplePool.
 *
 * Unlike waifu-magnet-22.html's hand-rolled WebSocket + hand-rolled Schnorr
 * verifier, nostr-tools verifies event signatures internally (via
 * @noble/curves, bundled — not loaded from a CDN at runtime), so there is
 * no "trust mode" fallback path where verification silently turns off.
 * If the crypto can't run, the app fails closed (throws), not open.
 */
export class RelayPool {
  private pool: SimplePool;
  private relays: string[];
  private onConnectionChange?: (connected: number, total: number, status: Map<string, boolean>) => void;

  // Remembers the active subscription's filters/callbacks so setRelays()
  // can restart it against the new relay set. Without this, changing
  // `this.relays` after subscribe() had no effect on the live connection —
  // subscribeMany() only reads the relay list at call time.
  //
  // filters is an array (not a single Filter) because relays commonly cap
  // how many events an unlimited/broad REQ returns by default, and a
  // single filter combining every event kind we care about into one
  // request was getting silently truncated by that per-relay cap —
  // opening one REQ per kind, each with its own `limit`, mirrors what the
  // original waifu-magnet-22.html sent (limit: 500 for listings/labels,
  // limit: 1 for the client-announce kind) and gets each kind its own
  // budget instead of all kinds competing for one relay-imposed cap.
  private activeSub: {
    filters: Filter[];
    onEvent: (event: NostrEvent) => void;
    onEose?: (relay: string) => void;
    close: () => void;
  } | null = null;

  private pollHandle: ReturnType<typeof setInterval> | null = null;

  constructor(relays: string[], onConnectionChange?: (connected: number, total: number, status: Map<string, boolean>) => void) {
    this.relays = relays;
    this.onConnectionChange = onConnectionChange;
    // SimplePool's public constructor type only advertises enablePing /
    // enableReconnect, but at runtime it forwards all options to
    // AbstractSimplePool (see node_modules/nostr-tools/lib/esm/pool.js),
    // which does support these connection-status callbacks. Cast to reach
    // them without widening RelayPool's own public API.
    this.pool = new SimplePool({
      onRelayConnectionSuccess: () => this.reportConnectionChange(),
      onRelayConnectionFailure: () => this.reportConnectionChange(),
      // AbstractSimplePool defaults to idleTimeout=20000ms with
      // enableReconnect=false — a relay with no "ongoing operation" for
      // 20s auto-closes and never reconnects. Our subscription is meant
      // to stay open indefinitely (a live catalog feed, not a one-shot
      // query), and after the initial EOSE a subscription can sit idle
      // between events, so the default silently dropped every relay to 0
      // one by one shortly after connecting (the "climbs to N, then
      // resets to 0" bug). idleTimeout: 0 disables the auto-close, and
      // enableReconnect covers relays that drop for other reasons
      // (network blip, relay-side restart).
      idleTimeout: 0,
      enableReconnect: true,
    } as ConstructorParameters<typeof SimplePool>[0]);

    // Safety net: onRelayConnectionSuccess/Failure only fire from the
    // subscribeMany/publish code paths, not from a relay's own internal
    // reconnect() after a drop (see handleHardClose in abstract-relay.js).
    // So a relay that silently reconnects in the background would leave
    // the displayed count stale until the next explicit pool operation.
    // Poll listConnectionStatus() directly so the UI self-corrects.
    this.pollHandle = setInterval(() => this.reportConnectionChange(), 3000);
  }

  private reportConnectionChange() {
    this.onConnectionChange?.(this.getConnectedCount(), this.relays.length, this.getRelayStatus());
  }

  getConnectedCount(): number {
    let n = 0;
    for (const url of this.relays) {
      if (this.pool.listConnectionStatus().get(url)) n++;
    }
    return n;
  }

  /** Per-relay connection status, for surfacing which specific relays are up/down in the UI. */
  getRelayStatus(): Map<string, boolean> {
    const status = this.pool.listConnectionStatus();
    const out = new Map<string, boolean>();
    for (const url of this.relays) {
      out.set(url, status.get(url) ?? false);
    }
    return out;
  }

  /**
   * Update the relay set. Closes and re-opens the active subscription (if
   * any) against the new list, so relays added in Settings actually get
   * connected to and relays removed actually get disconnected from —
   * previously this only updated an internal array with no effect on the
   * live connection.
   */
  setRelays(relays: string[]) {
    if (relays.join(",") === this.relays.join(",")) return; // no-op, avoid needless reconnect
    this.relays = relays;
    this.reportConnectionChange();
    if (this.activeSub) {
      const { filters, onEvent, onEose } = this.activeSub;
      this.activeSub.close();
      this.activeSub = this.openSubscription(filters, onEvent, onEose);
    }
  }

  getRelays(): string[] {
    return this.relays;
  }

  private openSubscription(
    filters: Filter[],
    onEvent: (event: NostrEvent) => void,
    onEose?: (relay: string) => void
  ) {
    const subs = filters.map((filter) =>
      this.pool.subscribeMany(this.relays, filter, {
        onevent: (ev) => onEvent(ev as NostrEvent),
        oneose: () => onEose?.(""),
      })
    );
    return { filters, onEvent, onEose, close: () => subs.forEach((s) => s.close()) };
  }

  /**
   * Subscribe across all configured relays. Accepts one filter or several —
   * pass several to give each event kind its own `limit` instead of having
   * them compete for one relay-imposed cap on a combined filter (see the
   * comment on activeSub above). Returns an unsubscribe function. `onEvent`
   * only ever receives events that nostr-tools has already
   * signature-verified.
   */
  subscribe(
    filter: Filter | Filter[],
    onEvent: (event: NostrEvent) => void,
    onEose?: (relay: string) => void
  ): () => void {
    const filters = Array.isArray(filter) ? filter : [filter];
    this.activeSub = this.openSubscription(filters, onEvent, onEose);
    return () => {
      this.activeSub?.close();
      this.activeSub = null;
    };
  }

  /**
   * One-shot fetch of the latest event matching a filter (e.g. a kind 0
   * profile for a specific pubkey), rather than a standing subscription.
   * Used for on-demand lookups — profile metadata for whoever's currently
   * logged in — where we don't want to keep a long-lived subscription open
   * for every pubkey the app has ever seen.
   */
  async fetchEvent(filter: Filter): Promise<NostrEvent | null> {
    const event = await this.pool.get(this.relays, filter);
    return (event as NostrEvent) ?? null;
  }

  async publish(event: NostrEvent): Promise<{ ok: string[]; failed: string[] }> {
    const results = await Promise.allSettled(this.pool.publish(this.relays, event));
    const ok: string[] = [];
    const failed: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") ok.push(this.relays[i]);
      else failed.push(this.relays[i]);
    });
    return { ok, failed };
  }

  close() {
    if (this.pollHandle) clearInterval(this.pollHandle);
    this.activeSub?.close();
    this.activeSub = null;
    this.pool.close(this.relays);
  }
}
