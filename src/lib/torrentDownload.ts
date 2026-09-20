/**
 * Hash-verified .torrent file download, replicating the security property
 * from waifu-magnet-22.html: the magnet's &xs= (exact source) is only
 * appended AFTER the fetched .torrent bytes are hash-verified against the
 * sha256 published in the listing event, so a compromised Blossom mirror
 * can't swap in a tampered .torrent silently.
 *
 * Note this is a different, weaker trust boundary than HF verification
 * (src/lib/hfVerification.ts): here we're trusting the PUBLISHER's claimed
 * sha256 of the .torrent file itself (metadata about the torrent), not
 * verifying the torrent's actual model-weight contents against HF. It's
 * still worth keeping — it stops a hostile mirror from substituting a
 * different .torrent than the one the publisher signed for — but it does
 * not substitute for tier-0 HF verification.
 */

export interface VerifiedTorrentResult {
  bytes: ArrayBuffer;
  verifiedSha256: string;
  sourceUrl: string;
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hostname for error messages; listing urls are arbitrary tag values and
 *  can be malformed, so never let new URL() throw its way out of the loop. */
function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 32);
  }
}

export async function fetchAndVerifyTorrent(
  urls: string[],
  expectedSha256: string | undefined,
  expectedSize: number | undefined
): Promise<VerifiedTorrentResult> {
  const mismatches: string[] = [];
  const errors: string[] = [];

  for (const url of urls) {
    let buf: ArrayBuffer;
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        errors.push(`${safeHost(url)}: HTTP ${resp.status}`);
        continue;
      }
      buf = await resp.arrayBuffer();
    } catch {
      errors.push(`${safeHost(url)}: fetch failed`);
      continue;
    }

    if (expectedSize && buf.byteLength !== expectedSize) {
      mismatches.push(`${safeHost(url)}: size ${buf.byteLength} != ${expectedSize}`);
      continue;
    }

    if (!expectedSha256) {
      // No hash to check against — still return bytes, but caller should
      // surface this as "unverified" in the UI.
      return { bytes: buf, verifiedSha256: await sha256Hex(buf), sourceUrl: url };
    }

    const hash = await sha256Hex(buf);
    if (hash === expectedSha256) {
      return { bytes: buf, verifiedSha256: hash, sourceUrl: url };
    }
    mismatches.push(`${safeHost(url)}: ${hash.slice(0, 8)}…`);
  }

  const reason = mismatches.length
    ? `Hash mismatch: ${mismatches.join("; ")}`
    : `Could not verify: ${errors.join("; ") || "no sources reachable"}`;
  throw new Error(reason);
}

/** Append &xs= (exact source) to a magnet URI, only once bytes are verified. */
export function magnetWithVerifiedSource(magnet: string, verifiedUrl: string): string {
  const sep = magnet.includes("?") ? "&" : "?";
  return `${magnet}${sep}xs=${encodeURIComponent(verifiedUrl)}`;
}
