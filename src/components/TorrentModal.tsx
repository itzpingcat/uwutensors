import { useState } from "react";
import type { TorrentListing } from "../types";
import { humanSize, shortHash } from "../lib/format";
import { fetchAndVerifyTorrent, magnetWithVerifiedSource } from "../lib/torrentDownload";
import { useCatalogStore } from "../store/catalogStore";
import { RequestSeedersModal } from "./RequestSeedersModal";

interface Props {
  listing: TorrentListing;
  onClose: () => void;
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

export function TorrentModal({ listing, onClose, onPublished }: Props) {
  const [seederModalOpen, setSeederModalOpen] = useState(false);
  const [magnetOut, setMagnetOut] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copyMagnetLabel, setCopyMagnetLabel] = useState("Copy magnet link");
  const pump = useCatalogStore((s) => s.pumpStatus.get(listing.infohash));

  const seederCount = pump?.seeders.length ?? 0;
  const webseedCount = listing.webseeds.length;
  const downloads = pump?.downloads ?? 0;

  // A magnet URI with no BitTorrent seeders behind it cannot resolve at
  // all — ut_metadata (fetching the torrent metadata over the swarm) needs
  // at least one peer, and most clients don't fall back to the magnet's
  // own webseed (`ws=`) tags the way a webseed-aware client with the
  // actual .torrent file does. This was the "magnet links don't work for
  // webseed-only listings" bug: the old modal rendered a bare
  // `<a href={listing.magnet}>` unconditionally, with no seeder-awareness
  // at all, so it silently gave webseed-only listings a magnet link that
  // could never resolve. Mirrors the original's `noSeeders` gate, which
  // disables the button and tells the user to use the .torrent file with
  // a webseed-capable client instead.
  const noSeeders = seederCount === 0;

  let seedLine = `${webseedCount} web seed${webseedCount !== 1 ? "s" : ""}`;
  if (seederCount > 0) seedLine += ` + ${seederCount} seeder${seederCount !== 1 ? "s" : ""}`;
  if (downloads > 0) seedLine += ` · ${downloads} download${downloads !== 1 ? "s" : ""}`;

  async function generateMagnet() {
    if (listing.urls.length === 0) {
      // No .torrent mirrors to verify against — fall back to the raw
      // magnet as-is (still gated by noSeeders above).
      setMagnetOut(listing.magnet);
      return;
    }
    setGenerating(true);
    try {
      const result = await fetchAndVerifyTorrent(listing.urls, listing.torrentSha256, listing.torrentSize);
      setMagnetOut(magnetWithVerifiedSource(listing.magnet, result.sourceUrl));
    } catch {
      // Verification failed — still offer the unverified magnet rather
      // than blocking the user entirely, same spirit as the original
      // (which only refuses to offer anything at all when there are no
      // seeders, not when verification fails).
      setMagnetOut(listing.magnet);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          &times;
        </button>
        <h2>{listing.displayName ?? listing.name}</h2>

        <div className="pump-section">
          <div className="pump-head">Seed status</div>
          <div className="pump-status-line">{seedLine}</div>
        </div>

        <div className="magnet-section">
          <div className="magnet-btn-row">
            {noSeeders ? (
              <button
                className="magnet-btn"
                disabled
                title="No seeders — magnet link cannot resolve without peers"
              >
                Generate magnet
              </button>
            ) : (
              <button className="magnet-btn" onClick={generateMagnet} disabled={generating}>
                {generating ? "Verifying…" : magnetOut ? "Regenerate magnet" : "Generate magnet"}
              </button>
            )}
            <button
              className="magnet-btn magnet-copy-btn"
              disabled={!magnetOut}
              onClick={() => magnetOut && copyToClipboard(magnetOut, setCopyMagnetLabel)}
            >
              {copyMagnetLabel}
            </button>
          </div>
          {noSeeders ? (
            <div className="magnet-note">
              No bittorrent seeders, magnet link won't work. Use the .torrent file with a
              webseed-capable client (e.g. Transmission).
            </div>
          ) : (
            magnetOut && <div className="magnet-out">{magnetOut}</div>
          )}
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
          {listing.modelKind && listing.modelKind !== "n/a" && (
            <>
              <dt>Model kind</dt>
              <dd>{listing.modelKind}</dd>
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
          {(listing.pieces || listing.pieceLength) && (
            <>
              <dt>Pieces</dt>
              <dd>
                {listing.pieces} pieces · {humanSize(listing.pieceLength ?? 0)} each
              </dd>
            </>
          )}
          <dt>Publisher</dt>
          <dd title={listing.event.pubkey}>{shortHash(listing.event.pubkey, 16)}</dd>
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
          <div className="seeder-sub">
            If you can't download because there are no seeders, let others know.
          </div>
          <button className="seeder-btn" onClick={() => setSeederModalOpen(true)}>
            No seeders — request seeders
          </button>
        </div>
      </div>
      {seederModalOpen && (
        <RequestSeedersModal
          listing={listing}
          onClose={() => setSeederModalOpen(false)}
          onPublished={onPublished}
        />
      )}
    </div>
  );
}
