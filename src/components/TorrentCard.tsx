import { useState } from "react";
import type { TorrentListing } from "../types";
import { humanSize, shortHash } from "../lib/format";
import { fetchAndVerifyTorrent } from "../lib/torrentDownload";
import { useCatalogStore } from "../store/catalogStore";

interface Props {
  listing: TorrentListing;
  onOpen: (listing: TorrentListing) => void;
}

export function TorrentCard({ listing, onOpen }: Props) {
  const [downloadState, setDownloadState] = useState<"idle" | "verifying" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const pump = useCatalogStore((s) => s.pumpStatus.get(listing.infohash));

  const title = listing.displayName ?? listing.name;
  // Original counts every pump entry as a seeder (pumpData.data.length in
  // waifu-magnet-22.html), not just peers at 100%. A `percentDone >= 100`
  // filter here was an invented, over-strict condition that made this
  // always show 0 seeders in practice — pump entries are peers currently
  // seeding/leeching via the pump fleet, not "fully downloaded" markers.
  const seederCount = pump?.seeders.length ?? 0;

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
    <div className="card" onClick={() => onOpen(listing)}>
      <div className="card-title">{title}</div>
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
        <span>{seederCount} seeder{seederCount === 1 ? "" : "s"}</span>
        <span title={listing.infohash}>{shortHash(listing.infohash)}</span>
      </div>
      <div className="card-actions">
        {listing.source && (
          <a
            className="btn"
            href={`https://${listing.source}`}
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
