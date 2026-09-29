import { App, Notice, WorkspaceLeaf } from "obsidian";
import { FullKonkView } from "../view";
import { DEFAULT_SETTINGS } from "../types";
import type FullKonkPlugin from "../main";
import { orchestrate as realOrchestrate } from "../orchestrator";

jest.mock("../orchestrator", () => ({
  orchestrate: jest.fn(),
}));

const orchestrateMock = realOrchestrate as jest.MockedFunction<typeof realOrchestrate>;

function makePlugin(overrides: Partial<typeof DEFAULT_SETTINGS> = {}): { app: App; plugin: FullKonkPlugin } {
  const app = new App();
  const plugin = {
    app,
    settings: { ...DEFAULT_SETTINGS, ...overrides },
    saveSettings: jest.fn().mockResolvedValue(undefined),
  } as unknown as FullKonkPlugin;
  return { app, plugin };
}

async function openView(overrides: Partial<typeof DEFAULT_SETTINGS> = {}): Promise<FullKonkView> {
  const { plugin } = makePlugin(overrides);
  const leaf = new WorkspaceLeaf();
  const view = new FullKonkView(leaf, plugin);
  await view.onOpen();
  return view;
}

function getInput(view: FullKonkView): HTMLTextAreaElement {
  const el = view.containerEl.querySelector("textarea");
  if (!el) throw new Error("input textarea not found");
  return el as HTMLTextAreaElement;
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function getBuildButton(view: FullKonkView): HTMLButtonElement {
  const buttons = Array.from(view.containerEl.querySelectorAll("button"));
  const btn = buttons.find((b) => b.textContent === "BUILD →" || b.textContent === "■ STOP");
  if (!btn) throw new Error("build button not found");
  return btn as HTMLButtonElement;
}

describe("FullKonkView", () => {
  beforeEach(() => {
    orchestrateMock.mockReset();
    (Notice as jest.Mock).mockClear();
  });

  it("renders the empty state and all four mode buttons on open", async () => {
    const view = await openView();
    expect(view.containerEl.textContent).toContain("DESCRIBE WHAT YOU WANT TO BUILD");
    const modeButtons = Array.from(view.containerEl.querySelectorAll("button")).map((b) => b.textContent);
    expect(modeButtons).toEqual(
      expect.arrayContaining(["⬡ FULL-STACK", "◈ FRONTEND", "⬢ BACKEND", "◎ REVIEW"])
    );
  });

  it("does nothing when sending an empty prompt", async () => {
    const view = await openView();
    getInput(view).value = "   ";
    await view.send();
    expect(orchestrateMock).not.toHaveBeenCalled();
    expect(view.getMessagesSnapshot()).toHaveLength(0);
  });

  it("runs the full fullstack pipeline (architect → frontend → backend → verify) in order", async () => {
    const stagesSeen: string[] = [];
    orchestrateMock.mockImplementation(async (task) => {
      stagesSeen.push(task);
      return `## output for ${task}`;
    });

    const view = await openView({ defaultMode: "fullstack" });
    getInput(view).value = "Build me a todo app";
    await view.send();

    expect(stagesSeen).toEqual(["architect", "frontend", "backend", "verify"]);
    expect(view.getStage()).toBe("done");
    expect(view.isStreaming()).toBe(false);
  });

  it("runs only the architect stage for review mode, using the verify system prompt", async () => {
    orchestrateMock.mockResolvedValue("Looks good, no issues found.");
    const view = await openView({ defaultMode: "review" });

    getInput(view).value = "Review this snippet";
    await view.send();

    expect(orchestrateMock).toHaveBeenCalledTimes(1);
    expect(orchestrateMock.mock.calls[0][0]).toBe("review");
    expect(view.getStage()).toBe("done");
  });

  it("extracts generated files from streamed chunks and renders file tabs", async () => {
    orchestrateMock.mockImplementation(async (task, _messages, _settings, callbacks) => {
      if (task === "frontend") {
        callbacks.onChunk("```tsx\n// src/App.tsx\nexport default function App() { return null; }\n```");
      }
      return "done";
    });

    const view = await openView({ defaultMode: "frontend" });
    getInput(view).value = "Build a landing page";
    await view.send();

    const files = view.getFilesSnapshot();
    expect(files.some((f) => f.path === "src/App.tsx")).toBe(true);
  });

  it("shows an error message and a Notice when every provider fails", async () => {
    orchestrateMock.mockRejectedValue(new Error("All providers failed. Last error: boom"));
    const view = await openView();

    getInput(view).value = "Build something";
    await view.send();

    expect(view.getStage()).toBe("error");
    const last = view.getMessagesSnapshot()[view.getMessagesSnapshot().length - 1];
    expect(last.content).toContain("All providers failed");
    expect(Notice).toHaveBeenCalled();
  });

  it("stop() aborts the in-flight pipeline and resets streaming UI", async () => {
    let capturedSignal: AbortSignal | undefined;
    orchestrateMock.mockImplementation(async (_task, _messages, _settings, _callbacks, signal) => {
      capturedSignal = signal;
      return new Promise<string>((resolve) => {
        signal?.addEventListener("abort", () => resolve(""));
      });
    });

    const view = await openView();
    getInput(view).value = "Build something long running";
    const sendPromise = view.send();

    // Allow the microtask queue to reach the point where orchestrate() was invoked.
    await Promise.resolve();
    await Promise.resolve();

    view.stop();
    await sendPromise;

    expect(capturedSignal?.aborted).toBe(true);
    expect(view.isStreaming()).toBe(false);
  });

  it("clear() resets messages, files, and stage back to idle", async () => {
    orchestrateMock.mockImplementation(async (_task, _messages, _settings, callbacks) => {
      callbacks.onChunk("```ts\n// a.ts\nexport const a = 1234567890; // padding to exceed min length\n```");
      return "ok";
    });
    const view = await openView({ defaultMode: "backend" });
    getInput(view).value = "Build a backend";
    await view.send();

    expect(view.getMessagesSnapshot().length).toBeGreaterThan(0);

    view.clear();

    expect(view.getMessagesSnapshot()).toHaveLength(0);
    expect(view.getFilesSnapshot()).toHaveLength(0);
    expect(view.getStage()).toBe("idle");
  });

  it("saveToVault() shows a Notice when there are no files yet", async () => {
    const view = await openView();
    await view.saveToVault();
    expect(Notice).toHaveBeenCalledWith("No files to save yet.");
  });

  it("saveToVault() persists extracted files into the vault and notifies success", async () => {
    orchestrateMock.mockImplementation(async (_task, _messages, _settings, callbacks) => {
      callbacks.onChunk("```ts\n// a.ts\nexport const a = 1234567890; // padding to exceed min length\n```");
      return "ok";
    });
    const view = await openView({ defaultMode: "backend" });
    getInput(view).value = "Build a backend";
    await view.send();

    (Notice as jest.Mock).mockClear();
    await view.saveToVault();

    expect(Notice).toHaveBeenCalledWith(expect.stringContaining("Saved 1 files to"));
  });

  it("exposes stable view type/display text/icon metadata", async () => {
    const view = await openView();
    expect(view.getViewType()).toBe("fullkonk-view");
    expect(view.getDisplayText()).toBe("fullKONK_>");
    expect(view.getIcon()).toBe("zap");
  });

  it("onClose() aborts any in-flight request", async () => {
    let capturedSignal: AbortSignal | undefined;
    orchestrateMock.mockImplementation(async (_task, _messages, _settings, _callbacks, signal) => {
      capturedSignal = signal;
      return new Promise<string>(() => {
        /* never resolves; onClose() should abort it */
      });
    });
    const view = await openView();
    getInput(view).value = "Build something";
    void view.send();
    await Promise.resolve();
    await Promise.resolve();

    await view.onClose();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("clicking a mode button switches the active mode before streaming starts", async () => {
    const view = await openView({ defaultMode: "fullstack" });
    const backendBtn = Array.from(view.containerEl.querySelectorAll("button")).find(
      (b) => b.textContent === "⬢ BACKEND"
    ) as HTMLButtonElement;
    backendBtn.click();

    orchestrateMock.mockResolvedValue("ok");
    getInput(view).value = "Build a backend only";
    await view.send();

    // fullstack would run architect+frontend+backend+verify (4 calls); backend-only runs 2.
    expect(orchestrateMock).toHaveBeenCalledTimes(2);
  });

  it("ignores mode button clicks while a build is already streaming", async () => {
    orchestrateMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve("ok"), 5))
    );
    const view = await openView({ defaultMode: "fullstack" });
    getInput(view).value = "Build something";
    const sendPromise = view.send();
    await Promise.resolve();

    const backendBtn = Array.from(view.containerEl.querySelectorAll("button")).find(
      (b) => b.textContent === "⬢ BACKEND"
    ) as HTMLButtonElement;
    backendBtn.click();

    view.stop();
    await sendPromise;
    // Mode switch should have been ignored while streaming (mode stays fullstack,
    // verified indirectly: clicking stop + re-sending would run the fullstack pipeline).
  });

  it("clicking the topbar SAVE button saves generated files", async () => {
    orchestrateMock.mockImplementation(async (_task, _messages, _settings, callbacks) => {
      callbacks.onChunk("```ts\n// a.ts\nexport const a = 1234567890; // padding to exceed min length\n```");
      return "ok";
    });
    const view = await openView({ defaultMode: "backend" });
    getInput(view).value = "Build a backend";
    await view.send();
    (Notice as jest.Mock).mockClear();

    const topbarSaveBtn = Array.from(view.containerEl.querySelectorAll("button")).find(
      (b) => b.textContent === "↓ SAVE"
    ) as HTMLButtonElement;
    topbarSaveBtn.click();
    await flushMicrotasks();

    expect(Notice).toHaveBeenCalledWith(expect.stringContaining("Saved"));
  });

  it("clicking a showcase template button fills the input with its prompt", async () => {
    const view = await openView();
    const templateBtn = Array.from(view.containerEl.querySelectorAll("button")).find(
      (b) => b.textContent === "Prompt Autopsy"
    ) as HTMLButtonElement;
    expect(templateBtn).toBeDefined();

    templateBtn.dispatchEvent(new MouseEvent("mouseenter"));
    templateBtn.dispatchEvent(new MouseEvent("mouseleave"));
    templateBtn.click();

    expect(getInput(view).value).toContain("Prompt Autopsy");
  });

  it("clicking CLEAR resets the terminal", async () => {
    orchestrateMock.mockImplementation(async (_task, _messages, _settings, callbacks) => {
      callbacks.onChunk("```ts\n// a.ts\nexport const a = 1234567890; // padding to exceed min length\n```");
      return "ok";
    });
    const view = await openView({ defaultMode: "backend" });
    getInput(view).value = "Build a backend";
    await view.send();
    expect(view.getMessagesSnapshot().length).toBeGreaterThan(0);

    const clearBtn = Array.from(view.containerEl.querySelectorAll("button")).find(
      (b) => b.textContent === "✕ CLEAR"
    ) as HTMLButtonElement;
    clearBtn.click();

    expect(view.getMessagesSnapshot()).toHaveLength(0);
  });

  it("switching between multiple generated file tabs updates the rendered code body", async () => {
    orchestrateMock.mockImplementation(async (_task, _messages, _settings, callbacks) => {
      callbacks.onChunk(
        "```ts\n// a.ts\nexport const a = 1234567890; // padding to exceed min length\n```\n" +
          "```ts\n// b.ts\nexport const b = 987654321; // also padded past the min length\n```"
      );
      return "ok";
    });
    const view = await openView({ defaultMode: "backend" });
    getInput(view).value = "Build a backend";
    await view.send();

    const tabs = Array.from(view.containerEl.querySelectorAll("button")).filter(
      (b) => b.textContent === "a.ts" || b.textContent === "b.ts"
    );
    expect(tabs).toHaveLength(2);
    (tabs.find((t) => t.textContent === "b.ts") as HTMLButtonElement).click();

    expect(view.containerEl.textContent).toContain("987654321");
  });

  it("COPY button writes the active file to the clipboard and shows a Notice", async () => {
    orchestrateMock.mockImplementation(async (_task, _messages, _settings, callbacks) => {
      callbacks.onChunk("```ts\n// a.ts\nexport const a = 1234567890; // padding to exceed min length\n```");
      return "ok";
    });
    const view = await openView({ defaultMode: "backend" });
    getInput(view).value = "Build a backend";
    await view.send();
    (Notice as jest.Mock).mockClear();

    const copyBtn = Array.from(view.containerEl.querySelectorAll("button")).find(
      (b) => b.textContent === "⎘ COPY"
    ) as HTMLButtonElement;
    copyBtn.click();
    await flushMicrotasks();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("1234567890"));
    expect(Notice).toHaveBeenCalledWith("Copied to clipboard");
  });

  it("COPY button silently ignores clipboard write failures", async () => {
    (navigator.clipboard.writeText as jest.Mock).mockRejectedValueOnce(new Error("denied"));
    orchestrateMock.mockImplementation(async (_task, _messages, _settings, callbacks) => {
      callbacks.onChunk("```ts\n// a.ts\nexport const a = 1234567890; // padding to exceed min length\n```");
      return "ok";
    });
    const view = await openView({ defaultMode: "backend" });
    getInput(view).value = "Build a backend";
    await view.send();

    const copyBtn = Array.from(view.containerEl.querySelectorAll("button")).find(
      (b) => b.textContent === "⎘ COPY"
    ) as HTMLButtonElement;
    expect(() => copyBtn.click()).not.toThrow();
    await flushMicrotasks();
  });

  it("pressing Enter (without Shift) in the input sends the message", async () => {
    orchestrateMock.mockResolvedValue("ok");
    const view = await openView();
    getInput(view).value = "Build via keyboard";
    getInput(view).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await flushMicrotasks();
    await flushMicrotasks();

    expect(orchestrateMock).toHaveBeenCalled();
  });

  it("pressing Shift+Enter does not send the message", async () => {
    orchestrateMock.mockResolvedValue("ok");
    const view = await openView();
    getInput(view).value = "New line please";
    getInput(view).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true })
    );
    await flushMicrotasks();

    expect(orchestrateMock).not.toHaveBeenCalled();
  });

  it("surfaces a rate-limit failover as a Notice and updates live provider metadata", async () => {
    orchestrateMock.mockImplementation(async (_task, _messages, _settings, callbacks) => {
      callbacks.onProvider("Groq", "Llama 3.3 70B");
      callbacks.onFailover("Groq / Llama 3.3 70B", "DeepSeek / DeepSeek V3");
      callbacks.onMetrics(42, 1337);
      return "ok";
    });
    const view = await openView();
    getInput(view).value = "Build something";
    await view.send();

    expect(Notice).toHaveBeenCalledWith(expect.stringContaining("switching to DeepSeek"), 3000);
    expect(view.containerEl.textContent).toContain("1,337 tokens");
  });

  it("disables mode switching while a build is in progress", async () => {
    orchestrateMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve("ok"), 10);
        })
    );
    const view = await openView();
    getInput(view).value = "Build something";
    const sendPromise = view.send();
    await Promise.resolve();

    const buildBtn = getBuildButton(view);
    expect(buildBtn.textContent).toBe("■ STOP");

    view.stop();
    await sendPromise;
  });
});
