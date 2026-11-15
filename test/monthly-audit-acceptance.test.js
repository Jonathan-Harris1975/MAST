import test from 'node:test';
import assert from 'node:assert/strict';
import { auditAcceptance } from '../scripts/monthlyAuditAcceptance.js';
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
    if(calls===2){started=request;return response({sessionId:'accepted'},202);}
    if(calls===3)return response({job:{status:'running',phase:'awaiting-remediation'}});
    return response({job:{status:'completed',ramsDispatch:{status:'completed',runId:'run-1',completion:{status:'completed'}}}});
  }));
  assert.equal(result.status,'completed');
  assert.equal(JSON.parse(started.body).force,true);
  assert.equal(started.headers['x-idempotency-key'],result.sessionId);
});

test('data URL transport resolves runtime modules through absolute file URLs',async()=>{
  const {readFile}=await import('node:fs/promises');
  const source=await readFile(new URL('../scripts/monthlyAuditAcceptance.js',import.meta.url),'utf8');
  const transported=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const seen=[];
  const runtime=await transported.loadMastRuntime(async specifier=>{
    const url=new URL(specifier);
    assert.equal(url.protocol,'file:');
    seen.push(url.pathname);
    return url.pathname.endsWith('/scheduler.js')?{runJob:()=>{}}:{jobs:[]};
  });
  assert.deepEqual(seen,['/app/src/scheduler.js','/app/src/jobs.js']);
  assert.equal(typeof runtime.runJob,'function');
});
