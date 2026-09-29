// Serial, explicitly opted-in real Codex acceptance across exact model IDs.
// Provider access failures are recorded, never retried with another identity.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
if(!process.argv.includes('--live'))throw new Error('Live model use requires --live.');
const index=process.argv.indexOf('--models');
const models=(index<0?'':process.argv[index+1]||'').split(',').filter(Boolean);
if(!models.length||models.some(id=>!/^opencode\/[a-z0-9][a-z0-9.-]*$/.test(id))||new Set(models).size!==models.length)throw new Error('Provide distinct exact model IDs with --models opencode/model-a,opencode/model-b.');
const output=path.resolve(process.env.BRIDGE_MATRIX_DIR||'generated/model-matrix');
fs.mkdirSync(output,{recursive:true});
if(fs.existsSync(path.join(output,'matrix.json')))throw new Error('Matrix already exists; choose a fresh BRIDGE_MATRIX_DIR.');
const mode=process.argv.includes('--repair-only')?'repair-only':'full-suite';
const receipt={date:new Date().toISOString(),mode,internalTools:process.env.BRIDGE_INTERNAL_TOOLS||'client-aliases',models:[]};
const save=()=>fs.writeFileSync(path.join(output,'matrix.json'),JSON.stringify(receipt,null,2)+'\n');
save();
for(const model of models){
 const file=path.join(output,model.split('/')[1]+'.json');
 console.log(JSON.stringify({starting:model,mode}));
 const exitCode=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[fileURLToPath(new URL('./native-acceptance.mjs',import.meta.url)),'--live',...(mode==='repair-only'?['--repair-only']:[])],{stdio:'inherit',env:{...process.env,BRIDGE_TEST_MODEL:model,BRIDGE_INTERNAL_TOOLS:receipt.internalTools,BRIDGE_RECEIPT:file}});
  child.once('error',reject);child.once('exit',code=>resolve(code));
 });
 let result;try{result=JSON.parse(fs.readFileSync(file));}catch{}
 receipt.models.push({model,exitCode,receipt:path.basename(file),sourceSha256:result?.sourceSha256,sourceChangedDuringRun:result?.sourceChangedDuringRun,scenarios:result?.scenarios.map(({name,passed})=>({name,passed})),passed:exitCode===0&&result?.passed===true&&result?.scenarios?.length>0&&result.scenarios.every(s=>s.passed)&&!result.sourceChangedDuringRun});save();
}
receipt.passed=receipt.models.every(x=>x.passed);save();
console.log(JSON.stringify({matrix:path.join(output,'matrix.json'),passed:receipt.passed}));
if(!receipt.passed)process.exitCode=1;
