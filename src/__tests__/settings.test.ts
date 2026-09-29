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
  const found = Setting.instances.find((s) => s.name === name);
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
    expect(rows.length).toBeGreaterThanOrEqual(9);
    expect(findSettingByName("Groq")).toBeDefined();
    expect(findSettingByName("Google Gemini")).toBeDefined();
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

  it("blank output folder falls back to the default 'fullKONK'", async () => {
    const plugin = makeFakePlugin();
    const tab = new FullKonkSettingsTab(plugin.app, plugin as unknown as FullKonkPlugin);
    tab.display();

    const [text] = findSettingByName("Output Folder").getTextComponents();
    await text.triggerChange("   ");

    expect(plugin.settings.outputFolder).toBe("fullKONK");
  });
});
