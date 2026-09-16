import type {
  ClientAnnouncement,
  FileClass,
  ModelKind,
  ModelRequest,
  NostrEvent,
  ProfileMetadata,
  QuantType,
  SeederRequest,
  TorrentListing,
} from "../types";

function tagVal(tags: string[][], name: string): string | undefined {
  return tags.find((t) => t[0] === name)?.[1];
}

function tagVals(tags: string[][], name: string): string[] {
  return tags.filter((t) => t[0] === name).map((t) => t[1]).filter(Boolean);
}

/** Parse a kind 30099 event into a typed TorrentListing, or null if malformed. */
export function parseTorrentListing(event: NostrEvent): TorrentListing | null {
  const infohash = tagVal(event.tags, "d");
  const magnet = tagVal(event.tags, "magnet");
  const name = tagVal(event.tags, "name");
  const sizeStr = tagVal(event.tags, "size");
  if (!infohash || !magnet || !name || !sizeStr) return null;

  return {
    event,
    infohash,
    magnet,
    name,
    totalSize: Number(sizeStr),
    pieces: numOrUndef(tagVal(event.tags, "pieces")),
    pieceLength: numOrUndef(tagVal(event.tags, "piece_length")),
    torrentSha256: tagVal(event.tags, "x"),
    torrentSize: numOrUndef(tagVal(event.tags, "torrent_size")),
    torrentCreatedAt: tagVal(event.tags, "torrent_created"),
    urls: tagVals(event.tags, "url"),
    webseeds: tagVals(event.tags, "webseed"),
    trackers: tagVals(event.tags, "tracker"),
    source: tagVal(event.tags, "source"),

    displayName: tagVal(event.tags, "display_name"),
    fileClass: tagVal(event.tags, "file_class") as FileClass | undefined,
    modelKind: tagVal(event.tags, "model_kind") as ModelKind | undefined,
    quantType: tagVal(event.tags, "quant_type") as QuantType | undefined,
    quantDev: tagVal(event.tags, "quant_dev"),
    quantDetail: tagVal(event.tags, "quant_detail"),
    quantBpw: numOrUndef(tagVal(event.tags, "quant_bpw")),
    lab: tagVal(event.tags, "lab"),
    modelName: tagVal(event.tags, "model_name"),
    repoId: tagVal(event.tags, "repo_id"),
    baseModel: tagVal(event.tags, "base_model"),
    subfolder: tagVal(event.tags, "subfolder"),
    torrentName: tagVal(event.tags, "torrent_name"),
    createdAt: tagVal(event.tags, "created_at"),
    version: tagVal(event.tags, "version"),
    commitSha: tagVal(event.tags, "commit_sha"),
  };
}

export function parseClientAnnouncement(event: NostrEvent): ClientAnnouncement | null {
  const version = tagVal(event.tags, "version");
  const sha256 = tagVal(event.tags, "sha256");
  const size = tagVal(event.tags, "size");
  if (!version || !sha256 || !size) return null;
  return {
    event,
    version: Number(version),
    sha256,
    size: Number(size),
    urls: tagVals(event.tags, "url"),
  };
}

export function parseSeederRequest(event: NostrEvent): SeederRequest | null {
  const torrentEventId = tagVal(event.tags, "e");
  const infohash = tagVal(event.tags, "infohash");
  if (!torrentEventId || !infohash) return null;
  return { event, torrentEventId, infohash, name: tagVal(event.tags, "name") };
}

export function parseModelRequest(event: NostrEvent): ModelRequest | null {
  const name = tagVal(event.tags, "name");
  if (!name) return null;
  return {
    event,
    name,
    links: tagVals(event.tags, "link"),
    type: tagVal(event.tags, "type") ?? "all",
    vram: tagVal(event.tags, "vram"),
  };
}

/** Approved (vouched-for) 30099 event ids from a kind 1985 NIP-32 label event. */
export function parseApprovalLabel(
  event: NostrEvent,
  namespace: string
): string[] {
  const isApprove = event.tags.some(
    (t) => t[0] === "l" && t[1] === "approve" && t[2] === namespace
  );
  if (!isApprove) return [];
  return event.tags.filter((t) => t[0] === "e" && t[1]).map((t) => t[1]);
}

/**
 * Parse a kind 0 (NIP-01 metadata) event's JSON content into a typed
 * profile. Malformed/non-object content parses to null rather than
 * throwing — a bad kind 0 from some relay shouldn't crash the app.
 */
export function parseProfileMetadata(event: NostrEvent): ProfileMetadata | null {
  let data: Record<string, unknown>;
  try {
    const parsed = JSON.parse(event.content);
    if (typeof parsed !== "object" || parsed === null) return null;
    data = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return {
    pubkey: event.pubkey,
    name: str(data.name),
    displayName: str(data.display_name) ?? str(data.displayName),
    picture: str(data.picture),
    nip05: str(data.nip05),
    about: str(data.about),
    updatedAt: event.created_at,
  };
}

/**
 * Parse a kind 10000 (NIP-51 mute list) event's `p` tags into a set of
 * blocked pubkeys (hex). NIP-51 also allows an encrypted `content` payload
 * for a "private" mute list, but that requires the signing key to decrypt
 * (NIP-04/44) — out of scope for now, so this only reads the public `p`
 * tags, same as every other NIP-51 list this app doesn't decrypt.
 */
export function parseMuteList(event: NostrEvent): Set<string> {
  return new Set(tagVals(event.tags, "p"));
}

function numOrUndef(s: string | undefined): number | undefined {
  if (s === undefined) return undefined;
  const n = Number(s);
  return Number.isNaN(n) ? undefined : n;
}
