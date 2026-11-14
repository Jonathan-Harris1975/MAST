import test from 'node:test';
import assert from 'node:assert/strict';
import { ramsPauseReadiness } from '../src/scheduler.js';
const response = body => async () => ({ok:true,json:async()=>body});
test('RAMS cannot be paused while durable remediation is busy', async()=>{
  assert.equal((await ramsPauseReadiness(response({status:'ok',lifecycle:{state:'busy'},pipelines:{website:'idle'}}))).safe,false);
  assert.equal((await ramsPauseReadiness(response({status:'ok',lifecycle:{state:'online'},pipelines:{website:'running'}}))).safe,false);
});
test('RAMS pause needs fresh known idle state',async()=>{
  assert.equal((await ramsPauseReadiness(response({status:'ok',lifecycle:{state:'online'},pipelines:{website:'idle'}}))).safe,true);
  assert.equal((await ramsPauseReadiness(response({status:'ok'}))).safe,false);
  assert.equal((await ramsPauseReadiness(async()=>{throw new Error('unreachable');})).safe,false);
});
