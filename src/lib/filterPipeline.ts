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
  hasProfilePicture?: boolean; // resolved elsewhere from the author's kind 0 — undefined = profile not fetched yet
  hasProfileName?: boolean; // same, for name/display_name
  hasProfileDescription?: boolean; // same, for kind 0's `about` field
  /**
   * The listing's event id was approved via a kind 1985 NIP-32 label issued
   * by a curator the user trusts (on the allowlist) — see useFilteredListings,
   * which is what does that gating. An approval is a provenance signal of the
   * same strength as an allowlist pass, so it earns visibility on its own.
   */
  isApproved?: boolean;
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

/**
 * Weak on its own — trivially fakeable, proves nothing about identity or
 * intent — but a throwaway/spam account very often skips profile setup
 * entirely, so combined with the real tiers this filters out the laziest
 * ones. Three independent checks (picture / name / description), each
 * treated the same as the other combining tiers: unresolved (profile not
 * fetched yet) is skipped, not failed, same reasoning as NIP-05/WoT.
 */
function checkProfilePicture(required: boolean, ctx: ListingTrustContext): boolean | undefined {
  if (!required) return undefined;
  if (ctx.hasProfilePicture === undefined) return undefined;
  return ctx.hasProfilePicture;
}

function checkProfileName(required: boolean, ctx: ListingTrustContext): boolean | undefined {
  if (!required) return undefined;
  if (ctx.hasProfileName === undefined) return undefined;
  return ctx.hasProfileName;
}

function checkProfileDescription(required: boolean, ctx: ListingTrustContext): boolean | undefined {
  if (!required) return undefined;
  if (ctx.hasProfileDescription === undefined) return undefined;
  return ctx.hasProfileDescription;
}

export function evaluateListing(
  listing: TorrentListing,
  settings: FilterSettings,
  ctx: ListingTrustContext
): FilterResult {
  // Allowlist and curator-approval are independent positive overrides: a
  // listed publisher or curator-approved listing is visible immediately,
  // but NOT being listed/approved does not hide an otherwise trustworthy
  // listing. Neither is included in the tier count below.
  const allowlistResult = checkAllowlist(listing.event, settings.allowlist);
  const approved = ctx.isApproved === true;

  const checks: Array<[string, boolean | undefined]> = [
    ["nip05", checkNip05(settings, ctx)],
    ["webOfTrust", checkWebOfTrust(settings.webOfTrust, ctx)],
    ["antiSpam", checkAntiSpam(settings.antiSpam, ctx)],
    ["profilePicture", checkProfilePicture(settings.requireProfilePicture, ctx)],
    ["profileName", checkProfileName(settings.requireProfileName, ctx)],
    ["profileDescription", checkProfileDescription(settings.requireProfileDescription, ctx)],
  ];

  const passedTiers: string[] = [];
  const failedTiers: string[] = [];
  const skippedTiers: string[] = [];

  for (const [name, result] of checks) {
    if (result === undefined) skippedTiers.push(name);
    else if (result) passedTiers.push(name);
    else failedTiers.push(name);
  }

  // An allowlist pass or curator approval earns visibility on its own, but
  // a failed allowlist does not veto the ordinary tier calculation.
  if (allowlistResult === true || approved) {
    return {
      visible: true,
      passedTiers: [
        ...(allowlistResult === true ? ["allowlist"] : []),
        ...(approved ? ["approval"] : []),
        ...passedTiers,
      ],
      failedTiers,
      skippedTiers,
    };
  }

  const evaluated = passedTiers.length + failedTiers.length;
  let visible: boolean;
  if (evaluated === 0) {
    // No enabled tier could be evaluated at all — default to visible;
    // the empty-filter-state is not itself a rejection.
    visible = true;
  } else {
    // "Must pass at least N of the tiers that were actually evaluated."
    // Clamped to [1, evaluated] so a threshold of 0 (or one higher than
    // the number of tiers currently enabled/resolved) can't trivially
    // pass or fail everything — a threshold set for 4 tiers should still
    // behave sanely if the user later disables one down to 3.
    const threshold = Math.min(Math.max(1, settings.combineMinPass), evaluated);
    visible = passedTiers.length >= threshold;
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
