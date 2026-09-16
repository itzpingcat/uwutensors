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
  private onConnectionChange?: (connected: number, total: number) => void;

  // Remembers the active subscription's filter/callbacks so setRelays()
  // can restart it against the new relay set. Without this, changing
  // `this.relays` after subscribe() had no effect on the live connection —
  // subscribeMany() only reads the relay list at call time.
  private activeSub: {
    filter: Filter;
    onEvent: (event: NostrEvent) => void;
    onEose?: (relay: string) => void;
    close: () => void;
  } | null = null;

  private pollHandle: ReturnType<typeof setInterval> | null = null;

  constructor(relays: string[], onConnectionChange?: (connected: number, total: number) => void) {
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
    this.onConnectionChange?.(this.getConnectedCount(), this.relays.length);
  }

  getConnectedCount(): number {
    let n = 0;
    for (const url of this.relays) {
      if (this.pool.listConnectionStatus().get(url)) n++;
    }
    return n;
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
      const { filter, onEvent, onEose } = this.activeSub;
      this.activeSub.close();
      this.activeSub = this.openSubscription(filter, onEvent, onEose);
    }
  }

  getRelays(): string[] {
    return this.relays;
  }

  private openSubscription(
    filter: Filter,
    onEvent: (event: NostrEvent) => void,
    onEose?: (relay: string) => void
  ) {
    const sub = this.pool.subscribeMany(this.relays, filter, {
      onevent: (ev) => onEvent(ev as NostrEvent),
      oneose: () => onEose?.(""),
    });
    return { filter, onEvent, onEose, close: () => sub.close() };
  }

  /**
   * Subscribe to a filter across all configured relays. Returns an
   * unsubscribe function. `onEvent` only ever receives events that
   * nostr-tools has already signature-verified.
   */
  subscribe(
    filter: Filter,
    onEvent: (event: NostrEvent) => void,
    onEose?: (relay: string) => void
  ): () => void {
    this.activeSub = this.openSubscription(filter, onEvent, onEose);
    return () => {
      this.activeSub?.close();
      this.activeSub = null;
    };
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
