import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const REPOSITORY_ROOT = new URL("../", import.meta.url);
const SOURCE_ROOT = new URL("../src/", import.meta.url);
const MAX_SOURCE_LINE_LENGTH = 200;

test("source files remain within the Repository Intelligence line-length limit", async () => {
  const sourceFiles = (await readdir(SOURCE_ROOT)).filter((name) => name.endsWith(".js"));
  const violations = [];

  for (const sourceFile of sourceFiles) {
    const contents = await readFile(new URL(sourceFile, SOURCE_ROOT), "utf8");
    contents.split("\n").forEach((line, index) => {
      if (line.length > MAX_SOURCE_LINE_LENGTH) {
        violations.push(`${sourceFile}:${index + 1} (${line.length} characters)`);
      }
    });
  }

  assert.deepEqual(violations, [], `Source lines exceed ${MAX_SOURCE_LINE_LENGTH} characters`);
});

test("all test files live under test so the CI test command executes them", async () => {
  const rootEntries = await readdir(REPOSITORY_ROOT, { withFileTypes: true });
  const rootTestFiles = rootEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.js"))
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(rootTestFiles, []);
});
