// src/utils/zip.ts
//
// Minimal, dependency-free ZIP writer (STORE method — no compression).
//
// Obsidian's Vault API can write binary files (`createBinary`) but the plugin
// has no filesystem/zip library available on mobile, so exporting a project as
// a `.zip` requires building the archive ourselves. Stored (uncompressed)
// entries are used deliberately: generated source code is small, the format
// stays trivial to verify byte-for-byte in unit tests, and it avoids pulling a
// deflate implementation into the bundle.
//
// Reference: PKWARE APPNOTE.TXT, sections 4.3.6 (local file header),
// 4.3.7 (local file data), 4.3.12 (central directory) and 4.3.16 (EOCD).

export interface ZipEntry {
  /** Archive-relative path, e.g. `src/index.ts`. Separators are normalized. */
  path: string;
  /** UTF-8 text content of the entry. */
  content: string;
}

const CRC32_TABLE: Uint32Array = buildCrc32Table();

function buildCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let bit = 0; bit < 8; bit++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

/** Standard CRC-32 (IEEE 802.3, polynomial 0xEDB88320), as used by ZIP. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Normalize an entry path: forward slashes only, no leading/trailing slashes, no `.`/empty segments. */
export function normalizeZipPath(path: string): string {
  const segments = path
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment !== "" && segment !== "." && segment !== "..");
  return segments.join("/");
}

function toDosDateTime(date: Date): { time: number; date: number } {
  // DOS timestamps have 2-second resolution and cannot represent dates before
  // 1980; both are clamped rather than throwing so an odd clock can't break an
  // export. UTC is used (not local time) purely for reproducibility.
  const year = Math.max(1980, date.getUTCFullYear());
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = Math.floor(date.getUTCSeconds() / 2) * 2;

  const dosTime = (hours << 11) | (minutes << 5) | (seconds >> 1);
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { time: dosTime, date: dosDate };
}

const SIG_LOCAL_HEADER = 0x04034b50;
const SIG_CENTRAL_HEADER = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const VERSION_NEEDED = 20;
const FLAG_UTF8 = 0x0800;
const METHOD_STORE = 0;

interface PreparedEntry {
  nameBytes: Uint8Array;
  data: Uint8Array;
  crc: number;
  offset: number;
}

/**
 * Build a complete ZIP archive from `entries` (STORE method). Duplicate paths
 * are preserved in order — later entries win when a zip tool extracts them.
 */
export function createZip(entries: ZipEntry[], date: Date = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const { time, date: dosDate } = toDosDateTime(date);

  const prepared: PreparedEntry[] = entries.map((entry) => {
    const path = normalizeZipPath(entry.path);
    if (!path) {
      throw new Error(`createZip(): entry has an empty path after normalization: "${entry.path}"`);
    }
    const data = encoder.encode(entry.content);
    return { nameBytes: encoder.encode(path), data, crc: crc32(data), offset: 0 };
  });

  const localSize = prepared.reduce(
    (sum, entry) => sum + 30 + entry.nameBytes.length + entry.data.length,
    0
  );
  const centralSize = prepared.reduce((sum, entry) => sum + 46 + entry.nameBytes.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let offset = 0;

  // ── Local file headers + data ──────────────────────────────────────────
  for (const entry of prepared) {
    entry.offset = offset;
    const nameLength = entry.nameBytes.length;

    view.setUint32(offset, SIG_LOCAL_HEADER, true);
    view.setUint16(offset + 4, VERSION_NEEDED, true);
    view.setUint16(offset + 6, FLAG_UTF8, true);
    view.setUint16(offset + 8, METHOD_STORE, true);
    view.setUint16(offset + 10, time, true);
    view.setUint16(offset + 12, dosDate, true);
    view.setUint32(offset + 14, entry.crc, true);
    view.setUint32(offset + 18, entry.data.length, true);
    view.setUint32(offset + 22, entry.data.length, true);
    view.setUint16(offset + 26, nameLength, true);
    view.setUint16(offset + 28, 0, true);
    offset += 30;

    out.set(entry.nameBytes, offset);
    offset += nameLength;
    out.set(entry.data, offset);
    offset += entry.data.length;
  }

  // ── Central directory ──────────────────────────────────────────────────
  const centralStart = offset;
  for (const entry of prepared) {
    view.setUint32(offset, SIG_CENTRAL_HEADER, true);
    view.setUint16(offset + 4, VERSION_NEEDED, true);
    view.setUint16(offset + 6, VERSION_NEEDED, true);
    view.setUint16(offset + 8, FLAG_UTF8, true);
    view.setUint16(offset + 10, METHOD_STORE, true);
    view.setUint16(offset + 12, time, true);
    view.setUint16(offset + 14, dosDate, true);
    view.setUint32(offset + 16, entry.crc, true);
    view.setUint32(offset + 20, entry.data.length, true);
    view.setUint32(offset + 24, entry.data.length, true);
    view.setUint16(offset + 28, entry.nameBytes.length, true);
    view.setUint16(offset + 30, 0, true); // extra field length
    view.setUint16(offset + 32, 0, true); // file comment length
    view.setUint16(offset + 34, 0, true); // disk number start
    view.setUint16(offset + 36, 0, true); // internal attributes
    view.setUint32(offset + 38, 0, true); // external attributes
    view.setUint32(offset + 42, entry.offset, true);
    offset += 46;

    out.set(entry.nameBytes, offset);
    offset += entry.nameBytes.length;
  }
  const centralSizeActual = offset - centralStart;

  // ── End of central directory ───────────────────────────────────────────
  view.setUint32(offset, SIG_EOCD, true);
  view.setUint16(offset + 4, 0, true); // this disk
  view.setUint16(offset + 6, 0, true); // disk with central directory
  view.setUint16(offset + 8, prepared.length, true);
  view.setUint16(offset + 10, prepared.length, true);
  view.setUint32(offset + 12, centralSizeActual, true);
  view.setUint32(offset + 16, centralStart, true);
  view.setUint16(offset + 20, 0, true); // comment length

  return out;
}
