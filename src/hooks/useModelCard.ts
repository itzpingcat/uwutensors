import { useEffect, useState } from "react";
import type { TorrentListing } from "../types";

/**
 * Fetches a listing's model card straight from HuggingFace's README.md,
 * when the listing has a known HF source (repoId). This is a stopgap: the
 * real plan (see project notes) is a Nostr-native model card via NIP-23
 * long-form content, so a publisher can ship a card without HF existing
 * at all. Until that's built, HF's README is the only source we have —
 * we never invent one.
 */
export interface ModelCardState {
  status: "idle" | "loading" | "ready" | "not-found" | "error";
  markdown?: string;
  error?: string;
}

export function useModelCard(listing: TorrentListing): ModelCardState {
  const [state, setState] = useState<ModelCardState>({ status: "idle" });

  useEffect(() => {
    // uwutensors-v1's own `card` tag (a Blossom-hosted README) is the
    // Nostr-native source of truth once a listing has one — it doesn't
    // depend on HuggingFace existing at all. Only fall back to fetching
    // HF's README directly for legacy listings that predate this field.
    const cardUrl = listing.card;
    const fallbackRepoId = !cardUrl ? listing.repoId : undefined;
    if (!cardUrl && !fallbackRepoId) {
      setState({ status: "not-found" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });

    const url = cardUrl
      ? cardUrl
      : `https://huggingface.co/${fallbackRepoId}/raw/${encodeURIComponent(
          listing.commitSha || listing.version || "main"
        )}/README.md`;

    (async () => {
      try {
        const resp = await fetch(url);
        if (cancelled) return;
        if (resp.status === 404) {
          setState({ status: "not-found" });
          return;
        }
        if (!resp.ok) {
          setState({ status: "error", error: `${cardUrl ? "Blossom" : "HuggingFace"} returned ${resp.status}` });
          return;
        }
        const text = await resp.text();
        if (cancelled) return;
        setState({ status: "ready", markdown: text });
      } catch (err) {
        if (cancelled) return;
        setState({ status: "error", error: err instanceof Error ? err.message : "Failed to fetch model card." });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [listing.card, listing.repoId, listing.commitSha, listing.version]);

  return state;
}
