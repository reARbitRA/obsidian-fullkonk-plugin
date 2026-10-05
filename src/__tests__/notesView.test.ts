import { App, Notice, TFile, WorkspaceLeaf } from "obsidian";
import { VaultNotesView } from "../notesView";
import { DEFAULT_SETTINGS } from "../types";
import type FullKonkPlugin from "../main";
import { orchestrate as realOrchestrate } from "../orchestrator";

jest.mock("../orchestrator", () => ({
  orchestrate: jest.fn(),
}));

const orchestrateMock = realOrchestrate as jest.MockedFunction<typeof realOrchestrate>;

function makePlugin(app = new App()): { app: App; plugin: FullKonkPlugin } {
  const plugin = {
    app,
    settings: { ...DEFAULT_SETTINGS, groqApiKey: "test-key" },
    activateView: jest.fn().mockResolvedValue(undefined),
    activateNotesView: jest.fn().mockResolvedValue(undefined),
  } as unknown as FullKonkPlugin;
  return { app, plugin };
}

async function createFolderPath(app: App, path: string): Promise<void> {
  let cursor = "";
  for (const part of path.split("/")) {
    cursor = cursor ? `${cursor}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(cursor)) await app.vault.createFolder(cursor);
  }
}

async function openView(app = new App()): Promise<{ app: App; view: VaultNotesView }> {
  const { plugin } = makePlugin(app);
  const view = new VaultNotesView(new WorkspaceLeaf(), plugin);
  await view.onOpen();
  return { app, view };
}

function buttonByText(view: VaultNotesView, text: string): HTMLButtonElement {
  const button = Array.from(view.containerEl.querySelectorAll("button")).find(
    (item) => item.textContent?.trim() === text
  );
  if (!button) throw new Error(`Button not found: ${text}`);
  return button as HTMLButtonElement;
}

function noteButton(view: VaultNotesView, title: string): HTMLButtonElement {
  const button = Array.from(view.containerEl.querySelectorAll(".fk-note-select")).find(
    (item) => item.querySelector(".fk-note-title")?.textContent === title
  );
  if (!button) throw new Error(`Note not found: ${title}`);
  return button as HTMLButtonElement;
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("VaultNotesView", () => {
  beforeEach(() => {
    orchestrateMock.mockReset();
    (Notice as jest.Mock).mockClear();
  });

  it("renders a vault note list and supports title, tag, category, sort, and content search", async () => {
    const app = new App();
    await createFolderPath(app, "Notes");
    const zebra = await app.vault.create("Notes/Zebra.md", "---\ntags: [project]\ncategory: Work\n---\nA hidden phrase.");
    const apple = await app.vault.create("Notes/Apple.md", "---\ntags: [reading]\ncategory: Personal\n---\nAnother body.");
    zebra.stat.mtime = 10;
    apple.stat.mtime = 20;
    const { view } = await openView(app);

    expect(view.containerEl.textContent).toContain("VAULT NOTES");
    expect(view.containerEl.querySelectorAll(".fk-note-select")).toHaveLength(2);
    expect(Array.from(view.containerEl.querySelectorAll(".fk-note-title")).map((el) => el.textContent)).toEqual([
      "Apple", "Zebra",
    ]);

    const sort = view.containerEl.querySelector(".fk-notes-toolbar select") as HTMLSelectElement;
    sort.value = "name";
    sort.dispatchEvent(new Event("change"));
    await flush();
    expect(Array.from(view.containerEl.querySelectorAll(".fk-note-title")).map((el) => el.textContent)).toEqual([
      "Zebra", "Apple",
    ]);
    buttonByText(view, "↓ DESC").click();
    await flush();
    expect(Array.from(view.containerEl.querySelectorAll(".fk-note-title")).map((el) => el.textContent)).toEqual([
      "Apple", "Zebra",
    ]);

    const tagFilter = view.containerEl.querySelector('[aria-label="Filter by tag"]') as HTMLInputElement;
    tagFilter.value = "project";
    tagFilter.dispatchEvent(new Event("input"));
    await flush();
    expect(Array.from(view.containerEl.querySelectorAll(".fk-note-title")).map((el) => el.textContent)).toEqual(["Zebra"]);

    tagFilter.value = "";
    const categoryFilter = view.containerEl.querySelector('[aria-label="Filter by category"]') as HTMLInputElement;
    categoryFilter.value = "personal";
    categoryFilter.dispatchEvent(new Event("input"));
    await flush();
    expect(Array.from(view.containerEl.querySelectorAll(".fk-note-title")).map((el) => el.textContent)).toEqual(["Apple"]);

    categoryFilter.value = "";
    const search = view.containerEl.querySelector('[aria-label="Search notes"]') as HTMLInputElement;
    search.value = "hidden phrase";
    search.dispatchEvent(new Event("input"));
    await flush();
    expect(view.containerEl.querySelectorAll(".fk-note-title")).toHaveLength(0);

    const contentSearch = view.containerEl.querySelector(".fk-notes-toolbar input[type=checkbox]") as HTMLInputElement;
    contentSearch.checked = true;
    contentSearch.dispatchEvent(new Event("change"));
    await flush();
    expect(Array.from(view.containerEl.querySelectorAll(".fk-note-title")).map((el) => el.textContent)).toEqual(["Zebra"]);
  });

  it("refreshes the selected note from the vault and protects an open draft", async () => {
    const app = new App();
    const file = await app.vault.create("Refresh.md", "Version one");
    const { view } = await openView(app);
    noteButton(view, "Refresh").click();
    await flush();
    await app.vault.modify(file, "Version two from Obsidian");
    buttonByText(view, "↻ REFRESH").click();
    await flush();
    expect(view.containerEl.textContent).toContain("Version two from Obsidian");

    buttonByText(view, "EDIT / FORMAT").click();
    const editor = view.containerEl.querySelector(".fk-notes-editor") as HTMLTextAreaElement;
    editor.value = "Unapplied draft";
    editor.dispatchEvent(new Event("input"));
    buttonByText(view, "↻ REFRESH").click();
    expect(Notice).toHaveBeenCalledWith("Apply/cancel the pending preview or discard the draft before refreshing.");
    expect(editor.value).toBe("Unapplied draft");
  });

  it("reads a note, formats a draft, previews it, and writes only after Apply", async () => {
    const app = new App();
    const file = await app.vault.create("Draft.md", "A simple note.");
    const { view } = await openView(app);
    noteButton(view, "Draft").click();
    await flush();
    expect(view.containerEl.textContent).toContain("A simple note.");

    buttonByText(view, "EDIT / FORMAT").click();
    await flush();
    const editor = view.containerEl.querySelector(".fk-notes-editor") as HTMLTextAreaElement;
    editor.setSelectionRange(2, 8);
    buttonByText(view, "BOLD").click();
    expect(editor.value).toBe("A **simple** note.");

    buttonByText(view, "PREVIEW CHANGES").click();
    expect(view.containerEl.textContent).toContain("REVIEW NOTE EDIT");
    expect(view.containerEl.textContent).toContain("PROPOSED");
    expect(await app.vault.read(file)).toBe("A simple note.");

    buttonByText(view, "APPLY EDIT").click();
    await flush();
    expect(await app.vault.read(file)).toBe("A **simple** note.");
    expect(Notice).toHaveBeenCalledWith("Updated Draft.md");
  });

  it("opens a note in Obsidian and stages a move/rename until the user confirms", async () => {
    const app = new App();
    await createFolderPath(app, "Inbox");
    const file = await app.vault.create("Inbox/Old title.md", "Keep me.");
    const { view } = await openView(app);
    noteButton(view, "Old title").click();
    await flush();

    buttonByText(view, "OPEN IN OBSIDIAN").click();
    const openedLeaf = (app.workspace as unknown as { lastLeaf: WorkspaceLeaf | null }).lastLeaf;
    expect((openedLeaf as unknown as { openedFile: TFile | null } | null)?.openedFile).toBe(file);
    buttonByText(view, "MOVE / RENAME").click();
    const inputs = Array.from(view.containerEl.querySelectorAll(".fk-notes-action-panel input[type=text]")) as HTMLInputElement[];
    inputs[0].value = "Archive/2026";
    inputs[0].dispatchEvent(new Event("input"));
    inputs[1].value = "New title";
    inputs[1].dispatchEvent(new Event("input"));
    buttonByText(view, "PREVIEW MOVE").click();

    expect(view.containerEl.textContent).toContain("Inbox/Old title.md  →  Archive/2026/New title.md");
    expect(app.vault.getAbstractFileByPath("Inbox/Old title.md")).toBe(file);
    expect(app.vault.getAbstractFileByPath("Archive/2026/New title.md")).toBeNull();

    buttonByText(view, "APPLY MOVES").click();
    await flush();
    await flush();
    expect(app.vault.getAbstractFileByPath("Inbox/Old title.md")).toBeNull();
    expect(app.vault.getAbstractFileByPath("Archive/2026/New title.md")).toBeInstanceOf(TFile);
    expect(await app.vault.read(app.vault.getAbstractFileByPath("Archive/2026/New title.md") as TFile)).toBe("Keep me.");
  });

  it("previews and applies tags/categories to multiple selected notes", async () => {
    const app = new App();
    const one = await app.vault.create("One.md", "---\ntags: [old]\ncategory: Inbox\n---\nOne");
    const two = await app.vault.create("Two.md", "---\ntags: [notes]\ncategory: Inbox\n---\nTwo");
    one.stat.mtime = 20;
    two.stat.mtime = 10;
    const { view } = await openView(app);

    const rows = Array.from(view.containerEl.querySelectorAll(".fk-note-row"));
    const firstCheck = rows[0].querySelector("input[type=checkbox]") as HTMLInputElement;
    firstCheck.checked = true;
    firstCheck.dispatchEvent(new Event("change"));
    await flush();
    const secondRow = Array.from(view.containerEl.querySelectorAll(".fk-note-row")).find((row) => row.textContent?.includes("Two.md"));
    if (!secondRow) throw new Error("second note row not found");
    const secondCheck = secondRow.querySelector("input[type=checkbox]") as HTMLInputElement;
    secondCheck.checked = true;
    secondCheck.dispatchEvent(new Event("change"));

    buttonByText(view, "TAGS / CATEGORY").click();
    const panelInputs = Array.from(view.containerEl.querySelectorAll(".fk-notes-action-panel input[type=text]")) as HTMLInputElement[];
    panelInputs[0].value = "review, ideas";
    panelInputs[0].dispatchEvent(new Event("input"));
    panelInputs[1].value = "Research";
    panelInputs[1].dispatchEvent(new Event("input"));
    buttonByText(view, "PREVIEW METADATA").click();
    expect(view.containerEl.textContent).toContain("METADATA PREVIEW");
    expect(await app.vault.read(app.vault.getAbstractFileByPath("One.md") as TFile)).toContain("category: Inbox");

    buttonByText(view, "APPLY METADATA").click();
    await flush();
    for (const path of ["One.md", "Two.md"]) {
      const content = await app.vault.read(app.vault.getAbstractFileByPath(path) as TFile);
      expect(content).toContain('"review"');
      expect(content).toContain('"ideas"');
      expect(content).toContain('category: "Research"');
    }
  });

  it("requires explicit consent before sending a note to AI and stages summaries as drafts", async () => {
    const app = new App();
    const file = await app.vault.create("Private.md", "Private note content.");
    const { view } = await openView(app);
    orchestrateMock.mockResolvedValue("A short summary.");
    noteButton(view, "Private").click();
    await flush();
    buttonByText(view, "AI ASSIST").click();

    buttonByText(view, "RUN AI").click();
    expect(orchestrateMock).not.toHaveBeenCalled();
    expect(Notice).toHaveBeenCalledWith("Confirm that you want to send this note to an AI provider.");

    const consent = view.containerEl.querySelector(".fk-notes-action-panel input[type=checkbox]") as HTMLInputElement;
    consent.checked = true;
    consent.dispatchEvent(new Event("change"));
    buttonByText(view, "RUN AI").click();
    await flush();

    expect(orchestrateMock).toHaveBeenCalledTimes(1);
    expect(orchestrateMock.mock.calls[0][1][1].content).toContain("Private note content.");
    expect(view.containerEl.textContent).toContain("A short summary.");
    expect(await app.vault.read(file)).toBe("Private note content.");

    buttonByText(view, "INSERT SUMMARY INTO DRAFT").click();
    const editor = view.containerEl.querySelector(".fk-notes-editor") as HTMLTextAreaElement;
    expect(editor.value).toContain("## Summary\n\nA short summary.");
    buttonByText(view, "PREVIEW CHANGES").click();
    expect(await app.vault.read(file)).toBe("Private note content.");
    buttonByText(view, "APPLY EDIT").click();
    await flush();
    expect(await app.vault.read(file)).toContain("## Summary\n\nA short summary.");
  });

  it("cancels an AI response when switching to a different note", async () => {
    const app = new App();
    await app.vault.create("Alpha.md", "Alpha private text.");
    await app.vault.create("Beta.md", "Beta note.");
    const { view } = await openView(app);
    const resolveAi: ((result: string) => void)[] = [];
    orchestrateMock.mockImplementation(() => new Promise<string>((resolve) => { resolveAi.push(resolve); }));

    noteButton(view, "Alpha").click();
    await flush();
    buttonByText(view, "AI ASSIST").click();
    const consent = view.containerEl.querySelector(".fk-notes-action-panel input[type=checkbox]") as HTMLInputElement;
    consent.checked = true;
    consent.dispatchEvent(new Event("change"));
    buttonByText(view, "RUN AI").click();
    expect(orchestrateMock).toHaveBeenCalledTimes(1);

    noteButton(view, "Beta").click();
    await flush();
    if (!resolveAi[0]) throw new Error("AI request resolver was not captured");
    resolveAi[0]("Stale response from Alpha");
    await flush();

    expect(view.containerEl.textContent).toContain("Beta note.");
    expect(view.containerEl.textContent).not.toContain("Stale response from Alpha");
    expect(view.containerEl.querySelector(".fk-notes-action-panel")).toBeNull();
  });

  it("keeps an AI rewrite as an unapplied draft until the user previews and applies it", async () => {
    const app = new App();
    const file = await app.vault.create("Rewrite.md", "Original wording.");
    const { view } = await openView(app);
    orchestrateMock.mockResolvedValue("# Clearer heading\n\nOriginal meaning preserved.");
    noteButton(view, "Rewrite").click();
    await flush();
    buttonByText(view, "AI ASSIST").click();

    const panel = view.containerEl.querySelector(".fk-notes-action-panel") as HTMLElement;
    const action = panel.querySelector("select") as HTMLSelectElement;
    action.value = "rewrite";
    action.dispatchEvent(new Event("change"));
    const consent = view.containerEl.querySelector(".fk-notes-action-panel input[type=checkbox]") as HTMLInputElement;
    consent.checked = true;
    consent.dispatchEvent(new Event("change"));
    buttonByText(view, "RUN AI").click();
    await flush();

    buttonByText(view, "USE REWRITE AS DRAFT").click();
    const editor = view.containerEl.querySelector(".fk-notes-editor") as HTMLTextAreaElement;
    expect(editor.value).toContain("# Clearer heading");
    expect(await app.vault.read(file)).toBe("Original wording.");
    buttonByText(view, "PREVIEW CHANGES").click();
    expect(await app.vault.read(file)).toBe("Original wording.");
    buttonByText(view, "APPLY EDIT").click();
    await flush();
    expect(await app.vault.read(file)).toContain("# Clearer heading");
  });

  it("exposes view metadata and prevents applying a stale edit preview", async () => {
    const app = new App();
    const file = await app.vault.create("Conflict.md", "Original");
    const { view } = await openView(app);
    expect(view.getViewType()).toBe("fullkonk-notes-view");
    expect(view.getDisplayText()).toBe("Vault & Notes");

    noteButton(view, "Conflict").click();
    await flush();
    buttonByText(view, "EDIT / FORMAT").click();
    const editor = view.containerEl.querySelector(".fk-notes-editor") as HTMLTextAreaElement;
    editor.value = "My planned edit";
    editor.dispatchEvent(new Event("input"));
    buttonByText(view, "PREVIEW CHANGES").click();
    await app.vault.modify(file, "Changed from another editor");
    buttonByText(view, "APPLY EDIT").click();
    await flush();

    expect(await app.vault.read(file)).toBe("Changed from another editor");
    expect(Notice).toHaveBeenCalledWith(expect.stringContaining("Edit not applied: This note changed"));
  });
});
