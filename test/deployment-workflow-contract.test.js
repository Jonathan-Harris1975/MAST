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

test("Koyeb Worker/API smoke fails closed and keeps downstream keys off GitHub runners", async () => {
  const workflow = await readFile(WATCHER_PATH, "utf8");
  const standalone = await readFile(new URL("../.github/workflows/ecosystem-smoke.yml", import.meta.url), "utf8");
  const staging = await readFile(new URL("../.github/workflows/staging-gate.yml", import.meta.url), "utf8");
  const runner = await readFile(new URL("../scripts/run_koyeb_worker_smoke.sh", import.meta.url), "utf8");
  const dockerfile = await readFile(new URL("../Dockerfile", import.meta.url), "utf8");

  for (const file of [workflow, standalone, staging]) {
    assert.match(file, /scripts\/run_koyeb_worker_smoke\.sh/);
    assert.doesNotMatch(file, /secrets\.(?:RMS_API_KEY|HIVE_ADMIN_BEARER_TOKEN|HIVE_UI_ACCESS_KEY)/);
  }
  assert.match(runner, /for name in KOYEB_TOKEN KOYEB_SERVICE EXPECTED_DEPLOYMENT_SHA/);
  assert.match(runner, /--skip-production-manager/);
  assert.match(runner, /ecosystemSmoke\.js --worker "\$EXPECTED_DEPLOYMENT_SHA"/);
  assert.match(runner, /exit 1/);
  assert.match(dockerfile, /COPY --chown=mast:mast scripts\/ecosystemSmoke\.js \.\/scripts\/ecosystemSmoke\.js/);
});

test("production jobs use the Koyeb environment without a public MAST URL", async () => {
  const watcher = await readFile(WATCHER_PATH, "utf8");
  const smoke = await readFile(new URL("../.github/workflows/ecosystem-smoke.yml", import.meta.url), "utf8");
  assert.match(watcher, /    environment: Koyeb/);
  assert.match(smoke, /    environment: Koyeb/);
  assert.match(watcher, /KOYEB_SERVICE: \$\{\{ vars\.KOYEB_SERVICE \}\}/);
  assert.doesNotMatch(watcher + smoke, /MAST_BASE_URL|CRON_ADMIN_TOKEN/);
});

test("exact-SHA watch and smoke gate the final attestation in order", async () => {
  const workflow = await readFile(WATCHER_PATH, "utf8");
  const watchIndex = workflow.indexOf("- name: Watch production deployment");
  const smokeIndex = workflow.indexOf("- name: Run post-deployment MAST Worker/API smoke");
  const attestationName = "Record final exact-SHA deployment and Worker/API-smoke attestation";
  const attestationIndex = workflow.indexOf(`- name: ${attestationName}`);

  assert.ok(watchIndex > 0 && smokeIndex > watchIndex && attestationIndex > smokeIndex);
  assert.match(stepBody(workflow, "Watch production deployment"), /EXPECTED_DEPLOYMENT_SHA:[\s\S]*workflow_run\.head_sha/);
  assert.match(stepBody(workflow, attestationName), /DEPLOYED_SHA:[\s\S]*workflow_run\.head_sha/);
  assert.match(stepBody(workflow, "Run post-deployment MAST Worker/API smoke"), /EXPECTED_DEPLOYMENT_SHA:[\s\S]*workflow_run\.head_sha/);
  assert.match(stepBody(workflow, attestationName), /production-deployment-and-worker-api-smoke-green/);
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


test("full Production Manager smoke is dispatched with the exact deployed SHA", async () => {
  const watcher = await readFile(WATCHER_PATH, "utf8");
  const smoke = await readFile(new URL("../.github/workflows/ecosystem-smoke.yml", import.meta.url), "utf8");
  const runner = await readFile(new URL("../scripts/run_koyeb_worker_smoke.sh", import.meta.url), "utf8");

  assert.match(watcher, /run_koyeb_worker_smoke\.sh --skip-production-manager/);
  assert.match(watcher, /actions: write/);
  assert.match(watcher, /gh workflow run ecosystem-smoke\.yml/);
  assert.match(watcher, /-f source_sha="\$DEPLOYED_SHA"/);
  assert.match(smoke, /workflow_dispatch:/);
  assert.doesNotMatch(smoke, /^  workflow_run:/m);
  assert.doesNotMatch(smoke, /ref: \$\{\{ inputs\.source_sha \}\}/);
  assert.match(smoke, /EXPECTED_DEPLOYMENT_SHA: \$\{\{ github\.sha \}\}/);
  assert.doesNotMatch(smoke, /run_koyeb_worker_smoke\.sh --skip-production-manager/);
  assert.match(runner, /ECOSYSTEM_SMOKE_RETRY_ATTEMPTS=/);
  assert.match(runner, /ECOSYSTEM_SMOKE_RETRY_DELAY_MS=/);
});

test("standalone smoke rejects malformed source SHAs before checkout", async () => {
  const smoke = await readFile(new URL("../.github/workflows/ecosystem-smoke.yml", import.meta.url), "utf8");
  const validation = stepBody(smoke, "Validate MAST smoke source identity and commit");
  assert.ok(validation.includes("SOURCE_SHA:"));
  assert.ok(validation.includes("^[0-9a-fA-F]{40}$"));
  assert.match(validation, /exit 1/);
  assert.ok(smoke.indexOf("Validate MAST smoke source identity and commit") < smoke.indexOf("uses: actions/checkout@"));
});
