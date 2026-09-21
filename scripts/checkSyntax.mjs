#!/usr/bin/env node
import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const ROOTS = ["src", "scripts", "test"];
const EXTENSIONS = new Set([".js", ".mjs"]);

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(candidate));
    else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) files.push(candidate);
  }
  return files;
}

const files = (await Promise.all(ROOTS.map(collectFiles))).flat().sort();
if (!files.length) throw new Error("No JavaScript source files were found for syntax validation");

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Syntax check passed for ${files.length} JavaScript files.`);
