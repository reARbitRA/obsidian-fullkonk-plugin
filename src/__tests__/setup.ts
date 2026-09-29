// src/__tests__/setup.ts
//
// jest/jsdom does not ship Obsidian's DOM convenience helpers
// (`createDiv`, `createEl`, `setText`, `empty`, ...) which the real Obsidian
// app installs onto `HTMLElement.prototype` at startup. Polyfill the subset
// fullKONK_> actually uses so `src/view.ts` and `src/settings.ts` can be
// exercised in tests exactly as they run inside Obsidian.

type DomElementInfo = {
  text?: string;
  cls?: string | string[];
  attr?: Record<string, string>;
  type?: string;
  value?: string;
  placeholder?: string;
};

function applyElementInfo(el: HTMLElement, o?: string | DomElementInfo): void {
  if (!o) return;
  if (typeof o === "string") {
    el.className = o;
    return;
  }
  if (o.cls) {
    const classes = Array.isArray(o.cls) ? o.cls : [o.cls];
    el.classList.add(...classes.filter(Boolean));
  }
  if (o.text !== undefined) el.textContent = o.text;
  if (o.attr) {
    for (const [key, value] of Object.entries(o.attr)) el.setAttribute(key, value);
  }
  if (o.type && el instanceof HTMLInputElement) el.type = o.type;
  if (o.value !== undefined && "value" in el) (el as HTMLInputElement).value = o.value;
  if (o.placeholder !== undefined && "placeholder" in el) {
    (el as HTMLInputElement).placeholder = o.placeholder;
  }
}

// This setup file runs for every test file regardless of its per-file
// `@jest-environment` docblock; node-environment tests (orchestrator, vault,
// etc.) have no `HTMLElement` global at all, so skip the DOM polyfill there.
const hasDom = typeof HTMLElement !== "undefined" && typeof document !== "undefined";

if (hasDom && !HTMLElement.prototype.createEl) {
  HTMLElement.prototype.createEl = function <K extends keyof HTMLElementTagNameMap>(
    this: HTMLElement,
    tag: K,
    o?: string | DomElementInfo
  ): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    applyElementInfo(el, o);
    this.appendChild(el);
    return el;
  } as typeof HTMLElement.prototype.createEl;
}

if (hasDom && !HTMLElement.prototype.createDiv) {
  HTMLElement.prototype.createDiv = function (
    this: HTMLElement,
    o?: string | DomElementInfo
  ): HTMLDivElement {
    return this.createEl("div", o);
  };
}

if (hasDom && !HTMLElement.prototype.createSpan) {
  HTMLElement.prototype.createSpan = function (
    this: HTMLElement,
    o?: string | DomElementInfo
  ): HTMLSpanElement {
    return this.createEl("span", o);
  };
}

if (hasDom && !HTMLElement.prototype.empty) {
  HTMLElement.prototype.empty = function (this: HTMLElement): void {
    while (this.firstChild) this.removeChild(this.firstChild);
  };
}

if (hasDom && !HTMLElement.prototype.setText) {
  HTMLElement.prototype.setText = function (this: HTMLElement, text: string): void {
    this.textContent = text;
  };
}

if (hasDom && !HTMLElement.prototype.addClass) {
  HTMLElement.prototype.addClass = function (this: HTMLElement, ...classes: string[]): void {
    this.classList.add(...classes);
  };
}

if (hasDom && !HTMLElement.prototype.removeClass) {
  HTMLElement.prototype.removeClass = function (this: HTMLElement, ...classes: string[]): void {
    this.classList.remove(...classes);
  };
}

if (hasDom && !HTMLElement.prototype.toggleClass) {
  HTMLElement.prototype.toggleClass = function (
    this: HTMLElement,
    classes: string | string[],
    force: boolean
  ): void {
    const list = Array.isArray(classes) ? classes : [classes];
    for (const c of list) this.classList.toggle(c, force);
  };
}

// jsdom's Range implementation is incomplete; clipboard/selection APIs are not
// exercised by these tests, but navigator.clipboard is used by the view, so
// provide a benign stub when it's missing.
if (hasDom && !navigator.clipboard) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
}

export {};
