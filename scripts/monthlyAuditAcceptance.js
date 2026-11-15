// Runs from trusted MAST workflow code inside the existing MAST runtime.
const ORIGIN = 'https://zeroth-kara-jonathanharris-3296ed37.koyeb.app';
const TYPES = {
  website: { route: '/audits/monthly/website', status: '/audits/website/jobs/' },
  content: { route: '/audits/monthly/aims', status: '/audits/content-master/jobs/' },
};

export async function auditAcceptance(kind, identity, {
  env = process.env, fetchImpl = fetch, pause = ms => new Promise(resolve => setTimeout(resolve, ms)),
  deadlineMs = 90 * 60 * 1000, log = console.log,
} = {}) {
  if (!TYPES[kind] || !/^[a-f0-9]{40}$/.test(identity || '')) throw new Error('Exact audit acceptance identity required');
  const token = String(env.AIMS_API_KEY || '').trim();
  if (!token) throw new Error('MAST runtime AIMS_API_KEY is not configured');
  const sessionId = `acceptance-${identity.slice(0, 16)}-${kind}`;
  const target = TYPES[kind];
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json',
    'x-idempotency-key': sessionId, 'user-agent': 'MAST-monthly-audit-acceptance/1.0' };
  const request = async (path, options = {}) => {
    const response = await fetchImpl(ORIGIN + path, { ...options, headers,
      redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (response.status === 404 && !options.method) return null;
    if (![200, 202].includes(response.status)) throw new Error(`${kind} acceptance API returned HTTP ${response.status}`);
    return response.json();
  };
  log(JSON.stringify({ event: 'audit-acceptance-planned', kind, sessionId }));
  let current = await request(target.status + sessionId);
  if (!current) {
    await request(target.route, { method: 'POST', body: JSON.stringify({ force: true, sessionId,
      requestedBy: 'MAST authorised monthly audit production acceptance' }) });
  }
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    current = await request(target.status + sessionId);
    const job = current?.job || current;
    if (!job) throw new Error(`${kind} audit parent was not persisted`);
    const status = job.status;
    log(JSON.stringify({ event: 'audit-acceptance-progress', kind, sessionId, status, phase: job.phase || null }));
    if (status === 'completed') {
      const handoff = job.ramsDispatch || job.result?.ramsDispatch;
      if (handoff?.status !== 'completed' || handoff?.completion?.status !== 'completed') {
        throw new Error(`${kind} parent completed without verified RAMS completion evidence`);
      }
      return { kind, sessionId, status, runId: handoff.runId, reportJsonUrl: job.finalReportJsonUrl || job.result?.reportJsonUrl };
    }
    if (status === 'failed') throw new Error(`${kind} audit failed; inspect persisted job ${sessionId}`);
    if (!['queued', 'accepted', 'running'].includes(status)) throw new Error(`${kind} audit status is invalid`);
    await pause(30000);
  }
  throw new Error(`${kind} acceptance remains unverified after its bounded observation window; job ${sessionId} is retained`);
}

export async function ensureRamsReady({ env = process.env, fetchImpl = fetch,
  pause = ms => new Promise(resolve => setTimeout(resolve, ms)), deadlineMs = 180000 } = {}) {
  const readyUrl = 'https://static-helaina-jonathanharris-6df5d241.koyeb.app/readyz';
  const ready = async () => {
    try {
      const response = await fetchImpl(readyUrl, { redirect: 'error', signal: AbortSignal.timeout(15000) });
      return response.ok && (await response.json()).status === 'ready';
    } catch { return false; }
  };
  if (await ready()) return;
  const serviceId = String(env.KOYEB_SERVICE_ID_RAMS || '').trim();
  const token = String(env.KOYEB_TOKEN || '').trim();
  if (!/^[a-f0-9-]{36}$/.test(serviceId) || !token) throw new Error('RAMS resume configuration is unavailable');
  const response = await fetchImpl(`https://app.koyeb.com/v1/services/${serviceId}/resume`, {
    method: 'POST', headers: { authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(30000),
  });
  if (![200, 202, 204, 409].includes(response.status)) throw new Error(`RAMS resume returned HTTP ${response.status}`);
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (await ready()) return;
    await pause(5000);
  }
  throw new Error('RAMS readiness could not be established within the bounded resume window');
}

if (process.env.AUDIT_ACCEPTANCE_REMOTE === '1') {
  const kind = process.env.AUDIT_ACCEPTANCE_KIND || 'both';
  const kinds = kind === 'both' ? ['website', 'content'] : [kind];
  if (kinds.some(value => !TYPES[value])) throw new Error('Unsupported audit acceptance selection');
  await ensureRamsReady();
  let failures = 0;
  for (const selected of kinds) {
    try { console.log(JSON.stringify(await auditAcceptance(selected, process.env.AUDIT_ACCEPTANCE_ID))); }
    catch (error) { failures++; console.error(error.message); }
  }
  if (failures) process.exitCode = 1;
}
