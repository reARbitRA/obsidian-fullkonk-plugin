import { App, PluginManifest, WorkspaceLeaf } from "obsidian";
import FullKonkPlugin from "../main";
import { DEFAULT_SETTINGS } from "../types";
import { FK_VIEW_TYPE } from "../view";
import { NOTES_VIEW_TYPE } from "../notesView";

const TEST_MANIFEST: PluginManifest = {
  id: "fullkonk",
  name: "fullKONK_>",
  author: "konkred.xyz",
  version: "1.0.0",
  minAppVersion: "1.4.4",
  description: "AI builder and vault-native notes workspace inside Obsidian.",
};

describe("FullKonkPlugin", () => {
  function makePlugin(): FullKonkPlugin {
    const app = new App();
    return new FullKonkPlugin(app, TEST_MANIFEST);
  }

  it("loads DEFAULT_SETTINGS when no persisted data exists", async () => {
    const plugin = makePlugin();
    await plugin.onload();
    expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("merges persisted data over defaults on load", async () => {
    const app = new App();
    await app.vault; // no-op, just ensure app constructed
    const plugin = new FullKonkPlugin(app, TEST_MANIFEST);
    await plugin.saveData({ groqApiKey: "persisted-key", temperature: 0.9 });
    await plugin.loadSettings();
    expect(plugin.settings.groqApiKey).toBe("persisted-key");
    expect(plugin.settings.temperature).toBe(0.9);
    expect(plugin.settings.maxTokens).toBe(DEFAULT_SETTINGS.maxTokens);
  });

  it("registers the fullKONK_> view and a ribbon icon on load", async () => {
    const plugin = makePlugin();
    const registerSpy = jest.spyOn(plugin, "registerView");
    const ribbonSpy = jest.spyOn(plugin, "addRibbonIcon");
    const commandSpy = jest.spyOn(plugin, "addCommand");
    const settingTabSpy = jest.spyOn(plugin, "addSettingTab");

    await plugin.onload();

    expect(registerSpy).toHaveBeenCalledWith(FK_VIEW_TYPE, expect.any(Function));
    expect(registerSpy).toHaveBeenCalledWith(NOTES_VIEW_TYPE, expect.any(Function));
    expect(ribbonSpy).toHaveBeenCalledWith("zap", "fullKONK_>", expect.any(Function));
    expect(commandSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: "open-fullkonk", name: "Open fullKONK_>" })
    );
    expect(commandSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: "open-vault-notes", name: "fullKONK_>: Open Vault & Notes" })
    );
    expect(settingTabSpy).toHaveBeenCalled();
  });

  it("activateView() creates a new leaf and reveals it when none exists yet", async () => {
    const plugin = makePlugin();
    await plugin.onload();

    const revealSpy = jest.spyOn(plugin.app.workspace, "revealLeaf");
    await plugin.activateView();

    expect(revealSpy).toHaveBeenCalledTimes(1);
    const revealedLeaf = revealSpy.mock.calls[0][0] as WorkspaceLeaf;
    expect(revealedLeaf.getViewState()?.type).toBe(FK_VIEW_TYPE);
  });

  it("activateNotesView() creates and reuses a Vault & Notes leaf", async () => {
    const plugin = makePlugin();
    await plugin.onload();

    await plugin.activateNotesView();
    const first = plugin.app.workspace.getLeavesOfType(NOTES_VIEW_TYPE);
    expect(first).toHaveLength(1);
    expect(first[0].getViewState()?.type).toBe(NOTES_VIEW_TYPE);

    await plugin.activateNotesView();
    expect(plugin.app.workspace.getLeavesOfType(NOTES_VIEW_TYPE)).toHaveLength(1);
  });

  it("activateView() reuses an existing leaf instead of creating a new one", async () => {
    const plugin = makePlugin();
    await plugin.onload();

    await plugin.activateView();
    const leavesAfterFirst = plugin.app.workspace.getLeavesOfType(FK_VIEW_TYPE);
    expect(leavesAfterFirst).toHaveLength(1);

    await plugin.activateView();
    const leavesAfterSecond = plugin.app.workspace.getLeavesOfType(FK_VIEW_TYPE);
    expect(leavesAfterSecond).toHaveLength(1);
  });

  it("onunload() detaches every fullKONK_> leaf", async () => {
    const plugin = makePlugin();
    await plugin.onload();
    await plugin.activateView();
    await plugin.activateNotesView();
    expect(plugin.app.workspace.getLeavesOfType(FK_VIEW_TYPE)).toHaveLength(1);
    expect(plugin.app.workspace.getLeavesOfType(NOTES_VIEW_TYPE)).toHaveLength(1);

    plugin.onunload();
    expect(plugin.app.workspace.getLeavesOfType(FK_VIEW_TYPE)).toHaveLength(0);
    expect(plugin.app.workspace.getLeavesOfType(NOTES_VIEW_TYPE)).toHaveLength(0);
  });

  it("saveSettings() persists the current settings object via saveData", async () => {
    const plugin = makePlugin();
    await plugin.onload();
    plugin.settings.groqApiKey = "new-key";
    await plugin.saveSettings();

    const raw = (await plugin.loadData()) as Record<string, unknown>;
    expect(raw.groqApiKey).toBe("new-key");
  });
});
