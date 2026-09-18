import { getSigningPubkey, signWithActiveIdentity } from "../nostr/identity";

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function uploadToBlossom(file: File, servers: string[]): Promise<string[]> {
  if (!servers.length) throw new Error("Configure at least one Blossom server before uploading.");
  const bytes = await file.arrayBuffer();
  const hash = await sha256Hex(bytes);
  const pubkey = await getSigningPubkey();
  const expiration = Math.floor(Date.now() / 1000) + 3600;
  const auth = await signWithActiveIdentity({
    kind: 24242,
    created_at: Math.floor(Date.now() / 1000),
    content: "Upload torrent file",
    tags: [["t", "upload"], ["x", hash], ["expiration", String(expiration)]],
  });
  // Keep the explicit pubkey read above: it makes extension/local identity
  // selection happen before any server request and gives clearer failures.
  if (!pubkey || !auth.sig) throw new Error("Couldn't authorize the Blossom upload.");
  const token = `Nostr ${base64Url(JSON.stringify(auth))}`;
  const settled = await Promise.allSettled(servers.map(async (server) => {
    const base = server.replace(/\/+$/, "");
    const response = await fetch(`${base}/upload`, {
      method: "PUT",
      headers: { Authorization: token, "Content-Type": file.type || "application/octet-stream" },
      body: bytes,
    });
    if (!response.ok) throw new Error(`${new URL(base).hostname}: HTTP ${response.status}`);
    const payload = await response.json().catch(() => ({})) as { url?: string };
    return payload.url || `${base}/${hash}`;
  }));
  const urls = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  if (!urls.length) throw new Error("Upload failed on every configured Blossom server.");
  return urls;
}
