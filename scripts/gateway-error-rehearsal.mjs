// Reproduce the proposed Router stream repair on a disposable dependency copy.
// No real provider inference, source edits or live service restart.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {inspectRouterCompatibility,ensureRouterCompatibility} from '../src/router-compatibility.mjs';
if(process.argv[2]!=='--router-root'||!process.argv[3])throw Error('Use --router-root with a verified pinned Router checkout.');
const source=path.resolve(process.argv[3]),target=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-error-rehearsal-'));
let compatibility;try{compatibility=inspectRouterCompatibility(source);}catch{compatibility=inspectRouterCompatibility(source,{spec:JSON.parse(fs.readFileSync('runtime/router-compatibility-v1.json'))});}
const sourceFile=path.join(source,'src/router.mjs'),before=fs.readFileSync(sourceFile);
fs.mkdirSync('generated',{recursive:true});
try{
 fs.cpSync(source,target,{recursive:true,filter:p=>!['node_modules','.venv','.git'].includes(path.basename(p))});
 for(const name of ['node_modules','.venv'])fs.symlinkSync(path.join(source,name),path.join(target,name),'dir');
 const applied=ensureRouterCompatibility(target);
 inspectRouterCompatibility(target);
 const receiptFile=path.resolve('generated/gateway-error-rehearsal.json');
 const result=spawnSync(process.execPath,['scripts/router-rehearsal.mjs','--router-root',target,'--faults'],{env:{...process.env,BRIDGE_RECEIPT:receiptFile},encoding:'utf8',timeout:120000});
 if(!fs.existsSync(receiptFile))throw Error('Rehearsal did not produce a receipt.');
 const receipt=JSON.parse(fs.readFileSync(receiptFile));
 receipt.fixture={baseCompatibility:compatibility.id,disposableRouterCopy:true,installerIntegration:true,appliedCompatibility:applied.id,realProviderInference:false,sourcePreserved:fs.readFileSync(sourceFile).equals(before),repairSha256:createHash('sha256').update(fs.readFileSync('src/gateway-error-stream.mjs')).digest('hex')};
 receipt.passed=receipt.passed&&result.status===0&&receipt.fixture.sourcePreserved;
 fs.writeFileSync(receiptFile,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));if(!receipt.passed)process.exitCode=1;
}finally{fs.rmSync(target,{recursive:true,force:true});}
