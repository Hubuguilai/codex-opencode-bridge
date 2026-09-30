import {test} from 'node:test';
import assert from 'node:assert/strict';
import {acceptanceTurnTimeout,acceptanceOptions,acceptancePassed,acceptanceScenarios,matrixPassed} from '../src/acceptance-contract.mjs';

function patchReceipt() {
  return {mode:'patch-only',passed:true,sourceSha256:'a'.repeat(64),sourceChangedDuringRun:false,scenarios:[
    ...['patch-create','patch-update'].map(name=>({name,status:'completed',passed:true,checks:{exactContent:true,nativeFileChange:true,nativeDiff:true,noCommandExecution:true,upstreamDidNotWrite:true}})),
    {name:'patch-denial',status:'completed',passed:true,checks:{oneApprovalDenied:true,fileAbsent:true,nativeFileChange:true,noCommandExecution:true,upstreamDidNotWrite:true}},
  ]};
}

test('A matrix cannot combine different source revisions or skipped models into one pass',()=>{
  const row={passed:true,sourceSha256:'a'.repeat(64)};
  assert.equal(matrixPassed([row,{...row}]),true);
  assert.equal(matrixPassed([row,{...row,sourceSha256:'b'.repeat(64)}]),false);
  assert.equal(matrixPassed([row,{notRun:true,passed:false}]),false);
  assert.equal(matrixPassed([]),false);
});

test('Live acceptance modes are explicit and invalid options cannot silently launch a full suite',()=>{
  assert.deepEqual(acceptanceOptions(['--live','--patch-only']),{mode:'patch-only',models:[]});
  assert.deepEqual(acceptanceOptions(['--live','--patch-only','--models','opencode/a,opencode/b'],{matrix:true}),{mode:'patch-only',models:['opencode/a','opencode/b']});
  assert.equal(acceptanceOptions(['--live']).mode,'full-suite');
  for(const args of [[],['--patch-only'],['--live','--patch-onyl'],['--live','--patch-only','--repair-only'],['--live','--live'],['--live','unexpected']])assert.throws(()=>acceptanceOptions(args));
  for(const models of ['', 'opencode/a,', 'opencode/a,opencode/a'])assert.throws(()=>acceptanceOptions(['--live','--models',models],{matrix:true}));
});

test('Partial, duplicated or wrong-mode patch receipts cannot satisfy the acceptance contract',()=>{
  assert.equal(acceptancePassed(patchReceipt(),'patch-only'),true);
  const missing=patchReceipt();missing.scenarios.pop();assert.equal(acceptancePassed(missing,'patch-only'),false);
  const duplicate=patchReceipt();duplicate.scenarios[2]=duplicate.scenarios[0];assert.equal(acceptancePassed(duplicate,'patch-only'),false);
  assert.equal(acceptancePassed(patchReceipt(),'full-suite'),false);
  const mislabeled=patchReceipt();mislabeled.mode='full-suite';assert.equal(acceptancePassed(mislabeled,'full-suite'),false);
  const nullScenario=patchReceipt();nullScenario.scenarios[0]=null;assert.equal(acceptancePassed(nullScenario,'patch-only'),false);
  assert.equal(acceptanceScenarios['full-suite'].length,10);
});

test('Native diff, denial, exact contents and provenance checks cannot be replaced by an overall passed flag',()=>{
  for(const mutate of [
    r=>delete r.scenarios[0].checks.nativeDiff,
    r=>r.scenarios[0].checks={unrelatedCheck:true},
    r=>r.scenarios[1].checks.exactContent=false,
    r=>r.scenarios[2].checks.oneApprovalDenied=false,
    r=>r.scenarios[2].status='failed',
    r=>r.sourceChangedDuringRun=true,
    r=>delete r.sourceChangedDuringRun,
    r=>r.sourceSha256='missing',
    r=>r.accessDenial={status:429},
  ]) {const value=patchReceipt();mutate(value);assert.equal(acceptancePassed(value,'patch-only'),false);}
});

test('Whole-turn deadline is explicit, bounded and independent of request timeout',()=>{
 assert.equal(acceptanceTurnTimeout({}),180000);
 assert.equal(acceptanceTurnTimeout({BRIDGE_ACCEPTANCE_TURN_TIMEOUT_MS:'300000'}),300000);
 for(const value of ['bad','0','999','900001','1500.5'])assert.throws(()=>acceptanceTurnTimeout({BRIDGE_ACCEPTANCE_TURN_TIMEOUT_MS:value}));
});
