import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {installDesktop} from './desktop-install.mjs';
import {verifyInstalled} from './installed-verification.mjs';

export function onboardingNext(category){
 const actions={
  authentication:'在本地终端运行 bash scripts/start.sh login，选择 OpenCode Zen 并在终端输入自己的 Key。登录后重新运行 setup --live。不要把 Key 发到聊天中。',
  model_access:'当前模型无权限或受地区限制。先在 OpenCode 选择同一模型测试；不要购买其他订阅来盲目重试。见 docs/opencode-access.md。',
  rate_limit:'当前账号或免费模型已限流。等待供应商给出的恢复时间，不要反复安装或切换 Key。',
  legacy_configuration:'检测到不兼容或已有修改的配置。保留现状，使用 README 的诊断 Prompt；不要删除旧目录或覆盖旧供应商。',
  verification_failed:'安装记录已保留。让 Codex 根据验证记录中的失败类别诊断，不要把服务启动当作模型可用。',
  installation_failed:'安装未完成。保留安装记录，用 README 的诊断 Prompt 检查；需要 recover-* 时先执行对应恢复命令。',
 };
 return actions[category]??actions.verification_failed;
}
// One owner of the user-facing sequence; the underlying installer owns all writes.
export async function setupForUser({live=false,directory,routerRoot,models,onProgress=()=>{}}={},
 deps={installDesktop,verifyInstalled,run:spawnSync}){
 if(!live)throw Error('使用 setup --live：安装后会调用所选模型进行验证，使用你自己的额度。');
 for(const command of ['git','python3','codex']){
  const result=deps.run(command,['--version'],{encoding:'utf8',timeout:10000});
  if(result.status!==0)throw Error(`缺少 ${command}。请通过 bash scripts/start.sh setup --live 启动，以检查依赖。`);
 }
 let installed;
 try{
  onProgress({phase:'installing',message:'正在安装或检查已有安装 / Installing or checking existing installation'});
  const root=directory??path.join(os.homedir(),'.local/share/codex-opencode-bridge/desktop');
  const selected=models??(fs.existsSync(path.join(root,'desktop-install.json'))?undefined:['opencode/big-pickle']);
  installed=await deps.installDesktop({directory,routerRoot,models:selected});
 }catch(error){
  const category=/ownership|existing|unowned|compatib|modified|source|reconcil/i.test(error.message)?'legacy_configuration':'installation_failed';
  return {ready:false,installed:false,category,message:error.message,next:onboardingNext(category)};
 }
 try{
  onProgress({phase:'verifying',message:'正在通过真实 Codex 检查文字、文件和适用的图片输入 / Verifying with Codex'});
  const verification=await deps.verifyInstalled({directory,live:true,route:'router',onProgress});
  const category=verification.stopReason??verification.models?.find(x=>!x.passed)?.errorCategory??'verification_failed';
  return {ready:verification.passed,installed:true,reused:installed.reused,models:installed.models,
   verificationReceipt:verification.receipt,checks:verification.models,desktopPickerVerified:false,
   next:verification.passed?'验证通过。完全退出并重新打开 Codex，在模型菜单选择 OpenCode Native Bridge 模型，新建对话试用。':onboardingNext(category),
   ...(!verification.passed?{category}:{})};
 }catch(error){return {ready:false,installed:true,category:'verification_failed',message:error.message,next:onboardingNext('verification_failed')};}
}
