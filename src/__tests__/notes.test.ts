import { TFile } from "obsidian";
import {
  buildMetadataPlan,
  buildMovePlan,
  categoryFromFrontmatter,
  filterAndSortNotes,
  formatSelection,
  mergeTags,
  normalizeFrontmatterTags,
  normalizeTag,
  normalizeVaultPath,
  parseTagInput,
  snapshotFrontmatter,
  uniqueTags,
  NoteRecord,
} from "../notes";

function note(path: string, options: Partial<Pick<NoteRecord, "tags" | "frontmatterTags" | "category" | "bodyText">> = {}): NoteRecord {
  const file = {
    path,
    basename: path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/i, ""),
    stat: { mtime: path.includes("older") ? 10 : 20, ctime: path.includes("older") ? 1 : 2 },
  } as TFile;
  return {
    file,
    tags: options.tags ?? [],
    frontmatterTags: options.frontmatterTags ?? [],
    category: options.category ?? "",
    ...(options.bodyText === undefined ? {} : { bodyText: options.bodyText }),
  };
}

describe("note metadata helpers", () => {
  it("normalizes tags and deduplicates case-insensitively", () => {
    expect(normalizeTag("  ## Project Notes ")).toBe("Project-Notes");
    expect(parseTagInput("#work, work\n#Research/AI")).toEqual(["work", "Research/AI"]);
    expect(normalizeFrontmatterTags("one, #two")).toEqual(["one", "two"]);
    expect(uniqueTags(["same", "SAME", "other"])).toEqual(["same", "other"]);
    expect(mergeTags(["one"], ["ONE", "two"])).toEqual(["one", "two"]);
  });

  it("normalizes category and frontmatter snapshots without changing unrelated fields", () => {
    expect(categoryFromFrontmatter("  Research  ")).toBe("Research");
    expect(categoryFromFrontmatter(["Work", "Personal"])).toBe("Work, Personal");
    expect(snapshotFrontmatter({ tags: ["#ideas", "Ideas"], category: "Notes" })).toEqual({
      tags: ["ideas"],
      category: "Notes",
    });
  });

  it("plans category and tag additions/removals while preserving other selected metadata", () => {
    const records = [
      note("a.md", { tags: ["work", "inline"], frontmatterTags: ["work"], category: "Old" }),
      note("b.md", { frontmatterTags: ["ideas"] }),
    ];

    const add = buildMetadataPlan(records, {
      tagAction: "add",
      tags: ["work", "#review"],
      category: "Projects",
    });
    expect(add.map((item) => item.after)).toEqual([
      { tags: ["work", "review"], category: "Projects" },
      { tags: ["ideas", "work", "review"], category: "Projects" },
    ]);

    const remove = buildMetadataPlan(records, { tagAction: "remove", tags: ["#work"], category: null });
    expect(remove.map((item) => item.after)).toEqual([
      { tags: [], category: "" },
      { tags: ["ideas"], category: "" },
    ]);
  });
});

describe("note search and sort", () => {
  const records = [
    note("Projects/newer.md", { tags: ["work"], category: "Projects" }),
    note("Archive/older.md", { tags: ["history"], category: "Archive", bodyText: "meeting notes" }),
    note("Inbox/third.md", { tags: ["work", "ideas"], category: "Inbox", bodyText: "draft" }),
  ];

  it("sorts by modification, name, creation and path in both directions", () => {
    expect(filterAndSortNotes(records).map((item) => item.file.basename)).toEqual(["third", "newer", "older"]);
    expect(filterAndSortNotes(records, { sortBy: "name", direction: "asc" }).map((item) => item.file.basename)).toEqual([
      "newer", "older", "third",
    ]);
    expect(filterAndSortNotes(records, { sortBy: "created", direction: "desc" }).map((item) => item.file.basename)).toEqual([
      "third", "newer", "older",
    ]);
    expect(filterAndSortNotes(records, { sortBy: "path", direction: "asc" }).map((item) => item.file.path)).toEqual([
      "Archive/older.md", "Inbox/third.md", "Projects/newer.md",
    ]);
  });

  it("filters across title, path, tags, category and optionally loaded note body", () => {
    expect(filterAndSortNotes(records, { query: "archive" }).map((item) => item.file.basename)).toEqual(["older"]);
    expect(filterAndSortNotes(records, { tag: "work" }).map((item) => item.file.basename)).toEqual(["third", "newer"]);
    expect(filterAndSortNotes(records, { category: "proj" }).map((item) => item.file.basename)).toEqual(["newer"]);
    expect(filterAndSortNotes(records, { query: "release" }).map((item) => item.file.basename)).toEqual([]);
    expect(filterAndSortNotes(records, { query: "release", sortBy: "name" }).map((item) => item.file.basename)).toEqual([]);
    const indexed = records.map((record) => ({
      ...record,
      bodyText: record.file.basename === "newer" ? "alpha release plan" : "",
    }));
    expect(filterAndSortNotes(indexed, { query: "release" }).map((item) => item.file.basename)).toEqual(["newer"]);
  });
});

describe("Markdown formatting", () => {
  it("wraps a selection with inline formatting and returns the selected text range", () => {
    expect(formatSelection("hello world", 6, 11, "bold")).toEqual({
      content: "hello **world**",
      selectionStart: 8,
      selectionEnd: 13,
    });
    expect(formatSelection("", 0, 0, "link")).toEqual({
      content: "[text](url)",
      selectionStart: 1,
      selectionEnd: 5,
    });
  });

  it("adds or replaces heading markers on the selected line and adjusts the selection", () => {
    expect(formatSelection("some title\nnext", 2, 6, "h1").content).toBe("# some title\nnext");
    expect(formatSelection("### title", 0, 9, "h2")).toEqual({
      content: "## title",
      selectionStart: 3,
      selectionEnd: 8,
    });
    expect(formatSelection("", 0, 0, "h1").content).toBe("# ");
  });
});

describe("safe vault paths and move plans", () => {
  it("normalizes separators and rejects path traversal/control characters", () => {
    expect(normalizeVaultPath("/Projects\\Idea//")).toBe("Projects/Idea");
    expect(() => normalizeVaultPath("../outside.md")).toThrow("Parent-directory traversal");
    expect(() => normalizeVaultPath("notes/\u0000bad.md")).toThrow("control characters");
  });

  it("plans folder moves and single-note renames while preserving extensions", () => {
    expect(buildMovePlan(["ideas/a.md", "ideas/b.md"], "Archive/2026")).toEqual([
      { sourcePath: "ideas/a.md", targetPath: "Archive/2026/a.md" },
      { sourcePath: "ideas/b.md", targetPath: "Archive/2026/b.md" },
    ]);
    expect(buildMovePlan(["ideas/a.md"], "Archive", "renamed")).toEqual([
      { sourcePath: "ideas/a.md", targetPath: "Archive/renamed.md" },
    ]);
    expect(buildMovePlan(["ideas/a.md"], "Archive", "renamed.md")[0].targetPath).toBe("Archive/renamed.md");
  });

  it("rejects duplicate destinations, invalid names and batch renaming", () => {
    expect(() => buildMovePlan(["a.md", "folder/a.md"], "Archive")).toThrow("same destination");
    expect(() => buildMovePlan(["a.md", "b.md"], "Archive", "same")).toThrow("single note");
    expect(() => buildMovePlan(["a.md"], "Archive", "../bad")).toThrow("valid note name");
    expect(() => buildMovePlan([], "Archive")).toThrow("Select at least one note");
  });
});
