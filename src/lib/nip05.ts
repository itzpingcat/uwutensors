/**
 * NIP-05 verification: a claimed identifier like "name@domain.com" is only
 * real if fetching https://domain.com/.well-known/nostr.json?name=name
 * returns that exact pubkey under names[name]. Anyone can put any string in
 * their kind 0 `nip05` field — the fetch is what actually proves the
 * domain owner vouches for that pubkey. Before this file existed, the
 * "Require NIP-05 verified publishers" filter checked a value
 * (ctx.nip05Verified) that nothing ever set, so it silently treated every
 * listing as unverifiable-and-therefore-skipped — the tier was a complete
 * no-op regardless of any author's actual NIP-05 status.
 */

const FETCH_TIMEOUT_MS = 6000;

export interface Nip05Identifier {
  name: string;
  domain: string;
}

/** Parses "name@domain.com" (or bare "domain.com", which NIP-05 treats as name "_"). */
export function parseNip05(identifier: string): Nip05Identifier | null {
  const trimmed = identifier.trim();
  if (!trimmed) return null;
  const at = trimmed.indexOf("@");
  const name = at === -1 ? "_" : trimmed.slice(0, at);
  const domain = at === -1 ? trimmed : trimmed.slice(at + 1);
  if (!domain || !name) return null;
  return { name, domain };
}

/**
 * Resolves a NIP-05 identifier and checks it matches the expected pubkey.
 * Returns false (not verified) on any parse error, network failure,
 * timeout, or mismatch — verification fails closed, never open.
 */
export async function verifyNip05(identifier: string, expectedPubkeyHex: string): Promise<boolean> {
  const parsed = parseNip05(identifier);
  if (!parsed) return false;

  const url = `https://${parsed.domain}/.well-known/nostr.json?name=${encodeURIComponent(parsed.name)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return false;
    const data = (await res.json()) as { names?: Record<string, string> };
    const resolvedPubkey = data.names?.[parsed.name];
    return resolvedPubkey === expectedPubkeyHex;
  } catch {
    return false; // network error, timeout, bad JSON — all treated as unverified
  } finally {
    clearTimeout(timer);
  }
}
