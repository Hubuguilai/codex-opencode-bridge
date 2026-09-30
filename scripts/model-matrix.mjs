// Serial, explicitly opted-in real Codex acceptance across exact model IDs.
// Provider access failures are recorded, never retried with another identity.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {acceptanceOptions,acceptancePassed,matrixPassed} from '../src/acceptance-contract.mjs';
const {mode,models}=acceptanceOptions(process.argv.slice(2),{matrix:true});
const output=path.resolve(process.env.BRIDGE_MATRIX_DIR||'generated/model-matrix');
fs.mkdirSync(output,{recursive:true});
if(fs.existsSync(path.join(output,'matrix.json')))throw new Error('Matrix already exists; choose a fresh BRIDGE_MATRIX_DIR.');
const receipt={date:new Date().toISOString(),mode,internalTools:process.env.BRIDGE_INTERNAL_TOOLS||'client-aliases',models:[]};
const save=()=>fs.writeFileSync(path.join(output,'matrix.json'),JSON.stringify(receipt,null,2)+'\n');
save();
let quotaStopped=false;
for(const model of models){
 if(quotaStopped){receipt.models.push({model,notRun:true,reason:'Earlier model returned HTTP 429; no further quota requests were sent.',passed:false});save();continue;}
 const file=path.join(output,model.split('/')[1]+'.json');
 console.log(JSON.stringify({starting:model,mode}));
 const exitCode=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[fileURLToPath(new URL('./native-acceptance.mjs',import.meta.url)),'--live',...(mode!=='full-suite'?['--'+mode]:[])],{stdio:'inherit',env:{...process.env,BRIDGE_TEST_MODEL:model,BRIDGE_INTERNAL_TOOLS:receipt.internalTools,BRIDGE_RECEIPT:file}});
  child.once('error',reject);child.once('exit',code=>resolve(code));
 });
 let result;try{result=JSON.parse(fs.readFileSync(file));}catch{}
 if(result?.accessDenial?.status===429)quotaStopped=true;
 receipt.models.push({model,exitCode,receipt:path.basename(file),sourceSha256:result?.sourceSha256,sourceChangedDuringRun:result?.sourceChangedDuringRun,scenarios:Array.isArray(result?.scenarios)?result.scenarios.filter(item=>item&&typeof item==='object').map(({name,passed})=>({name,passed})):[],passed:exitCode===0&&result?.model===model&&acceptancePassed(result,mode)});save();
}
receipt.sourceConsistent=new Set(receipt.models.filter(x=>x.sourceSha256).map(x=>x.sourceSha256)).size===1;
receipt.passed=matrixPassed(receipt.models);save();
console.log(JSON.stringify({matrix:path.join(output,'matrix.json'),passed:receipt.passed}));
if(!receipt.passed)process.exitCode=1;
