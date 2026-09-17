import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { TorrentListing } from "../types";
import { useModelCard } from "../hooks/useModelCard";

interface Props {
  listing: TorrentListing;
}

/**
 * The Overview tab's main content: the listing's card (README/model card),
 * sourced from uwutensors-v1's own `card` tag (a Blossom-hosted README —
 * see nostr/parse.ts) when present, or a legacy listing's HF `repoId` as a
 * fallback fetch target — see useModelCard.ts, which already knows how to
 * pick between the two. v1 has no repoId field at all (it uses `source` +
 * `card` instead), so this component must trust useModelCard's own status
 * rather than re-checking listing.repoId itself — that used to short
 * circuit to "not found" for every v1 listing regardless of whether it
 * actually had a card, since a v1 listing never has repoId set.
 */
export function ModelCard({ listing }: Props) {
  const card = useModelCard(listing);

  const html = useMemo(() => {
    if (card.status !== "ready" || !card.markdown) return null;
    // marked.parse is sync here (no async extensions registered).
    const raw = marked.parse(card.markdown, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  }, [card.status, card.markdown]);

  if (card.status === "idle" || card.status === "loading") {
    return <div className="hint">Fetching card…</div>;
  }
  if (card.status === "not-found") {
    return <div className="model-card-empty">No card found</div>;
  }
  if (card.status === "error") {
    return <div className="card-error">Couldn't fetch the card: {card.error}</div>;
  }

  return <div className="model-card" dangerouslySetInnerHTML={{ __html: html ?? "" }} />;
}
