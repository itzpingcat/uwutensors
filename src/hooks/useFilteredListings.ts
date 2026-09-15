import { useMemo, useState } from "react";
import type { TorrentListing } from "../types";
import { useCatalogStore } from "../store/catalogStore";
import { useSettingsStore } from "../store/settingsStore";
import { evaluateListing, leadingZeroBits, metadataCompleteness } from "../lib/filterPipeline";

export interface CatalogFilters {
  search: string;
  format: string; // quant_type or "all"
  fileClass: string; // "all" | FileClass
}

const DEFAULT_FILTERS: CatalogFilters = { search: "", format: "all", fileClass: "all" };

export function useFilteredListings() {
  const listings = useCatalogStore((s) => s.listings);
  const filterSettings = useSettingsStore((s) => s.settings.filters);
  const [filters, setFilters] = useState<CatalogFilters>(DEFAULT_FILTERS);

  const results = useMemo(() => {
    const all = Array.from(listings.values());
    return all.filter((listing) => passesUiFilters(listing, filters) && passesTrustPipeline(listing));

    function passesTrustPipeline(listing: TorrentListing): boolean {
      const { visible } = evaluateListing(listing, filterSettings, {
        hasSignedInIdentity: false, // wired up once NIP-07 signer support lands
        powBits: leadingZeroBits(listing.event.id),
        metadataCompleteness: metadataCompleteness(listing),
      });
      return visible;
    }
  }, [listings, filters, filterSettings]);

  const totalSize = useMemo(() => results.reduce((sum, l) => sum + l.totalSize, 0), [results]);

  return { listings: results, filters, setFilters, totalSize };
}

function passesUiFilters(listing: TorrentListing, filters: CatalogFilters): boolean {
  if (filters.format !== "all" && listing.quantType !== filters.format) return false;
  if (filters.fileClass !== "all" && listing.fileClass !== filters.fileClass) return false;
  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    const haystack = [
      listing.name,
      listing.displayName,
      listing.lab,
      listing.modelName,
      listing.repoId,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}
