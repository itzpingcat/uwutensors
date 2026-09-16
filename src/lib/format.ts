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
