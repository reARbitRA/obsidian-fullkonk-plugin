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

  async read(file: TFile): Promise<string> {
    const content = this.contents.get(file.path);
    if (content === undefined) {
      throw new Error(`No content recorded for file: ${file.path}`);
    }
    return content;
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
}

export class App {
  vault = new MockVault();
  workspace = new MockWorkspace();
  metadataCache = { getFileCache: () => null };
}

export class WorkspaceLeaf {
  private viewState: { type: string; active?: boolean } | null = null;
  view: unknown = null;

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

  getLeaf(_newLeaf?: boolean | string): WorkspaceLeaf {
    const leaf = new WorkspaceLeaf();
    this.leaves.push(leaf);
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
  onload(): void {}
  onunload(): void {}
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
