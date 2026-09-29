import {invalid} from './errors.mjs';

// OpenCode AI 2.0.18 Message / ToolCallPart / ToolResultPart wire shapes.
// This is a schema translation, not replay inside the OpenCode agent executor.
export function nativeHistory(history, tools) {
 const messages=[];
 const identities=new Map(tools.map(tool=>[JSON.stringify([tool.namespace||'',tool.name]),tool.relayName]));
 const calls=new Map();
 let historical=0;
 const push=(role,part)=>{
  const last=messages.at(-1);
  if(last?.role===role && (role==='assistant'||role==='tool'))last.content.push(part);
  else messages.push({role,content:[part]});
 };
 for(const item of history){
  if(['function_call','custom_tool_call'].includes(item.type)){
   const key=JSON.stringify([item.namespace||'',item.name]);
   if(!identities.has(key))identities.set(key,`historical_client_${historical++}`);
   const name=identities.get(key);
   let input;
   if(item.type==='custom_tool_call')input={input:item.input};
   else {try{input=JSON.parse(item.arguments);}catch{throw invalid('Historical tool arguments must be valid JSON.');}}
   calls.set(item.call_id,name);
   push('assistant',{type:'tool-call',id:item.call_id,name,input});
  }else if(['function_call_output','custom_tool_call_output'].includes(item.type)){
   const name=calls.get(item.call_id);
   if(!name)throw invalid('Historical result has no tool call.');
   push('tool',{type:'tool-result',id:item.call_id,name,result:{type:'text',value:item.output}});
  }else {
   // OpenCode has one operator-instruction role; developer and system both
   // use it. Tool/user content is never promoted to that role.
   const role=item.role==='developer'?'system':item.role;
   if(Array.isArray(item.content)) messages.push({role,content:item.content});
   else push(role,{type:'text',text:item.content});
  }
 }
 return messages;
}
