import test from 'node:test';
import assert from 'node:assert/strict';
import { auditAcceptance, ensureRamsReady } from '../scripts/monthlyAuditAcceptance.js';
const sha='a'.repeat(40);
const response=(body,status=200)=>new Response(JSON.stringify(body),{status});
const options=fetchImpl=>({env:{AIMS_API_KEY:'test-key'},fetchImpl,pause:async()=>{},log:()=>{}});

test('acceptance rejects invalid identity before any external action',async()=>{
  await assert.rejects(auditAcceptance('other',sha,options(()=>assert.fail())),/identity/);
  await assert.rejects(auditAcceptance('website','bad',options(()=>assert.fail())),/identity/);
});
test('an accepted or old completed report cannot certify repair completion',async()=>{
  await assert.rejects(auditAcceptance('website',sha,options(async()=>response({job:{status:'completed',ramsDispatch:{status:'accepted'}}}))),/without verified/);
});
test('acceptance reuses an existing parent without repeating its POST',async()=>{
  const methods=[];
  const result=await auditAcceptance('content',sha,options(async(url,request)=>{
    methods.push(request.method||'GET');
    return response({status:'completed',result:{ramsDispatch:{status:'completed',runId:'run-1',completion:{status:'completed'}}}});
  }));
  assert.equal(result.runId,'run-1');
  assert.deepEqual(methods,['GET','GET']);
});
test('new acceptance uses a stable idempotency key and follows durable pending status',async()=>{
  let calls=0;let started;
  const result=await auditAcceptance('website',sha,options(async(url,request)=>{
    calls++;
    if(calls===1)return response({},404);
    if(calls===2){started=request;return response({sessionId:JSON.parse(request.body).sessionId},202);}
    if(calls===3)return response({job:{status:'running',phase:'awaiting-remediation'}});
    return response({job:{status:'completed',ramsDispatch:{status:'completed',runId:'run-1',completion:{status:'completed'}}}});
  }));
  assert.equal(result.status,'completed');
  assert.equal(JSON.parse(started.body).force,true);
  assert.equal(started.headers['x-idempotency-key'],result.sessionId);
});

test('the transported runner can probe RAMS without importing a second scheduler',async()=>{
  const {readFile}=await import('node:fs/promises');
  const source=await readFile(new URL('../scripts/monthlyAuditAcceptance.js',import.meta.url),'utf8');
  const transported=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  let requests=0;
  await transported.ensureRamsReady({env:{RMS_API_KEY:'rams-key'},fetchImpl:async()=>{requests++;return response({status:'ready'});}});
  assert.equal(requests,1);
});
test('paused RAMS is resumed through its configured provider identity before audits',async()=>{
  const requests=[];
  await ensureRamsReady({env:{RMS_API_KEY:'rams-key',KOYEB_TOKEN:'test-key',KOYEB_SERVICE_ID_RAMS:'a'.repeat(36)},pause:async()=>{},
    fetchImpl:async(url,options)=>{
      requests.push({url,...options});
      if(requests.length===1)return response({},503);
      if(options.method==='POST')return response({},202);
      return response({status:'ready'});
    }});
  assert.equal(requests[1].url,'https://app.koyeb.com/v1/services/'+'a'.repeat(36)+'/resume');
  assert.equal(requests[1].headers.authorization,'Bearer test-key');
  assert.equal(requests[2].headers.authorization,'Bearer rams-key');
  assert.equal(requests[1].body,'{}');
});

test('rejected RAMS readiness credentials cannot trigger a provider resume',async()=>{
  let requests=0;
  await assert.rejects(ensureRamsReady({env:{RMS_API_KEY:'incorrect'},fetchImpl:async()=>{
    requests++;return response({},401);
  }}),/authentication was rejected/);
  assert.equal(requests,1);
});

test('website acceptance looks up the same canonical parent that AIMS persists',async()=>{
  const urls=[];
  const result=await auditAcceptance('website',sha,options(async(url)=>{
    urls.push(url);
    return response({job:{status:'completed',ramsDispatch:{status:'completed',completion:{status:'completed'}}}});
  }));
  assert.equal(result.sessionId,'AUD-WEBSITE-acceptance-'+sha.slice(0,16)+'-website');
  assert.ok(urls.every(url=>url.endsWith('/'+result.sessionId)));
});
test('an accepted canonical session is used for subsequent status reads',async()=>{
  let calls=0;
  await auditAcceptance('content',sha,options(async(url,request)=>{
    calls++;
    if(calls===1)return response({},404);
    if(request.method==='POST')return response({sessionId:'canonical-server-id'},202);
    assert.ok(url.endsWith('/canonical-server-id'));
    return response({status:'completed',result:{ramsDispatch:{status:'completed',completion:{status:'completed'}}}});
  }));
});

test('one observation returns durable pending state without a long remote process or another POST',async()=>{
  let pauses=0;const methods=[];
  const result=await auditAcceptance('website',sha,{...options(async(_url,request)=>{
    methods.push(request.method||'GET');return response({job:{status:'running',phase:'awaiting-remediation'}});
  }),singlePass:true,pause:async()=>{pauses++;}});
  assert.equal(result.status,'running');
  assert.equal(result.phase,'awaiting-remediation');
  assert.equal(pauses,0);
  assert.deepEqual(methods,['GET','GET']);
});

test('short-session workflow keeps observing the other audit after one audit fails',async()=>{
  const {mkdtemp,mkdir,writeFile,readFile}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const {execFile}=await import('node:child_process');
  const {promisify}=await import('node:util');
  const dir=await mkdtemp(join(tmpdir(),'audit-observer-'));
  const bin=join(dir,'bin');await mkdir(bin);
  await writeFile(join(bin,'koyeb'),`#!/usr/bin/env bash
set -eu
file="$PROBE_TEST_DIR/$AUDIT_ACCEPTANCE_KIND.count"
count=0
if test -f "$file"; then count="$(cat "$file")"; fi
count=$((count+1)); echo "$count" > "$file"
status=running
if test "$AUDIT_ACCEPTANCE_KIND" = content; then status=failed; elif test "$count" -ge 2; then status=completed; fi
printf 'AUDIT_ACCEPTANCE_RESULT={"kind":"%s","status":"%s"}\\n' "$AUDIT_ACCEPTANCE_KIND" "$status"
`,{mode:0o755});
  await writeFile(join(bin,'sleep'),'#!/usr/bin/env bash\nexit 0\n',{mode:0o755});
  let result;
  try {
    result=await promisify(execFile)('bash',['scripts/runMonthlyAuditAcceptance.sh'],{cwd:new URL('..',import.meta.url),timeout:15000,
      env:{...process.env,PATH:bin+':'+process.env.PATH,PROBE_TEST_DIR:dir,KOYEB_TOKEN:'test-key',KOYEB_SERVICE:'service-test',
        AUDIT_ACCEPTANCE_ID:sha,AUDIT_ACCEPTANCE_KIND:'both'}});
    assert.fail('One audit failed; the workflow must not pass');
  } catch(error) {
    assert.equal(error.code,1,error.stderr);
    result=error;
  }
  assert.match(result.stdout,/"status":"completed"/);
  assert.equal((await readFile(join(dir,'website.count'),'utf8')).trim(),'2');
  assert.equal((await readFile(join(dir,'content.count'),'utf8')).trim(),'1');
});
