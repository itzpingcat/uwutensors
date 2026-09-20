import type {
  ClientAnnouncement,
  FileClass,
  ListingType,
  ModelKind,
  ModelRequest,
  ModelType,
  NostrEvent,
  PieceLayout,
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

/** Parses uwutensors-v1's compact "<count>*<length_bytes>" pieces tag. */
function parsePieceLayout(raw: string | undefined): PieceLayout | undefined {
  if (!raw) return undefined;
  const m = /^(\d+)\*(\d+)$/.exec(raw.trim());
  if (!m) return undefined;
  return { count: Number(m[1]), length: Number(m[2]) };
}

/** Inverse of parsePieceLayout — for submit.ts and any legacy->v1 conversion. */
export function formatPieceLayout(layout: PieceLayout): string {
  return `${layout.count}*${layout.length}`;
}

const RECOGNIZED_LISTING_TYPES: readonly ListingType[] = ["model", "dataset"];

/**
 * Parse a kind 30099 event whose `schema` tag is exactly "uwutensors-v1".
 * Returns null if required v1 fields are missing, or if `type` isn't one
 * of the two types this client recognizes — an unrecognized type is
 * treated as unknown content, not assumed to be a model.
 */
function parseV1Listing(event: NostrEvent): TorrentListing | null {
  const infohash = tagVal(event.tags, "d");
  const magnet = tagVal(event.tags, "magnet");
  const name = tagVal(event.tags, "name");
  const sizeStr = tagVal(event.tags, "size");
  const torrentSha256 = tagVal(event.tags, "x");
  const typeStr = tagVal(event.tags, "type");
  if (!infohash || !magnet || !name || !sizeStr || !torrentSha256 || !typeStr) return null;
  if (!RECOGNIZED_LISTING_TYPES.includes(typeStr as ListingType)) return null;
  // A non-numeric/garbage size tag would otherwise become NaN totalSize,
  // poisoning the grid's total-size sum, size sorts, and humanSize display.
  const totalSize = Number(sizeStr);
  if (!Number.isFinite(totalSize) || totalSize < 0) return null;

  return {
    event,
    schemaVersion: "v1",
    infohash,
    magnet,
    name,
    totalSize,
    torrentSha256,
    type: typeStr as ListingType,
    pieces: parsePieceLayout(tagVal(event.tags, "pieces")),
    urls: tagVals(event.tags, "url"),
    webseeds: tagVals(event.tags, "webseed"),
    trackers: tagVals(event.tags, "tracker"),
    source: tagVal(event.tags, "source"),
    card: tagVal(event.tags, "card"),
    lab: tagVal(event.tags, "lab"),
    tags: tagVals(event.tags, "tags"),
    modelType: tagVal(event.tags, "model_type") as ModelType | undefined,
    quantType: tagVal(event.tags, "quant_type") as QuantType | undefined,
    source_commit: tagVal(event.tags, "source_commit"),
    sourceCommitName: tagVal(event.tags, "source_commit_name"),
  };
}

/**
 * Converts a pre-v1 ("llama.garden schema") listing up to the
 * uwutensors-v1 runtime shape, but ONLY when it carries "sufficient
 * data" to actually function as a usable listing — not just the bare
 * minimum that used to pass parsing. A legacy event with no torrent
 * hash and no way to resolve piece info is unverifiable and largely
 * useless (can't hash-verify the .torrent, can't show a file list), so
 * rather than silently laundering it into a trusted-looking v1 object,
 * we reject it here the same as a malformed event.
 *
 * "Sufficient" = the original required fields (d/magnet/name/size),
 * PLUS a torrent sha256 (`x`) to verify against, PLUS at least one way
 * to actually get the torrent's piece layout: either a legacy
 * pieces+piece_length pair, or a mirror URL a client could fetch the
 * .torrent from and derive pieces itself.
 */
function convertLegacyListing(event: NostrEvent): TorrentListing | null {
  const infohash = tagVal(event.tags, "d");
  const magnet = tagVal(event.tags, "magnet");
  const name = tagVal(event.tags, "name");
  const sizeStr = tagVal(event.tags, "size");
  const torrentSha256 = tagVal(event.tags, "x");
  if (!infohash || !magnet || !name || !sizeStr || !torrentSha256) return null;

  const legacyPieces = numOrUndef(tagVal(event.tags, "pieces"));
  const legacyPieceLength = numOrUndef(tagVal(event.tags, "piece_length"));
  const urls = tagVals(event.tags, "url");
  const hasPieceInfo = legacyPieces !== undefined && legacyPieceLength !== undefined;
  if (!hasPieceInfo && urls.length === 0) return null; // insufficient data — reject
  // Same NaN guard as parseV1Listing — a garbage size tag must not reach
  // the grid's size math.
  const totalSize = Number(sizeStr);
  if (!Number.isFinite(totalSize) || totalSize < 0) return null;

  return {
    event,
    schemaVersion: "legacy",
    infohash,
    magnet,
    name,
    totalSize,
    torrentSha256,
    type: "model", // the only thing the legacy schema ever published
    pieces: hasPieceInfo ? { count: legacyPieces!, length: legacyPieceLength! } : undefined,
    torrentSize: numOrUndef(tagVal(event.tags, "torrent_size")),
    torrentCreatedAt: tagVal(event.tags, "torrent_created"),
    urls,
    webseeds: tagVals(event.tags, "webseed"),
    trackers: tagVals(event.tags, "tracker"),
    source: tagVal(event.tags, "source"),

    displayName: tagVal(event.tags, "display_name"),
    fileClass: tagVal(event.tags, "file_class") as FileClass | undefined,
    modelType: normalizeLegacyModelKind(tagVal(event.tags, "model_kind") as ModelKind | undefined),
    quantType: tagVal(event.tags, "quant_type") as QuantType | undefined,
    quantDev: tagVal(event.tags, "quant_dev"),
    quantDetail: tagVal(event.tags, "quant_detail"),
    quantBpw: numOrUndef(tagVal(event.tags, "quant_bpw")),
    lab: tagVal(event.tags, "lab"),
    tags: [],
    modelName: tagVal(event.tags, "model_name"),
    repoId: tagVal(event.tags, "repo_id"),
    baseModel: tagVal(event.tags, "base_model"),
    subfolder: tagVal(event.tags, "subfolder"),
    torrentName: tagVal(event.tags, "torrent_name"),
    createdAt: tagVal(event.tags, "created_at"),
    version: tagVal(event.tags, "version"),
    commitSha: tagVal(event.tags, "commit_sha"),
    source_commit: tagVal(event.tags, "commit_sha"),
  };
}

/**
 * Parse a kind 30099 event into a typed TorrentListing, or null if
 * malformed / insufficient. Tries uwutensors-v1 first (schema tag exact
 * match); if that tag is absent or set to anything else, falls back to
 * interpreting the event under the legacy schema and upgrading it to the
 * v1 runtime shape — but only if convertLegacyListing finds enough data
 * to make it usable (see its doc comment). Everything past this function
 * only ever sees the v1 shape.
 */
export function parseTorrentListing(event: NostrEvent): TorrentListing | null {
  if (tagVal(event.tags, "schema") === "uwutensors-v1") {
    return parseV1Listing(event);
  }
  return convertLegacyListing(event);
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

/** Legacy schema's model_kind used "fine-tune" (hyphenated); v1's
 * model_type uses "finetune". Normalizes so a converted legacy listing's
 * modelType always matches the v1 vocabulary the rest of the app reads. */
function normalizeLegacyModelKind(kind: ModelKind | undefined): ModelType | undefined {
  if (kind === "fine-tune") return "finetune";
  if (kind === "base") return "base";
  return undefined;
}

function numOrUndef(s: string | undefined): number | undefined {
  if (s === undefined) return undefined;
  const n = Number(s);
  return Number.isNaN(n) ? undefined : n;
}
