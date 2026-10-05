// src/main.ts

import { Plugin, WorkspaceLeaf } from "obsidian";
import { FK_VIEW_TYPE, FullKonkView } from "./view";
import { NOTES_VIEW_TYPE, VaultNotesView } from "./notesView";
import { FullKonkSettingsTab } from "./settings";
import { DEFAULT_SETTINGS, FullKonkSettings, sanitizeSettings } from "./types";

export default class FullKonkPlugin extends Plugin {
  override settings: FullKonkSettings = DEFAULT_SETTINGS;

  override async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(FK_VIEW_TYPE, (leaf) => new FullKonkView(leaf, this));
    this.registerView(NOTES_VIEW_TYPE, (leaf) => new VaultNotesView(leaf, this));

    this.addRibbonIcon("zap", "fullKONK_>", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "open-fullkonk",
      name: "Open fullKONK_>",
      callback: () => {
        void this.activateView();
      },
    });

    this.addCommand({
      id: "open-vault-notes",
      name: "fullKONK_>: Open Vault & Notes",
      callback: () => {
        void this.activateNotesView();
      },
    });

    this.addSettingTab(new FullKonkSettingsTab(this.app, this));
  }

  override onunload(): void {
    this.app.workspace.detachLeavesOfType(FK_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(NOTES_VIEW_TYPE);
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;

    const existing = workspace.getLeavesOfType(FK_VIEW_TYPE);
    if (existing.length > 0) {
      leaf = existing[0];
    } else {
      leaf = workspace.getLeaf(true);
      await leaf.setViewState({ type: FK_VIEW_TYPE, active: true });
    }

    if (leaf) workspace.revealLeaf(leaf);
  }

  async activateNotesView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;

    const existing = workspace.getLeavesOfType(NOTES_VIEW_TYPE);
    if (existing.length > 0) {
      leaf = existing[0];
    } else {
      leaf = workspace.getLeaf(true);
      await leaf.setViewState({ type: NOTES_VIEW_TYPE, active: true });
    }

    if (leaf) workspace.revealLeaf(leaf);
  }

  async loadSettings(): Promise<void> {
    const raw = await this.loadData();
    this.settings = sanitizeSettings(raw);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
