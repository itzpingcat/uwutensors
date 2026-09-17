import { useState } from "react";
import { nip19 } from "nostr-tools";
import type { TorrentListing } from "../types";
import { humanSize, shortHash } from "../lib/format";
import { fetchAndVerifyTorrent, magnetWithVerifiedSource } from "../lib/torrentDownload";
import { useCatalogStore } from "../store/catalogStore";
import { useProfile } from "../hooks/useProfile";
import { AvatarIcon } from "./AvatarIcon";
import { RequestSeedersModal } from "./RequestSeedersModal";

interface Props {
  listing: TorrentListing;
  onPublished: (msg: string) => void;
}

function copyToClipboard(text: string, setLabel: (l: string) => void) {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      setLabel("Copied!");
      setTimeout(() => setLabel("Copy"), 1200);
    })
    .catch(() => {
      setLabel("Copy failed");
      setTimeout(() => setLabel("Copy"), 1200);
    });
}

function TorrentFileRow({ url, expectedSha256, expectedSize }: { url: string; expectedSha256?: string; expectedSize?: number }) {
  const [verifyLabel, setVerifyLabel] = useState<"VERIFY" | "VERIFYING…" | "VERIFIED" | "INVALID">("VERIFY");
  const [copyLabel, setCopyLabel] = useState("copy");

  async function verify() {
    setVerifyLabel("VERIFYING…");
    try {
      await fetchAndVerifyTorrent([url], expectedSha256, expectedSize);
      setVerifyLabel("VERIFIED");
    } catch {
      setVerifyLabel("INVALID");
    }
  }

  return (
    <div className="torrent-row">
      <a className="pill" href={url} target="_blank" rel="noopener noreferrer" title={url}>
        {url}
      </a>
      <button
        className={"verify-btn" + (verifyLabel === "VERIFIED" ? " ok" : verifyLabel === "INVALID" ? " invalid" : "")}
        type="button"
        onClick={verify}
        disabled={verifyLabel === "VERIFYING…"}
      >
        {verifyLabel}
      </button>
      <button className="copy-btn" type="button" onClick={() => copyToClipboard(url, setCopyLabel)}>
        {copyLabel}
      </button>
    </div>
  );
}

function Collapsible({ label, items }: { label: string; items: string[] }) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className={"section" + (expanded ? " expanded" : "")}>
      <div className="label collapsible-head" onClick={() => setExpanded((e) => !e)}>
        {label} ({items.length}) <span className="chev">›</span>
      </div>
      <div className="pill-row collapsible-body">
        {items.map((item) => (
          <span key={item} className="pill">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * The listing's field grid, seed status, magnet flow, .torrent mirror
 * list, webseeds/trackers, submitter row, and "request seeders" — shared
 * between TorrentModal (the popup) and TorrentPage's Overview tab (the
 * full-page /model/<infohash> route), so the two don't drift out of sync
 * by duplicating this JSX independently.
 */
export function TorrentOverview({ listing, onPublished }: Props) {
  const [seederModalOpen, setSeederModalOpen] = useState(false);
  const [magnetOut, setMagnetOut] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [downloadingTorrent, setDownloadingTorrent] = useState(false);
  const [copyMagnetLabel, setCopyMagnetLabel] = useState("Copy magnet link");
  const [copyNpubLabel, setCopyNpubLabel] = useState("copy npub");
  const pump = useCatalogStore((s) => s.pumpStatus.get(listing.infohash));
  const seederInfo = useCatalogStore((s) => s.seederInfo.get(listing.infohash));
  const submitterProfile = useProfile(listing.event.pubkey);
  const submitterNpub = nip19.npubEncode(listing.event.pubkey);
  const submitterName =
    submitterProfile?.displayName || submitterProfile?.name || shortHash(listing.event.pubkey, 16);

  const seederCount = seederInfo?.seeders ?? 0;
  const webseedCount = listing.webseeds.length;
  const downloads = pump?.downloads ?? 0;
  const noSeeders = seederCount === 0;

  let seedLine = `${webseedCount} web seed${webseedCount !== 1 ? "s" : ""}`;
  if (seederCount > 0) {
    seedLine += ` + ${seederCount} seeder${seederCount !== 1 ? "s" : ""}`;
    if (seederInfo?.leechers) seedLine += `, ${seederInfo.leechers} leecher${seederInfo.leechers !== 1 ? "s" : ""}`;
  }
  if (downloads > 0) seedLine += ` · ${downloads} download${downloads !== 1 ? "s" : ""}`;
  const seederSourceNote =
    seederInfo?.source === "tracker"
      ? "Seeder count from a direct BitTorrent tracker scrape."
      : seederInfo?.source === "pump"
        ? "Seeder count from llama.garden's pump fleet — not the full swarm, since this torrent lists no WebSocket tracker a browser can scrape directly."
        : undefined;

  async function resolveMagnet(): Promise<string> {
    if (listing.urls.length === 0) return listing.magnet;
    try {
      const result = await fetchAndVerifyTorrent(listing.urls, listing.torrentSha256, listing.torrentSize);
      return magnetWithVerifiedSource(listing.magnet, result.sourceUrl);
    } catch {
      return listing.magnet;
    }
  }

  async function copyMagnetLink() {
    setGenerating(true);
    try {
      const magnet = await resolveMagnet();
      setMagnetOut(magnet);
      copyToClipboard(magnet, setCopyMagnetLabel);
    } finally {
      setGenerating(false);
    }
  }

  async function downloadTorrentFile() {
    if (listing.urls.length === 0) return;
    setDownloadingTorrent(true);
    try {
      const result = await fetchAndVerifyTorrent(listing.urls, listing.torrentSha256, listing.torrentSize);
      const blob = new Blob([result.bytes], { type: "application/x-bittorrent" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${listing.name || listing.infohash}.torrent`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // fetchAndVerifyTorrent already tried every mirror; nothing more to do
      // here besides leaving the button re-enabled for a retry.
    } finally {
      setDownloadingTorrent(false);
    }
  }

  return (
    <>
      <div className="pump-section">
        <div className="pump-head">Seed status</div>
        <div className="pump-status-line">{seedLine}</div>
        {seederSourceNote && <div className="seeder-source-note">{seederSourceNote}</div>}
      </div>

      <div className="magnet-section">
        <div className="magnet-btn-row">
          <button
            className="magnet-btn"
            onClick={downloadTorrentFile}
            disabled={listing.urls.length === 0 || downloadingTorrent}
            title={listing.urls.length === 0 ? "No .torrent mirror available to download" : undefined}
          >
            {downloadingTorrent ? "Downloading…" : "Download .torrent"}
          </button>
          {noSeeders ? (
            <span className="magnet-btn-tooltip-wrap">
              <button className="magnet-btn" disabled>
                Copy magnet link
              </button>
              <span className="magnet-btn-tooltip">
                No seeders — magnet link cannot resolve without peers. Use the .torrent file with a
                webseed-capable client (e.g. Transmission).
              </span>
            </span>
          ) : (
            <button className="magnet-btn" onClick={copyMagnetLink} disabled={generating}>
              {generating ? "Verifying…" : copyMagnetLabel}
            </button>
          )}
        </div>
        {magnetOut && !noSeeders && <div className="magnet-out">{magnetOut}</div>}
      </div>

      <dl className="modal-fields">
        <dt>Infohash</dt>
        <dd>{listing.infohash}</dd>
        <dt>Size</dt>
        <dd>{humanSize(listing.totalSize)}</dd>
        {listing.torrentSize !== undefined && (
          <>
            <dt>.torrent file size</dt>
            <dd>{humanSize(listing.torrentSize)}</dd>
          </>
        )}
        {listing.torrentCreatedAt && (
          <>
            <dt>.torrent created</dt>
            <dd>{listing.torrentCreatedAt}</dd>
          </>
        )}
        {listing.source && (
          <>
            <dt>Source</dt>
            <dd>
              <a href={`https://${listing.source}`} target="_blank" rel="noreferrer">
                {listing.source}
              </a>
            </dd>
          </>
        )}
        {listing.repoId && (
          <>
            <dt>HF repo</dt>
            <dd>{listing.repoId}</dd>
          </>
        )}
        {listing.baseModel && (
          <>
            <dt>Base model</dt>
            <dd>{listing.baseModel}</dd>
          </>
        )}
        {listing.commitSha && (
          <>
            <dt>Commit</dt>
            <dd>{shortHash(listing.commitSha, 12)}</dd>
          </>
        )}
        {listing.lab && (
          <>
            <dt>Lab</dt>
            <dd>{listing.lab}</dd>
          </>
        )}
        {listing.fileClass && listing.fileClass !== "n/a" && (
          <>
            <dt>Class</dt>
            <dd>{listing.fileClass}</dd>
          </>
        )}
        {listing.modelType && listing.modelType !== "n/a" && (
          <>
            <dt>Model kind</dt>
            <dd>{listing.modelType}</dd>
          </>
        )}
        {listing.quantType && listing.quantType !== "n/a" && (
          <>
            <dt>Quant format</dt>
            <dd>{listing.quantType}</dd>
          </>
        )}
        {listing.quantDetail && (
          <>
            <dt>Quant detail</dt>
            <dd>{listing.quantDetail}</dd>
          </>
        )}
        {listing.quantBpw !== undefined && (
          <>
            <dt>Est. bits/weight</dt>
            <dd>{listing.quantBpw}</dd>
          </>
        )}
        {listing.quantDev && (
          <>
            <dt>Quantized by</dt>
            <dd>{listing.quantDev}</dd>
          </>
        )}
        {listing.subfolder && (
          <>
            <dt>Subfolder</dt>
            <dd>{listing.subfolder}</dd>
          </>
        )}
        {listing.version && (
          <>
            <dt>Revision</dt>
            <dd>{listing.version}</dd>
          </>
        )}
        {listing.createdAt && (
          <>
            <dt>Model created</dt>
            <dd>{listing.createdAt}</dd>
          </>
        )}
        {listing.pieces && (
          <>
            <dt>Pieces</dt>
            <dd>
              {listing.pieces.count} pieces · {humanSize(listing.pieces.length)} each
            </dd>
          </>
        )}
        <dt>Submitted by</dt>
        <dd title={listing.event.pubkey}>
          <a
            className="submitter-link"
            href={`https://njump.me/${submitterNpub}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <AvatarIcon seed={listing.event.pubkey} picture={submitterProfile?.picture} />
            {submitterName}
          </a>{" "}
          <button
            className="copy-inline"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              copyToClipboard(submitterNpub, setCopyNpubLabel);
            }}
          >
            {copyNpubLabel}
          </button>
        </dd>
      </dl>

      {listing.urls.length > 0 && (
        <div className="section">
          <div className="label">.torrent files ({listing.urls.length})</div>
          <div>
            {listing.urls.map((u) => (
              <TorrentFileRow key={u} url={u} expectedSha256={listing.torrentSha256} expectedSize={listing.torrentSize} />
            ))}
          </div>
        </div>
      )}

      <Collapsible label="Webseeds" items={listing.webseeds} />
      <Collapsible label="Trackers" items={listing.trackers} />

      <div className="seeder-section">
        <div className="seeder-head">No seeders?</div>
        <div className="seeder-sub">If you can't download because there are no seeders, let others know.</div>
        <button className="seeder-btn" onClick={() => setSeederModalOpen(true)}>
          No seeders — request seeders
        </button>
      </div>

      {seederModalOpen && (
        <RequestSeedersModal listing={listing} onClose={() => setSeederModalOpen(false)} onPublished={onPublished} />
      )}
    </>
  );
}
