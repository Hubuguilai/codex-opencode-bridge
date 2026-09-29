import {BridgeError} from './errors.mjs';
import {NativeTextStream} from './native-text-stream.mjs';

// Subscribe before prompting: the official v2 text deltas are live-only and are
// not present in message-query snapshots. Never reconnect across a possible gap.
export class NativeEvents {
  constructor({url,authorization,sessionID,signal,onDelta,maxBytes}) {
    Object.assign(this,{url,authorization,sessionID,signal,onDelta,maxBytes});
    this.controller=new AbortController();this.messages=new Map();this.output=new NativeTextStream(maxBytes);
  }
  async open(){
    const response=await fetch(this.url+'/api/event',{headers:{authorization:this.authorization,accept:'text/event-stream'},redirect:'error',signal:AbortSignal.any([this.signal,this.controller.signal])});
    if(!response.ok||!response.headers.get('content-type')?.includes('text/event-stream')){
      await response.body?.cancel();throw new BridgeError(502,'event_stream_unavailable','OpenCode live event stream is unavailable.');
    }
    this.pump=this.consume(response.body).catch(error=>{if(!this.controller.signal.aborted)this.error=error;});
  }
  async consume(body){
    let pending='';const decoder=new TextDecoder();this.reader=body.getReader();
    while(true){
      const {value,done}=await this.reader.read();
      if(done)break;
      pending+=decoder.decode(value,{stream:true});
      if(Buffer.byteLength(pending)>this.maxBytes+65536)throw new BridgeError(502,'event_too_large','OpenCode event exceeded the configured byte limit.');
      let match;
      while((match=/\r?\n\r?\n/.exec(pending))){
        const block=pending.slice(0,match.index);pending=pending.slice(match.index+match[0].length);
        const data=block.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
        if(!data)continue;
        let event;try{event=JSON.parse(data);}catch{throw new BridgeError(502,'invalid_event','OpenCode sent a malformed event.');}
        await this.accept(event);
      }
    }
    if(!this.controller.signal.aborted)throw new BridgeError(502,'event_stream_disconnected','OpenCode live events disconnected; no automatic replay was attempted.');
  }
  async accept(event){
    const data=event.data;
    if(data?.sessionID!==this.sessionID||!['session.text.started','session.text.delta','session.text.ended'].includes(event.type))return;
    if(typeof data.assistantMessageID!=='string'||!Number.isInteger(data.ordinal)||data.ordinal<0)throw new BridgeError(502,'invalid_event','Invalid OpenCode text event identity.');
    let parts=this.messages.get(data.assistantMessageID);
    if(!parts){parts=new Map();this.messages.set(data.assistantMessageID,parts);}
    if(event.type==='session.text.started'){
      if(parts.has(data.ordinal))throw new BridgeError(502,'invalid_event','Duplicate OpenCode text start.');
      parts.set(data.ordinal,'');return;
    }
    if(!parts.has(data.ordinal))throw new BridgeError(502,'event_stream_gap','Text delta arrived without its start; refusing an incomplete stream.');
    if(event.type==='session.text.delta'){
      if(typeof data.delta!=='string')throw new BridgeError(502,'invalid_event','Invalid OpenCode text delta.');
      parts.set(data.ordinal,parts.get(data.ordinal)+data.delta);
    }else{
      if(typeof data.text!=='string'||!data.text.startsWith(parts.get(data.ordinal)))throw new BridgeError(502,'non_append_output','OpenCode changed live text at completion.');
      parts.set(data.ordinal,data.text);
    }
    const messages=[...this.messages].map(([id,parts])=>({id,content:[...parts].sort(([a],[b])=>a-b).map(([,text])=>({type:'text',text}))}));
    await this.output.update(messages.filter(message=>message.content.some(part=>part.text)),this.onDelta);
  }
  assertHealthy(){this.signal.throwIfAborted();if(this.error)throw this.error;}
  async finish(assistants){
    await this.stop();this.assertHealthy();
    await this.output.update(assistants.filter(message=>(message.content||[]).some(part=>part.type==='text'&&part.text)),this.onDelta);
  }
  async stop(){
    this.controller.abort();
    // Explicitly cancel the reader: aborting fetch alone can leave a transformed
    // stream pending when a terminal snapshot races its last live event.
    await this.reader?.cancel().catch(()=>{});
    await this.pump;
  }
}
