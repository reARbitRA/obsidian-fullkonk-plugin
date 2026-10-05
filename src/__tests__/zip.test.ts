/**
 * @jest-environment node
 */
import { createZip, crc32, normalizeZipPath, ZipEntry } from "../utils/zip";

const decoder = new TextDecoder();

interface ParsedEntry {
  name: string;
  content: string;
  crc: number;
  method: number;
  flags: number;
  localOffset: number;
  dosTime: number;
  dosDate: number;
}

/** Minimal ZIP reader used to verify the writer's output byte-for-byte. */
function readZip(bytes: Uint8Array): { entries: ParsedEntry[]; commentLength: number; trailerOk: boolean } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  const entries: ParsedEntry[] = [];

  // Local file headers.
  while (view.getUint32(offset, true) === 0x04034b50) {
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const dosTime = view.getUint16(offset + 10, true);
    const dosDate = view.getUint16(offset + 12, true);
    const crc = view.getUint32(offset + 14, true);
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);

    const name = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    const dataStart = offset + 30 + nameLength + extraLength;
    const content = decoder.decode(bytes.subarray(dataStart, dataStart + size));

    entries.push({ name, content, crc, method, flags, localOffset: offset, dosTime, dosDate });
    offset = dataStart + size;
  }

  // Central directory (one record per local entry, in order).
  const centralStart = offset;
  for (let i = 0; i < entries.length; i++) {
    expect(view.getUint32(offset, true)).toBe(0x02014b50);
    expect(view.getUint32(offset + 42, true)).toBe(entries[i].localOffset);
    const nameLength = view.getUint16(offset + 28, true);
    expect(decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength))).toBe(entries[i].name);
    offset += 46 + nameLength;
  }

  // End of central directory.
  expect(view.getUint32(offset, true)).toBe(0x06054b50);
  const entryCount = view.getUint16(offset + 10, true);
  expect(entryCount).toBe(entries.length);
  expect(view.getUint32(offset + 16, true)).toBe(centralStart);
  const commentLength = view.getUint16(offset + 20, true);
  offset += 22;

  return { entries, commentLength, trailerOk: offset === bytes.length };
}

describe("crc32()", () => {
  it("matches the canonical IEEE CRC-32 test vector", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("returns 0 for empty input", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it("is stable for repeated calls with the same input", () => {
    const data = new TextEncoder().encode("fullKONK_>");
    expect(crc32(data)).toBe(crc32(data));
  });
});

describe("normalizeZipPath()", () => {
  it("converts backslashes and collapses empty/dot segments", () => {
    expect(normalizeZipPath("src\\nested//./file.ts")).toBe("src/nested/file.ts");
  });

  it("strips leading, trailing and parent segments", () => {
    expect(normalizeZipPath("/../a/b/")).toBe("a/b");
  });
});

describe("createZip()", () => {
  const entry = (path: string, content: string): ZipEntry => ({ path, content });

  it("writes a single stored entry with matching CRC and sizes", () => {
    const zip = createZip([entry("hello.txt", "hello world")]);
    const { entries, trailerOk, commentLength } = readZip(zip);

    expect(trailerOk).toBe(true);
    expect(commentLength).toBe(0);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("hello.txt");
    expect(entries[0].content).toBe("hello world");
    expect(entries[0].method).toBe(0);
    expect(entries[0].flags).toBe(0x0800);
    expect(entries[0].crc).toBe(crc32(new TextEncoder().encode("hello world")));
  });

  it("preserves entry order and offsets across multiple files", () => {
    const zip = createZip([entry("a.txt", "aaa"), entry("src/b.ts", "bbb"), entry("c", "ccc")]);
    const { entries } = readZip(zip);

    expect(entries.map((e) => e.name)).toEqual(["a.txt", "src/b.ts", "c"]);
    expect(entries[0].localOffset).toBe(0);
  });

  it("normalizes separators and parent segments in entry paths", () => {
    const zip = createZip([entry("/src\\../lib//util.ts", "export {};")]);
    const { entries } = readZip(zip);
    expect(entries[0].name).toBe("src/lib/util.ts");
  });

  it("round-trips UTF-8 paths and content", () => {
    const zip = createZip([entry("یادداشت/ファイル.md", "# عنوان 🚀")]);
    const { entries } = readZip(zip);
    expect(entries[0].name).toBe("یادداشت/ファイル.md");
    expect(entries[0].content).toBe("# عنوان 🚀");
  });

  it("produces a valid empty archive when there are no entries", () => {
    const zip = createZip([]);
    expect(zip.length).toBe(22);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x06054b50);
    expect(view.getUint16(10, true)).toBe(0);
  });

  it("encodes the timestamp as a DOS date/time (2-second resolution, UTC)", () => {
    const zip = createZip([entry("a", "x")], new Date("2026-10-04T12:34:56Z"));
    const { entries } = readZip(zip);
    expect(entries[0].dosTime).toBe((12 << 11) | (34 << 5) | (56 >> 1));
    expect(entries[0].dosDate).toBe(((2026 - 1980) << 9) | (10 << 5) | 4);
  });

  it("clamps pre-1980 timestamps instead of throwing", () => {
    const zip = createZip([entry("a", "x")], new Date("1970-01-01T00:00:00Z"));
    const { entries } = readZip(zip);
    expect(entries[0].dosDate).toBe(((1980 - 1980) << 9) | (1 << 5) | 1);
  });

  it("throws when an entry path normalizes to empty", () => {
    expect(() => createZip([entry("../", "x")])).toThrow(/empty path/);
  });
});
