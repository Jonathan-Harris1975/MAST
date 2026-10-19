import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = new URL("../.github/workflows/council.yml", import.meta.url);

test("Council dispatch is gated by exact evidence and a durable R2 reservation", async () => {
  const source = await readFile(workflowPath, "utf8");
  assert.match(source, /if: steps\.gate\.outputs\.status == 'gate_passed'/);
  const reserve = source.indexOf("council_dispatch_ledger.py reserve");
  const dispatch = source.indexOf("curl --silent", reserve);
  const settle = source.indexOf("council_dispatch_ledger.py settle", dispatch);
  assert.ok(reserve >= 0 && dispatch > reserve && settle > dispatch);
  assert.match(source, /delivery_status="dispatch_unknown"/);
  assert.match(source, /delivery_status="dispatch_rejected"/);
  assert.match(source, /delivery_status="dispatch_accepted"/);
  assert.match(source, /status=duplicate_replay/);
});

test("Council failure evidence is retained and R2 persistence is attempted after gate failure", async () => {
  const source = await readFile(workflowPath, "utf8");
  assert.match(source, /if: always\(\) && steps\.target\.outputs\.sha != ''/);
  assert.match(source, /name: Retain local lifecycle evidence even if R2 persistence fails\n\s+if: always\(\)/);
  assert.match(source, /name: Alert central operations about Council failure/);
  assert.match(source, /name: Require successful gate, delivery, and evidence persistence/);
});

test("returned Council reports require an exact, successful source run and a declared disposition", async () => {
  const source = await readFile(new URL("../.github/workflows/council-result-r2.yml", import.meta.url), "utf8");
  assert.match(source, /READY_FOR_COUNCIL_ACCEPTANCE\|HUMAN_HOLD\|NOT_READY/);
  assert.match(source, /source_status.*completed/);
  assert.match(source, /source_conclusion.*success/);
  assert.match(source, /source_branch.*DEFAULT_BRANCH/);
  assert.match(source, /source_sha.*TARGET_SHA/);
  assert.match(source, /json_sha.*TARGET_SHA/);
});
