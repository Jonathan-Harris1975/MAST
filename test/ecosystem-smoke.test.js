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

async function exerciseSmoke({ heartbeatSource = 'r2_s3', heartbeatAgeSeconds = 3, recentFailures = 0, wakeStatus = 'ready', workerMode = false, deployedSha = 'a'.repeat(40), hiveToken = 'test-hive-token' } = {}) {
  let aimsBase = '';

  const rams = await listen((req, res) => {
    if (req.url === '/readyz') return send(res, 200, { status: 'ready' });
    if (req.url === '/rebuild/on-brand/run') return send(res, 202, { runId: 'smoke-run', pipeline: 'on-brand', dryRun: true });
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
      return send(res, 200, { ready: true, configuration_ready: true, dependency_probes: [{ required: true, status: 'ok' }] });
    }
    if (req.url === '/v1/providers/health') return send(res, 200, { provider_count: 1, providers: [{ provider: 'mock', ok: true }] });
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

  const website = await listen((req, res) => {
    if (req.headers.origin !== `http://${req.headers.host}`) return send(res, 403, { error: 'origin_rejected' });
    if (req.url === '/api/cognipal/message') return send(res, 202, { ok: true, accepted: true });
    if (req.url === '/api/cognipal/sync') return send(res, 200, { ok: true, messages: [] });
    return send(res, 404, { error: 'not-found' });
  });

  try {
    return await runSmoke({
      ECOSYSTEM_SMOKE_ALLOW_HTTP: 'true',
      ECOSYSTEM_SMOKE_TIMEOUT_MS: '3000',
      ECOSYSTEM_SMOKE_RETRY_ATTEMPTS: '2',
      ECOSYSTEM_SMOKE_RETRY_DELAY_MS: '10',
      AIMS_BASE_URL: aims.base,
      RAMS_BASE_URL: rams.base,
      HIVE_BASE_URL: hive.base,
      WEBSITE_BASE_URL: website.base,
      HIVE_UI_BASE_URL: hive.base,
      AIMS_UI_BASE_URL: aims.base,
      RMS_API_KEY: 'test-rams-token',
      HIVE_ADMIN_BEARER_TOKEN: hiveToken,
      HIVE_UI_ACCESS_KEY: workerMode ? '' : 'test-ui-key',
      KOYEB_GIT_SHA: deployedSha,
    }, workerMode ? ['--worker', 'a'.repeat(40)] : []);
  } finally {
    await Promise.all([rams.close(), hive.close(), aims.close(), website.close()]);
  }
}

test('post-deployment smoke checks the private Worker heartbeat and wakes RAMS through HIVE', async () => {
  const result = await exerciseSmoke();
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /ok 2 - MAST Worker R2 heartbeat via HIVE/);
  assert.match(result.stdout, /ok 3 - RAMS ready through HIVE Koyeb lifecycle/);
  assert.match(result.stdout, /ok 17 - CogniPal message\/sync round trip/);
  assert.match(result.stdout, /ecosystem smoke passed/);
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
  assert.match(result.stdout, /ok 17 - CogniPal message\/sync round trip/);
});

test('smoke rejects a failed RAMS wake ticket', async () => {
  const result = await exerciseSmoke({ wakeStatus: 'failed' });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /HIVE RAMS wake failed/);
});

test('Koyeb Worker runs the API checks with Koyeb-resident credentials and no UI key', async () => {
  const result = await exerciseSmoke({ workerMode: true });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /ok 8 - HIVE database write\/delete readiness/);
  assert.match(result.stdout, /ok 17 - CogniPal message\/sync round trip/);
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
