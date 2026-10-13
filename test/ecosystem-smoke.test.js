import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import test from 'node:test';

async function listen(handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

async function runSmoke(env, args = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/ecosystemSmoke.js', ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function exerciseSmoke({ heartbeatSource = 'r2_s3', heartbeatAgeSeconds = 3, recentFailures = 0, wakeStatus = 'ready', workerMode = false, deployedSha = 'a'.repeat(40), hiveToken = 'test-hive-token', ramsBusyResponses = 0, productionState = 'GREEN', releaseDecision = 'ALLOW', productionManagerBody = null, productionManagerDelayMs = 0, smokeTimeoutMs = 3000, councilFresh = true, councilBody = null, skipProductionManager = false, runtimeReadinessStatus = 200, runtimeReadinessBody = null, ramsConflictBody = null } = {}) {
  let aimsBase = '';
  let productionManagerRequests = 0;

  let ramsBusyRemaining = ramsBusyResponses;
  const rams = await listen((req, res) => {
    if (req.url === '/readyz') return send(res, 200, { status: 'ready' });
    if (req.url === '/rebuild/on-brand/run') {
      if (ramsBusyRemaining > 0) {
        ramsBusyRemaining -= 1;
        return send(res, 409, ramsConflictBody || { error: 'pipeline already running' });
      }
      return send(res, 202, { runId: 'smoke-run', pipeline: 'on-brand', dryRun: true });
    }
    return send(res, 404, { error: 'not-found' });
  });

  const hive = await listen((req, res) => {
    if (req.url === '/v1/system/repo-health?force_refresh=true') {
      return send(res, 200, { repos: [{
        repo: 'MAST', category: 'background_worker', status: 'healthy',
        operational: { payload: {
          source: heartbeatSource, object_key: 'state/mast/scheduler-state.json',
          last_tick_at: new Date(Date.now() - heartbeatAgeSeconds * 1000).toISOString(),
          heartbeat_age_seconds: heartbeatAgeSeconds, healthy_max_age_seconds: 90,
          recent_failures: recentFailures,
        } },
      }] });
    }
    if (req.url === '/v1/services/RAMS/ensure-ready') {
      return send(res, 202, { ok: true, repo: 'RAMS', poll_url: '/services/RAMS/ensure-ready/0123456789abcdef0123456789abcdef' });
    }
    if (req.url === '/v1/services/RAMS/ensure-ready/0123456789abcdef0123456789abcdef') {
      return send(res, 200, { status: wakeStatus, result: { ready: wakeStatus === 'ready' }, error: 'wake failed' });
    }
    if (req.url === '/v1/runtime/readiness') {
      if (runtimeReadinessStatus !== 200) {
        return send(res, runtimeReadinessStatus, runtimeReadinessBody || { detail: 'service unavailable' });
      }
      return send(res, 200, { ready: true, configuration_ready: true, dependency_probes: [{ required: true, status: 'ok' }] });
    }
    if (req.url === '/v1/providers/health') return send(res, 200, { provider_count: 1, providers: [{ provider: 'mock', ok: true }] });
    if (req.url === '/v1/system/production-manager?force_refresh=true') {
      productionManagerRequests += 1;
      const body = productionManagerBody || { state: productionState, release_decision: releaseDecision };
      if (productionManagerDelayMs > 0) {
        return setTimeout(() => send(res, 200, body), productionManagerDelayMs);
      }
      return send(res, 200, body);
    }
    if (req.url === '/v1/ai-council/status') {
      return send(res, 200, councilBody || {
        ok: councilFresh,
        fresh: councilFresh,
        downstream_sync_enabled: councilFresh,
        downstream_sync_ok: councilFresh,
        reason: councilFresh ? null : 'current monthly governance is stale',
      });
    }
    if (req.url === '/v1/db/ping-write') return send(res, 200, { ok: true, sql: { ok: true }, d1: { ok: true } });
    if (req.url === '/health') return send(res, 200, { ok: true, service: 'HIVE UI' });
    if (req.url === '/api/auth/login') return send(res, 200, { authenticated: true }, { 'set-cookie': '__Host-hive_session=test; Path=/; HttpOnly; SameSite=Strict' });
    if (req.url === '/api/auth/session') return send(res, 200, { authenticated: true });
    if (req.url === '/api/auth/comms-handoff?format=json') return send(res, 200, { url: `${aimsBase}/console/#handoff=test-handoff-token` });
    if (req.url === '/api/auth/comms-identity') return send(res, 200, { actor: 'owner', role: 'admin' });
    return send(res, 404, { error: 'not-found' });
  });

  const aims = await listen((req, res) => {
    if (req.url === '/readyz') {
      if (workerMode && req.headers.origin) return send(res, 403, { detail: 'CORS origin not allowed' });
      return send(res, 200, { ok: true, ready: true });
    }
    if (req.url === '/console/api/auth/handoff') {
      return send(res, 200, { authenticated: true, actor: 'owner', role: 'admin' }, { 'set-cookie': '__Host-aims_session=test; Path=/; HttpOnly; SameSite=Strict' });
    }
    if (req.url === '/console/api/health') return send(res, 200, { ok: true, service: 'comms-hub' });
    return send(res, 404, { error: 'not-found' });
  });
  aimsBase = aims.base;

  try {
    const result = await runSmoke({
      ECOSYSTEM_SMOKE_ALLOW_HTTP: 'true',
      ECOSYSTEM_SMOKE_TIMEOUT_MS: String(smokeTimeoutMs),
      ECOSYSTEM_SMOKE_RETRY_ATTEMPTS: '2',
      ECOSYSTEM_SMOKE_RETRY_DELAY_MS: '10',
      AIMS_BASE_URL: aims.base,
      RAMS_BASE_URL: rams.base,
      HIVE_BASE_URL: hive.base,
      HIVE_UI_BASE_URL: hive.base,
      AIMS_UI_BASE_URL: aims.base,
      RMS_API_KEY: 'test-rams-token',
      HIVE_ADMIN_BEARER_TOKEN: hiveToken,
      HIVE_UI_ACCESS_KEY: workerMode ? '' : 'test-ui-key',
      KOYEB_GIT_SHA: deployedSha,
    }, workerMode ? ['--worker', 'a'.repeat(40), ...(skipProductionManager ? ['--skip-production-manager'] : [])] : []);
    result.productionManagerRequests = productionManagerRequests;
    return result;
  } finally {
    await Promise.all([rams.close(), hive.close(), aims.close()]);
  }
}

test('post-deployment smoke checks the private Worker heartbeat and wakes RAMS through HIVE', async () => {
  const result = await exerciseSmoke();
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /ok 2 - MAST Worker R2 heartbeat via HIVE/);
  assert.match(result.stdout, /ok 3 - RAMS ready through HIVE Koyeb lifecycle/);
  assert.match(result.stdout, /ecosystem smoke passed/);
});

test('smoke redacts an unrecognised accepted RAMS 409 response body', async () => {
  const result = await exerciseSmoke({
    ramsBusyResponses: 1,
    ramsConflictBody: { detail: 'opaque-conflict-sentinel-DO_NOT_LOG' },
  });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /RAMS dry-run returned 409 with an unrecognized conflict response/);
  assert.doesNotMatch(result.stderr, /opaque-conflict-sentinel-DO_NOT_LOG/);
});

test('smoke reports HTTP status without echoing an error response body', async () => {
  const result = await exerciseSmoke({
    runtimeReadinessStatus: 503,
    runtimeReadinessBody: { detail: 'opaque-sentinel-value-DO_NOT_LOG' },
  });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /GET request failed with HTTP 503/);
  assert.doesNotMatch(result.stderr, /opaque-sentinel-value-DO_NOT_LOG/);
});

test('smoke rejects Koyeb status when HIVE has no R2 heartbeat', async () => {
  const result = await exerciseSmoke({ heartbeatSource: 'koyeb_api' });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /health was not read from its durable R2 heartbeat/);
});

test('smoke rejects a stale Worker heartbeat', async () => {
  const result = await exerciseSmoke({ heartbeatAgeSeconds: 600 });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /heartbeat is missing or stale/);
});

test('historical job failures are reported while live Worker and API checks continue', async () => {
  const result = await exerciseSmoke({ workerMode: true, recentFailures: 2 });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /MAST recorded 2 failed job\(s\) in its recent history/);
});


test('smoke retries a transient RAMS pipeline-busy conflict', async () => {
  const result = await exerciseSmoke({ ramsBusyResponses: 1 });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /ok 5 - RAMS remediation dry-run admitted/);
});

test('smoke rejects a failed RAMS wake ticket', async () => {
  const result = await exerciseSmoke({ wakeStatus: 'failed' });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /HIVE RAMS wake failed/);
});

test('Koyeb Worker runs the API checks with Koyeb-resident credentials and no UI key', async () => {
  const result = await exerciseSmoke({ workerMode: true });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /ok 10 - HIVE database write\/delete readiness/);
  assert.doesNotMatch(result.stdout, /ok 9 - HIVE-UI/);
  assert.match(result.stdout, /MAST Worker\/API smoke passed/);
});

test('Worker smoke rejects an instance with a different or missing deployment SHA', async () => {
  for (const deployedSha of ['b'.repeat(40), '']) {
    const result = await exerciseSmoke({ workerMode: true, deployedSha });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /not running the expected MAST Git SHA/);
    assert.equal(result.stdout, '');
  }
});

test('Worker smoke fails closed when its HIVE credential is absent', async () => {
  const result = await exerciseSmoke({ workerMode: true, hiveToken: '' });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /HIVE_ADMIN_BEARER_TOKEN is required/);
});


test('smoke fails after one forced HIVE Production Manager refresh when state is not GREEN/ALLOW', async () => {
  const result = await exerciseSmoke({ productionState: 'DEGRADED', releaseDecision: 'HOLD' });
  assert.equal(result.code, 1);
  assert.equal(result.productionManagerRequests, 1);
  assert.match(result.stderr, /Production Manager did not certify GREEN\\/ALLOW/);
});

test('smoke does not repeat a timed-out HIVE Production Manager refresh', async () => {
  const result = await exerciseSmoke({ productionManagerDelayMs: 100, smokeTimeoutMs: 20 });
  assert.equal(result.code, 1);
  assert.equal(result.productionManagerRequests, 1);
  assert.match(result.stderr, /Production Manager did not certify GREEN\\/ALLOW/);
  assert.match(result.stderr, /TimeoutError|timed out/i);
});

test('Production Manager failure reports bounded per-repository gate evidence without arbitrary payload fields', async () => {
  const result = await exerciseSmoke({
    productionState: 'DEGRADED',
    releaseDecision: 'HOLD',
    productionManagerBody: {
      state: 'DEGRADED',
      release_decision: 'HOLD',
      reason: 'One or more governed repositories need verification.',
      summary: { total: 8, green: 7, degraded: 1, blocked: 0 },
      secret: 'must-not-be-printed',
      repositories: [{
        repository_id: 'RAMS',
        state: 'DEGRADED',
        runtime_state: 'GREEN',
        health_status: 'healthy',
        readiness_status: 'ready',
        detail: 'unfiltered diagnostic that must not be printed',
        gate_evidence: {
          reason: 'Required exact-SHA workflow evidence is incomplete.',
          required_workflows: {
            CI: { state: 'GREEN', status: 'success', run_id: 10 },
            'Security and repository quality': { state: 'DEGRADED', status: 'missing', run_id: null },
          },
          deployment: { state: 'GREEN', status: 'success', run_id: 11 },
        },
      }],
    },
  });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /repository_id\":\"RAMS/);
  assert.match(result.stderr, /Security and repository quality/);
  assert.match(result.stderr, /\"status\":\"missing/);
  assert.doesNotMatch(result.stderr, /must-not-be-printed|unfiltered diagnostic/);
});

test('Production Manager diagnostics cap workflow evidence and report omissions', async () => {
  const workflows = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [
    `workflow-${index}`,
    { state: 'DEGRADED', status: 'missing', run_id: index + 1 },
  ]));
  const result = await exerciseSmoke({
    productionManagerBody: {
      state: 'DEGRADED',
      release_decision: 'HOLD',
      repositories: [{
        repository_id: 'RAMS',
        state: 'DEGRADED',
        gate_evidence: { required_workflows: workflows },
      }],
    },
  });
  assert.equal(result.code, 1);
  const match = result.stderr.match(/diagnostics=(\{[^\r\n]*\})/);
  assert.ok(match, result.stderr);
  const diagnostics = JSON.parse(match[1]);
  const repo = diagnostics.repositories[0];
  assert.equal(Object.keys(repo.required_workflows).length, 12);
  assert.equal(repo.omitted_workflow_count, 88);
  assert.ok(Object.hasOwn(repo.required_workflows, 'workflow-11'));
  assert.equal(Object.hasOwn(repo.required_workflows, 'workflow-12'), false);
});

test('smoke fails when monthly HIVE model governance is stale', async () => {
  const result = await exerciseSmoke({ councilFresh: false });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /monthly model governance is not fresh and verified/);
});


test('monthly governance failures identify stale evidence, downstream sync, or service status', async () => {
  const cases = [
    {
      body: { ok: false, fresh: false, downstream_sync_enabled: true, downstream_sync_ok: true, reason: 'latest AI Council run is degraded', period: '2026-09', secret: 'hidden' },
      classification: 'stale_governance_evidence',
      reason: 'latest AI Council run is degraded',
    },
    {
      body: { ok: true, fresh: true, downstream_sync_enabled: true, downstream_sync_ok: false, reason: 'RAMS sync pending' },
      classification: 'downstream_sync',
      reason: 'RAMS sync pending',
    },
    {
      body: { ok: false, fresh: true, downstream_sync_enabled: true, downstream_sync_ok: true, reason: 'status endpoint unavailable' },
      classification: 'service_status',
      reason: 'status endpoint unavailable',
    },
  ];
  for (const scenario of cases) {
    const result = await exerciseSmoke({ councilBody: scenario.body });
    assert.equal(result.code, 1);
    assert.match(result.stderr, new RegExp(`"classification":"${scenario.classification}"`));
    assert.match(result.stderr, new RegExp(scenario.reason));
    assert.doesNotMatch(result.stderr, /hidden/);
  }
});

test('deployment-phase Worker smoke can defer only the self-referential Production Manager check', async () => {
  const result = await exerciseSmoke({
    workerMode: true,
    skipProductionManager: true,
    productionState: 'DEGRADED',
    releaseDecision: 'HOLD',
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Production Manager check deferred until deployment workflow completes/);
  assert.match(result.stdout, /monthly model governance fresh and propagated/);
});

test('deployment-phase deferral never bypasses stale monthly model governance', async () => {
  const result = await exerciseSmoke({
    workerMode: true,
    skipProductionManager: true,
    councilFresh: false,
  });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /monthly model governance is not fresh and verified/);
});

