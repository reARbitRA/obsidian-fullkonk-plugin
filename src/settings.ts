// src/settings.ts

import { App, PluginSettingTab, Setting } from "obsidian";
import type FullKonkPlugin from "./main";
import { PROVIDERS } from "./providers/registry";
import type { ApiKeySettingsField, BuildMode, FullKonkSettings, TaskType } from "./types";
import { TASK_TYPES } from "./types";

/** Human-readable labels for the per-stage routing controls. */
const STAGE_LABELS: Record<TaskType, string> = {
  architect: "Architecture stage",
  frontend: "Frontend stage",
  backend: "Backend stage",
  verify: "Verify stage",
  review: "Review mode",
};

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
  {
    label: "Mistral",
    key: "mistralApiKey",
    desc: "Mistral Large / Codestral. Free tier at console.mistral.ai",
    signup: "https://console.mistral.ai",
  },
  {
    label: "Together AI",
    key: "togetherApiKey",
    desc: "Free Llama 3.3 / R1 Distill endpoints. api.together.xyz",
    signup: "https://api.together.xyz/settings/api-keys",
  },
  {
    label: "Fireworks AI",
    key: "fireworksApiKey",
    desc: "Fast open-model inference. Free credit at fireworks.ai",
    signup: "https://fireworks.ai/account/api-keys",
  },
];

export class FullKonkSettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: FullKonkPlugin) {
    super(app, plugin);
  }

  /**
   * One row per pipeline stage: a provider dropdown (Auto + every provider) and,
   * once a provider is pinned, a dependent model dropdown. Changing the provider
   * re-renders the tab so the model list always matches the pinned provider.
   */
  private renderStageRouting(containerEl: HTMLElement, task: TaskType): void {
    const pin = this.plugin.settings.stageRouting[task];
    const pinnedProvider = PROVIDERS.find((p) => p.id === pin.provider);
    const description = pinnedProvider
      ? `Pinned to ${pinnedProvider.name}${pin.model ? ` · ${pin.model}` : " (any model)"} — auto fallback still active`
      : "Automatic — highest-scoring available provider, with failover";

    const setting = new Setting(containerEl)
      .setName(STAGE_LABELS[task])
      .setDesc(description)
      .addDropdown((dd) => {
        dd.addOption("", "Auto (recommended)");
        for (const provider of PROVIDERS) {
          dd.addOption(provider.id, provider.name);
        }
        dd.setValue(pinnedProvider ? pin.provider : "").onChange(async (value) => {
          // Replace the table instead of mutating the nested object in place,
          // so a settings object that aliases DEFAULT_SETTINGS (e.g. a shallow
          // copy) can never leak routing changes into another instance.
          this.plugin.settings.stageRouting = {
            ...this.plugin.settings.stageRouting,
            [task]: { provider: value, model: "" },
          };
          await this.plugin.saveSettings();
          this.display();
        });
      });

    if (pinnedProvider) {
      setting.addDropdown((dd) => {
        dd.addOption("", "Any model");
        for (const model of pinnedProvider.models) {
          dd.addOption(model.id, model.label);
        }
        const knownModel = pinnedProvider.models.some((m) => m.id === pin.model);
        dd.setValue(knownModel ? pin.model : "").onChange(async (value) => {
          this.plugin.settings.stageRouting = {
            ...this.plugin.settings.stageRouting,
            [task]: { provider: pinnedProvider.id, model: value },
          };
          await this.plugin.saveSettings();
          this.display();
        });
      });
    }
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

    containerEl.createEl("h3", { text: "Per-Stage Routing" });
    containerEl.createEl("p", {
      text:
        "By default every stage is routed to the best available model automatically, with failover. " +
        "Pin a provider (and optionally a model) to a stage to force it to be tried first — automatic " +
        "fallbacks stay in place behind it, so a rate-limited pin still fails over instead of stalling.",
      cls: "setting-item-description",
    });

    for (const task of TASK_TYPES) {
      this.renderStageRouting(containerEl, task);
    }

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
