/**
 * Derives the fields a uwutensors-v1 listing actually requires (infohash,
 * magnet, piece layout, torrent sha256) straight from a fetched .torrent
 * file's own bytes — never hand-typed by the publisher. This is what lets
 * AddTorrentModal satisfy parseV1Listing's required fields for real,
 * instead of the old flow's synthetic "d" tag that never round-tripped
 * through the parser correctly.
 *
 * Infohash is SHA-1 of the raw bencoded `info` dict (BEP 3) — this is
 * BitTorrent v1's infohash definition; v2/hybrid torrents (BEP 52) are out
 * of scope for now, same as the rest of this codebase.
 */
import { decodeBencode, type BencodeValue } from "./bencode";

export interface DerivedTorrentMeta {
  infohash: string; // 40-char lowercase hex
  magnet: string;
  totalSize: number;
  pieces: { count: number; length: number };
  torrentSha256: string;
  name: string; // the torrent's own info.name, for prefilling the form
  trackers: string[]; // from the .torrent's own announce/announce-list
  webseeds: string[]; // from the .torrent's own url-list (BEP 19)
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Re-encodes a decoded bencode value back to bytes — used to isolate the
 * raw `info` dict's bytes for infohash hashing, since BEP 3 defines the
 * infohash over the dict's exact original encoding, not a semantic copy. */
function encodeBencode(value: BencodeValue): Uint8Array {
  const chunks: Uint8Array[] = [];
  const enc = new TextEncoder();

  function push(s: string) {
    chunks.push(enc.encode(s));
  }

  function walk(v: BencodeValue) {
    if (v instanceof Uint8Array) {
      push(`${v.length}:`);
      chunks.push(v);
    } else if (typeof v === "number") {
      push(`i${v}e`);
    } else if (Array.isArray(v)) {
      push("l");
      for (const item of v) walk(item);
      push("e");
    } else {
      push("d");
      // Bencode dicts require lexicographic key order; Map iteration order
      // from our decoder matches file order, which for a well-formed
      // .torrent is already sorted per BEP 3 — but sort defensively so a
      // hand-edited or nonconforming file still infohashes correctly.
      const keys = [...v.keys()].sort();
      for (const k of keys) {
        push(`${k.length}:${k}`);
        walk(v.get(k)!);
      }
      push("e");
    }
  }

  walk(value);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** digest() over the view itself (honoring byteOffset/length) — see
 *  hfVerification.ts's digestBytes for why .buffer is never hashed directly. */
function digestBytes(algo: "SHA-256" | "SHA-1", bytes: Uint8Array): Promise<ArrayBuffer> {
  return crypto.subtle.digest(algo, bytes as unknown as ArrayBuffer);
}

async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const digest = await digestBytes("SHA-1", bytes);
  return bytesToHex(new Uint8Array(digest));
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await digestBytes("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

export function buildMagnetUri(infohash: string, name: string, trackers: string[]): string {
  const params = new URLSearchParams();
  params.set("dn", name);
  for (const t of trackers) params.append("tr", t);
  return `magnet:?xt=urn:btih:${infohash}&${params.toString()}`;
}

/** Recover a human-facing HF repo name when a torrent uses a commit SHA as
 * info.name for its webseed URL layout. */
export function inferDisplayNameFromWebseeds(webseeds: string[]): string | undefined {
  for (const webseed of webseeds) {
    try {
      const parts = new URL(webseed).pathname.split("/").filter(Boolean);
      const resolveIndex = parts.indexOf("resolve");
      if (resolveIndex >= 2) return decodeURIComponent(parts[resolveIndex - 1]);
    } catch {
      // Try the next webseed.
    }
  }
  return undefined;
}

/**
 * Decodes a fetched .torrent file's bytes into everything a v1 listing
 * needs. Throws if the file isn't a well-formed single/multi-file BEP-3
 * torrent with a piece length — callers should surface that as a form
 * validation error, not silently fall back to fabricated values.
 */
export async function deriveTorrentMeta(torrentBytes: ArrayBuffer | Uint8Array): Promise<DerivedTorrentMeta> {
  const u8 = torrentBytes instanceof Uint8Array ? torrentBytes : new Uint8Array(torrentBytes);
  const decoded = decodeBencode(u8);
  if (!(decoded instanceof Map)) throw new Error("Not a valid .torrent file (expected a top-level dict).");
  const info = decoded.get("info");
  if (!(info instanceof Map)) throw new Error("Not a valid .torrent file (missing info dict).");

  const infoBytes = encodeBencode(info);
  const infohash = await sha1Hex(infoBytes);
  const torrentSha256 = await sha256Hex(u8);

  const pieceLength = info.get("piece length");
  if (typeof pieceLength !== "number") throw new Error(".torrent file has no piece length.");
  const piecesRaw = info.get("pieces");
  if (!(piecesRaw instanceof Uint8Array)) throw new Error(".torrent file has no pieces hash list.");
  const pieceCount = Math.ceil(piecesRaw.length / 20); // each piece hash is 20 bytes (SHA-1)

  const nameRaw = info.get("name");
  const name = nameRaw instanceof Uint8Array ? new TextDecoder().decode(nameRaw) : "unknown";

  let totalSize = 0;
  const files = info.get("files");
  if (Array.isArray(files)) {
    for (const f of files) {
      if (f instanceof Map) {
        const length = f.get("length");
        if (typeof length === "number") totalSize += length;
      }
    }
  } else {
    const length = info.get("length");
    if (typeof length === "number") totalSize = length;
  }

  const trackers = extractTrackers(decoded);
  const webseeds = extractWebseeds(decoded);

  return {
    infohash,
    magnet: buildMagnetUri(infohash, name, trackers),
    totalSize,
    pieces: { count: pieceCount, length: pieceLength },
    torrentSha256,
    name,
    trackers,
    webseeds,
  };
}

/** Extracts BEP-19 HTTP/HTTPS webseed URLs from a .torrent's top-level
 * `url-list` field, which can be either a single byte string or a list of
 * them depending on the client that created the torrent. */
function extractWebseeds(decoded: Map<string, BencodeValue>): string[] {
  const urlList = decoded.get("url-list");
  if (urlList instanceof Uint8Array) return [new TextDecoder().decode(urlList)];
  if (Array.isArray(urlList)) {
    return urlList
      .filter((u): u is Uint8Array => u instanceof Uint8Array)
      .map((u) => new TextDecoder().decode(u));
  }
  return [];
}

function extractTrackers(decoded: Map<string, BencodeValue>): string[] {
  const trackers: string[] = [];
  const announce = decoded.get("announce");
  if (announce instanceof Uint8Array) trackers.push(new TextDecoder().decode(announce));
  const announceList = decoded.get("announce-list");
  if (Array.isArray(announceList)) {
    for (const tier of announceList) {
      if (Array.isArray(tier)) {
        for (const t of tier) {
          if (t instanceof Uint8Array) trackers.push(new TextDecoder().decode(t));
        }
      }
    }
  }
  return [...new Set(trackers)];
}
