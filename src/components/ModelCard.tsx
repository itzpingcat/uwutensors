import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { TorrentListing } from "../types";
import { useModelCard } from "../hooks/useModelCard";

interface Props {
  listing: TorrentListing;
}

/**
 * The Overview tab's main content: the model card itself, fetched from
 * HuggingFace's README when the listing has a known HF source. There's no
 * Nostr-native model card yet (planned as a NIP-23 long-form event keyed
 * off the infohash — see project notes), so for now this is HF-only, and
 * says so plainly when there's nothing to show rather than inventing
 * placeholder content.
 */
export function ModelCard({ listing }: Props) {
  const card = useModelCard(listing);

  const html = useMemo(() => {
    if (card.status !== "ready" || !card.markdown) return null;
    // marked.parse is sync here (no async extensions registered).
    const raw = marked.parse(card.markdown, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  }, [card.status, card.markdown]);

  if (!listing.repoId) {
    return <div className="model-card-empty">No Model Card Found</div>;
  }
  if (card.status === "idle" || card.status === "loading") {
    return <div className="hint">Fetching model card from HuggingFace…</div>;
  }
  if (card.status === "not-found") {
    return <div className="model-card-empty">No Model Card Found</div>;
  }
  if (card.status === "error") {
    return <div className="card-error">Couldn't fetch the model card: {card.error}</div>;
  }

  return <div className="model-card" dangerouslySetInnerHTML={{ __html: html ?? "" }} />;
}
