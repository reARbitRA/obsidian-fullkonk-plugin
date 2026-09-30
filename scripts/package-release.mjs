#!/usr/bin/env node
// scripts/package-release.mjs
//
// Copies the three files Obsidian actually needs at runtime (main.js,
// manifest.json, styles.css) into release/, and zips them (via the system
// `zip` binary when available) so the archive can be attached directly to a
// GitHub Release for manual/BRAT installation. Requires `npm run build` to
// have been run first.

import { existsSync, mkdirSync, copyFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const releaseDir = path.join(root, "release");
const requiredFiles = ["main.js", "manifest.json", "styles.css"];

for (const file of requiredFiles) {
  if (!existsSync(path.join(root, file))) {
    console.error(`[package-release] Missing required file: ${file}. Run \`npm run build\` first.`);
    process.exit(1);
  }
}

mkdirSync(releaseDir, { recursive: true });

for (const file of requiredFiles) {
  copyFileSync(path.join(root, file), path.join(releaseDir, file));
}

const manifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf-8"));
const zipName = `fullkonk-${manifest.version}.zip`;

try {
  execFileSync("zip", ["-j", zipName, ...requiredFiles], { cwd: root, stdio: "inherit" });
  console.log(`[package-release] Wrote ${zipName}`);
} catch {
  console.warn(
    "[package-release] `zip` binary not found — skipping archive creation. " +
      `Plain files are available under ${path.relative(root, releaseDir)}/`
  );
}

console.log(`[package-release] Release files ready in ${path.relative(root, releaseDir)}/`);
