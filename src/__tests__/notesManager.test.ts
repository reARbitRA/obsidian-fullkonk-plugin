import { App, TFile } from "obsidian";
import { buildMetadataPlan, buildMovePlan } from "../notes";
import { NoteConflictError, VaultNotesManager } from "../notesManager";

async function createFolderPath(app: App, path: string): Promise<void> {
  let cursor = "";
  for (const part of path.split("/")) {
    cursor = cursor ? `${cursor}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(cursor)) await app.vault.createFolder(cursor);
  }
}

describe("VaultNotesManager", () => {
  it("lists Markdown notes with Obsidian frontmatter and tag metadata", async () => {
    const app = new App();
    await createFolderPath(app, "Research/AI");
    await app.vault.create(
      "Research/AI/Model notes.md",
      "---\ntags:\n  - research\n  - llm\ncategory: Research\n---\nBody has #draft too."
    );
    await app.vault.create("readme.txt", "not a Markdown note");

    const notes = new VaultNotesManager(app).listNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0].file.path).toBe("Research/AI/Model notes.md");
    expect(notes[0].frontmatterTags).toEqual(["research", "llm"]);
    expect(notes[0].tags).toEqual(["research", "llm", "draft"]);
    expect(notes[0].category).toBe("Research");
  });

  it("reads and applies edits only if the note still matches the preview baseline", async () => {
    const app = new App();
    const file = await app.vault.create("idea.md", "Original text");
    const manager = new VaultNotesManager(app);
    expect(await manager.readNote(file)).toBe("Original text");

    await manager.saveNote(file, "Original text", "Revised text");
    expect(await app.vault.read(file)).toBe("Revised text");
    await expect(manager.saveNote(file, "Original text", "Stale edit")).rejects.toBeInstanceOf(NoteConflictError);
    expect(await app.vault.read(file)).toBe("Revised text");
  });

  it("moves notes into nested folders through FileManager.renameFile", async () => {
    const app = new App();
    await createFolderPath(app, "Inbox");
    const file = await app.vault.create("Inbox/ideas.md", "[[another note]]");
    const renameSpy = jest.spyOn(app.fileManager, "renameFile");
    const manager = new VaultNotesManager(app);
    const plan = buildMovePlan([file.path], "Archive/2026");

    expect(manager.validateMovePlan(plan)).toBeUndefined();
    expect(await manager.moveNotes(plan)).toBe(1);
    expect(renameSpy).toHaveBeenCalledWith(file, "Archive/2026/ideas.md");
    expect(app.vault.getAbstractFileByPath("Inbox/ideas.md")).toBeNull();
    expect(file.path).toBe("Archive/2026/ideas.md");
    expect(await app.vault.read(file)).toBe("[[another note]]");
  });

  it("rejects existing destinations and rolls back a partially failed batch move", async () => {
    const app = new App();
    await createFolderPath(app, "Inbox");
    await app.vault.create("Inbox/a.md", "A");
    await app.vault.create("Inbox/b.md", "B");
    await app.vault.create("Archive/a.md", "already here");
    const manager = new VaultNotesManager(app);

    const collision = buildMovePlan(["Inbox/a.md"], "Archive");
    expect(() => manager.validateMovePlan(collision)).toThrow("already exists");

    const plan = buildMovePlan(["Inbox/a.md", "Inbox/b.md"], "Archive/Batch");
    const originalRename = app.fileManager.renameFile.bind(app.fileManager);
    const renameSpy = jest.spyOn(app.fileManager, "renameFile").mockImplementation(async (file, path) => {
      if (path === "Archive/Batch/b.md") throw new Error("simulated rename failure");
      await originalRename(file, path);
    });
    await expect(manager.moveNotes(plan)).rejects.toThrow("Completed moves were rolled back");
    expect(app.vault.getAbstractFileByPath("Inbox/a.md")).toBeInstanceOf(TFile);
    expect(app.vault.getAbstractFileByPath("Inbox/b.md")).toBeInstanceOf(TFile);
    expect(app.vault.getAbstractFileByPath("Archive/Batch/a.md")).toBeNull();
    expect(renameSpy).toHaveBeenCalledTimes(3);
  });

  it("applies tag and category previews while preserving unrelated frontmatter", async () => {
    const app = new App();
    const file = await app.vault.create(
      "note.md",
      "---\ntags: [old]\ncategory: Reading\naliases: [favorite]\n---\nBody"
    );
    const manager = new VaultNotesManager(app);
    const record = manager.listNotes()[0];
    const plans = buildMetadataPlan([record], {
      tagAction: "add",
      tags: ["new"],
      category: "Research",
    });

    expect(await manager.applyMetadata(plans)).toBe(1);
    const saved = await app.vault.read(file);
    expect(saved).toContain('"old"');
    expect(saved).toContain('"new"');
    expect(saved).toContain('category: "Research"');
    expect(saved).toContain("aliases:");
    expect(saved).toContain('"favorite"');
    expect(saved).toContain("Body");
    expect(manager.listNotes()[0].frontmatterTags).toEqual(["old", "new"]);
    expect(manager.listNotes()[0].category).toBe("Research");
  });

  it("rejects a stale metadata preview before changing any note in the batch", async () => {
    const app = new App();
    const first = await app.vault.create("a.md", "---\ntags: [old]\ncategory: Work\n---\nFirst");
    const second = await app.vault.create("b.md", "---\ntags: [old]\ncategory: Work\n---\nSecond");
    const manager = new VaultNotesManager(app);
    const plan = buildMetadataPlan(manager.listNotes(), { tagAction: "add", tags: ["review"] });
    await app.fileManager.processFrontMatter(second, (frontmatter) => {
      frontmatter.category = "Changed elsewhere";
    });

    await expect(manager.applyMetadata(plan)).rejects.toBeInstanceOf(NoteConflictError);
    expect(await app.vault.read(first)).not.toContain('"review"');
    expect(await app.vault.read(second)).toContain('category: "Changed elsewhere"');
  });
});
