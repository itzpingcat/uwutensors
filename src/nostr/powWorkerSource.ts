/**
 * Source code for the PoW worker, as a string, spawned via Blob +
 * createObjectURL (see runPow.ts) instead of Vite's `new Worker(new
 * URL(...))` pattern.
 *
 * Why: `new Worker(new URL('./pow.worker.ts', import.meta.url))` produces a
 * separate emitted chunk that vite-plugin-singlefile does NOT inline (it
 * only inlines <script>/<link> tags reachable from index.html, not worker
 * chunks referenced by URL at runtime) — so a singlefile build would ship a
 * UwUTensors.html that 404s on the worker file the moment it's opened
 * standalone via file://, exactly the deployment model this app targets.
 * A Blob worker has no external file to lose, so it survives being copied
 * around as a single .html with no build artifacts alongside it — same
 * approach the original waifu-magnet-22.html used for this exact reason.
 *
 * This intentionally duplicates a small hand-written SHA-256 (no @noble
 * import) so the worker string is self-contained and doesn't need a
 * bundler to resolve dependencies for it.
 */
export const POW_WORKER_SOURCE = `
const K = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
]);
const H0 = new Uint32Array([
  0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19
]);
function rotr(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }
function sha256hex(data) {
  const len = data.length;
  const bitLen = len * 8;
  const paddedLen = (((len + 9) + 63) >> 6) << 6;
  const msg = new Uint8Array(paddedLen);
  msg.set(data);
  msg[len] = 0x80;
  const dv = new DataView(msg.buffer);
  dv.setUint32(paddedLen - 4, bitLen >>> 0, false);
  dv.setUint32(paddedLen - 8, 0, false);
  const w = new Uint32Array(64);
  const h = new Uint32Array(H0);
  const a = new Uint32Array(8);
  for (let i = 0; i < paddedLen; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = dv.getUint32(i + j * 4, false);
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(w[j-15], 7) ^ rotr(w[j-15], 18) ^ (w[j-15] >>> 3);
      const s1 = rotr(w[j-2], 17) ^ rotr(w[j-2], 19) ^ (w[j-2] >>> 10);
      w[j] = (w[j-16] + s0 + w[j-7] + s1) >>> 0;
    }
    for (let j = 0; j < 8; j++) a[j] = h[j];
    for (let j = 0; j < 64; j++) {
      const S1 = rotr(a[4], 6) ^ rotr(a[4], 11) ^ rotr(a[4], 25);
      const ch = (a[4] & a[5]) ^ (~a[4] & a[6]);
      const t1 = (a[7] + S1 + ch + K[j] + w[j]) >>> 0;
      const S0 = rotr(a[0], 2) ^ rotr(a[0], 13) ^ rotr(a[0], 22);
      const mj = (a[0] & a[1]) ^ (a[0] & a[2]) ^ (a[1] & a[2]);
      const t2 = (S0 + mj) >>> 0;
      a[7] = a[6]; a[6] = a[5]; a[5] = a[4];
      a[4] = (a[3] + t1) >>> 0;
      a[3] = a[2]; a[2] = a[1]; a[1] = a[0];
      a[0] = (t1 + t2) >>> 0;
    }
    for (let j = 0; j < 8; j++) h[j] = (h[j] + a[j]) >>> 0;
  }
  let hex = "";
  for (let j = 0; j < 8; j++) hex += h[j].toString(16).padStart(8, "0");
  return hex;
}
function leadingZeroBits(hex) {
  let bits = 0;
  for (let i = 0; i < hex.length; i++) {
    const n = parseInt(hex[i], 16);
    if (n === 0) { bits += 4; continue; }
    bits += Math.clz32(n) - 28;
    break;
  }
  return bits;
}
const enc = new TextEncoder();
self.onmessage = function(e) {
  const d = e.data;
  const tags = JSON.parse(JSON.stringify(d.tags));
  const nonceIdx = tags.length - 1;
  const start = performance.now();
  let bestNonce = 0, bestPow = -1, bestId = "", hashes = 0;
  let nonce = Math.floor(Math.random() * 0xFFFFFFFF);
  function computeId(n) {
    tags[nonceIdx] = ["nonce", String(n)];
    const s = JSON.stringify([0, d.pubkey, d.created_at, d.kind, tags, d.content]);
    return sha256hex(enc.encode(s));
  }
  function tick() {
    const elapsedMs = performance.now() - start;
    if (elapsedMs >= d.durationMs) {
      self.postMessage({ type: "done", nonce: bestNonce, pow: bestPow, id: bestId, hashes: hashes });
      self.close();
      return;
    }
    for (let i = 0; i < 20000; i++) {
      const id = computeId(nonce);
      hashes++;
      const p = leadingZeroBits(id);
      if (p > bestPow) { bestPow = p; bestNonce = nonce; bestId = id; }
      nonce = (nonce + 1) >>> 0;
    }
    self.postMessage({ type: "progress", pow: bestPow, hashes: hashes, elapsedMs: elapsedMs });
    setTimeout(tick, 0);
  }
  tick();
};
`;
