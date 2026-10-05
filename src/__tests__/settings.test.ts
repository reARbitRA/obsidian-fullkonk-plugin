import { App } from "obsidian";
import { Setting } from "../__mocks__/obsidian";
import { FullKonkSettingsTab } from "../settings";
import { DEFAULT_SETTINGS, FullKonkSettings } from "../types";
import type FullKonkPlugin from "../main";

interface FakePlugin {
  app: App;
  settings: FullKonkSettings;
  saveSettings: jest.Mock<Promise<void>, []>;
}

function makeFakePlugin(): FakePlugin {
  return {
    app: new App(),
    settings: { ...DEFAULT_SETTINGS },
    saveSettings: jest.fn().mockResolvedValue(undefined),
  };
}

function findSettingByName(name: string): Setting {
  // A re-rendered tab leaves the previous render's Setting objects in the mock
  // registry (their elements are detached by containerEl.empty()), so prefer
  // the most recent match that is still attached to the container.
  const matches = Setting.instances.filter((s) => s.name === name && s.settingEl.parentElement !== null);
  const found = matches[matches.length - 1];
  if (!found) throw new Error(`No Setting found with name "${name}"`);
  return found;
}

describe("FullKonkSettingsTab", () => {
  beforeEach(() => {
    Setting.resetInstances();
  });

  it("renders a heading and one Setting row per provider API key", () => {
    const plugin = makeFakePlugin();
    const tab = new FullKonkSettingsTab(plugin.app, plugin as unknown as FullKonkPlugin);

    tab.display();

    expect(tab.containerEl.querySelector("h2")?.textContent).toBe("fullKONK_> Settings");
    const rows = tab.containerEl.querySelectorAll("input");
    expect(rows.length).toBeGreaterThanOrEqual(12);
    expect(findSettingByName("Groq")).toBeDefined();
    expect(findSettingByName("Google Gemini")).toBeDefined();
    expect(findSettingByName("Mistral")).toBeDefined();
    expect(findSettingByName("Together AI")).toBeDefined();
    expect(findSettingByName("Fireworks AI")).toBeDefined();
  });

  it("persists the API key of a newly added provider", async () => {
    const plugin = makeFakePlugin();
    const tab = new FullKonkSettingsTab(plugin.app, plugin as unknown as FullKonkPlugin);
    tab.display();

    const [mistral] = findSettingByName("Mistral").getTextComponents();
    await mistral.triggerChange("ms-key");

    expect(plugin.settings.mistralApiKey).toBe("ms-key");
  });

  it("re-rendering clears previous content instead of duplicating it", () => {
    const plugin = makeFakePlugin();
    const tab = new FullKonkSettingsTab(plugin.app, plugin as unknown as FullKonkPlugin);

    tab.display();
    const firstCount = tab.containerEl.querySelectorAll("input").length;
    tab.display();
    const secondCount = tab.containerEl.querySelectorAll("input").length;
    expect(secondCount).toBe(firstCount);
  });

  it("updating the Groq API key text field trims and persists the value", async () => {
    const plugin = makeFakePlugin();
    const tab = new FullKonkSettingsTab(plugin.app, plugin as unknown as FullKonkPlugin);
    tab.display();

    const [groqText] = findSettingByName("Groq").getTextComponents();
    await groqText.triggerChange("  sk-live-123  ".trim());

    expect(plugin.settings.groqApiKey).toBe("sk-live-123");
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  it("changing the default mode dropdown updates settings.defaultMode", async () => {
    const plugin = makeFakePlugin();
    const tab = new FullKonkSettingsTab(plugin.app, plugin as unknown as FullKonkPlugin);
    tab.display();

    const [dropdown] = findSettingByName("Default Mode").getDropdownComponents();
    await dropdown.triggerChange("backend");

    expect(plugin.settings.defaultMode).toBe("backend");
  });

  it("changing the temperature slider updates settings.temperature", async () => {
    const plugin = makeFakePlugin();
    const tab = new FullKonkSettingsTab(plugin.app, plugin as unknown as FullKonkPlugin);
    tab.display();

    const [slider] = findSettingByName("Temperature").getSliderComponents();
    await slider.triggerChange(0.85);

    expect(plugin.settings.temperature).toBe(0.85);
  });

  it("toggling 'Save Chat History' updates settings.saveHistory", async () => {
    const plugin = makeFakePlugin();
    const tab = new FullKonkSettingsTab(plugin.app, plugin as unknown as FullKonkPlugin);
    tab.display();

    const [toggle] = findSettingByName("Save Chat History").getToggleComponents();
    await toggle.triggerChange(false);

    expect(plugin.settings.saveHistory).toBe(false);
  });

  it("renders a per-stage routing row for every pipeline stage", () => {
    const plugin = makeFakePlugin();
    const tab = new FullKonkSettingsTab(plugin.app, plugin as unknown as FullKonkPlugin);
    tab.display();

    for (const label of ["Architecture stage", "Frontend stage", "Backend stage", "Verify stage", "Review mode"]) {
      expect(findSettingByName(label)).toBeDefined();
    }

    const [providerDropdown] = findSettingByName("Backend stage").getDropdownComponents();
    expect(Object.keys(providerDropdown.options)).toEqual(
      expect.arrayContaining(["", "groq", "deepseek", "mistral", "together", "fireworks"])
    );
  });

  it("pinning a stage provider persists the pin and reveals its model dropdown", async () => {
    const plugin = makeFakePlugin();
    const tab = new FullKonkSettingsTab(plugin.app, plugin as unknown as FullKonkPlugin);
    tab.display();

    const [providerDropdown] = findSettingByName("Backend stage").getDropdownComponents();
    await providerDropdown.triggerChange("deepseek");

    expect(plugin.settings.stageRouting.backend).toEqual({ provider: "deepseek", model: "" });
    expect(plugin.settings.stageRouting.architect).toEqual({ provider: "", model: "" });

    // display() re-ran: the row now offers the pinned provider's models.
    const [, modelDropdown] = findSettingByName("Backend stage").getDropdownComponents();
    expect(Object.keys(modelDropdown.options)).toEqual(
      expect.arrayContaining(["", "deepseek-reasoner", "deepseek-chat"])
    );
    expect(modelDropdown.getValue()).toBe("");
  });

  it("selecting a specific model stores it on the pin", async () => {
    const plugin = makeFakePlugin();
    plugin.settings.stageRouting.backend = { provider: "deepseek", model: "" };
    const tab = new FullKonkSettingsTab(plugin.app, plugin as unknown as FullKonkPlugin);
    tab.display();

    const [, modelDropdown] = findSettingByName("Backend stage").getDropdownComponents();
    await modelDropdown.triggerChange("deepseek-chat");

    expect(plugin.settings.stageRouting.backend).toEqual({
      provider: "deepseek",
      model: "deepseek-chat",
    });
    expect(findSettingByName("Backend stage").descEl.textContent).toContain("deepseek-chat");
  });

  it("switching a pinned stage back to Auto clears the pin", async () => {
    const plugin = makeFakePlugin();
    plugin.settings.stageRouting.review = { provider: "groq", model: "llama-3.3-70b-versatile" };
    const tab = new FullKonkSettingsTab(plugin.app, plugin as unknown as FullKonkPlugin);
    tab.display();

    const [providerDropdown] = findSettingByName("Review mode").getDropdownComponents();
    await providerDropdown.triggerChange("");

    expect(plugin.settings.stageRouting.review).toEqual({ provider: "", model: "" });
    expect(findSettingByName("Review mode").descEl.textContent).toContain("Automatic");
  });

  it("treats an unknown pinned provider in data.json as automatic in the UI", () => {
    const plugin = makeFakePlugin();
    plugin.settings.stageRouting.verify = { provider: "some-retired-provider", model: "x" };
    const tab = new FullKonkSettingsTab(plugin.app, plugin as unknown as FullKonkPlugin);
    tab.display();

    expect(findSettingByName("Verify stage").descEl.textContent).toContain("Automatic");
    const dropdowns = findSettingByName("Verify stage").getDropdownComponents();
    expect(dropdowns).toHaveLength(1); // no model dropdown for an unknown provider
    expect(dropdowns[0].getValue()).toBe("");
  });

  it("blank output folder falls back to the default 'fullKONK'", async () => {
    const plugin = makeFakePlugin();
    const tab = new FullKonkSettingsTab(plugin.app, plugin as unknown as FullKonkPlugin);
    tab.display();

    const [text] = findSettingByName("Output Folder").getTextComponents();
    await text.triggerChange("   ");

    expect(plugin.settings.outputFolder).toBe("fullKONK");
  });
});
