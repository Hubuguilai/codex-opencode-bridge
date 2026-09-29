import {BridgeError} from './errors.mjs';

// OpenCode returns cumulative message snapshots. Only append verified new text;
// never re-emit an old assistant message when a dispatch continuation appears.
export class NativeTextStream {
  constructor(maxBytes) { this.maxBytes=maxBytes; this.seen=[]; this.text=''; }
  async update(assistants,onDelta) {
    const next=assistants.map(message=>({id:message.id,text:(message.content||[])
      .filter(part=>part.type==='text'&&typeof part.text==='string').map(part=>part.text).join('')}));
    if(next.length<this.seen.length)throw new BridgeError(502,'non_append_output','Upstream removed an already-observed assistant message.');
    for(const [i,old] of this.seen.entries()) {
      if((old.id!==undefined&&next[i].id!==old.id)||!next[i].text.startsWith(old.text))
        throw new BridgeError(502,'non_append_output','Upstream changed already-delivered text.');
    }
    const text=next.map(message=>message.text).filter(Boolean).join('\n\n');
    if(!text.startsWith(this.text))throw new BridgeError(502,'non_append_output','Upstream changed assistant message order.');
    if(Buffer.byteLength(text)>this.maxBytes)throw new BridgeError(502,'output_too_large','Output exceeded the configured byte limit.');
    const delta=text.slice(this.text.length);
    if(delta)await onDelta(delta);
    this.seen=next;this.text=text;
  }
}
