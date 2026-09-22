import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WATCHER_PATH = new URL("../.github/workflows/koyeb-deployment-watch.yml", import.meta.url);
const CI_PATH = new URL("../.github/workflows/ci.yml", import.meta.url);

function stepBody(workflow, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = workflow.match(
    new RegExp(`      - name: ${escaped}\\n([\\s\\S]*?)(?=\\n      - (?:name:|uses:|if:)|\\n\\n  [a-zA-Z_]|$)`),
  );
  assert.ok(match, `workflow step not found: ${name}`);
  return match[1];
}

test("automatic Koyeb watcher fails closed when either required value is missing", async () => {
  const workflow = await readFile(WATCHER_PATH, "utf8");
  const config = stepBody(workflow, "Check Koyeb deployment-watch configuration");

  assert.match(config, /for name in KOYEB_TOKEN KOYEB_SERVICE/);
  assert.match(config, /exit 1/);
  assert.match(config, /::error::MAST production deployment verification cannot run/);
  assert.doesNotMatch(config, /::warning::|configured=false|skipp(?:ed|ing)/i);
});

test("every mandatory ecosystem-smoke input fails closed when absent", async () => {
  const workflow = await readFile(WATCHER_PATH, "utf8");
  const config = stepBody(workflow, "Check post-deployment smoke configuration");
  const required = [
    "MAST_BASE_URL",
    "HIVE_UI_BASE_URL",
    "CRON_ADMIN_TOKEN",
    "RMS_API_KEY",
    "HIVE_ADMIN_BEARER_TOKEN",
    "HIVE_UI_ACCESS_KEY",
  ];

  assert.match(config, new RegExp(`for name in ${required.join(" ")}`));
  assert.match(config, /exit 1/);
  assert.match(config, /::error::Mandatory post-deployment ecosystem smoke cannot run/);
  assert.doesNotMatch(config, /configured=false|skipp(?:ed|ing)/i);
});

test("exact-SHA watch and smoke gate the final attestation in order", async () => {
  const workflow = await readFile(WATCHER_PATH, "utf8");
  const watchIndex = workflow.indexOf("- name: Watch production deployment");
  const smokeIndex = workflow.indexOf("- name: Run post-deployment ecosystem smoke");
  const attestationName = "Record final exact-SHA deployment and ecosystem-smoke attestation";
  const attestationIndex = workflow.indexOf(`- name: ${attestationName}`);

  assert.ok(watchIndex > 0 && smokeIndex > watchIndex && attestationIndex > smokeIndex);
  assert.match(stepBody(workflow, "Watch production deployment"), /EXPECTED_DEPLOYMENT_SHA:[\s\S]*workflow_run\.head_sha/);
  assert.match(stepBody(workflow, attestationName), /DEPLOYED_SHA:[\s\S]*workflow_run\.head_sha/);
  assert.match(stepBody(workflow, attestationName), /production-deployment-and-ecosystem-smoke-green/);
  assert.doesNotMatch(workflow, /steps\.(?:deployment_config|smoke_config)\.outputs\.configured == 'true'/);
});

test("CI scans the actual built MAST image and retains a readable report", async () => {
  const workflow = await readFile(CI_PATH, "utf8");
  const scan = stepBody(
    workflow,
    "Scan built production image for fixable high-severity vulnerabilities",
  );
  const evidence = stepBody(workflow, "Retain production image vulnerability report");

  assert.match(workflow, /docker build -t mast:ci/);
  assert.match(scan, /aquasecurity\/trivy-action@[0-9a-f]{40}/);
  assert.match(scan, /image-ref: mast:ci/);
  assert.match(scan, /vuln-type: os,library/);
  assert.match(scan, /severity: CRITICAL,HIGH/);
  assert.match(scan, /exit-code: "1"/);
  assert.match(scan, /ignore-unfixed: true/);
  assert.match(evidence, /trivy-mast-image\.txt/);
  assert.match(evidence, /if: always\(\)/);
});
