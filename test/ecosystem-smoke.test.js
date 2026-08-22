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

async function runSmoke(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/ecosystemSmoke.js'], {
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

test('post-deployment ecosystem smoke exercises all launch-critical paths', async () => {
  let aimsBase = '';

  const mast = await listen((req, res) => {
    if (req.url === '/readyz') return send(res, 200, { ok: true, ready: true });
    if (req.url === '/run/suite-health-ping') return send(res, 200, { ok: true, jobId: 'suite-health-ping' });
    if (req.url === '/services/rams/resume') return send(res, 202, { ok: true, service: 'rams' });
    return send(res, 404, { error: 'not-found' });
  });

  const rams = await listen((req, res) => {
    if (req.url === '/readyz') return send(res, 200, { status: 'ready' });
    if (req.url === '/rebuild/on-brand/run') return send(res, 202, { runId: 'smoke-run', pipeline: 'on-brand', dryRun: true });
    return send(res, 404, { error: 'not-found' });
  });

  const hive = await listen((req, res) => {
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
    if (req.url === '/readyz') return send(res, 200, { ok: true, ready: true });
    if (req.url === '/console/api/auth/handoff') {
      return send(res, 200, { authenticated: true, actor: 'owner', role: 'admin' }, { 'set-cookie': '__Host-aims_session=test; Path=/; HttpOnly; SameSite=Strict' });
    }
    if (req.url === '/console/api/health') return send(res, 200, { ok: true, service: 'comms-hub' });
    return send(res, 404, { error: 'not-found' });
  });
  aimsBase = aims.base;

  const website = await listen((req, res) => {
    if (req.url === '/api/cognipal/message') return send(res, 202, { ok: true, accepted: true });
    if (req.url === '/api/cognipal/sync') return send(res, 200, { ok: true, messages: [] });
    return send(res, 404, { error: 'not-found' });
  });

  try {
    const result = await runSmoke({
      ECOSYSTEM_SMOKE_ALLOW_HTTP: 'true',
      ECOSYSTEM_SMOKE_TIMEOUT_MS: '3000',
      ECOSYSTEM_SMOKE_RETRY_ATTEMPTS: '2',
      ECOSYSTEM_SMOKE_RETRY_DELAY_MS: '10',
      MAST_BASE_URL: mast.base,
      AIMS_BASE_URL: aims.base,
      RAMS_BASE_URL: rams.base,
      HIVE_BASE_URL: hive.base,
      WEBSITE_BASE_URL: website.base,
      HIVE_UI_BASE_URL: hive.base,
      AIMS_UI_BASE_URL: aims.base,
      CRON_ADMIN_TOKEN: 'test-cron-token',
      RMS_API_KEY: 'test-rams-token',
      HIVE_ADMIN_BEARER_TOKEN: 'test-hive-token',
      HIVE_UI_ACCESS_KEY: 'test-ui-key',
    });
    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /ok 17 - CogniPal message\/sync round trip/);
    assert.match(result.stdout, /ecosystem smoke passed/);
  } finally {
    await Promise.all([mast.close(), rams.close(), hive.close(), aims.close(), website.close()]);
  }
});
