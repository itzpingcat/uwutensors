import { KIND, type TorrentListing } from "../types";
import { buildSeederRequestTags } from "../nostr/submit";
import { getSigningPubkey } from "../nostr/identity";
import { useMineAndPublish } from "../hooks/useMineAndPublish";
import { PowProgressBar } from "./PowProgressBar";

interface Props {
  listing: TorrentListing;
  onClose: () => void;
  onPublished: (msg: string) => void;
}

export function RequestSeedersModal({ listing, onClose, onPublished }: Props) {
  const { submitting, pct, label, error, submit } = useMineAndPublish();

  async function handleSubmit() {
    const pubkeyHex = await getSigningPubkey();
    const tags = buildSeederRequestTags(
      pubkeyHex,
      listing.event.id,
      listing.infohash,
      listing.displayName ?? listing.name
    );
    const result = await submit(KIND.SEEDER_REQUEST, tags);
    if (result) {
      onClose();
      onPublished(
        `Seeder request published. (${result.okCount}/${result.total} relays, PoW: ${result.powBits} bits.)`
      );
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          &times;
        </button>
        <h2>Request seeders</h2>
        <p className="req-intro">for {listing.displayName ?? listing.name}</p>
        <p className="hint">
          This publishes a signed request signaling this torrent needs seeders. Anyone watching for
          seeder requests (including the pump fleet operator, if one exists) may pick it up — there is
          no guarantee anything responds.
        </p>

        <PowProgressBar active={submitting} pct={pct} label={label} />
        {error && <div className="card-error">{error}</div>}

        <button className="submit-btn btn" disabled={submitting} onClick={handleSubmit}>
          {submitting ? "Mining PoW…" : "Start — mine for 10 seconds"}
        </button>
      </div>
    </div>
  );
}
