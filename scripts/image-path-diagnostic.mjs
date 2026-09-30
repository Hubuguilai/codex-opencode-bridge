// Minimal real-image probes, independent of Codex task history. Not UI acceptance.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import net from 'node:net';import {randomInt,createHash} from 'node:crypto';
import {prepareDirectory,preparedEnvironment,removePreparedDirectory} from '../src/setup.mjs';import {readConfig} from '../src/config.mjs';import {startOpenCode} from '../src/opencode.mjs';import {createBridge} from '../src/server.mjs';import {verificationImage} from '../src/verification-image.mjs';
if(process.argv[2]!=='--live')throw Error('Use --live to authorize real image inference.');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-image-path-')),prepared=path.join(root,'prepared'),model='opencode/muse-spark-1.3-contributor-free';
const free=()=>new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
let runtime,bridge;const receipt={date:new Date().toISOString(),model,scope:'minimal real bridge image inputs; no actual Codex tools or GUI',checks:[],warnings:[]};
const hash=createHash('sha256');for(const name of fs.readdirSync('src').filter(x=>x.endsWith('.mjs')).sort())hash.update(name).update(fs.readFileSync(path.join('src',name)));receipt.sourceSha256=hash.digest('hex');
try{
 const port=await free();let upstreamPort=await free();while(port===upstreamPort)upstreamPort=await free();prepareDirectory(prepared,{models:[model],port,upstreamPort});
 const env=preparedEnvironment(prepared),config=readConfig(env);runtime=await startOpenCode(config,env);const start=Date.now();runtime.backend.warn=code=>receipt.warnings.push({code,elapsedMs:Date.now()-start});
 bridge=createBridge(config,runtime.backend);await bridge.listen();
 for(const name of ['uploaded_image','tool_returned_image']){
  const code=String(randomInt(100000,1000000)),image={type:'input_image',image_url:'data:image/png;base64,'+verificationImage(code).toString('base64')};
  const input=name==='uploaded_image'?[{role:'user',content:[{type:'input_text',text:'Read the six digits in the image. Reply only with those digits.'},image]}]:[
   {role:'user',content:'Read the six digits in the image returned by view_image. Reply only with those digits.'},
   {type:'function_call',call_id:'image_probe',name:'view_image',arguments:'{}'},
   {type:'function_call_output',call_id:'image_probe',output:[image]}];
  const began=Date.now();console.log(JSON.stringify({name,phase:'starting'}));
  const response=await fetch(`http://127.0.0.1:${port}/v1/responses`,{method:'POST',headers:{authorization:'Bearer '+config.token,'content-type':'application/json'},body:JSON.stringify({model,input,stream:true}),signal:AbortSignal.timeout(210000)});
  const wire=await response.text(),events=[];for(const line of wire.split('\n'))if(line.startsWith('data: ')){try{events.push(JSON.parse(line.slice(6)));}catch{}}
  const completed=events.find(x=>x.type==='response.completed'),failure=events.find(x=>x.type==='response.failed');
  const text=(completed?.response?.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');
  const file=path.join(runtime.backend.directory,'bridge-wire-surface.json');const surface=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{};
  const check={name,httpStatus:response.status,durationMs:Date.now()-began,completed:Boolean(completed),failureCode:failure?.response?.error?.code,exactDigits:text.trim()===code,claimsMissingImage:/cannot|can't|unable|not.*(?:see|view)|no image|无法|看不到|没有.*图/i.test(text),imageIntegrity:surface.imageIntegrity};
  check.passed=check.completed&&check.exactDigits&&check.imageIntegrity?.exactBytesInOrder===true&&check.imageIntegrity.expectedImages===1&&check.imageIntegrity.wireImages===1;receipt.checks.push(check);console.log(JSON.stringify(check));
  if(response.status===401||response.status===403||response.status===429||failure?.response?.error?.code==='upstream_access_or_quota')break;
 }
 receipt.passed=receipt.checks.length===2&&receipt.checks.every(x=>x.passed);if(!receipt.passed)process.exitCode=1;
}catch(error){receipt.passed=false;receipt.error=error.message.replaceAll(root,'<temporary-directory>');process.exitCode=1;}
finally{
 if(bridge)await bridge.close();if(runtime)await runtime.stop();try{removePreparedDirectory(prepared);fs.rmdirSync(root);receipt.cleaned=true;}catch{receipt.cleaned=false;process.exitCode=1;}
 fs.mkdirSync('generated',{recursive:true});fs.writeFileSync('generated/image-path-diagnostic.json',JSON.stringify(receipt,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(receipt));
}
