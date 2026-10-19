/**
 * A minimal in-browser ZIP writer and reader: STORED entries, no compression.
 *
 * What goes in is already compressed (JPEG/WebP/PNG) or small text, so deflate
 * would save next to nothing and cost a dependency in every site that composes
 * a tool. Names are UTF-8 (general-purpose flag bit 11); sizes are 32-bit — a
 * browser tab never gets near 4 GB. Output opens in every unzip tool.
 *
 * Promoted in 0.58 from the devkit pack (writer + reader + path guard) and the
 * media pack (UTF-8 names, real timestamps), which had grown two copies.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 (IEEE 802.3), as ZIP and PNG chunks require. */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  path: string;
  data: Uint8Array;
}

/**
 * Strict path guard: relative, no `.`/`..`/empty segments (no zip-slip) and
 * only `A–Z a–z 0–9 . _ - /`. For archives whose names come from code.
 */
export function safeZipPath(path: string): string | null {
  const p = path.replace(/\\/g, "/");
  if (p.startsWith("/") || p.split("/").some((seg) => seg === ".." || seg === "." || seg === "")) return null;
  if (!/^[A-Za-z0-9._/-]{1,200}$/.test(p)) return null;
  return p;
}

/**
 * Lenient guard for names that come from the visitor's own files
 * ("Prüfbericht-komprimiert.jpg"): any Unicode, but still relative, no
 * `.`/`..` segments and none of the characters a file system rejects.
 */
export function safeZipName(path: string): string | null {
  const p = path.replace(/\\/g, "/");
  if (p.startsWith("/") || p.split("/").some((seg) => seg === ".." || seg === "." || seg === "")) return null;
  // eslint-disable-next-line no-control-regex
  if (p.length > 255 || /[\u0000-\u001f:*?"<>|]/.test(p)) return null;
  return p;
}

export interface CreateZipOptions {
  /**
   * Entry timestamp. Default: a fixed day (2026-01-01 00:00), so the same input
   * gives the same bytes. Pass `new Date()` for archives a person unpacks.
   */
  date?: Date;
  /** `"strict"` (default) uses `safeZipPath`; `"unicode"` uses `safeZipName`. */
  names?: "strict" | "unicode";
}

function dosStamp(date: Date | undefined): { time: number; day: number } {
  if (!date) return { time: 0, day: ((2026 - 1980) << 9) | (1 << 5) | 1 };
  return {
    time: ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff,
    day: (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff,
  };
}

/** Builds the archive. Throws on an unsafe entry path rather than writing it. */
export function createZip(entries: ZipEntry[], opts: CreateZipOptions = {}): Uint8Array {
  const guard = opts.names === "unicode" ? safeZipName : safeZipPath;
  const { time, day } = dosStamp(opts.date);
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const path = guard(entry.path);
    if (!path) throw new Error(`Unsafe zip path: ${entry.path}`);
    const name = enc.encode(path);
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, time, true);
    lv.setUint16(12, day, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, day, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    locals.push(local, entry.data);
    centrals.push(central);
    offset += local.length + size;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + 22);
  let pos = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}

/** Reads names and contents back (stored entries only), verifying each CRC. */
export function readZip(data: Uint8Array): ZipEntry[] {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let eocd = data.length - 22;
  while (eocd >= 0 && dv.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("Not a zip file");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const size = dv.getUint32(p + 24, true);
    const localOffset = dv.getUint32(p + 42, true);
    const path = dec.decode(data.subarray(p + 46, p + 46 + nameLen));
    const lNameLen = dv.getUint16(localOffset + 26, true);
    const lExtraLen = dv.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const entry = data.subarray(start, start + size);
    if (crc32(entry) !== dv.getUint32(p + 16, true)) throw new Error(`CRC mismatch: ${path}`);
    out.push({ path, data: entry });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
