import type { FilterSettings, HfVerificationStatus, NostrEvent, TorrentListing } from "../types";

/**
 * The trust/filter pipeline discussed at length: five tiers, ordered by
 * how strong a guarantee they actually provide.
 *
 *   Tier 0 — HF cross-reference: the ONLY tier that verifies content
 *            correctness rather than authorship. Client-side only, and
 *            only meaningful post-download (see hfVerification.ts). It
 *            can't gate what's rendered in the grid (nothing has been
 *            downloaded yet), so it surfaces as a per-card badge state,
 *            not a listing filter — see HfVerificationStatus.
 *   Tier 1 — NIP-05: proves domain control, not correctness.
 *   Tier 2 — Web of Trust: proves social proximity, not correctness.
 *            Silently excluded from "all" combine mode when the user
 *            has no signed-in identity (no follow graph to compute from).
 *   Tier 3 — anti-spam heuristics: filters noise, not fraud.
 *   Tier 4 — allowlist: proxy for "I trust this specific publisher's
 *            build process." The only tier answering the real question
 *            of provenance, at the cost of not scaling past personal trust.
 *
 * NOTE: this module filters/scores the *listing* (a claim). It does not
 * and cannot prove the claim true — see src/lib/hfVerification.ts for the
 * only check that does that, which necessarily happens after download.
 */

export interface ListingTrustContext {
  nip05Verified?: boolean; // resolved elsewhere (network call), passed in
  webOfTrustScore?: number; // hops-weighted score from the user's follow graph; undefined = unavailable
  hasSignedInIdentity: boolean;
  powBits: number; // leading zero bits of event.id
  metadataCompleteness: number; // 0-100, computed from tag presence
}

export interface FilterResult {
  visible: boolean;
  passedTiers: string[];
  failedTiers: string[];
  skippedTiers: string[]; // tiers that were enabled but unavailable (e.g. WoT, no identity)
}

function checkAllowlist(
  event: NostrEvent,
  settings: FilterSettings["allowlist"]
): boolean | undefined {
  if (!settings.enabled) return undefined;
  if (settings.pubkeys.length === 0) return undefined; // empty allowlist = not enforced
  return settings.pubkeys.includes(event.pubkey);
}

function checkNip05(
  settings: FilterSettings,
  ctx: ListingTrustContext
): boolean | undefined {
  if (!settings.requireNip05) return undefined;
  if (ctx.nip05Verified === undefined) return undefined; // not resolved yet
  return ctx.nip05Verified;
}

function checkWebOfTrust(
  settings: FilterSettings["webOfTrust"],
  ctx: ListingTrustContext
): boolean | undefined {
  if (!settings.enabled) return undefined;
  if (!ctx.hasSignedInIdentity || ctx.webOfTrustScore === undefined) {
    return undefined; // unavailable — auto-excluded, never counted as fail
  }
  return ctx.webOfTrustScore >= settings.minScore;
}

function checkAntiSpam(
  settings: FilterSettings["antiSpam"],
  ctx: ListingTrustContext
): boolean | undefined {
  if (!settings.enabled) return undefined;
  if (ctx.powBits < settings.minPowBits) return false;
  const score = Math.min(100, ctx.metadataCompleteness);
  return score >= settings.threshold;
}

export function evaluateListing(
  listing: TorrentListing,
  settings: FilterSettings,
  ctx: ListingTrustContext
): FilterResult {
  const checks: Array<[string, boolean | undefined]> = [
    ["allowlist", checkAllowlist(listing.event, settings.allowlist)],
    ["nip05", checkNip05(settings, ctx)],
    ["webOfTrust", checkWebOfTrust(settings.webOfTrust, ctx)],
    ["antiSpam", checkAntiSpam(settings.antiSpam, ctx)],
  ];

  const passedTiers: string[] = [];
  const failedTiers: string[] = [];
  const skippedTiers: string[] = [];

  for (const [name, result] of checks) {
    if (result === undefined) skippedTiers.push(name);
    else if (result) passedTiers.push(name);
    else failedTiers.push(name);
  }

  const evaluated = passedTiers.length + failedTiers.length;
  let visible: boolean;
  if (evaluated === 0) {
    // No enabled tier could be evaluated at all — default to visible;
    // the empty-filter-state is not itself a rejection.
    visible = true;
  } else if (settings.combineMode === "all") {
    visible = failedTiers.length === 0;
  } else {
    visible = passedTiers.length > 0;
  }

  return { visible, passedTiers, failedTiers, skippedTiers };
}

/** Simple metadata-completeness heuristic for the anti-spam tier. */
export function metadataCompleteness(listing: TorrentListing): number {
  const fields = [
    listing.source,
    listing.repoId,
    listing.lab,
    listing.modelName,
    listing.commitSha,
    listing.webseeds.length > 0,
    listing.trackers.length > 0,
  ];
  const present = fields.filter(Boolean).length;
  return Math.round((present / fields.length) * 100);
}

/** Count leading zero bits of a hex string (NIP-13 PoW difficulty). */
export function leadingZeroBits(hex: string): number {
  let bits = 0;
  for (const c of hex) {
    const nibble = parseInt(c, 16);
    if (nibble === 0) {
      bits += 4;
      continue;
    }
    bits += Math.clz32(nibble) - 28;
    break;
  }
  return bits;
}

export type { HfVerificationStatus };
