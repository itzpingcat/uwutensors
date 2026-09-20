import { useState } from "react";
import type { TorrentListing } from "../types";
import { humanSize, shortHash, normalizeSourceHost } from "../lib/format";
import { fetchAndVerifyTorrent } from "../lib/torrentDownload";
import { useCatalogStore } from "../store/catalogStore";
import { navigateToTorrent } from "../hooks/useRoute";

interface Props {
  listing: TorrentListing;
}

export function TorrentCard({ listing }: Props) {
  const [downloadState, setDownloadState] = useState<"idle" | "verifying" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const seederInfo = useCatalogStore((s) => s.seederInfo.get(listing.infohash));

  const title = listing.displayName ?? listing.name;
  const sourceUrl = listing.source ? normalizeSourceHost(listing.source) : null;
  // seederInfo is the unified, source-labeled count (see useSeederCount):
  // a direct wss:// tracker scrape when the torrent lists one and it
  // responds ("tracker" — the decentralized, more trustworthy source),
  // otherwise llama.garden's pump API as a fallback ("pump" — a single
  // company's private fleet, not the whole swarm). We show which one it
  // was so a pump-derived count isn't mistaken for an authoritative swarm
  // count.
  const seederCount = seederInfo?.seeders ?? 0;
  const seederSource = seederInfo?.source;

  async function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
    if (listing.urls.length === 0) {
      window.open(listing.magnet, "_blank");
      return;
    }
    setDownloadState("verifying");
    setError(null);
    try {
      const result = await fetchAndVerifyTorrent(
        listing.urls,
        listing.torrentSha256,
        listing.torrentSize
      );
      const blob = new Blob([result.bytes], { type: "application/x-bittorrent" });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${listing.name}.torrent`;
      a.click();
      URL.revokeObjectURL(blobUrl);
      // Verified source is available for a "copy magnet with source" action
      // via magnetWithVerifiedSource(listing.magnet, result.sourceUrl).
      setDownloadState("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDownloadState("error");
    }
  }

  return (
    <div
      className="card"
      onClick={() => navigateToTorrent(listing.infohash)}
    >
      {/* A real anchor, not just a div click, so the model page has a
          genuine URL: right-click "copy link", open-in-new-tab, and
          browser history all work. preventDefault stops the anchor's own
          navigation (which would otherwise cause a duplicate hashchange);
          stopPropagation isn't needed since the card's own onClick does
          the same navigation anyway. */}
      <a
        className="card-title"
        href={`#/torrent/${encodeURIComponent(listing.infohash)}`}
        onClick={(e) => {
          e.preventDefault();
          navigateToTorrent(listing.infohash);
        }}
      >
        {title}
      </a>
      <div className="card-badges">
        {listing.lab && <span className="badge">{listing.lab}</span>}
        {listing.quantType && listing.quantType !== "n/a" && (
          <span className="badge badge-quant">{listing.quantType}</span>
        )}
        {listing.fileClass && listing.fileClass !== "n/a" && (
          <span className="badge">{listing.fileClass}</span>
        )}
      </div>
      <div className="card-meta">
        <span>{humanSize(listing.totalSize)}</span>
        <span title={seederSource === "tracker" ? "From a direct tracker scrape" : seederSource === "pump" ? "From llama.garden's pump fleet (not the full swarm)" : undefined}>
          {seederCount} seeder{seederCount === 1 ? "" : "s"}
          {seederSource === "tracker" && <sup className="seeder-source-tag">T</sup>}
          {seederSource === "pump" && <sup className="seeder-source-tag pump">P</sup>}
        </span>
        <span title={listing.infohash}>{shortHash(listing.infohash)}</span>
      </div>
      <div className="card-actions">
        {sourceUrl && (
          <a
            className="btn"
            href={`https://${sourceUrl}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            HuggingFace
          </a>
        )}
        <button className="btn-secondary" onClick={handleDownload} disabled={downloadState === "verifying"}>
          {downloadState === "verifying" ? "Verifying…" : ".torrent"}
        </button>
      </div>
      {error && <div className="card-error">{error}</div>}
    </div>
  );
}
