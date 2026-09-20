export function humanSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function shortHash(hex: string | undefined, n = 8): string {
  if (!hex) return "";
  return hex.length > n ? `${hex.slice(0, n)}…` : hex;
}

/**
 * Many of these torrents were built by mirroring a HuggingFace repo's own
 * `resolve/<sha>/<file>` URL structure, so the .torrent's real internal
 * file paths look like `Repo-Name/resolve/518fbbc2.../config.json` — the
 * repo name and commit SHA are baked into every single path. That's
 * accurate (it IS the torrent's real path, and changing it would break
 * per-file verification against the actual bytes), but it's redundant
 * noise on screen since the page already shows the repo/commit elsewhere.
 * This strips a leading `<name>/resolve/<40-hex-sha>/` segment for
 * display only — the underlying path used for verification is untouched.
 */
export function displayFilePath(path: string): string {
  return path.replace(/^[^/]+\/resolve\/[0-9a-f]{40}\//i, "");
}

/**
 * `listing.source` is a free-text tag from a listing event: usually a bare
 * "huggingface.co/org/repo", but sometimes already carrying a scheme (which
 * would naively produce a broken "https://https://..." link). Normalizes to
 * a bare host/path string suitable for prefixing with https://, or null if
 * it doesn't look like a domain/path at all (no accidental javascript: or
 * scheme soup from attacker-controlled tags).
 */
export function normalizeSourceHost(source: string): string | null {
  const stripped = source.trim().replace(/^https?:\/\//i, "").replace(/^\/+/, "");
  return stripped ? stripped : null;
}

/** Live label under the PoW progress bar, shared by all publish flows. */
export function formatPowLabel(pow: number, hashes: number, elapsedMs: number, durationMs: number): string {
  const secsLeft = Math.max(0, Math.ceil((durationMs - elapsedMs) / 1000));
  const rate = (hashes / Math.max(1, elapsedMs / 1000)).toFixed(0);
  return `best: ${pow} leading-zero bits · ${rate} h/s · ${secsLeft}s left`;
}
