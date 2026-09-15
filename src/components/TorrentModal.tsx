import { useState } from "react";
import type { TorrentListing } from "../types";
import { humanSize, shortHash } from "../lib/format";
import { RequestSeedersModal } from "./RequestSeedersModal";

interface Props {
  listing: TorrentListing;
  onClose: () => void;
  onPublished: (msg: string) => void;
}

export function TorrentModal({ listing, onClose, onPublished }: Props) {
  const [seederModalOpen, setSeederModalOpen] = useState(false);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          &times;
        </button>
        <h2>{listing.displayName ?? listing.name}</h2>
        <dl className="modal-fields">
          <dt>Infohash</dt>
          <dd>{listing.infohash}</dd>
          <dt>Size</dt>
          <dd>{humanSize(listing.totalSize)}</dd>
          {listing.repoId && (
            <>
              <dt>HF repo</dt>
              <dd>{listing.repoId}</dd>
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
          {listing.quantDetail && (
            <>
              <dt>Quant</dt>
              <dd>{listing.quantDetail}</dd>
            </>
          )}
          <dt>Publisher</dt>
          <dd title={listing.event.pubkey}>{shortHash(listing.event.pubkey, 16)}</dd>
          <dt>Trackers</dt>
          <dd>{listing.trackers.length}</dd>
          <dt>Webseeds</dt>
          <dd>{listing.webseeds.length}</dd>
        </dl>
        <div className="modal-actions">
          <a className="btn" href={listing.magnet}>
            Open magnet
          </a>
          <button className="btn btn-secondary" onClick={() => setSeederModalOpen(true)}>
            Request seeders
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
