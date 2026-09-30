// Integration-test helper only. Starts child processes, never launchd services.
import fs from 'node:fs';import path from 'node:path';import net from 'node:net';
import {spawn} from 'node:child_process';import {randomBytes} from 'node:crypto';
async function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});}
export async function isolatedRouterEnvironment(){
 const ports=[];while(ports.length<3){const port=await freePort();if(!ports.includes(port))ports.push(port);}
 const [front,api,gateway]=ports;
 return {MODEL_ROUTER_PORT:String(front),CODEX_ROUTER_PORT:String(front),MODEL_ROUTER_API_PORT:String(api),CODEX_ROUTER_API_PORT:String(api),MODEL_ROUTER_GATEWAY_PORT:String(gateway),CODEX_ROUTER_GATEWAY_PORT:String(gateway),
 CODEX_ROUTER_GATEWAY_BASE_URL:`http://127.0.0.1:${gateway}/v1`,CODEX_ROUTER_API_FORWARD_BASE_URL:`http://127.0.0.1:${api}/v1`,CODEX_ROUTER_API_BASE_URL:`http://127.0.0.1:${api}/v1`,CODEX_ROUTER_API_HEALTH_URL:`http://127.0.0.1:${api}/health`,
 CODEX_ROUTER_CALLER_KEY:randomBytes(32).toString('hex'),CODEX_ROUTER_INTERNAL_KEY:randomBytes(32).toString('hex'),CODEX_ROUTER_QUIET:'1',LITELLM_TELEMETRY:'false'};
}
export async function startIsolatedRouter({routerRoot,api}){
 const processes=[];
 function start(binary,args){const p=spawn(binary,args,{env:process.env,stdio:['ignore','ignore','pipe']});p.stderr.resume();p.on('error',()=>{p.startFailed=true;});processes.push(p);return p;}
 async function ready(url,child,headers={}){
  for(let i=0;i<150;i++){
   if(child.startFailed||child.exitCode!==null)throw Error('Isolated Router component failed to start.');
   try{if((await fetch(url,{headers,signal:AbortSignal.timeout(500)})).ok)return;}catch{}
   await new Promise(resolve=>setTimeout(resolve,200));
  }
  throw Error('Isolated Router readiness timed out for '+new URL(url).pathname+'.');
 }
 async function stop(){
  for(const child of processes.reverse())if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,3000))]);if(child.exitCode===null)child.kill('SIGKILL');}
 }
 try{
  fs.writeFileSync(api.paths.CALLER_SECRET_PATH,process.env.CODEX_ROUTER_CALLER_KEY,{mode:0o600,flag:'wx'});
  if(!fs.existsSync(api.paths.LITELLM_CONFIG_PATH))throw Error('Actual published gateway configuration is missing.');
  const forward=start(process.execPath,[path.join(routerRoot,'src/api-forwarder.mjs')]);
  await ready(process.env.CODEX_ROUTER_API_HEALTH_URL,forward,{authorization:'Bearer '+process.env.CODEX_ROUTER_INTERNAL_KEY});
  const gateway=start(path.join(routerRoot,'.venv/bin/litellm'),['--config',api.paths.LITELLM_CONFIG_PATH,'--host','127.0.0.1','--port',process.env.CODEX_ROUTER_GATEWAY_PORT]);
  await ready(`http://127.0.0.1:${process.env.CODEX_ROUTER_GATEWAY_PORT}/health/liveliness`,gateway);
  const front=start(process.execPath,[path.join(routerRoot,'src/router.mjs')]);
  const baseUrl=`http://127.0.0.1:${process.env.CODEX_ROUTER_PORT}/v1`,token=process.env.CODEX_ROUTER_CALLER_KEY;
  await ready(baseUrl+'/models',front,{authorization:'Bearer '+token});
  return {baseUrl,token,stop};
 }catch(error){await stop();throw error;}
}
