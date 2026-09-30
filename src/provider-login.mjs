import {spawnSync} from 'node:child_process';
import {installRuntime} from './runtime-install.mjs';
// Interactive only: no secret argument, logging, IPC or chat input.
export function loginProvider({tty=process.stdin.isTTY,run=spawnSync,install=installRuntime}={}){
 if(!tty)throw Error('请在你自己可输入的本地终端运行 bash scripts/start.sh login；Key 只输入终端，不发给 Codex。');
 const {binary}=install();
 const result=run(binary,['auth','login','--provider','opencode'],{stdio:'inherit'});
 if(result.status!==0)throw Error('OpenCode 登录未完成。保留原凭据，请在本地终端重试。');
 return {loginCompleted:true,modelAccessVerified:false,next:'回到原 Codex 对话，让它继续 setup --live。'};
}
