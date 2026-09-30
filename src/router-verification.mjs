import fs from 'node:fs';import path from 'node:path';
import {loadRouter,verifyRouterSelection} from './router-registration.mjs';
export async function routerVerificationRoute(record,{load=loadRouter,verify=verifyRouterSelection}={}){
 const api=await load(record.routerRoot);verify(record.plan,{api});
 const plan=JSON.parse(fs.readFileSync(path.join(record.plan,'router-plan.json')));
 if(JSON.stringify(plan.models.map(x=>x.upstreamModel))!==JSON.stringify(record.models))throw Error('Router and installed model selections differ.');
 const secret=api.paths.CALLER_SECRET_PATH,stat=fs.lstatSync(secret);
 if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw Error('Router caller credential is not a protected regular file.');
 const token=fs.readFileSync(secret,'utf8').trim();if(token.length<24||/\s/.test(token))throw Error('Router caller credential is invalid.');
 const port=Number(api.paths.PORTS.router);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Router port is invalid.');
 const catalog=JSON.parse(fs.readFileSync(api.paths.MERGED_CATALOG_PATH));
 const models=plan.models.map(model=>{
  const entry=catalog.models.find(x=>x.slug===model.slug&&x.visibility==='list');
  if(!entry)throw Error('Requested model is missing from the published Router catalog.');
  return {id:model.upstreamModel,model:model.slug,entry,images:model.inputModalities?.includes('image')===true,routerAdvertisesImages:entry.input_modalities?.includes('image')===true};
 });
 return {baseUrl:`http://127.0.0.1:${port}/v1`,token,models,name:'codex_router_gateway_forwarder_installed_bridge'};
}
