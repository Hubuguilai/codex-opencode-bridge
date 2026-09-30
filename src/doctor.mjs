import {spawnSync} from 'node:child_process';
import {findOpenCode} from './config.mjs';
import {MODEL_PROFILES} from './model-profiles.mjs';
import {supportedNode} from './prerequisites.mjs';

// Read-only preflight: do not create tokens, install packages, read credentials,
// start services or send model requests. Runtime entitlement is a separate gate.
export function doctor({env=process.env,platform=process.platform,node=process.versions.node,
 run=spawnSync,locate=findOpenCode}={}){
 const checks=[];
 const add=(id,ok,message,next)=>checks.push({id,ok,message,...(!ok&&next?{next}:{})});
 add('platform',platform==='darwin',platform==='darwin'?'macOS target detected.':'Desktop installation is currently targeting macOS.','Other platforms are not yet certified for desktop installation.');
 add('node',supportedNode(node),'Node '+node,'Install Node.js 22.19 or later.');
 let binary;
 try{binary=locate(env);}catch{}
 if(!binary)add('opencode',false,'OpenCode executable not found.','Install the documented official OpenCode v2 runtime, or set OPENCODE_BIN.');
 else{
  const result=run(binary,['--version'],{encoding:'utf8',timeout:10000,env});
  const version=String(result.stdout||'').trim().match(/(?:^|[^0-9])(\d+\.\d+\.\d+)\b/)?.[1];
  add('opencode',result.status===0&&version==='2.0.18',version?'OpenCode '+version:'OpenCode version could not be read.','This candidate is verified with official OpenCode 2.0.18. Other versions require compatibility validation; no automatic downgrade is performed.');
 }
 const codex=run('codex',['--version'],{encoding:'utf8',timeout:10000,env});
 const codexVersion=String(codex.stdout||'').trim().match(/(?:^|[^0-9])(\d+\.\d+\.\d+)\b/)?.[1];
 add('codex',codex.status===0&&Boolean(codexVersion),codexVersion?'Codex '+codexVersion:'Codex CLI is not available on PATH.','Install/enable the Codex CLI used for end-to-end verification.');
 return {kind:'bridge-preflight',readOnly:true,prerequisitesReady:checks.every(x=>x.ok),
 desktopInstalled:false,modelAccessVerified:false,checks,
 models:Object.entries(MODEL_PROFILES).map(([id,p])=>({id,name:p.name,context:p.context,autoCompact:p.compact,images:p.images,evidence:p.evidence})),
 next:'Prerequisite checks do not certify login, model access, desktop installation or picker visibility.'};
}
