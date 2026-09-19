import { useEffect, useState } from "react";
import { useFilteredListings } from "../hooks/useFilteredListings";
import { usePumpPolling } from "../hooks/usePumpPolling";
import { useSeederCount, usePumpFallbackSeederInfo } from "../hooks/useSeederCount";
import { useNip05Verification } from "../hooks/useNip05Verification";
import { useCatalogStore } from "../store/catalogStore";
import { TorrentCard } from "./TorrentCard";
import { RequestModelModal } from "./RequestModelModal";
import { AddTorrentModal } from "./AddTorrentModal";
import { humanSize } from "../lib/format";
import { isLoggedIn } from "../nostr/identity";

interface Props {
  onPublished: (msg: string) => void;
  onRequireLogin: () => void;
}

export function CatalogGrid({ onPublished, onRequireLogin }: Props) {
  const { listings, filters, setFilters, totalSize } = useFilteredListings();
  const pumpHealth = useCatalogStore((s) => s.pumpHealth);
  useEffect(() => {
    if (pumpHealth === "failed" && filters.sort === "downloads") {
      setFilters({ ...filters, sort: "newest" });
    }
  }, [pumpHealth, filters, setFilters]);
  // useNip05Verification needs to see every listing, not just the
  // already-filtered ones — a listing whose author isn't NIP-05 verified
  // yet is exactly what the "Require NIP-05" filter is supposed to hide,
  // so verifying only what's already past that filter would never resolve
  // anything for a currently-hidden author.
  const allListings = useCatalogStore((s) => s.listings);
  const [requestOpen, setRequestOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  // Publishing a torrent listing attributes it to a pubkey (see
  // AddTorrentModal), and letting that happen anonymously from a
  // never-chosen local identity made every listing effectively
  // unaccountable — anyone could publish as a fresh throwaway key with one
  // click. Requesting a model or pinging for seeders stay open to anyone
  // (lower stakes, more like a forum post), but adding a torrent now
  // requires being logged in as *some* identity, local or NIP-07, the user
  // actually chose via the login flow.
  function handleAddTorrentClick() {
    if (!isLoggedIn()) {
      onRequireLogin();
      return;
    }
    setAddOpen(true);
  }

  usePumpPolling(listings.map((l) => l.infohash));
  useSeederCount(listings);
  usePumpFallbackSeederInfo();
  useNip05Verification(Array.from(allListings.values()));

  return (
    <>
      <div id="toolbar">
        <div className="catalog-type-toggle" aria-label="Resource type">
          <button className={filters.type === "model" ? "active" : ""} onClick={() => setFilters({ ...filters, type: "model" })}>Models{filters.type === "model" && " ·"}</button>
          <button className={filters.type === "dataset" ? "active" : ""} onClick={() => setFilters({ ...filters, type: "dataset" })}>Datasets{filters.type === "dataset" && " ·"}</button>
        </div>
        <div id="search-wrap">
          <input
            className="search"
            placeholder={`Search ${filters.type}s…`}
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </div>
        <label className="sort-control">Sort by
          <select value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value as typeof filters.sort })}>
            <option value="downloads" disabled={pumpHealth === "failed"}>Most Downloaded{pumpHealth === "failed" ? " (unavailable)" : ""}</option>
            <option value="newest">Newest</option><option value="oldest">Oldest</option>
            <option value="largest">Largest</option><option value="smallest">Smallest</option>
            <option value="name-asc">Name (A-Z)</option><option value="name-desc">Name (Z-A)</option>
          </select>
        </label>
        <div className="toolbar-actions">
          <button className="btn-secondary" onClick={() => setRequestOpen(true)}>
            Request a {filters.type}
          </button>
          <button className="btn-secondary" onClick={handleAddTorrentClick}>
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
          <TorrentCard key={listing.infohash} listing={listing} />
        ))}
        {listings.length === 0 && <div className="empty-state">No torrents match the current filters.</div>}
      </div>

      {requestOpen && <RequestModelModal resourceType={filters.type} onClose={() => setRequestOpen(false)} onPublished={onPublished} />}
      {addOpen && <AddTorrentModal onClose={() => setAddOpen(false)} onPublished={onPublished} />}
    </>
  );
}
