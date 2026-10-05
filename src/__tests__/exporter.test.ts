/**
 * @jest-environment node
 */
import { buildBundleMarkdown, fenceCode } from "../exporter";
import { GeneratedFile } from "../types";

const files: GeneratedFile[] = [
  { path: "src/index.ts", content: "export const x = 1;", language: "ts" },
  { path: "README.md", content: "# Demo", language: "md" },
];

describe("fenceCode()", () => {
  it("wraps content in a fenced block tagged with the language", () => {
    expect(fenceCode("const a = 1;", "ts")).toBe("```ts\nconst a = 1;\n```");
  });

  it("falls back to a text tag when the language is empty", () => {
    expect(fenceCode("plain", "")).toBe("```text\nplain\n```");
  });

  it("widens the fence when the content itself contains backticks", () => {
    const nested = "```\ninner block\n```";
    const rendered = fenceCode(nested, "md");
    expect(rendered.startsWith("````md\n")).toBe(true);
    expect(rendered.endsWith("\n````")).toBe(true);
    expect(rendered).toContain(nested);
  });
});

describe("buildBundleMarkdown()", () => {
  const markdown = buildBundleMarkdown("My App", files, "2026-10-04-12-00-00");

  it("emits frontmatter with project, timestamp, file count and tags", () => {
    expect(markdown).toContain("project: My App");
    expect(markdown).toContain("generated: 2026-10-04-12-00-00");
    expect(markdown).toContain("files: 2");
    expect(markdown).toContain("tags: [fullkonk, bundle]");
  });

  it("includes a heading and one fenced section per file path", () => {
    expect(markdown).toContain("# My App — bundle");
    expect(markdown).toContain("## `src/index.ts`");
    expect(markdown).toContain("```ts\nexport const x = 1;\n```");
    expect(markdown).toContain("## `README.md`");
  });

  it("pluralizes the file count correctly", () => {
    expect(markdown).toContain("· 2 files");
    expect(buildBundleMarkdown("X", [files[0]], "t")).toContain("· 1 file\n");
  });

  it("escapes double quotes in the project name for YAML safety", () => {
    const risky = buildBundleMarkdown('foo "bar" baz', files, "t");
    expect(risky).toContain("project: foo 'bar' baz");
    expect(risky.split("\n")[1]).toBe("project: foo 'bar' baz");
  });
});
