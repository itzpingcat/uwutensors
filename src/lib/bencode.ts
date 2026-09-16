/**
 * Minimal bencode decoder, just enough to read a .torrent file's `info`
 * dict and list out its files with real sizes — the actual file tree the
 * torrent itself commits to, not something a publisher can misrepresent
 * in a listing's tags. No dependency needed: bencode is a tiny format
 * (four types — byte strings, integers, lists, dicts) and a .torrent file
 * is small enough to decode synchronously in the browser.
 *
 * Byte strings are NOT necessarily UTF-8 (path components can be raw
 * bytes on some clients), but in practice torrent file paths are UTF-8
 * text, so this decodes them as such and falls back to a lossy decode
 * rather than throwing on the rare malformed entry.
 */

export type BencodeValue = Uint8Array | number | BencodeValue[] | Map<string, BencodeValue>;

class Decoder {
  private pos = 0;
  private bytes: Uint8Array;
  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  private peek(): number {
    return this.bytes[this.pos];
  }

  private expect(byte: number): void {
    if (this.bytes[this.pos] !== byte) {
      throw new Error(`bencode: expected '${String.fromCharCode(byte)}' at offset ${this.pos}`);
    }
    this.pos++;
  }

  decode(): BencodeValue {
    const c = this.peek();
    if (c === 0x69 /* 'i' */) return this.decodeInt();
    if (c === 0x6c /* 'l' */) return this.decodeList();
    if (c === 0x64 /* 'd' */) return this.decodeDict();
    if (c >= 0x30 && c <= 0x39 /* '0'-'9' */) return this.decodeBytes();
    throw new Error(`bencode: unexpected byte 0x${c.toString(16)} at offset ${this.pos}`);
  }

  private readUntil(delim: number): string {
    const start = this.pos;
    while (this.bytes[this.pos] !== delim) {
      this.pos++;
      if (this.pos > this.bytes.length) throw new Error("bencode: unterminated token");
    }
    const s = new TextDecoder("latin1").decode(this.bytes.subarray(start, this.pos));
    this.pos++; // consume delimiter
    return s;
  }

  private decodeInt(): number {
    this.expect(0x69); // 'i'
    const s = this.readUntil(0x65); // 'e'
    return parseInt(s, 10);
  }

  private decodeBytes(): Uint8Array {
    const lenStr = this.readUntil(0x3a); // ':'
    const len = parseInt(lenStr, 10);
    const bytes = this.bytes.subarray(this.pos, this.pos + len);
    this.pos += len;
    return bytes;
  }

  private decodeList(): BencodeValue[] {
    this.expect(0x6c); // 'l'
    const out: BencodeValue[] = [];
    while (this.peek() !== 0x65 /* 'e' */) out.push(this.decode());
    this.pos++; // consume 'e'
    return out;
  }

  private decodeDict(): Map<string, BencodeValue> {
    this.expect(0x64); // 'd'
    const out = new Map<string, BencodeValue>();
    while (this.peek() !== 0x65 /* 'e' */) {
      const key = bytesToUtf8(this.decodeBytes());
      out.set(key, this.decode());
    }
    this.pos++; // consume 'e'
    return out;
  }
}

function bytesToUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("latin1").decode(bytes); // lossy fallback for non-UTF-8 paths
  }
}

export function decodeBencode(bytes: ArrayBuffer | Uint8Array): BencodeValue {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return new Decoder(u8).decode();
}

export interface TorrentFileEntry {
  path: string;
  size: number;
}

/**
 * Extracts the real file list from a decoded .torrent's top-level dict —
 * single-file torrents have `info.length` + `info.name`; multi-file
 * torrents have `info.files`, each with its own `length` and `path`
 * (an array of path segments, joined here with '/').
 */
export function extractTorrentFiles(decoded: BencodeValue): TorrentFileEntry[] {
  if (!(decoded instanceof Map)) throw new Error("bencode: expected a dict at top level");
  const info = decoded.get("info");
  if (!(info instanceof Map)) throw new Error("bencode: no info dict");

  const name = info.get("name");
  const nameStr = name instanceof Uint8Array ? bytesToUtf8(name) : "unknown";

  const files = info.get("files");
  if (files instanceof Array) {
    return files
      .filter((f) => {
        // BEP 47 padding files (used to align pieces between real files)
        // are marked with an "attr" string containing "p", and/or a path
        // component literally named ".pad" — real BitTorrent clients hide
        // these, they're not part of the actual model/dataset content.
        if (!(f instanceof Map)) return true;
        const attr = f.get("attr");
        const attrStr = attr instanceof Uint8Array ? bytesToUtf8(attr) : undefined;
        if (attrStr && attrStr.includes("p")) return false;
        const pathList = f.get("path");
        if (pathList instanceof Array) {
          const segments = pathList.map((seg) => (seg instanceof Uint8Array ? bytesToUtf8(seg) : String(seg)));
          if (segments.includes(".pad")) return false;
        }
        return true;
      })
      .map((f) => {
        if (!(f instanceof Map)) throw new Error("bencode: malformed file entry");
        const length = f.get("length");
        const pathList = f.get("path");
        const segments =
          pathList instanceof Array
            ? pathList.map((seg) => (seg instanceof Uint8Array ? bytesToUtf8(seg) : String(seg)))
            : [];
        return {
          path: [nameStr, ...segments].join("/"),
          size: typeof length === "number" ? length : 0,
        };
      });
  }

  // Single-file torrent — info.length is the file's own size, info.name is its filename.
  const length = info.get("length");
  return [{ path: nameStr, size: typeof length === "number" ? length : 0 }];
}
