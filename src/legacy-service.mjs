import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function regular(file){const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Legacy service evidence must be a regular file.');return fs.readFileSync(file);}
function context(snapshot,{home=os.homedir(),uid=process.getuid?.(),platform=process.platform,run=spawnSync}={}){
 if(platform!=='darwin')throw Error('Legacy service migration currently targets macOS only.');
 if(snapshot.kind!=='bridge-legacy-service'||!Number.isInteger(uid)||!/^[A-Za-z0-9][A-Za-z0-9.-]+$/.test(snapshot.label)||snapshot.plist!==path.join(home,'Library/LaunchAgents',snapshot.label+'.plist'))throw Error('Legacy service identity is inconsistent.');
 return {run,target:`gui/${uid}/${snapshot.label}`,domain:`gui/${uid}`};
}
function launch(c,args){return c.run('launchctl',args,{encoding:'utf8',timeout:15000});}
export function inspectLegacyService(plist,options={}){
 const file=path.resolve(plist),bytes=regular(file),run=options.run??spawnSync;
 const result=run('/usr/bin/plutil',['-convert','json','-o','-',file],{encoding:'utf8',timeout:10000});
 if(result.status!==0)throw Error('Cannot read the legacy service property list.');
 let doc;try{doc=JSON.parse(result.stdout);}catch{throw Error('Invalid legacy service property list.');}
 const args=doc.ProgramArguments,env=doc.EnvironmentVariables??{};
 if(!Array.isArray(args)||args.length!==3||args[2]!=='serve'||!path.isAbsolute(args[0])||!path.isAbsolute(args[1])||path.basename(args[1])!=='bridge.mjs'||env.BRIDGE_MODE!=='native-tools'||!path.isAbsolute(env.BRIDGE_STATE_DIR??''))throw Error('Only an explicit legacy native bridge serve service can be migrated.');
 if(env.BRIDGE_TOKEN)throw Error('Move the legacy local token to its protected state file before migration.');
 const port=Number(env.BRIDGE_PORT??4396),upstreamPort=Number(env.OPENCODE_PORT??4397),models=String(env.BRIDGE_MODELS??'').split(',').filter(Boolean);
 if(![port,upstreamPort].every(x=>Number.isInteger(x)&&x>0&&x<65536)||port===upstreamPort||!models.length||new Set(models).size!==models.length)throw Error('Legacy service ports or model list are invalid.');
 const snapshot={kind:'bridge-legacy-service',plist:file,label:doc.Label,sha256:hash(bytes),contents:bytes.toString('base64'),port,upstreamPort,models,tokenPath:path.join(env.BRIDGE_STATE_DIR,'local-token')};
 const c=context(snapshot,options),status=launch(c,['print',c.target]);
 if(status.status!==0||!/state = running/.test(status.stdout??''))throw Error('Legacy service must be loaded and running before migration.');
 return snapshot;
}
export async function checkLegacyService(snapshot,{fetchImpl=fetch,requireIdle=true}={}){
 const response=await fetchImpl(`http://127.0.0.1:${snapshot.port}/health`,{signal:AbortSignal.timeout(3000)}),health=await response.json();
 if(!response.ok||health.ok!==true||health.mode!=='native-tools'||(requireIdle&&health.active!==0))throw Error('Legacy bridge is unavailable, incompatible or busy; finish its tasks before migration.');
 return {healthy:true,idle:health.active===0};
}
function evidence(snapshot,backup,options){
 const c=context(snapshot,options),bytes=Buffer.from(snapshot.contents,'base64');
 if(hash(bytes)!==snapshot.sha256)throw Error('Legacy service snapshot is damaged.');
 if(!path.isAbsolute(backup)||backup===snapshot.plist)throw Error('Provide an independent private legacy service backup path.');
 return {c,bytes};
}
export function retireLegacyService(snapshot,{backup,...options}={}){
 const {c,bytes}=evidence(snapshot,backup,options);
 if(fs.existsSync(backup)){if(hash(regular(backup))!==snapshot.sha256)throw Error('Legacy service backup changed.');}
 else{fs.mkdirSync(path.dirname(backup),{recursive:true,mode:0o700});fs.writeFileSync(backup,bytes,{mode:0o600,flag:'wx'});}
 // The coordinator must persist retirement intent before this call; absence is
 // accepted only with the exact original private backup, allowing crash resume.
 if(fs.existsSync(snapshot.plist)&&hash(regular(snapshot.plist))!==snapshot.sha256)throw Error('Legacy service configuration changed; retirement stopped.');
 if(launch(c,['print',c.target]).status===0&&launch(c,['bootout',c.target]).status!==0)throw Error('Could not stop the legacy service; its configuration and backup are retained.');
 if(fs.existsSync(snapshot.plist))fs.unlinkSync(snapshot.plist);
 return {retired:true,backupPreserved:true};
}
export async function restoreLegacyService(snapshot,{backup,...options}={}){
 const {c,bytes}=evidence(snapshot,backup,options);
 if(hash(regular(backup))!==snapshot.sha256)throw Error('Legacy service backup changed.');
 if(fs.existsSync(snapshot.plist)){if(hash(regular(snapshot.plist))!==snapshot.sha256)throw Error('Legacy service configuration changed; restoration stopped.');}
 else fs.writeFileSync(snapshot.plist,bytes,{mode:0o600,flag:'wx'});
 if(launch(c,['print',c.target]).status!==0){
  for(let i=0;i<20;i++){
   const result=launch(c,['bootstrap',c.domain,snapshot.plist]);if(result.status===0)return {restored:true};
   if(result.status!==5||i===19)throw Error('Could not restore the legacy service; original configuration is retained.');
   await new Promise(resolve=>setTimeout(resolve,250));
  }
 }
 return {restored:true};
}
export async function waitLegacyService(snapshot,{check=checkLegacyService,delay=()=>new Promise(resolve=>setTimeout(resolve,500)),attempts=40}={}){
 for(let i=0;i<attempts;i++){
  try{return await check(snapshot);}catch{if(i+1<attempts)await delay();}
 }
 throw Error('Restored legacy service did not become healthy and idle; preserve migration records for recovery.');
}
