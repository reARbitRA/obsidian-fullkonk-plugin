// src/settings.ts

import { App, PluginSettingTab, Setting } from "obsidian";
import type FullKonkPlugin from "./main";
import type { ApiKeySettingsField, BuildMode, FullKonkSettings } from "./types";

interface ApiKeyField {
  label: string;
  key: ApiKeySettingsField;
  desc: string;
  signup: string;
}

const API_KEY_FIELDS: ApiKeyField[] = [
  {
    label: "Google Gemini",
    key: "geminiApiKey",
    desc: "1M context, best reasoning. Free at aistudio.google.com",
    signup: "https://aistudio.google.com",
  },
  {
    label: "DeepSeek",
    key: "deepseekApiKey",
    desc: "Best coding + R1 reasoning. Free at platform.deepseek.com",
    signup: "https://platform.deepseek.com",
  },
  {
    label: "NVIDIA NIM",
    key: "nvidiaApiKey",
    desc: "DeepSeek R1 on NVIDIA hardware. Free at build.nvidia.com",
    signup: "https://build.nvidia.com",
  },
  {
    label: "SambaNova",
    key: "sambanovaApiKey",
    desc: "Fastest inference. Free at cloud.sambanova.ai",
    signup: "https://cloud.sambanova.ai",
  },
  {
    label: "Groq",
    key: "groqApiKey",
    desc: "Fastest LPU inference. Free at console.groq.com",
    signup: "https://console.groq.com",
  },
  {
    label: "Cerebras",
    key: "cerebrasApiKey",
    desc: "1M tokens/day free. cloud.cerebras.ai",
    signup: "https://cloud.cerebras.ai",
  },
  {
    label: "OpenRouter",
    key: "openrouterApiKey",
    desc: "20+ free models gateway. openrouter.ai",
    signup: "https://openrouter.ai",
  },
  {
    label: "GitHub Token",
    key: "githubToken",
    desc: "GPT-4o free via GitHub Models. github.com/marketplace/models",
    signup: "https://github.com/settings/tokens",
  },
  {
    label: "HuggingFace",
    key: "huggingfaceApiKey",
    desc: "Qwen3 235B and more. huggingface.co",
    signup: "https://huggingface.co/settings/tokens",
  },
];

export class FullKonkSettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: FullKonkPlugin) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "fullKONK_> Settings" });
    containerEl.createEl("p", {
      text:
        "Add API keys for the providers you want to use. At least one key is required. " +
        "The orchestrator automatically routes to the best available model and fails over " +
        "to the next provider if one is rate limited or errors out.",
      cls: "setting-item-description",
    });

    containerEl.createEl("h3", { text: "API Keys — Priority Order" });

    for (const field of API_KEY_FIELDS) {
      new Setting(containerEl)
        .setName(field.label)
        .setDesc(`${field.desc} → ${field.signup}`)
        .addText((text) =>
          text
            .setPlaceholder("Paste API key here...")
            .setValue(this.plugin.settings[field.key])
            .onChange(async (value) => {
              this.plugin.settings[field.key] = value.trim();
              await this.plugin.saveSettings();
            })
        );
    }

    containerEl.createEl("h3", { text: "Defaults" });

    new Setting(containerEl)
      .setName("Default Mode")
      .setDesc("Which pipeline mode to use by default")
      .addDropdown((dd) =>
        dd
          .addOption("fullstack", "Full-Stack")
          .addOption("frontend", "Frontend only")
          .addOption("backend", "Backend only")
          .addOption("review", "Code Review")
          .setValue(this.plugin.settings.defaultMode)
          .onChange(async (value) => {
            this.plugin.settings.defaultMode = value as BuildMode;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Temperature")
      .setDesc("0 = deterministic, 1 = creative")
      .addSlider((sl) =>
        sl
          .setLimits(0, 1, 0.05)
          .setValue(this.plugin.settings.temperature)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.temperature = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Max Output Tokens")
      .setDesc("Maximum tokens per generation stage")
      .addSlider((sl) =>
        sl
          .setLimits(1024, 16384, 512)
          .setValue(this.plugin.settings.maxTokens)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxTokens = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Request Timeout (seconds)")
      .setDesc("How long to wait for a provider before treating it as failed")
      .addSlider((sl) =>
        sl
          .setLimits(10, 300, 5)
          .setValue(Math.round(this.plugin.settings.requestTimeoutMs / 1000))
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.requestTimeoutMs = value * 1000;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "Vault" });

    new Setting(containerEl)
      .setName("Output Folder")
      .setDesc("Where generated files are saved in your vault")
      .addText((text) =>
        text
          .setPlaceholder("fullKONK")
          .setValue(this.plugin.settings.outputFolder)
          .onChange(async (value) => {
            this.plugin.settings.outputFolder = value.trim() || "fullKONK";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Save Chat History")
      .setDesc("Save each session as a Markdown file in the vault")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.saveHistory).onChange(async (value) => {
          this.plugin.settings.saveHistory = value;
          await this.plugin.saveSettings();
        })
      );
  }
}

export type { FullKonkSettings };
