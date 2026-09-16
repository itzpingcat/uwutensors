import { useState } from "react";
import type { TorrentListing } from "../types";
import { humanSize, displayFilePath } from "../lib/format";
import { useTorrentFiles } from "../hooks/useTorrentFiles";
import { navigateToCatalog } from "../hooks/useRoute";
import { TorrentOverview } from "./TorrentOverview";
import { ModelCard } from "./ModelCard";

type PageTab = "overview" | "files" | "community";

interface Props {
  listing: TorrentListing;
  onPublished: (msg: string) => void;
}

function FilesTab({ listing }: { listing: TorrentListing }) {
  const { status, files, error, verified } = useTorrentFiles(listing);

  if (status === "idle" || status === "loading") {
    return <div className="hint">Fetching and decoding the .torrent file…</div>;
  }
  if (status === "error") {
    return <div className="card-error">{error}</div>;
  }

  return (
    <div>
      <p className="hint">
        {files.length} file{files.length !== 1 ? "s" : ""} — read directly from the .torrent's own file
        table, not from anything the publisher wrote in the listing.{" "}
        {verified
          ? "The .torrent bytes were hash-verified against the listing's published sha256 before decoding."
          : "This listing published no sha256 to verify the .torrent against — the file list below is unverified."}
      </p>
      <div className="file-tree">
        {files.map((f) => (
          <div key={f.path} className="file-tree-row">
            <span className="file-tree-path" title={f.path}>
              {displayFilePath(f.path)}
            </span>
            <span className="file-tree-size">{humanSize(f.size)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TorrentPage({ listing, onPublished }: Props) {
  const [tab, setTab] = useState<PageTab>("overview");
  const title = listing.lab ? `${listing.lab} / ${listing.displayName ?? listing.name}` : listing.displayName ?? listing.name;

  return (
    <div className="torrent-page">
      <button className="btn-small back-btn" onClick={navigateToCatalog}>
        ← Back
      </button>
      <h2>{title}</h2>

      <div className="page-tabs">
        <button className={"page-tab" + (tab === "overview" ? " active" : "")} onClick={() => setTab("overview")}>
          Overview
        </button>
        <button className={"page-tab" + (tab === "files" ? " active" : "")} onClick={() => setTab("files")}>
          Files
        </button>
        <button className={"page-tab" + (tab === "community" ? " active" : "")} onClick={() => setTab("community")}>
          Community
        </button>
      </div>

      {tab === "overview" && (
        <div className="overview-layout">
          <div className="overview-main">
            <ModelCard listing={listing} />
          </div>
          <aside className="overview-sidebar">
            <TorrentOverview listing={listing} onPublished={onPublished} />
          </aside>
        </div>
      )}
      {tab === "files" && <FilesTab listing={listing} />}
      {tab === "community" && (
        <div className="hint">Comments aren't built yet — coming in a later pass (NIP-22 threaded replies).</div>
      )}
    </div>
  );
}
