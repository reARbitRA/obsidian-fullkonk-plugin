/**
 * @jest-environment node
 */
import { SHOWCASE_TEMPLATES, SYSTEM_PROMPTS } from "../templates";

describe("SYSTEM_PROMPTS", () => {
  it("defines a non-empty prompt for every pipeline stage", () => {
    for (const key of ["architect", "frontend", "backend", "verify"] as const) {
      expect(SYSTEM_PROMPTS[key].length).toBeGreaterThan(50);
    }
  });

  it("instructs the architect stage to withhold code", () => {
    expect(SYSTEM_PROMPTS.architect).toMatch(/no code yet/i);
  });
});

describe("SHOWCASE_TEMPLATES", () => {
  it("has unique ids", () => {
    const ids = SHOWCASE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every template has all required non-empty fields", () => {
    for (const tpl of SHOWCASE_TEMPLATES) {
      expect(tpl.name.length).toBeGreaterThan(0);
      expect(tpl.tag.length).toBeGreaterThan(0);
      expect(tpl.description.length).toBeGreaterThan(0);
      expect(tpl.prompt.length).toBeGreaterThan(20);
      expect(tpl.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
