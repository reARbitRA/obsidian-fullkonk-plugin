/**
 * @jest-environment node
 */
import { extractFiles } from "../fileExtractor";

describe("extractFiles", () => {
  it("extracts a single named file from a fenced code block", () => {
    const content = [
      "Here is the file:",
      "```ts",
      "// src/index.ts",
      "export function add(a: number, b: number): number {",
      "  return a + b;",
      "}",
      "```",
    ].join("\n");

    const files = extractFiles(content);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/index.ts");
    expect(files[0].language).toBe("ts");
    expect(files[0].content).toContain("export function add");
  });

  it("extracts multiple files in encounter order", () => {
    const content = [
      "```ts",
      "// src/a.ts",
      "export const a = 1;\nexport const aa = 11;",
      "```",
      "some prose in between",
      "```python",
      "# src/b.py",
      "def hello():\n    return 'hi there, world'",
      "```",
    ].join("\n");

    const files = extractFiles(content);
    expect(files.map((f) => f.path)).toEqual(["src/a.ts", "src/b.py"]);
    expect(files[1].language).toBe("python");
  });

  it("falls back to a positional filename when no path comment is present", () => {
    const content = "```json\n{\"hello\": \"world this is long enough to pass\"}\n```";
    const files = extractFiles(content);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("output-1.json");
  });

  it("falls back to the raw language as the extension for unknown languages", () => {
    const content = "```toml\nname = \"fullkonk\"\nversion = \"1.0.0\"\ndescription=\"long enough block\"\n```";
    const files = extractFiles(content);
    expect(files[0].path).toBe("output-1.toml");
  });

  it("ignores trivially small code blocks (likely inline snippets, not files)", () => {
    const content = "```js\n// tiny.js\nx=1\n```";
    const files = extractFiles(content);
    expect(files).toHaveLength(0);
  });

  it("overwrites an earlier block sharing the same path with a later one", () => {
    const content = [
      "```ts",
      "// src/a.ts",
      "export const a = 'first version of this file goes here';",
      "```",
      "```ts",
      "// src/a.ts",
      "export const a = 'second, corrected version of this file';",
      "```",
    ].join("\n");

    const files = extractFiles(content);
    expect(files).toHaveLength(1);
    expect(files[0].content).toContain("second, corrected version");
  });

  it("preserves nested triple-backtick examples inside a four-backtick fence", () => {
    const content = [
      "````markdown",
      "// docs/readme.md",
      "# Usage example",
      "",
      "The README includes this fenced snippet:",
      "```ts",
      "const message = \"inner fences stay in the file\";",
      "```",
      "",
      "The outer fence ends only after this paragraph.",
      "````",
    ].join("\n");

    const files = extractFiles(content);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("docs/readme.md");
    expect(files[0].language).toBe("markdown");
    expect(files[0].content).toContain("```ts\nconst message");
    expect(files[0].content).toContain("```\n\nThe outer fence");
  });

  it("does not treat a closing fence shorter than the opener as the end", () => {
    const content = [
      "````ts",
      "// src/nested.ts",
      "const example = `markdown below is content`;",
      "```",
      "this line must remain inside the four-backtick block",
      "export const finalValue = 42;",
      "````",
    ].join("\n");

    const files = extractFiles(content);
    expect(files).toHaveLength(1);
    expect(files[0].content).toContain("this line must remain inside");
    expect(files[0].content).toContain("export const finalValue");
  });

  it("returns an empty array for content with no code blocks", () => {
    expect(extractFiles("just some plain prose, nothing fenced here at all")).toEqual([]);
  });

  it("defaults to the 'text' language/extension when the fence has no language tag", () => {
    const content = "```\nplain fenced block with more than thirty characters of content\n```";
    const files = extractFiles(content);
    expect(files[0].language).toBe("text");
    expect(files[0].path).toBe("output-1.txt");
  });
});
