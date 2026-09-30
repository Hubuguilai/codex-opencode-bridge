// Real pinned download/npm recovery, deliberately stops before client setup.
// No launchd, client configuration changes, credentials or model requests.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {ensureRouter,runDependency} from '../src/router-install.mjs';
import {inspectRouterCompatibility} from '../src/router-compatibility.mjs';
if(process.argv[2]!=='--live-download')throw Error('Use --live-download to permit official source/package downloads.');
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-router-recovery-')),root=path.join(parent,'router');
const receipt={date:new Date().toISOString(),kind:'real-router-dependency-recovery',platform:process.platform,node:process.version,modelRequests:0,clientSetupExecuted:false,checks:{}};
const digest=createHash('sha256');for(const file of ['src/router-install.mjs','src/router-source-state.mjs','src/router-compatibility.mjs','src/install-state.mjs','runtime/router.json','runtime/router-compatibility.json'])digest.update(file).update(fs.readFileSync(file));receipt.sourceSha256=digest.digest('hex');
let firstNpm=true,fetches=0,setupReached=false;
const run=async(command,args,options)=>{
 if(command==='git'&&args[0]==='fetch')fetches++;
 if(command===process.execPath&&args[0]==='src/setup.mjs'){setupReached=true;return {status:1,stdout:'',stderr:''};}
 if(command==='npm'&&firstNpm){
  firstNpm=false;
  // A real npm failure: empty isolated cache and offline mode cannot satisfy
  // the pinned dependency lock. This never replaces the user's npm cache.
  const result=await runDependency(command,args,{...options,env:{...options.env,npm_config_cache:path.join(parent,'empty-npm-cache'),npm_config_offline:'true'}});
  assert.notEqual(result.status,0);receipt.checks.realNpmFailure=true;return result;
 }
 return runDependency(command,args,options);
};
try{
 await assert.rejects(ensureRouter(root,{run}),/dependency step failed/);
 let saved=JSON.parse(fs.readFileSync(path.join(root,'.bridge-router-install.json')));
 assert.equal(saved.phase,'node-dependencies');assert.equal(saved.status,'incomplete');assert.equal(saved.worker,undefined);assert.ok(saved.sourceFiles['package.json']);receipt.checks.durablePreparationRecord=true;
 await assert.rejects(ensureRouter(root,{run}),/dependency step failed/);
 saved=JSON.parse(fs.readFileSync(path.join(root,'.bridge-router-install.json')));
 assert.equal(saved.phase,'router-setup');assert.equal(saved.worker,undefined);assert.equal(setupReached,true);assert.equal(fetches,1);assert.equal(inspectRouterCompatibility(root).verified,true);
 receipt.checks.reusedPinnedDownload=true;receipt.checks.realNpmRetryAndCompatibility=true;
 await assert.rejects(ensureRouter(root,{run}),/client setup requires state recovery/);receipt.checks.stopsAtUnverifiedClientSetup=true;
 receipt.passed=true;
}catch(error){receipt.passed=false;receipt.error=error.message.replaceAll(parent,'<temporary-directory>');process.exitCode=1;}
finally{
 // runDependency returns only after its child exits; setup is never executed.
 fs.rmSync(parent,{recursive:true,force:true});receipt.cleaned=true;
 fs.mkdirSync('generated',{recursive:true});fs.writeFileSync('generated/router-preparation-recovery.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}
