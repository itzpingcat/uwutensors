import { useMemo, useState } from "react";
import type { TorrentListing } from "../types";
import { useCatalogStore } from "../store/catalogStore";
import { useSettingsStore } from "../store/settingsStore";
import { evaluateListing, leadingZeroBits, metadataCompleteness } from "../lib/filterPipeline";
import { isLoggedIn } from "../nostr/identity";

export interface CatalogFilters {
  search: string;
  format: string; // quant_type or "all"
  fileClass: string; // "all" | FileClass
}

const DEFAULT_FILTERS: CatalogFilters = { search: "", format: "all", fileClass: "all" };

export function useFilteredListings() {
  const listings = useCatalogStore((s) => s.listings);
  const nip05Verified = useCatalogStore((s) => s.nip05Verified);
  const profiles = useCatalogStore((s) => s.profiles);
  const mutedPubkeys = useCatalogStore((s) => s.mutedPubkeys);
  const filterSettings = useSettingsStore((s) => s.settings.filters);
  const [filters, setFilters] = useState<CatalogFilters>(DEFAULT_FILTERS);

  const results = useMemo(() => {
    const all = Array.from(listings.values());
    return all.filter(
      (listing) =>
        // The user's own NIP-51 mute list is enforced unconditionally,
        // ahead of everything else and with no settings toggle — see
        // useMuteList.ts for why this isn't one more trust tier. Checked
        // first since it's the cheapest and most absolute of all the
        // filters here.
        !mutedPubkeys.has(listing.event.pubkey) &&
        passesUiFilters(listing, filters) &&
        passesTrustPipeline(listing)
    );

    function passesTrustPipeline(listing: TorrentListing): boolean {
      // useNip05Verification (run from CatalogGrid, over every listing —
      // see its own comment for why) is what actually fetches every
      // author's kind 0 profile, so this reuses that same fetch rather
      // than triggering a second one just for picture/name presence.
      // Resolution-attempted is tracked via nip05Verified.has(pubkey), not
      // profiles.has(pubkey) — an author with NO kind 0 at all (common)
      // never gets a profiles entry, which would otherwise leave
      // hasProfilePicture/hasProfileName stuck at undefined (= "not
      // resolved yet") forever, the same silently-skipped-forever bug
      // class the NIP-05 fix above addressed. nip05Verified always gets a
      // true/false entry once that author's resolution attempt finishes,
      // whether or not a profile was actually found.
      const profile = profiles.get(listing.event.pubkey);
      const profileResolved = nip05Verified.has(listing.event.pubkey);
      const { visible } = evaluateListing(listing, filterSettings, {
        // See useNip05Verification.ts — this Map is what actually gets
        // populated now; before it existed, nothing ever set
        // nip05Verified, so checkNip05() in filterPipeline.ts always saw
        // "not resolved yet" and silently skipped every listing, making
        // "Require NIP-05 verified publishers" a complete no-op regardless
        // of whether an author had a real NIP-05 identifier or none at all.
        nip05Verified: nip05Verified.get(listing.event.pubkey),
        // Login (NIP-07 or local) landed a while back — see nostr/identity.ts
        // — but there's still no follow-graph fetch to compute an actual
        // webOfTrustScore from, so checkWebOfTrust() in filterPipeline.ts
        // still always treats WoT as unavailable/skipped either way. This
        // flag is now at least accurate about login state, rather than a
        // stale placeholder that predates login existing at all.
        hasSignedInIdentity: isLoggedIn(),
        powBits: leadingZeroBits(listing.event.id),
        metadataCompleteness: metadataCompleteness(listing),
        // undefined (profile not fetched/resolved yet) is preserved as-is
        // so the profile-completeness checks can tell "not resolved" apart
        // from "resolved and genuinely missing" the same way nip05Verified
        // does.
        hasProfilePicture: profileResolved ? !!profile?.picture : undefined,
        hasProfileName: profileResolved ? !!(profile?.displayName || profile?.name) : undefined,
        hasProfileDescription: profileResolved ? !!profile?.about : undefined,
      });
      return visible;
    }
  }, [listings, filters, filterSettings, nip05Verified, profiles, mutedPubkeys]);

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
