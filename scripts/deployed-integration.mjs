#!/usr/bin/env node

const DEFAULT_AIMS_UI_BASE_URL = 'https://chat.jonathan-harris.online'
const DEFAULT_HIVE_UI_BASE_URL = 'https://hive.jonathan-harris.online'
const DEFAULT_WEBSITE_ORIGIN = 'https://jonathan-harris.online'
const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_RETRY_DELAY_MS = 10_000

function required(name) {
  const value = String(process.env[name] || '').trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function baseUrl(name, fallback) {
  const value = String(process.env[name] || fallback || '').trim()
  if (!value) throw new Error(`${name} is required`)
  const parsed = new URL(value)
  if (parsed.protocol !== 'https:' && process.env.DEPLOYED_INTEGRATION_ALLOW_HTTP !== 'true') {
    throw new Error(`${name} must use https`)
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '')
  parsed.search = ''
  parsed.hash = ''
  return parsed
}

function headersFor(origin, extra = {}) {
  return {
    accept: 'application/json',
    origin: origin.origin,
    'sec-fetch-site': 'same-origin',
    'user-agent': 'aims-ui-deployed-integration/1.0',
    ...extra,
  }
}

function cookiePair(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean)
  const pairs = values
    .flatMap((value) => String(value).split(/,(?=\s*[^;,=]+=[^;,]+)/))
    .map((value) => value.split(';', 1)[0].trim())
    .filter(Boolean)
  if (!pairs.length) throw new Error('Expected a session cookie but none was returned')
  return pairs.join('; ')
}

async function requestJson(url, options = {}, expectedStatuses = [200]) {
  const timeoutMs = Number(process.env.DEPLOYED_INTEGRATION_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
  const response = await fetch(url, {
    ...options,
    redirect: 'manual',
    signal: AbortSignal.timeout(Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS),
  })
  const text = await response.text()
  let body = null
  if (text) {
    try { body = JSON.parse(text) } catch { body = { raw: text.slice(0, 500) } }
  }
  if (!expectedStatuses.includes(response.status)) {
    const detail = body?.detail || body?.message || body?.error || text.slice(0, 300) || 'no response body'
    throw new Error(`${options.method || 'GET'} ${url} returned ${response.status}: ${detail}`)
  }
  return { response, body }
}

async function waitForExpectedRelease(url, expectedSha) {
  const attempts = Math.max(1, Math.min(90, Number(process.env.DEPLOYED_INTEGRATION_RETRY_ATTEMPTS || 60)))
  const delayMs = Math.max(250, Number(process.env.DEPLOYED_INTEGRATION_RETRY_DELAY_MS || DEFAULT_RETRY_DELAY_MS))
  let lastError = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await requestJson(url)
      const deployedSha = String(result.body?.releaseSha || '').trim()
      if (result.body?.ok === true && deployedSha === expectedSha) return result
      lastError = new Error(`Expected deployed SHA ${expectedSha}, received ${deployedSha || 'none'}`)
    } catch (error) {
      lastError = error
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  throw lastError || new Error(`Expected release ${expectedSha} did not become ready`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  const aimsUiBase = baseUrl('AIMS_UI_BASE_URL', DEFAULT_AIMS_UI_BASE_URL)
  const hiveUiBase = baseUrl('HIVE_UI_BASE_URL', DEFAULT_HIVE_UI_BASE_URL)
  const websiteOrigin = baseUrl('WEBSITE_ORIGIN', DEFAULT_WEBSITE_ORIGIN)
  const expectedSha = required('EXPECTED_DEPLOYMENT_SHA')
  const hiveUiAccessKey = required('HIVE_UI_ACCESS_KEY')

  const gatewayHealth = await waitForExpectedRelease(new URL('/health', aimsUiBase), expectedSha)
  const configuration = gatewayHealth.body?.configuration || {}
  assert(configuration.aimsApiBaseUrl === true, 'AIMS_API_BASE_URL is not configured in the deployed gateway')
  assert(configuration.aimsApiKey === true, 'AIMS_API_KEY is not configured in the deployed gateway')
  assert(configuration.delegationSecret === true, 'COMMS_HUB_RBAC_DELEGATION_SECRET is not configured in the deployed gateway')
  assert(configuration.d1 === true, 'AIMS-UI D1 binding is not configured in the deployed gateway')
  assert(configuration.assets === true, 'AIMS-UI asset binding is not configured in the deployed gateway')
  console.log('ok 1 - exact AIMS-UI release and production bindings')

  const widgetSession = await requestJson(new URL('/widget/session', aimsUiBase), {
    method: 'POST',
    headers: {
      ...headersFor(websiteOrigin),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      siteId: 'jonathan-harris.online',
      pageUrl: `${websiteOrigin.origin}/production-readiness-smoke`,
      referrer: '',
    }),
  })
  assert(Boolean(widgetSession.body?.sessionId && widgetSession.body?.visitorId && widgetSession.body?.token), 'D1-backed widget session was not created')
  const widgetMessages = await requestJson(new URL(`/widget/sessions/${encodeURIComponent(widgetSession.body.sessionId)}/messages`, aimsUiBase), {
    headers: {
      ...headersFor(websiteOrigin),
      authorization: `Bearer ${widgetSession.body.token}`,
    },
  })
  assert(Array.isArray(widgetMessages.body?.messages), 'D1-backed widget session could not be read')
  console.log('ok 2 - D1-backed widget session create/read')

  const login = await requestJson(new URL('/api/auth/login', hiveUiBase), {
    method: 'POST',
    headers: {
      ...headersFor(hiveUiBase),
      'content-type': 'application/json',
    },
    body: JSON.stringify({ access_key: hiveUiAccessKey }),
  })
  assert(login.body?.authenticated === true, 'HIVE-UI login did not establish a session')
  const hiveCookie = cookiePair(login.response)

  try {
    const handoff = await requestJson(new URL('/api/auth/comms-handoff?format=json', hiveUiBase), {
      headers: headersFor(hiveUiBase, { cookie: hiveCookie }),
    })
    const communicationsUrl = new URL(String(handoff.body?.url || ''))
    assert(communicationsUrl.origin === aimsUiBase.origin, `HIVE handoff target ${communicationsUrl.origin} does not match ${aimsUiBase.origin}`)
    const token = new URLSearchParams(communicationsUrl.hash.replace(/^#/, '')).get('handoff') || ''
    assert(Boolean(token), 'HIVE handoff did not include a signed token')

    const exchange = await requestJson(new URL('/console/api/auth/handoff', aimsUiBase), {
      method: 'POST',
      headers: headersFor(aimsUiBase, { authorization: `Bearer ${token}` }),
    })
    assert(exchange.body?.authenticated === true, 'AIMS-UI rejected the HIVE handoff')
    const aimsCookie = cookiePair(exchange.response)

    const commsHealth = await requestJson(new URL('/console/api/health', aimsUiBase), {
      headers: headersFor(aimsUiBase, { cookie: aimsCookie }),
    })
    assert(commsHealth.body?.ok === true && commsHealth.body?.service === 'comms-hub', 'AIMS delegated Comms Hub health route is not ready')
    console.log('ok 3 - HIVE handoff and delegated AIMS API proxy')
  } finally {
    await requestJson(new URL('/api/auth/logout', hiveUiBase), {
      method: 'POST',
      headers: headersFor(hiveUiBase, { cookie: hiveCookie }),
    }).catch(() => {})
  }

  const consoleResponse = await fetch(new URL('/console/', aimsUiBase), {
    headers: { 'user-agent': 'aims-ui-deployed-integration/1.0' },
    redirect: 'manual',
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  })
  assert(consoleResponse.status === 200, `AIMS console returned ${consoleResponse.status}`)
  assert(String(consoleResponse.headers.get('content-security-policy') || '').includes("script-src 'self'"), 'AIMS console CSP is missing the self-only script policy')
  console.log('ok 4 - deployed console asset and security policy')

  console.log('AIMS-UI deployed integration passed')
}

main().catch((error) => {
  console.error(`AIMS-UI deployed integration failed: ${error?.message || String(error)}`)
  process.exitCode = 1
})
