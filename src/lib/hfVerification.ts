import type { FileVerification, HfVerificationStatus } from "../types";

/**
 * Client-side, post-download provenance verification.
 *
 * This is the corrected design from the "who do you trust" discussion:
 * hashes are NEVER trusted from the publisher/listing event, because the
 * publisher controls both the file and any hash they'd claim about it —
 * that's not verification, it's a claim wearing a hash's clothing.
 *
 * Instead: the DOWNLOADER computes the hash, from bytes it actually holds
 * after BitTorrent's own piece-hash verification has already guaranteed
 * those bytes match the .torrent. Then it independently fetches HuggingFace's
 * own metadata for the claimed repo+commit and compares. The only party
 * trusted here is HuggingFace's API, for a narrow, independently-checkable
 * claim ("what hash did you report for this file at this commit") — never
 * the torrent's publisher.
 */

export interface HfFileEntry {
  path: string;
  size: number;
  lfsSha256?: string; // present for LFS-tracked files (most model weights)
  gitBlobSha1?: string; // present for all files, git blob oid
}

const HF_API_BASE = "https://huggingface.co/api/models";

/**
 * Fetch HF's file tree for a repo at a given revision/commit, including
 * LFS pointer info where available. This is the ONLY externally-trusted
 * input to verification.
 */
export async function fetchHfFileTree(
  repoId: string,
  revision: string
): Promise<HfFileEntry[]> {
  const url = `${HF_API_BASE}/${repoId}/tree/${encodeURIComponent(revision)}?recursive=true`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`HF tree fetch failed: ${resp.status} ${resp.statusText}`);
  }
  const data = await resp.json();
  const entries: HfFileEntry[] = [];
  for (const item of data) {
    if (item.type !== "file") continue;
    entries.push({
      path: item.path,
      size: item.size,
      lfsSha256: item.lfs?.oid,
      gitBlobSha1: item.oid,
    });
  }
  return entries;
}

/** SHA256 of raw bytes, hex-encoded. Used for LFS-tracked files. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Git blob oid: SHA1("blob <size>\0" + content). Used for non-LFS files
 * (small configs, tokenizer files) where HF only exposes the git hash.
 */
export async function gitBlobSha1Hex(bytes: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const combined = new Uint8Array(header.length + bytes.length);
  combined.set(header, 0);
  combined.set(bytes, header.length);
  const digest = await crypto.subtle.digest("SHA-1", combined.buffer as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verify one downloaded file's bytes against HF's reported hash for that
 * path. Prefers LFS sha256 (cheaper, and what most model weight files use);
 * falls back to git blob sha1 for small/non-LFS files.
 */
export async function verifyFile(
  filename: string,
  bytes: Uint8Array,
  hfEntries: HfFileEntry[]
): Promise<FileVerification> {
  const entry = hfEntries.find((e) => e.path === filename || e.path.endsWith(`/${filename}`));
  if (!entry) {
    return { filename, status: "no-hf-data" as HfVerificationStatus };
  }

  if (entry.lfsSha256) {
    const local = await sha256Hex(bytes);
    return {
      filename,
      localSha256: local,
      hfExpectedHash: entry.lfsSha256,
      hfHashKind: "lfs-sha256",
      status: local === entry.lfsSha256 ? "match" : "mismatch",
    };
  }

  if (entry.gitBlobSha1) {
    const local = await gitBlobSha1Hex(bytes);
    return {
      filename,
      localSha256: local,
      hfExpectedHash: entry.gitBlobSha1,
      hfHashKind: "git-blob-sha1",
      status: local === entry.gitBlobSha1 ? "match" : "mismatch",
    };
  }

  return { filename, status: "no-hf-data" as HfVerificationStatus };
}

/**
 * Verify every downloaded file in a torrent against HF. Call this
 * progressively as pieces complete (per-file, once a file's bytes are
 * fully assembled), not only at 100% torrent completion — see
 * src/hooks/useTorrentVerification.ts for the incremental wiring.
 */
export async function verifyDownloadedFiles(
  repoId: string,
  commitSha: string,
  files: { filename: string; bytes: Uint8Array }[]
): Promise<FileVerification[]> {
  const hfEntries = await fetchHfFileTree(repoId, commitSha);
  return Promise.all(files.map((f) => verifyFile(f.filename, f.bytes, hfEntries)));
}
