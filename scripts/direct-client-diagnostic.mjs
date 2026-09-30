// Opt-in real inference through the prepared bridge, bypassing Router.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import net from 'node:net';import {createHash} from 'node:crypto';
import {prepareDirectory,preparedEnvironment,removePreparedDirectory} from '../src/setup.mjs';
import {readConfig} from '../src/config.mjs';import {startOpenCode} from '../src/opencode.mjs';import {createBridge} from '../src/server.mjs';import {verifyClientRoute} from '../src/client-verification.mjs';
if(process.argv[2]!=='--live')throw Error('Use --live to authorize real model inference.');
const model=process.argv[3]||'opencode/muse-spark-1.3-contributor-free';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-direct-diagnostic-')),prepared=path.join(root,'prepared');
const free=()=>new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
let runtime,bridge;const receipt={date:new Date().toISOString(),route:'direct_prepared_bridge_real_codex',model,warnings:[],media:[]};
const hash=createHash('sha256');for(const name of fs.readdirSync('src').filter(x=>x.endsWith('.mjs')).sort())hash.update(name).update(fs.readFileSync(path.join('src',name)));receipt.sourceSha256=hash.digest('hex');
fs.mkdirSync('generated',{recursive:true});
try{
 const port=await free();let upstreamPort=await free();while(upstreamPort===port)upstreamPort=await free();
 prepareDirectory(prepared,{models:[model],port,upstreamPort});
 const env=preparedEnvironment(prepared),config=readConfig(env);
 runtime=await startOpenCode(config,env);receipt.runtime=(await runtime.backend.health()).version;
 const start=Date.now();runtime.backend.warn=code=>receipt.warnings.push({elapsedMs:Date.now()-start,code});
 bridge=createBridge(config,runtime.backend);await bridge.listen();
 const catalogEntry=JSON.parse(fs.readFileSync(path.join(prepared,'models.json'))).models[0];
 const progress=event=>{
  const file=path.join(runtime.backend.directory,'bridge-wire-surface.json');
  if(fs.existsSync(file)){const surface=JSON.parse(fs.readFileSync(file));receipt.media.push({event,counts:surface.media,imageIntegrity:surface.imageIntegrity});}
  console.log(JSON.stringify(event));
 };
 receipt.client=await verifyClientRoute({diagnosticImageOnly:process.env.BRIDGE_DIAGNOSTIC_IMAGE_ONLY==='1',model,baseUrl:`http://127.0.0.1:${port}/v1`,token:config.token,catalogEntry,images:catalogEntry.input_modalities.includes('image'),route:receipt.route,onProgress:progress,
 onPrivateError:value=>fs.appendFileSync('generated/direct-private-errors.jsonl',JSON.stringify(value)+'\n',{mode:0o600})});
 receipt.passed=receipt.client.passed;if(!receipt.passed)process.exitCode=1;
}catch(error){receipt.passed=false;receipt.error=error.message.replaceAll(root,'<temporary-directory>');process.exitCode=1;}
finally{
 if(bridge)await bridge.close();if(runtime)await runtime.stop();
 try{if(fs.existsSync(prepared))removePreparedDirectory(prepared);fs.rmdirSync(root);receipt.cleaned=true;}catch{receipt.cleaned=false;process.exitCode=1;}
 fs.writeFileSync('generated/direct-client-diagnostic.json',JSON.stringify(receipt,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(receipt));
}
