import {Transform} from 'node:stream';
// Scoped by the caller to owned bridge routes. The gateway loses Responses
// terminal errors; recover only known safe categories, never relay raw details.
export function gatewayFailure(error){
 const message=typeof error?.message==='string'?error.message:'';
 const status=/provider returned HTTP (401|403|429)\b/i.exec(message)?.[1];
 if(status)return {code:'upstream_access_or_quota',message:`OpenCode provider returned HTTP ${status}: ${status==='401'?'authentication rejected':status==='403'?'model access rejected':'rate or quota limit reached'}.`};
 if(/Request cancelled or deadline exceeded\./.test(message))return {code:'request_cancelled',message:'Request cancelled or deadline exceeded.'};
 if(/provider explicitly reported that the input exceeds its context limit/i.test(message))return {code:'context_length_exceeded',message:'The provider explicitly reported that the input exceeds its context limit. Compact the conversation in Codex.'};
 return {code:'gateway_upstream_error',message:'The gateway reported an upstream failure. Inspect protected bridge service diagnostics for the safe failure code.'};
}
export function bridgeGatewayErrorTransform(contentType,{maxFrameBytes=1024*1024}={}){
 if(!String(contentType).includes('text/event-stream'))return undefined;
 let pending=Buffer.alloc(0),sequence=0,failed=false;
 function frame(bytes){
  if(failed)return;
  let value;
  try{const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);const data=text.split(/\r?\n/).filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trimStart()).join('\n');value=JSON.parse(data);}catch{this.push(bytes);return;}
  if(Number.isSafeInteger(value.sequence_number))sequence=Math.max(sequence,value.sequence_number+1);
  if(!value.type&&value.error&&typeof value.error==='object'){
   failed=true;
   const event={type:'response.failed',sequence_number:sequence,response:{status:'failed',error:gatewayFailure(value.error)}};
   this.push('event: response.failed\ndata: '+JSON.stringify(event)+'\n\n');return;
  }
  this.push(bytes);
 }
 return new Transform({transform(chunk,encoding,done){
  try{
   if(failed){done();return;}
   pending=Buffer.concat([pending,chunk]);
   while(pending.length){
    const a=pending.indexOf('\n\n'),b=pending.indexOf('\r\n\r\n');
    const index=b!==-1&&(a===-1||b<a)?b:a,sep=index===b?4:2;
    if(index===-1){if(pending.length>maxFrameBytes)throw Error('Gateway SSE frame exceeds its bounded parser limit.');break;}
    if(index+sep>maxFrameBytes)throw Error('Gateway SSE frame exceeds its bounded parser limit.');
    frame.call(this,pending.subarray(0,index+sep));pending=pending.subarray(index+sep);
    if(failed){pending=Buffer.alloc(0);break;}
   }
   done();
  }catch(error){done(error);}
 },flush(done){try{if(pending.length&&!failed)frame.call(this,pending);done();}catch(error){done(error);}}});
}
