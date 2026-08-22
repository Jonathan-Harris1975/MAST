#!/usr/bin/env node

const DEFAULT_TIMEOUT_MS = 15_000;

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function baseUrl(name) {
  const value = required(name);
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
    'user-agent': 'mast-ecosystem-smoke/1.0',
    ...extra,
  };
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

async function main() {
  const hiveBase = baseUrl('HIVE_UI_BASE_URL');
  const configuredAimsBase = process.env.AIMS_UI_BASE_URL?.trim() ? baseUrl('AIMS_UI_BASE_URL') : null;
  const accessKey = required('HIVE_UI_ACCESS_KEY');

  const hiveHealthUrl = new URL('/health', hiveBase);
  const hiveHealth = await requestJson(hiveHealthUrl, { headers: requestHeaders(hiveBase) });
  if (!String(hiveHealth.body?.service || '').toLowerCase().includes('hive')) {
    throw new Error('HIVE-UI health response did not identify the HIVE UI service');
  }
  console.log('ok 1 - HIVE-UI health');

  const loginUrl = new URL('/api/auth/login', hiveBase);
  const login = await requestJson(loginUrl, {
    method: 'POST',
    headers: requestHeaders(hiveBase, { 'content-type': 'application/json' }),
    body: JSON.stringify({ access_key: accessKey }),
  });
  if (!login.body?.authenticated) throw new Error('HIVE-UI login did not establish an authenticated session');
  const hiveCookie = cookiePair(login.response);
  console.log('ok 2 - HIVE-UI authenticated session');

  const sessionUrl = new URL('/api/auth/session', hiveBase);
  const session = await requestJson(sessionUrl, {
    headers: requestHeaders(hiveBase, { cookie: hiveCookie }),
  });
  if (!session.body?.authenticated) throw new Error('HIVE-UI session verification failed');
  console.log('ok 3 - HIVE session verified');

  const handoffUrl = new URL('/api/auth/comms-handoff?format=json', hiveBase);
  const handoff = await requestJson(handoffUrl, {
    headers: requestHeaders(hiveBase, { cookie: hiveCookie }),
  });
  const communicationsUrl = new URL(String(handoff.body?.url || ''));
  const hashParams = new URLSearchParams(communicationsUrl.hash.replace(/^#/, ''));
  const token = hashParams.get('handoff') || '';
  if (!token) throw new Error('HIVE-UI communications handoff did not return a signed handoff token');
  console.log('ok 4 - HIVE-UI communications handoff issued');

  const identityUrl = new URL('/api/auth/comms-identity', hiveBase);
  const identity = await requestJson(identityUrl, {
    headers: requestHeaders(hiveBase, { authorization: `Bearer ${token}` }),
  });
  if (!identity.body?.actor || !identity.body?.role) throw new Error('HIVE communications identity response is incomplete');
  console.log(`ok 5 - HIVE identity verified (${identity.body.role})`);

  const aimsBase = configuredAimsBase || new URL(communicationsUrl.origin);
  if (configuredAimsBase && configuredAimsBase.origin !== communicationsUrl.origin) {
    throw new Error(`AIMS_UI_BASE_URL (${configuredAimsBase.origin}) does not match the HIVE handoff origin (${communicationsUrl.origin})`);
  }

  const exchangeUrl = new URL('/console/api/auth/handoff', aimsBase);
  const exchange = await requestJson(exchangeUrl, {
    method: 'POST',
    headers: requestHeaders(aimsBase, { authorization: `Bearer ${token}` }),
  });
  if (!exchange.body?.authenticated || exchange.body?.actor !== identity.body.actor || exchange.body?.role !== identity.body.role) {
    throw new Error('AIMS-UI handoff exchange did not preserve the HIVE identity');
  }
  const aimsCookie = cookiePair(exchange.response);
  console.log('ok 6 - AIMS-UI handoff exchange');

  const commsHealthUrl = new URL('/console/api/health', aimsBase);
  const comms = await requestJson(commsHealthUrl, {
    headers: requestHeaders(aimsBase, { cookie: aimsCookie }),
  });
  if (comms.body?.service !== 'comms-hub' || comms.body?.ok !== true) {
    throw new Error('AIMS Comms Hub did not report ready through the delegated console route');
  }
  console.log('ok 7 - AIMS Comms Hub delegated route');
  console.log('ecosystem smoke passed');
}

main().catch((error) => {
  console.error(`ecosystem smoke failed: ${error?.message || String(error)}`);
  process.exitCode = 1;
});
