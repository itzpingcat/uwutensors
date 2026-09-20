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
  const cardUrl = listing.card;
  const repoId = listing.repoId;
  const hasSource = Boolean(cardUrl || repoId);
  // The deps that define "this listing's card fetch" — the state key the
  // render-time reset below compares against.
  const fetchKey = `${cardUrl ?? ""}|${repoId ?? ""}|${listing.commitSha ?? ""}|${listing.version ?? ""}`;

  const [state, setState] = useState<ModelCardState>({ status: "idle" });
  // Reset to loading during render when the fetch key changes (React's
  // documented "adjust state when a prop changes" pattern) instead of
  // calling setState synchronously at the top of the effect.
  const [prevKey, setPrevKey] = useState(fetchKey);
  if (prevKey !== fetchKey) {
    setPrevKey(fetchKey);
    setState({ status: "loading" });
  }

  useEffect(() => {
    // uwutensors-v1's own `card` tag (a Blossom-hosted README) is the
    // Nostr-native source of truth once a listing has one — it doesn't
    // depend on HuggingFace existing at all. Only fall back to fetching
    // HF's README directly for legacy listings that predate this field.
    if (!cardUrl && !repoId) return;
    let cancelled = false;

    const url = cardUrl ?? hfReadmeUrl(repoId ?? "", listing.commitSha || listing.version || "main");

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
  }, [fetchKey, cardUrl, repoId, listing.commitSha, listing.version]);

  if (!hasSource) return { status: "not-found" };
  return state;
}

/** HF repo README at a specific revision, with repoId/revision path-encoded
 *  so a crafted listing tag can't rewrite the URL path. */
function hfReadmeUrl(repoId: string, revision: string): string {
  const encodedRepo = repoId.split("/").map(encodeURIComponent).join("/");
  return `https://huggingface.co/${encodedRepo}/raw/${encodeURIComponent(revision)}/README.md`;
}
