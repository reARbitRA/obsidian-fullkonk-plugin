// src/__mocks__/obsidian.ts
//
// Minimal, in-memory re-implementation of the slice of the Obsidian API that
// fullKONK_> depends on. The real `obsidian` package ships only ambient type
// declarations (no runtime implementation) since it's provided by the host
// application at runtime, so unit tests need a working stand-in.

export function normalizePath(path: string): string {
  const withForwardSlashes = path.replace(/\\/g, "/");
  const collapsed = withForwardSlashes.replace(/\/+/g, "/");
  const trimmed = collapsed.replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed === "." ? "" : trimmed;
}

export abstract class TAbstractFile {
  path: string;
  name: string;
  parent: TFolder | null = null;

  constructor(path: string) {
    this.path = path;
    const parts = path.split("/");
    this.name = parts[parts.length - 1] ?? path;
  }
}

export class TFile extends TAbstractFile {
  extension: string;
  basename: string;
  stat = { ctime: Date.now(), mtime: Date.now(), size: 0 };

  constructor(path: string) {
    super(path);
    const dot = this.name.lastIndexOf(".");
    this.extension = dot >= 0 ? this.name.slice(dot + 1) : "";
    this.basename = dot >= 0 ? this.name.slice(0, dot) : this.name;
  }
}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];
}

class MockVault {
  private nodes = new Map<string, TAbstractFile>();
  private contents = new Map<string, string>();
  private binaryContents = new Map<string, ArrayBuffer>();
  readonly root: TFolder;

  constructor() {
    this.root = new TFolder("/");
    this.nodes.set("", this.root);
  }

  private parentPath(path: string): string {
    const idx = path.lastIndexOf("/");
    return idx === -1 ? "" : path.slice(0, idx);
  }

  private attachToParent(node: TAbstractFile): void {
    const parentPath = this.parentPath(node.path);
    const parent = this.nodes.get(parentPath);
    if (parent instanceof TFolder) {
      node.parent = parent;
      parent.children.push(node);
    }
  }

  getAbstractFileByPath(path: string): TAbstractFile | null {
    const normalized = normalizePath(path);
    return this.nodes.get(normalized) ?? null;
  }

  async createFolder(path: string): Promise<TFolder> {
    const normalized = normalizePath(path);
    if (this.nodes.has(normalized)) {
      throw new Error(`Folder already exists: ${normalized}`);
    }
    const folder = new TFolder(normalized);
    this.nodes.set(normalized, folder);
    this.attachToParent(folder);
    return folder;
  }

  async create(path: string, content: string): Promise<TFile> {
    const normalized = normalizePath(path);
    if (this.nodes.has(normalized)) {
      throw new Error(`File already exists: ${normalized}`);
    }
    const file = new TFile(normalized);
    file.stat.size = content.length;
    this.nodes.set(normalized, file);
    this.contents.set(normalized, content);
    this.attachToParent(file);
    return file;
  }

  async modify(file: TFile, content: string): Promise<void> {
    this.contents.set(file.path, content);
    file.stat.mtime = Date.now();
    file.stat.size = content.length;
  }

  async createBinary(path: string, data: ArrayBuffer): Promise<TFile> {
    const normalized = normalizePath(path);
    if (this.nodes.has(normalized)) {
      throw new Error(`File already exists: ${normalized}`);
    }
    const file = new TFile(normalized);
    file.stat.size = data.byteLength;
    this.nodes.set(normalized, file);
    this.binaryContents.set(normalized, data);
    this.attachToParent(file);
    return file;
  }

  async modifyBinary(file: TFile, data: ArrayBuffer): Promise<void> {
    this.binaryContents.set(file.path, data);
    file.stat.mtime = Date.now();
    file.stat.size = data.byteLength;
  }

  async readBinary(file: TFile): Promise<ArrayBuffer> {
    const data = this.binaryContents.get(file.path);
    if (data === undefined) {
      throw new Error(`No binary content recorded for file: ${file.path}`);
    }
    return data;
  }

  async read(file: TFile): Promise<string> {
    const content = this.contents.get(file.path);
    if (content === undefined) {
      throw new Error(`No content recorded for file: ${file.path}`);
    }
    return content;
  }

  async cachedRead(file: TFile): Promise<string> {
    return this.read(file);
  }

  getText(path: string): string | undefined {
    return this.contents.get(normalizePath(path));
  }

  async rename(file: TAbstractFile, newPath: string): Promise<void> {
    const oldPath = file.path;
    const normalized = normalizePath(newPath);
    if (this.nodes.has(normalized)) throw new Error(`File already exists: ${normalized}`);
    const parentPath = this.parentPath(normalized);
    const parent = this.nodes.get(parentPath);
    if (!(parent instanceof TFolder)) throw new Error(`Parent folder does not exist: ${parentPath}`);

    if (file.parent) file.parent.children = file.parent.children.filter((child) => child !== file);
    const content = this.contents.get(oldPath);
    const binary = this.binaryContents.get(oldPath);
    this.nodes.delete(oldPath);
    this.contents.delete(oldPath);
    this.binaryContents.delete(oldPath);

    file.path = normalized;
    const parts = normalized.split("/");
    file.name = parts[parts.length - 1] ?? normalized;
    if (file instanceof TFile) {
      const dot = file.name.lastIndexOf(".");
      file.extension = dot >= 0 ? file.name.slice(dot + 1) : "";
      file.basename = dot >= 0 ? file.name.slice(0, dot) : file.name;
    }
    this.nodes.set(normalized, file);
    if (content !== undefined) this.contents.set(normalized, content);
    if (binary !== undefined) this.binaryContents.set(normalized, binary);
    this.attachToParent(file);
  }

  async delete(file: TAbstractFile): Promise<void> {
    this.nodes.delete(file.path);
    this.contents.delete(file.path);
    if (file.parent) {
      file.parent.children = file.parent.children.filter((c) => c !== file);
    }
  }

  getMarkdownFiles(): TFile[] {
    return [...this.nodes.values()].filter(
      (n): n is TFile => n instanceof TFile && n.extension === "md"
    );
  }

  getAllLoadedFiles(): TAbstractFile[] {
    return [...this.nodes.values()];
  }
}

interface ParsedMockNote {
  frontmatter: Record<string, unknown>;
  body: string;
  exists: boolean;
}

function parseScalar(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inside = trimmed.slice(1, -1).trim();
    if (!inside) return [];
    return inside.split(",").map((part) => parseScalar(part));
  }
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    const unquoted = trimmed.slice(1, -1);
    if (trimmed.startsWith("\"")) {
      try {
        return JSON.parse(trimmed) as unknown;
      } catch {
        return unquoted;
      }
    }
    return unquoted;
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function parseMockNote(content: string): ParsedMockNote {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== "---") return { frontmatter: {}, body: content, exists: false };
  const end = lines.indexOf("---", 1);
  if (end < 0) return { frontmatter: {}, body: content, exists: false };
  const frontmatter: Record<string, unknown> = {};
  for (let index = 1; index < end; index++) {
    const match = /^([\w.-]+):\s*(.*)$/.exec(lines[index]);
    if (!match) continue;
    const key = match[1];
    const value = match[2];
    if (value) {
      frontmatter[key] = parseScalar(value);
    } else {
      const values: unknown[] = [];
      while (index + 1 < end && /^\s+-\s+/.test(lines[index + 1])) {
        values.push(parseScalar(lines[index + 1].replace(/^\s+-\s+/, "")));
        index++;
      }
      frontmatter[key] = values;
    }
  }
  const bodyLines = lines.slice(end + 1);
  if (bodyLines[0] === "") bodyLines.shift();
  return { frontmatter, body: bodyLines.join("\n"), exists: true };
}

export function parseYaml(yaml: string): unknown {
  return parseMockNote(`---\n${yaml}\n---`).frontmatter;
}

function serializeMockFrontmatter(frontmatter: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      if (value.length === 0) lines.push(`${key}: []`);
      else {
        lines.push(`${key}:`);
        for (const item of value) lines.push(`  - ${serializeMockScalar(item)}`);
      }
    } else {
      lines.push(`${key}: ${serializeMockScalar(value)}`);
    }
  }
  return lines.join("\n");
}

function serializeMockScalar(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  return JSON.stringify(value);
}

class MockMetadataCache {
  constructor(private readonly vault: MockVault) {}

  getFileCache(file: TFile): { frontmatter?: Record<string, unknown>; tags?: { tag: string }[] } | null {
    const text = this.vault.getText(file.path);
    if (text === undefined) return null;
    const parsed = parseMockNote(text);
    const tags = new Set<string>();
    const rawFrontmatterTags = parsed.frontmatter.tags;
    const frontmatterTags = Array.isArray(rawFrontmatterTags)
      ? rawFrontmatterTags
      : typeof rawFrontmatterTags === "string"
        ? rawFrontmatterTags.split(/[\n,]+/)
        : [];
    for (const tag of frontmatterTags) {
      if (typeof tag === "string" && tag.trim()) tags.add(`#${tag.trim().replace(/^#+/, "")}`);
    }
    for (const match of parsed.body.matchAll(/#([\p{L}\p{N}_/-]+)/gu)) tags.add(`#${match[1]}`);
    return { frontmatter: parsed.frontmatter, tags: [...tags].map((tag) => ({ tag })) };
  }
}

class MockFileManager {
  constructor(private readonly vault: MockVault) {}

  async renameFile(file: TAbstractFile, newPath: string): Promise<void> {
    await this.vault.rename(file, newPath);
  }

  async processFrontMatter(file: TFile, callback: (frontmatter: Record<string, unknown>) => void): Promise<void> {
    const content = await this.vault.read(file);
    const parsed = parseMockNote(content);
    const frontmatter = { ...parsed.frontmatter };
    callback(frontmatter);
    const yaml = serializeMockFrontmatter(frontmatter);
    const body = parsed.body;
    await this.vault.modify(file, `---\n${yaml}\n---\n${body ? `\n${body}` : ""}`);
  }
}

export class App {
  vault = new MockVault();
  workspace = new MockWorkspace();
  metadataCache = new MockMetadataCache(this.vault);
  fileManager = new MockFileManager(this.vault);
}

export class WorkspaceLeaf {
  private viewState: { type: string; active?: boolean } | null = null;
  view: unknown = null;
  openedFile: TFile | null = null;

  async openFile(file: TFile): Promise<void> {
    this.openedFile = file;
  }

  async setViewState(state: { type: string; active?: boolean }): Promise<void> {
    this.viewState = state;
  }

  getViewState(): { type: string; active?: boolean } | null {
    return this.viewState;
  }

  detach(): void {
    this.view = null;
  }
}

class MockWorkspace {
  private leaves: WorkspaceLeaf[] = [];
  revealedLeaf: WorkspaceLeaf | null = null;
  lastLeaf: WorkspaceLeaf | null = null;

  getLeaf(_newLeaf?: boolean | string): WorkspaceLeaf {
    const leaf = new WorkspaceLeaf();
    this.leaves.push(leaf);
    this.lastLeaf = leaf;
    return leaf;
  }

  getLeavesOfType(type: string): WorkspaceLeaf[] {
    return this.leaves.filter((l) => l.getViewState()?.type === type);
  }

  revealLeaf(leaf: WorkspaceLeaf): void {
    this.revealedLeaf = leaf;
  }

  detachLeavesOfType(type: string): void {
    this.leaves = this.leaves.filter((l) => l.getViewState()?.type !== type);
  }
}

export class Component {
  private children = new Set<Component>();

  onload(): void {}
  onunload(): void {}

  addChild<T extends Component>(component: T): T {
    this.children.add(component);
    component.onload();
    return component;
  }

  removeChild<T extends Component>(component: T): T {
    if (this.children.delete(component)) component.onunload();
    return component;
  }
}

export class MarkdownRenderer {
  static async render(_app: App, markdown: string, el: HTMLElement, _sourcePath: string, _component: Component): Promise<void> {
    el.textContent = markdown;
  }
}

export class Plugin extends Component {
  app: App;
  manifest: unknown;
  private data: unknown = null;

  constructor(app: App, manifest: unknown) {
    super();
    this.app = app;
    this.manifest = manifest;
  }

  addRibbonIcon(_icon: string, _title: string, _callback: () => void): HTMLElement {
    return document.createElement("div");
  }

  addCommand(_command: { id: string; name: string; callback: () => void }): void {}

  addSettingTab(_tab: unknown): void {}

  registerView(_type: string, _viewCreator: (leaf: WorkspaceLeaf) => unknown): void {}

  async loadData(): Promise<unknown> {
    return this.data;
  }

  async saveData(data: unknown): Promise<void> {
    this.data = data;
  }
}

export class ItemView extends Component {
  containerEl: HTMLElement;
  leaf: WorkspaceLeaf;

  constructor(leaf: WorkspaceLeaf) {
    super();
    this.leaf = leaf;
    this.containerEl = document.createElement("div");
    const headerEl = document.createElement("div");
    const contentEl = document.createElement("div");
    this.containerEl.appendChild(headerEl);
    this.containerEl.appendChild(contentEl);
  }

  getViewType(): string {
    return "item-view";
  }

  getDisplayText(): string {
    return "";
  }

  getIcon(): string {
    return "";
  }
}

export class PluginSettingTab {
  app: App;
  plugin: Plugin;
  containerEl: HTMLElement;

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement("div");
  }

  display(): void {}
  hide(): void {}
}

type ChangeHandler<T> = (value: T) => void | Promise<void>;

class TextComponent {
  inputEl = document.createElement("input");
  private onChangeHandler: ChangeHandler<string> | null = null;

  setPlaceholder(text: string): this {
    this.inputEl.placeholder = text;
    return this;
  }

  setValue(value: string): this {
    this.inputEl.value = value;
    return this;
  }

  getValue(): string {
    return this.inputEl.value;
  }

  onChange(handler: ChangeHandler<string>): this {
    this.onChangeHandler = handler;
    return this;
  }

  async triggerChange(value: string): Promise<void> {
    this.inputEl.value = value;
    await this.onChangeHandler?.(value);
  }
}

class ToggleComponent {
  private value = false;
  private onChangeHandler: ChangeHandler<boolean> | null = null;

  setValue(value: boolean): this {
    this.value = value;
    return this;
  }

  getValue(): boolean {
    return this.value;
  }

  onChange(handler: ChangeHandler<boolean>): this {
    this.onChangeHandler = handler;
    return this;
  }

  async triggerChange(value: boolean): Promise<void> {
    this.value = value;
    await this.onChangeHandler?.(value);
  }
}

class SliderComponent {
  private value = 0;
  private onChangeHandler: ChangeHandler<number> | null = null;

  setLimits(_min: number, _max: number, _step: number): this {
    return this;
  }

  setValue(value: number): this {
    this.value = value;
    return this;
  }

  getValue(): number {
    return this.value;
  }

  setDynamicTooltip(): this {
    return this;
  }

  onChange(handler: ChangeHandler<number>): this {
    this.onChangeHandler = handler;
    return this;
  }

  async triggerChange(value: number): Promise<void> {
    this.value = value;
    await this.onChangeHandler?.(value);
  }
}

class DropdownComponent {
  private value = "";
  private onChangeHandler: ChangeHandler<string> | null = null;
  options: Record<string, string> = {};

  addOption(value: string, display: string): this {
    this.options[value] = display;
    return this;
  }

  setValue(value: string): this {
    this.value = value;
    return this;
  }

  getValue(): string {
    return this.value;
  }

  onChange(handler: ChangeHandler<string>): this {
    this.onChangeHandler = handler;
    return this;
  }

  async triggerChange(value: string): Promise<void> {
    this.value = value;
    await this.onChangeHandler?.(value);
  }
}

export class Setting {
  /** Test-only registry of every Setting created since the last `Setting.resetInstances()`. */
  static instances: Setting[] = [];
  static resetInstances(): void {
    Setting.instances = [];
  }

  settingEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  name = "";
  private textComponents: TextComponent[] = [];
  private toggleComponents: ToggleComponent[] = [];
  private sliderComponents: SliderComponent[] = [];
  private dropdownComponents: DropdownComponent[] = [];

  constructor(containerEl: HTMLElement) {
    this.settingEl = document.createElement("div");
    this.nameEl = document.createElement("div");
    this.descEl = document.createElement("div");
    this.settingEl.appendChild(this.nameEl);
    this.settingEl.appendChild(this.descEl);
    containerEl.appendChild(this.settingEl);
    Setting.instances.push(this);
  }

  setName(name: string): this {
    this.name = name;
    this.nameEl.textContent = name;
    return this;
  }

  setDesc(desc: string): this {
    this.descEl.textContent = desc;
    return this;
  }

  addText(callback: (component: TextComponent) => void): this {
    const component = new TextComponent();
    this.textComponents.push(component);
    callback(component);
    this.settingEl.appendChild(component.inputEl);
    return this;
  }

  addToggle(callback: (component: ToggleComponent) => void): this {
    const component = new ToggleComponent();
    this.toggleComponents.push(component);
    callback(component);
    return this;
  }

  addSlider(callback: (component: SliderComponent) => void): this {
    const component = new SliderComponent();
    this.sliderComponents.push(component);
    callback(component);
    return this;
  }

  addDropdown(callback: (component: DropdownComponent) => void): this {
    const component = new DropdownComponent();
    this.dropdownComponents.push(component);
    callback(component);
    return this;
  }

  getTextComponents(): TextComponent[] {
    return this.textComponents;
  }

  getToggleComponents(): ToggleComponent[] {
    return this.toggleComponents;
  }

  getSliderComponents(): SliderComponent[] {
    return this.sliderComponents;
  }

  getDropdownComponents(): DropdownComponent[] {
    return this.dropdownComponents;
  }
}

export const Notice = jest.fn().mockImplementation(function (
  this: { message: string; timeout?: number },
  message: string,
  timeout?: number
) {
  this.message = message;
  this.timeout = timeout;
});

export interface RequestUrlParam {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface RequestUrlResponse {
  status: number;
  json: unknown;
  text: string;
}

export const requestUrl = jest.fn(
  async (_params: RequestUrlParam): Promise<RequestUrlResponse> => ({
    status: 200,
    json: {},
    text: "",
  })
);
