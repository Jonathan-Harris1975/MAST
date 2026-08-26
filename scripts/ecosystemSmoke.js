#!/usr/bin/env node

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRY_DELAY_MS = 5_000;

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function configuredBaseUrl(name, fallback = '') {
  const value = String(process.env[name] || fallback).trim();
  if (!value) throw new Error(`${name} is required`);
  const url = new URL(value);
  if (url.protocol !== 'https:' && process.env.ECOSYSTEM_SMOKE_ALLOW_HTTP !== 'true') {
    throw new Error(`${name} must use https`);
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url;
}

function requestHeaders(origin, extra = {}) {
  return {
    accept: 'application/json',
    origin: origin.origin,
    'sec-fetch-site': 'same-origin',
    'user-agent': 'mast-ecosystem-smoke/2.0',
    ...extra,
  };
}

function bearer(token) {
  return { authorization: `Bearer ${token}` };
}

function cookiePair(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  const pairs = values
    .flatMap((value) => String(value).split(/,(?=\s*[^;,=]+=[^;,]+)/))
    .map((value) => value.split(';', 1)[0].trim())
    .filter(Boolean);
  if (!pairs.length) throw new Error('Expected a session cookie but none was returned');
  return pairs.join('; ');
}

async function requestJson(url, options = {}, expected = [200]) {
  const timeoutMs = Number(process.env.ECOSYSTEM_SMOKE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS),
    redirect: 'manual',
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
  }
  if (!expected.includes(response.status)) {
    const detail = body?.detail || body?.message || body?.error || text.slice(0, 300) || 'no response body';
    throw new Error(`${options.method || 'GET'} ${url} returned ${response.status}: ${detail}`);
  }
  return { response, body };
}

async function waitForJson(url, options = {}, predicate = () => true) {
  const attempts = Math.max(1, Math.min(24, Number(process.env.ECOSYSTEM_SMOKE_RETRY_ATTEMPTS || 12)));
  const delayMs = Math.max(250, Number(process.env.ECOSYSTEM_SMOKE_RETRY_DELAY_MS || DEFAULT_RETRY_DELAY_MS));
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await requestJson(url, options);
      if (predicate(result.body)) return result;
      lastError = new Error(`Readiness predicate was false for ${url}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const mastBase = configuredBaseUrl('MAST_BASE_URL');
  const aimsApiBase = configuredBaseUrl('AIMS_BASE_URL', 'https://zeroth-kara-jonathanharris-3296ed37.koyeb.app');
  const ramsBase = configuredBaseUrl('RAMS_BASE_URL', 'https://static-helaina-jonathanharris-6df5d241.koyeb.app');
  const hiveApiBase = configuredBaseUrl('HIVE_BASE_URL', 'https://liable-loreen-jonathanharris-57884580.koyeb.app');
  const websiteBase = configuredBaseUrl('WEBSITE_BASE_URL', 'https://jonathan-harris.online');
  const hiveUiBase = configuredBaseUrl('HIVE_UI_BASE_URL');
  const configuredAimsUiBase = process.env.AIMS_UI_BASE_URL?.trim()
    ? configuredBaseUrl('AIMS_UI_BASE_URL')
    : null;

  const cronAdminToken = required('CRON_ADMIN_TOKEN');
  const rmsApiKey = required('RMS_API_KEY');
  const hiveAdminToken = required('HIVE_ADMIN_BEARER_TOKEN');
  const hiveUiAccessKey = required('HIVE_UI_ACCESS_KEY');

  const aimsReady = await requestJson(new URL('/readyz', aimsApiBase), {
    headers: requestHeaders(aimsApiBase),
  });
  assertOk(aimsReady.body?.ok === true || aimsReady.body?.ready === true, 'AIMS readiness did not report ready');
  console.log('ok 1 - AIMS readiness');

  const mastReady = await requestJson(new URL('/readyz', mastBase), {
    headers: requestHeaders(mastBase),
  });
  assertOk(mastReady.body?.ok === true || mastReady.body?.ready === true, 'MAST readiness did not report ready');
  console.log('ok 2 - MAST readiness');

  const mastToAims = await requestJson(new URL('/run/suite-health-ping', mastBase), {
    method: 'POST',
    headers: requestHeaders(mastBase, {
      ...bearer(cronAdminToken),
      'content-type': 'application/json',
    }),
    body: JSON.stringify({ force: true }),
  });
  assertOk(mastToAims.body?.ok === true && mastToAims.body?.jobId === 'suite-health-ping', 'MAST → AIMS health job failed');
  console.log('ok 3 - MAST → AIMS operation');

  await requestJson(new URL('/services/rams/resume', mastBase), {
    method: 'POST',
    headers: requestHeaders(mastBase, {
      ...bearer(cronAdminToken),
      'content-type': 'application/json',
    }),
    body: JSON.stringify({ reason: 'production-launch-smoke' }),
  }, [200, 202]);

  const ramsReady = await waitForJson(new URL('/readyz', ramsBase), {
    headers: requestHeaders(ramsBase, bearer(rmsApiKey)),
  }, (body) => body?.status === 'ready');
  assertOk(ramsReady.body?.status === 'ready', 'RAMS readiness did not report ready');
  console.log('ok 4 - RAMS readiness');

  const idempotencyKey = `production-launch-smoke-${Date.now()}`;
  const ramsDryRun = await requestJson(new URL('/rebuild/on-brand/run', ramsBase), {
    method: 'POST',
    headers: requestHeaders(ramsBase, {
      ...bearer(rmsApiKey),
      'content-type': 'application/json',
      'x-idempotency-key': idempotencyKey,
    }),
    body: JSON.stringify({ dry_run: true }),
  }, [202]);
  assertOk(ramsDryRun.body?.dryRun === true && ramsDryRun.body?.pipeline === 'on-brand', 'RAMS dry-run was not admitted as a dry run');
  console.log('ok 5 - RAMS remediation dry-run admitted');

  const hiveReady = await requestJson(new URL('/v1/runtime/readiness', hiveApiBase), {
    headers: requestHeaders(hiveApiBase, bearer(hiveAdminToken)),
  });
  assertOk(hiveReady.body?.ready === true && hiveReady.body?.configuration_ready === true, 'HIVE detailed readiness is not green');
  const requiredDependencyErrors = Array.isArray(hiveReady.body?.dependency_probes)
    ? hiveReady.body.dependency_probes.filter((probe) => probe?.required !== false && probe?.status === 'error')
    : [];
  assertOk(requiredDependencyErrors.length === 0, `HIVE has ${requiredDependencyErrors.length} required dependency probe error(s)`);
  console.log('ok 6 - HIVE storage/dependency readiness');

  const providerHealth = await requestJson(new URL('/v1/providers/health', hiveApiBase), {
    headers: requestHeaders(hiveApiBase, bearer(hiveAdminToken)),
  });
  const providers = Array.isArray(providerHealth.body?.providers) ? providerHealth.body.providers : [];
  assertOk(Number(providerHealth.body?.provider_count || 0) > 0, 'HIVE reported no configured providers');
  assertOk(providers.every((provider) => provider?.ok === true), 'One or more HIVE providers failed their health probe');
  console.log('ok 7 - HIVE provider health');

  const dbPing = await requestJson(new URL('/v1/db/ping-write', hiveApiBase), {
    method: 'POST',
    headers: requestHeaders(hiveApiBase, {
      ...bearer(hiveAdminToken),
      'content-type': 'application/json',
    }),
    body: '{}',
  });
  assertOk(dbPing.body?.ok === true, 'HIVE SQL/D1 write-delete readiness probe failed');
  console.log('ok 8 - HIVE database write/delete readiness');

  const hiveHealth = await requestJson(new URL('/health', hiveUiBase), {
    headers: requestHeaders(hiveUiBase),
  });
  assertOk(String(hiveHealth.body?.service || '').toLowerCase().includes('hive'), 'HIVE-UI health response did not identify the HIVE UI service');
  console.log('ok 9 - HIVE-UI health');

  const login = await requestJson(new URL('/api/auth/login', hiveUiBase), {
    method: 'POST',
    headers: requestHeaders(hiveUiBase, { 'content-type': 'application/json' }),
    body: JSON.stringify({ access_key: hiveUiAccessKey }),
  });
  assertOk(login.body?.authenticated === true, 'HIVE-UI login did not establish an authenticated session');
  const hiveCookie = cookiePair(login.response);
  console.log('ok 10 - HIVE-UI authenticated session');

  const session = await requestJson(new URL('/api/auth/session', hiveUiBase), {
    headers: requestHeaders(hiveUiBase, { cookie: hiveCookie }),
  });
  assertOk(session.body?.authenticated === true, 'HIVE-UI session verification failed');
  console.log('ok 11 - HIVE session verified');

  const handoff = await requestJson(new URL('/api/auth/comms-handoff?format=json', hiveUiBase), {
    headers: requestHeaders(hiveUiBase, { cookie: hiveCookie }),
  });
  const communicationsUrl = new URL(String(handoff.body?.url || ''));
  const hashParams = new URLSearchParams(communicationsUrl.hash.replace(/^#/, ''));
  const handoffToken = hashParams.get('handoff') || '';
  assertOk(Boolean(handoffToken), 'HIVE-UI communications handoff did not return a signed handoff token');
  console.log('ok 12 - HIVE-UI communications handoff issued');

  const identity = await requestJson(new URL('/api/auth/comms-identity', hiveUiBase), {
    headers: requestHeaders(hiveUiBase, { authorization: `Bearer ${handoffToken}` }),
  });
  assertOk(Boolean(identity.body?.actor && identity.body?.role), 'HIVE communications identity response is incomplete');
  console.log(`ok 13 - HIVE identity verified (${identity.body.role})`);

  const aimsUiBase = configuredAimsUiBase || new URL(communicationsUrl.origin);
  if (configuredAimsUiBase && configuredAimsUiBase.origin !== communicationsUrl.origin) {
    throw new Error(`AIMS_UI_BASE_URL (${configuredAimsUiBase.origin}) does not match the HIVE handoff origin (${communicationsUrl.origin})`);
  }

  const exchange = await requestJson(new URL('/console/api/auth/handoff', aimsUiBase), {
    method: 'POST',
    headers: requestHeaders(aimsUiBase, { authorization: `Bearer ${handoffToken}` }),
  });
  assertOk(
    exchange.body?.authenticated === true
      && exchange.body?.actor === identity.body.actor
      && exchange.body?.role === identity.body.role,
    'AIMS-UI handoff exchange did not preserve the HIVE identity',
  );
  const aimsCookie = cookiePair(exchange.response);
  console.log('ok 14 - AIMS-UI handoff exchange');

  const comms = await requestJson(new URL('/console/api/health', aimsUiBase), {
    headers: requestHeaders(aimsUiBase, { cookie: aimsCookie }),
  });
  assertOk(comms.body?.service === 'comms-hub' && comms.body?.ok === true, 'AIMS Comms Hub did not report ready through the delegated console route');
  console.log('ok 15 - AIMS Comms Hub delegated route');

  const smokeSuffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const chatPayload = {
    sessionId: `launch-smoke-session-${smokeSuffix}`,
    visitorId: `launch-smoke-visitor-${smokeSuffix}`,
    text: `[production-launch-smoke] Verify CogniPal gateway connectivity. ${smokeSuffix}`,
  };
  const chatMessage = await requestJson(new URL('/api/cognipal/message', websiteBase), {
    method: 'POST',
    headers: requestHeaders(websiteBase, { 'content-type': 'application/json' }),
    body: JSON.stringify(chatPayload),
  }, [200, 202]);
  assertOk(chatMessage.body?.ok === true || chatMessage.body?.accepted === true, 'CogniPal message gateway did not accept the smoke message');
  console.log('ok 16 - CogniPal message gateway');

  const chatSync = await requestJson(new URL('/api/cognipal/sync', websiteBase), {
    method: 'POST',
    headers: requestHeaders(websiteBase, { 'content-type': 'application/json' }),
    body: JSON.stringify({ sessionId: chatPayload.sessionId, visitorId: chatPayload.visitorId }),
  });
  assertOk(chatSync.body?.ok === true, 'CogniPal sync gateway did not complete successfully');
  console.log('ok 17 - CogniPal message/sync round trip');

  console.log('ecosystem smoke passed');
}

main().catch((error) => {
  console.error(`ecosystem smoke failed: ${error?.message || String(error)}`);
  process.exitCode = 1;
});
