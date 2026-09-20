import { useRef, useState } from "react";
import { RelayPool } from "../nostr/relayPool";
import { mineAndPublish, POW_DURATION_MS } from "../nostr/submit";
import { formatPowLabel } from "../lib/format";
import { useSettingsStore } from "../store/settingsStore";
import type { NostrEvent } from "../types";

interface SubmitState {
  submitting: boolean;
  pct: number;
  label: string;
  error: string | null;
}

const INITIAL: SubmitState = { submitting: false, pct: 0, label: "", error: null };

export function useMineAndPublish() {
  const relays = useSettingsStore((s) => s.settings.relays.relays);
  const [state, setState] = useState<SubmitState>(INITIAL);
  const poolRef = useRef<RelayPool | null>(null);

  async function submit(
    kind: number,
    tags: string[][],
    content = ""
  ): Promise<{ event: NostrEvent; okCount: number; total: number; powBits: number } | null> {
    setState({ submitting: true, pct: 0, label: "starting proof-of-work search…", error: null });
    try {
      if (!poolRef.current) poolRef.current = new RelayPool(relays);
      poolRef.current.setRelays(relays);

      const result = await mineAndPublish(poolRef.current, kind, tags, content, (p) => {
        const pct = Math.min(100, (p.elapsedMs / POW_DURATION_MS) * 100);
        setState((s) => ({ ...s, pct, label: formatPowLabel(p.pow, p.hashes, p.elapsedMs, POW_DURATION_MS) }));
      });

      setState(INITIAL);
      return {
        event: result.event,
        okCount: result.publish.ok.length,
        total: relays.length,
        powBits: result.pow.pow,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ submitting: false, pct: 0, label: "", error: message });
      return null;
    }
  }

  return { ...state, submit };
}
