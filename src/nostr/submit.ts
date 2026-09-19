import type { NostrEvent } from "../types";
import { APP_VERSION } from "../lib/defaults";
import { getSigningPubkey, signWithActiveIdentity } from "./identity";
import { runPow, type PowProgress, type PowResult } from "./runPow";
import { RelayPool } from "./relayPool";

const POW_DURATION_MS = 10_000;
const CLIENT_TAG = `uwutensors-${APP_VERSION}`;

// ---------------------------------------------------------------------------
// Tag builders — same schemas as waifu-magnet-22.html's kind 30103 (model
// request), 30102 (seeder request), and 30099 (user-submitted torrent
// listing), so events published here interop with existing curators/relays.
// ---------------------------------------------------------------------------

export function buildModelRequestTags(
  pubkeyHex: string,
  name: string,
  links: string[],
  type: string,
  vramGb?: string
): string[][] {
  const tags: string[][] = [["d", pubkeyHex], ["name", name]];
  for (const link of links) {
    const u = link.trim();
    if (u) tags.push(["url", u]);
  }
  tags.push(["type", type]);
  if (vramGb && !Number.isNaN(Number(vramGb))) tags.push(["vram_gb", vramGb]);
  tags.push(["client", CLIENT_TAG]);
  tags.push(["nonce", "0"]); // must stay last — the PoW worker overwrites it
  return tags;
}

export function buildSeederRequestTags(
  pubkeyHex: string,
  torrentEventId: string,
  infohash: string,
  name?: string
): string[][] {
  const tags: string[][] = [
    ["d", `${pubkeyHex}:${infohash}`],
    ["e", torrentEventId],
    ["i", infohash],
  ];
  if (name) tags.push(["name", name]);
  tags.push(["client", CLIENT_TAG]);
  tags.push(["nonce", "0"]);
  return tags;
}

/** NIP-09 deletion request for a listing owned by the active identity. */
export function buildDeletionRequestTags(listingEventId: string, listingPubkey: string, dTag: string): string[][] {
  return [
    ["e", listingEventId],
    ["a", `${30099}:${listingPubkey}:${dTag}`],
    ["client", CLIENT_TAG],
    ["nonce", "0"],
  ];
}

/**
 * Fields for publishing a fresh uwutensors-v1 kind 30099 listing. Unlike
 * the pre-v1 form this replaces, the infohash, magnet, torrent sha256
 * (`x`), and piece layout are all real values derived from the actual
 * .torrent file — see useAddTorrentForm / bencode.ts — not hand-typed
 * metadata, so what gets published always satisfies parseV1Listing's
 * required fields (and, incidentally, always counts as "sufficient" if
 * some future client had to fall back to treating it as legacy).
 */
export interface AddTorrentFields {
  infohash: string;
  magnet: string;
  name: string;
  totalSize: number;
  torrentSha256: string;
  type: "model" | "dataset";
  pieces: { count: number; length: number };
  lab?: string;
  card?: string;
  tags?: string[];
  modelType?: "base" | "finetune" | "merge";
  quantType?: string;
  urls?: string[];
  webseeds?: string[];
  trackers?: string[];
  source?: string;
  sourceCommit?: string;
  sourceCommitName?: string;
}

export function buildAddTorrentTags(fields: AddTorrentFields): string[][] {
  const tags: string[][] = [
    ["schema", "uwutensors-v1"],
    ["d", fields.infohash],
    ["magnet", fields.magnet],
    ["name", fields.name],
    ["size", String(fields.totalSize)],
    ["x", fields.torrentSha256],
    ["type", fields.type],
    ["pieces", `${fields.pieces.count}*${fields.pieces.length}`],
  ];
  if (fields.lab) tags.push(["lab", fields.lab]);
  if (fields.card) tags.push(["card", fields.card]);
  for (const t of fields.tags ?? []) tags.push(["tags", t]);
  if (fields.modelType) tags.push(["model_type", fields.modelType]);
  if (fields.quantType) tags.push(["quant_type", fields.quantType]);
  for (const u of fields.urls ?? []) tags.push(["url", u]);
  for (const w of fields.webseeds ?? []) tags.push(["webseed", w]);
  for (const t of fields.trackers ?? []) tags.push(["tracker", t]);
  if (fields.source) tags.push(["source", fields.source]);
  if (fields.sourceCommit) tags.push(["source_commit", fields.sourceCommit]);
  if (fields.sourceCommitName) tags.push(["source_commit_name", fields.sourceCommitName]);
  tags.push(["client", CLIENT_TAG]);
  tags.push(["nonce", "0"]); // must stay last — the PoW worker overwrites it
  return tags;
}

// ---------------------------------------------------------------------------
// Mine + sign + publish
// ---------------------------------------------------------------------------

export interface MineAndPublishResult {
  event: NostrEvent;
  pow: PowResult;
  publish: { ok: string[]; failed: string[] };
}

/**
 * Mines PoW on (pubkey, created_at, kind, tags, content), signs the winning
 * event with whichever identity is currently active — the logged-in NIP-07
 * extension if there is one, otherwise the local key — and publishes it to
 * the given relay pool. Mirrors the original's mine -> sign -> publishEvent
 * pipeline for the request/seeder/add-torrent forms.
 *
 * Mining always happens locally (a NIP-07 extension only exposes signing,
 * not the raw private key a mining loop would need), so we fetch the
 * signing pubkey up front, mine against it, then hand the fully-formed
 * event to signWithActiveIdentity for the actual signature — which is the
 * only step that goes through the extension when logged in via NIP-07.
 */
export async function mineAndPublish(
  pool: RelayPool,
  kind: number,
  tags: string[][],
  content: string,
  onProgress?: (p: PowProgress) => void
): Promise<MineAndPublishResult> {
  const pubkeyHex = await getSigningPubkey();
  const created_at = Math.floor(Date.now() / 1000);

  const pow = await runPow(
    { pubkey: pubkeyHex, created_at, kind, tags, content, durationMs: POW_DURATION_MS },
    onProgress
  );

  if (pow.pow < 1) {
    throw new Error(`Could not find any proof-of-work in ${POW_DURATION_MS / 1000}s. Try again.`);
  }

  const minedTags = tags.map((t) => [...t]);
  minedTags[minedTags.length - 1] = ["nonce", String(pow.nonce)];

  const signed = await signWithActiveIdentity({ kind, created_at, tags: minedTags, content });

  const publish = await pool.publish(signed);
  return { event: signed, pow, publish };
}

export { POW_DURATION_MS };
