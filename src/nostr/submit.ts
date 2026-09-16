import { sha256 } from "@noble/hashes/sha2.js";
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

export interface AddTorrentFields {
  url: string;
  name: string;
  hf?: string;
  sizeGb?: string;
  fileClass: string;
  modelKind: string;
  lab?: string;
  quantType?: string;
  clientTool?: string;
  hfMatch: "yes" | "no" | "unsure";
}

export function buildAddTorrentTags(
  pubkeyHex: string,
  fields: AddTorrentFields
): string[][] {
  const enc = new TextEncoder();
  const idSeed = toHex(sha256(enc.encode(`${fields.url}:${fields.name}`)));
  const d = `user:${pubkeyHex}:${idSeed}`;

  const tags: string[][] = [
    ["d", d],
    ["url", fields.url],
    ["name", fields.name],
  ];
  if (fields.sizeGb && !Number.isNaN(Number(fields.sizeGb))) {
    tags.push(["size", String(Math.round(Number(fields.sizeGb) * 1073741824))]);
  }
  if (fields.hf) {
    try {
      tags.push(["source", new URL(fields.hf).hostname + new URL(fields.hf).pathname]);
    } catch {
      tags.push(["source", fields.hf]);
    }
    tags.push(["hf", fields.hf]);
  }
  tags.push(["file_class", fields.fileClass]);
  tags.push(["model_kind", fields.modelKind]);
  if (fields.lab) tags.push(["lab", fields.lab]);
  if (fields.quantType) tags.push(["quant_type", fields.quantType]);
  if (fields.clientTool) tags.push(["torrent_client_tool", fields.clientTool]);
  tags.push(["hf_match", fields.hfMatch]);
  tags.push(["client", CLIENT_TAG]);
  tags.push(["nonce", "0"]);
  return tags;
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
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
