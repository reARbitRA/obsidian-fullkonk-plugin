/**
 * @jest-environment node
 */
import { App } from "obsidian";
import { VaultManager, toSafeName, timestampSlug } from "../vault";
import { VaultOperationError } from "../errors";
import { createSessionStats, recordStage } from "../stats";
import type { FKMessage, GeneratedFile } from "../types";

describe("toSafeName()", () => {
  it("strips unsafe characters and truncates to 40 chars", () => {
    expect(toSafeName("Hello, World! / <script>")).toBe("Hello_World_script");
  });

  it("falls back to 'untitled' for an all-unsafe input", () => {
    expect(toSafeName("!!!///???")).toBe("untitled");
  });

  it("preserves names written in non-Latin scripts", () => {
    expect(toSafeName("سلام دنیا")).toBe("سلام_دنیا");
    expect(toSafeName("東京ノート")).toBe("東京ノート");
  });

  it("truncates by Unicode code point without splitting surrogate pairs", () => {
    const name = toSafeName("𐐀".repeat(41));
    expect(Array.from(name)).toHaveLength(40);
    expect(name).toBe("𐐀".repeat(40));
  });

  it("truncates very long names", () => {
    const long = "a".repeat(100);
    expect(toSafeName(long).length).toBe(40);
  });
});

describe("timestampSlug()", () => {
  it("produces a sortable, filesystem-safe slug", () => {
    const slug = timestampSlug(new Date("2026-09-29T14:05:03.123Z"));
    expect(slug).toBe("2026-09-29-14-05-03");
  });
});

describe("VaultManager", () => {
  function makeManager(outputFolder = "fullKONK"): { app: App; manager: VaultManager } {
    const app = new App();
    return { app, manager: new VaultManager(app, outputFolder) };
  }

  it("saves generated files under a timestamped project folder plus a README", async () => {
    const { app, manager } = makeManager();
    const files: GeneratedFile[] = [
      { path: "src/index.ts", content: "export const x = 1;", language: "ts" },
      { path: "src/nested/util.ts", content: "export const y = 2;", language: "ts" },
    ];

    const folder = await manager.saveGeneratedFiles("My Cool Project", files);
    expect(folder).toMatch(/^fullKONK\/My_Cool_Project-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/);

    const indexFile = app.vault.getAbstractFileByPath(`${folder}/README.md`);
    expect(indexFile).not.toBeNull();

    const file1 = app.vault.getAbstractFileByPath(`${folder}/src/index.ts`);
    expect(file1).not.toBeNull();
    const file2 = app.vault.getAbstractFileByPath(`${folder}/src/nested/util.ts`);
    expect(file2).not.toBeNull();
  });

  it("throws VaultOperationError when saving an empty file list", async () => {
    const { manager } = makeManager();
    await expect(manager.saveGeneratedFiles("empty", [])).rejects.toBeInstanceOf(VaultOperationError);
  });

  it("overwrites (modifies) an existing file when the same project is regenerated at the same timestamp", async () => {
    const fixedNow = new Date("2026-01-01T00:00:00.000Z");
    const app = new App();
    const manager = new VaultManager(app, "fullKONK", () => fixedNow);

    const folder = await manager.saveGeneratedFiles("proj", [{ path: "a.ts", content: "v1", language: "ts" }]);
    const folder2 = await manager.saveGeneratedFiles("proj", [{ path: "a.ts", content: "v2 updated", language: "ts" }]);
    expect(folder2).toBe(folder);

    const file = app.vault.getAbstractFileByPath(`${folder}/a.ts`);
    const content = await app.vault.read(file as never);
    expect(content).toBe("v2 updated");
  });

  it("saves chat history with YAML frontmatter and readable transcript", async () => {
    const { app, manager } = makeManager();
    const messages: FKMessage[] = [
      { id: "1", role: "user", content: "Build me a todo app", timestamp: 1 },
      { id: "2", role: "assistant", content: "## OVERVIEW\n...", stage: "architect", timestamp: 2 },
    ];

    const path = await manager.saveChatHistory("Todo App", messages, "fullstack", "Groq");
    const file = app.vault.getAbstractFileByPath(path);
    expect(file).not.toBeNull();

    const content = await app.vault.read(file as never);
    expect(content).toContain("mode: fullstack");
    expect(content).toContain("provider: Groq");
    expect(content).toContain("Build me a todo app");
    expect(content).toContain("## OVERVIEW");
  });

  it("defaults provider to 'unknown' in history frontmatter when not supplied", async () => {
    const { app, manager } = makeManager();
    const path = await manager.saveChatHistory(
      "x",
      [{ id: "1", role: "user", content: "hi", timestamp: 1 }],
      "review",
      ""
    );
    const file = app.vault.getAbstractFileByPath(path);
    const content = await app.vault.read(file as never);
    expect(content).toContain("provider: unknown");
  });

  it("reads multiple vault files and concatenates them as fenced context blocks", async () => {
    const { app, manager } = makeManager();
    await app.vault.create("notes/a.md", "Alpha content");
    await app.vault.create("notes/b.md", "Beta content");

    const context = await manager.readFilesAsContext(["notes/a.md", "notes/b.md", "notes/missing.md"]);
    expect(context).toContain("## File: notes/a.md");
    expect(context).toContain("Alpha content");
    expect(context).toContain("## File: notes/b.md");
    expect(context).toContain("Beta content");
    expect(context).not.toContain("missing.md");
  });

  it("lists previously generated projects newest first, reading metadata from README frontmatter", async () => {
    const { manager } = makeManager();
    await manager.saveGeneratedFiles("First", [{ path: "a.ts", content: "1".repeat(10), language: "ts" }]);
    await manager.saveGeneratedFiles("Second", [{ path: "a.ts", content: "2".repeat(10), language: "ts" }]);

    const projects = await manager.listProjects();
    expect(projects.length).toBe(2);
    expect(projects[0].generatedAt >= projects[1].generatedAt).toBe(true);
    expect(projects.map((p) => p.name).sort()).toEqual(["First", "Second"]);
  });

  it("returns an empty list when the output folder does not exist yet", async () => {
    const { manager } = makeManager("does-not-exist-yet");
    expect(await manager.listProjects()).toEqual([]);
  });

  it("embeds session stats in the history frontmatter and body when provided", async () => {
    const { app, manager } = makeManager();
    const stats = createSessionStats();
    recordStage(stats, {
      stage: "architect",
      provider: "Groq",
      model: "Llama 3.3 70B",
      tokens: 1200,
      durationMs: 2400,
    });

    const path = await manager.saveChatHistory(
      "Stats App",
      [{ id: "1", role: "user", content: "build", timestamp: 1 }],
      "fullstack",
      "Groq",
      stats
    );
    const file = app.vault.getAbstractFileByPath(path);
    const content = await app.vault.read(file as never);

    expect(content).toContain("tokens: 1200");
    expect(content).toContain("stages: 1");
    expect(content).toContain("## Session stats");
    expect(content).toContain("ARCHITECT — 1,200 tok");
  });

  it("omits the stats frontmatter when no stats were recorded", async () => {
    const { app, manager } = makeManager();
    const path = await manager.saveChatHistory(
      "No Stats",
      [{ id: "1", role: "user", content: "hi", timestamp: 1 }],
      "review",
      ""
    );
    const file = app.vault.getAbstractFileByPath(path);
    const content = await app.vault.read(file as never);

    expect(content).not.toContain("tokens:");
    expect(content).not.toContain("## Session stats");
  });

  it("exports generated files as a real ZIP archive under exports/", async () => {
    const fixedNow = new Date("2026-10-04T12:00:00.000Z");
    const app = new App();
    const manager = new VaultManager(app, "fullKONK", () => fixedNow);

    const path = await manager.exportZip("Zip App", [
      { path: "src/index.ts", content: "export const x = 1;", language: "ts" },
      { path: "README.md", content: "# Zip App", language: "md" },
    ]);

    expect(path).toBe("fullKONK/exports/Zip_App-2026-10-04-12-00-00.zip");

    const file = app.vault.getAbstractFileByPath(path);
    expect(file).not.toBeNull();
    const bytes = new Uint8Array(await app.vault.readBinary(file as never));

    // Local header signature, EOCD signature, and both file names present.
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(bytes.length - 12, true)).toBe(2); // entry count
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("src/index.ts");
    expect(text).toContain("export const x = 1;");
  });

  it("refuses to export an empty file list as a ZIP or bundle", async () => {
    const { manager } = makeManager();
    await expect(manager.exportZip("empty", [])).rejects.toBeInstanceOf(VaultOperationError);
    await expect(manager.saveBundle("empty", [])).rejects.toBeInstanceOf(VaultOperationError);
  });

  it("exports a single-file Markdown bundle under exports/", async () => {
    const fixedNow = new Date("2026-10-04T12:00:00.000Z");
    const app = new App();
    const manager = new VaultManager(app, "fullKONK", () => fixedNow);

    const path = await manager.saveBundle("Bundle App", [
      { path: "src/a.ts", content: "export {};", language: "ts" },
    ]);

    expect(path).toBe("fullKONK/exports/Bundle_App-2026-10-04-12-00-00.md");
    const file = app.vault.getAbstractFileByPath(path);
    const content = await app.vault.read(file as never);

    expect(content).toContain("files: 1");
    expect(content).toContain("## `src/a.ts`");
    expect(content).toContain("```ts\nexport {};\n```");
  });
});
