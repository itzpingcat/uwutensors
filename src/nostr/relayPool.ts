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
  private pool = new SimplePool();
  private relays: string[];

  constructor(relays: string[]) {
    this.relays = relays;
  }

  setRelays(relays: string[]) {
    this.relays = relays;
  }

  getRelays(): string[] {
    return this.relays;
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
    const sub = this.pool.subscribeMany(this.relays, filter, {
      onevent: (ev) => onEvent(ev as NostrEvent),
      oneose: () => onEose?.(""),
    });
    return () => sub.close();
  }

  async publish(event: NostrEvent): Promise<{ ok: string[]; failed: string[] }> {
    const results = await Promise.allSettled(
      this.pool.publish(this.relays, event)
    );
    const ok: string[] = [];
    const failed: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") ok.push(this.relays[i]);
      else failed.push(this.relays[i]);
    });
    return { ok, failed };
  }

  close() {
    this.pool.close(this.relays);
  }
}
