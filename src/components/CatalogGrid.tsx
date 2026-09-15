import { useState } from "react";
import { useFilteredListings } from "../hooks/useFilteredListings";
import { usePumpPolling } from "../hooks/usePumpPolling";
import { TorrentCard } from "./TorrentCard";
import { TorrentModal } from "./TorrentModal";
import { RequestModelModal } from "./RequestModelModal";
import { AddTorrentModal } from "./AddTorrentModal";
import { humanSize } from "../lib/format";
import type { TorrentListing } from "../types";

interface Props {
  onPublished: (msg: string) => void;
}

export function CatalogGrid({ onPublished }: Props) {
  const { listings, filters, setFilters, totalSize } = useFilteredListings();
  const [selected, setSelected] = useState<TorrentListing | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  usePumpPolling(listings.map((l) => l.infohash));

  return (
    <>
      <div id="toolbar">
        <div id="search-wrap">
          <input
            className="search"
            placeholder="Search models…"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </div>
        <div className="toolbar-actions">
          <button className="btn-secondary" onClick={() => setRequestOpen(true)}>
            Request a model
          </button>
          <button className="btn-secondary" onClick={() => setAddOpen(true)}>
            + Add torrent
          </button>
        </div>
      </div>

      <div className="stats-row">
        <span>{listings.length} torrents</span>
        <span>{humanSize(totalSize)} total</span>
      </div>

      <div id="grid">
        {listings.map((listing) => (
          <TorrentCard key={listing.infohash} listing={listing} onOpen={setSelected} />
        ))}
        {listings.length === 0 && <div className="empty-state">No torrents match the current filters.</div>}
      </div>

      {selected && (
        <TorrentModal listing={selected} onClose={() => setSelected(null)} onPublished={onPublished} />
      )}
      {requestOpen && <RequestModelModal onClose={() => setRequestOpen(false)} onPublished={onPublished} />}
      {addOpen && <AddTorrentModal onClose={() => setAddOpen(false)} onPublished={onPublished} />}
    </>
  );
}
