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
  type: "model" | "dataset";
  sort: SortOption;
}

export type SortOption = "downloads" | "newest" | "oldest" | "largest" | "smallest" | "name-asc" | "name-desc";

const DEFAULT_FILTERS: CatalogFilters = { search: "", format: "all", fileClass: "all", type: "model", sort: "downloads" };

export function useFilteredListings() {
  const listings = useCatalogStore((s) => s.listings);
  const nip05Verified = useCatalogStore((s) => s.nip05Verified);
  const profiles = useCatalogStore((s) => s.profiles);
  const mutedPubkeys = useCatalogStore((s) => s.mutedPubkeys);
  const pumpStatus = useCatalogStore((s) => s.pumpStatus);
  const approvalsByCurator = useCatalogStore((s) => s.approvalsByCurator);
  const filterSettings = useSettingsStore((s) => s.settings.filters);
  const [filters, setFilters] = useState<CatalogFilters>(DEFAULT_FILTERS);

  const results = useMemo(() => {
    // Trusted curators = the allowlist itself (same semantics as
    // checkAllowlist: enabled AND non-empty). A listing is curator-approved
    // when any trusted curator published a kind 1985 label approving its
    // event id — labels from anyone else never count, since kind 1985 can
    // be published by anyone approving anything.
    const trustedCurators = filterSettings.allowlist.enabled
      ? filterSettings.allowlist.pubkeys
      : [];

    const all = Array.from(listings.values());
    const results = all.filter(
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
    return [...results].sort((a, b) => compareListings(a, b, filters.sort, pumpStatus));

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
      const isApproved =
        trustedCurators.length > 0 &&
        trustedCurators.some((pk) => approvalsByCurator.get(pk)?.has(listing.event.id));
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
        isApproved,
      });
      return visible;
    }
  }, [listings, filters, filterSettings, nip05Verified, profiles, mutedPubkeys, pumpStatus, approvalsByCurator]);

  const totalSize = useMemo(() => results.reduce((sum, l) => sum + l.totalSize, 0), [results]);

  return { listings: results, filters, setFilters, totalSize };
}

function compareListings(a: TorrentListing, b: TorrentListing, sort: SortOption, pumps: Map<string, { downloads: number }>): number {
  if (sort === "downloads") return (pumps.get(b.infohash)?.downloads ?? 0) - (pumps.get(a.infohash)?.downloads ?? 0) || compareName(a, b);
  if (sort === "newest") return b.event.created_at - a.event.created_at || compareName(a, b);
  if (sort === "oldest") return a.event.created_at - b.event.created_at || compareName(a, b);
  if (sort === "largest") return b.totalSize - a.totalSize || compareName(a, b);
  if (sort === "smallest") return a.totalSize - b.totalSize || compareName(a, b);
  return (sort === "name-desc" ? -1 : 1) * compareName(a, b);
}

function compareName(a: TorrentListing, b: TorrentListing): number {
  return (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name, undefined, { sensitivity: "base" });
}

function passesUiFilters(listing: TorrentListing, filters: CatalogFilters): boolean {
  if (filters.format !== "all" && listing.quantType !== filters.format) return false;
  if (filters.fileClass !== "all" && listing.fileClass !== filters.fileClass) return false;
  if (listing.type !== filters.type) return false;
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
