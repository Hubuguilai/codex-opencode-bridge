// Live protocol probe: persist timing/counts only, never generated content.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readConfig} from '../src/config.mjs';
import {startOpenCode} from '../src/opencode.mjs';
import {createBridge} from '../src/server.mjs';

if(!process.argv.includes('--live'))throw new Error('Live upstream use requires --live.');
function digest(){const hash=createHash('sha256');for(const name of fs.readdirSync(new URL('../src/',import.meta.url)).filter(x=>x.endsWith('.mjs')).sort()){hash.update(name);hash.update(fs.readFileSync(new URL('../src/'+name,import.meta.url)));}return hash.digest('hex');}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'bridge-stream-'));
const model=process.env.BRIDGE_TEST_MODEL||'opencode/space-bunny-free';
const config=readConfig({...process.env,BRIDGE_STATE_DIR:root,BRIDGE_MODE:'native-tools',BRIDGE_INTERNAL_TOOLS:process.env.BRIDGE_INTERNAL_TOOLS||'hidden',BRIDGE_MODELS:model,BRIDGE_PORT:'4896',OPENCODE_PORT:'4897'});
const receipt={date:new Date().toISOString(),model,sourceSha256:digest(),internalTools:config.internalTools,scenarios:[]};
let runtime,bridge;
try{
 runtime=await startOpenCode(config);receipt.opencode=(await runtime.backend.health()).version;
 bridge=createBridge(config,runtime.backend);await bridge.listen();
 for(const api of ['responses','chat']){
  const prompt='Explain binary search to a beginner in about 350 words. Include a worked example and edge cases. Use plain text. Do not use tools.';
  const payload={model,stream:true,...(api==='responses'?{input:prompt}:{messages:[{role:'user',content:prompt}]})};
  const started=Date.now(),entry={api,deltas:0,characters:0,terminal:false};let pending='',text='',lastDelta;
  const response=await fetch(`http://127.0.0.1:${config.port}/v1/${api==='responses'?'responses':'chat/completions'}`,{method:'POST',headers:{authorization:`Bearer ${config.token}`,'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(120000)});
  entry.httpStatus=response.status;
  for await(const chunk of response.body.pipeThrough(new TextDecoderStream())){
   pending+=chunk;let boundary;
   while((boundary=pending.indexOf('\n\n'))>=0){
    const block=pending.slice(0,boundary);pending=pending.slice(boundary+2);
    const data=block.split('\n').filter(line=>line.startsWith('data: ')).map(line=>line.slice(6)).join('\n');
    if(!data)continue;if(data==='[DONE]'){entry.terminal=true;continue;}
    const event=JSON.parse(data);if(event.error||event.type==='response.failed')entry.error=event.error?.code||event.response?.error?.code||'stream_error';
    const delta=api==='responses'?(event.type==='response.output_text.delta'?event.delta:''):event.choices?.[0]?.delta?.content;
    if(delta){entry.firstDeltaMs??=Date.now()-started;lastDelta=Date.now()-started;entry.deltas++;text+=delta;entry.characters+=delta.length;}
    if(event.type==='response.completed'){entry.terminal=true;entry.finalMatches=event.response.output.filter(item=>item.type==='message').flatMap(item=>item.content).map(part=>part.text||'').join('')===text;}
   }
  }
  entry.durationMs=Date.now()-started;entry.deltaSpanMs=lastDelta-entry.firstDeltaMs;
  entry.passed=response.status===200&&!entry.error&&entry.terminal&&entry.deltas>1&&entry.deltaSpanMs>0&&entry.characters>0&&(api!=='responses'||entry.finalMatches);
  receipt.scenarios.push(entry);console.log(JSON.stringify(entry));
 }
}catch(error){receipt.error=error.code||error.name;}
finally{
 if(bridge)await bridge.close();if(runtime)await runtime.stop();fs.rmSync(root,{recursive:true,force:true});
 receipt.sourceChangedDuringRun=receipt.sourceSha256!==digest();
 receipt.passed=!receipt.error&&!receipt.sourceChangedDuringRun&&receipt.scenarios.length===2&&receipt.scenarios.every(entry=>entry.passed);
 const file=process.env.BRIDGE_RECEIPT||'generated/native-stream-probe.json';fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(receipt,null,2)+'\n');
 if(!receipt.passed)process.exitCode=1;
}
