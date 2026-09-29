import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {NativeEvents} from '../src/native-events.mjs';
const event=(type,extra={})=>({type:'session.text.'+type,data:{sessionID:'ses_test',assistantMessageID:'msg_test',ordinal:0,...extra}});
function fixture(overrides={}){const deltas=[];const live=new NativeEvents({url:'http://unused',authorization:'test',sessionID:'ses_test',signal:new AbortController().signal,onDelta:async delta=>deltas.push(delta),maxBytes:1000,...overrides});return{live,deltas};}

test('Live text is session scoped and reconciles with final snapshots without duplicates',async()=>{
 const {live,deltas}=fixture();
 await live.accept(event('started'));
 await live.accept({...event('delta',{delta:'other'}),data:{...event('delta').data,sessionID:'ses_other',delta:'other'}});
 await live.accept({type:'session.reasoning.delta',data:{...event('delta').data,delta:'private reasoning'}});
 await live.accept(event('delta',{delta:'你'}));
 await live.accept(event('delta',{delta:'好'}));
 await live.accept(event('ended',{text:'你好'}));
 await live.finish([{id:'msg_test',content:[{type:'text',text:'你好'}]}]);
 assert.deepEqual(deltas,['你','好']);
});

test('Missing start, rewritten full text and final snapshot mismatch fail closed',async()=>{
 const missing=fixture().live;await assert.rejects(missing.accept(event('delta',{delta:'x'})),{code:'event_stream_gap'});
 const {live}=fixture();await live.accept(event('started'));await live.accept(event('delta',{delta:'hello'}));
 await assert.rejects(live.accept(event('ended',{text:'different'})),{code:'non_append_output'});
 await assert.rejects(live.finish([{id:'msg_test',content:[{type:'text',text:'different'}]}]),{code:'non_append_output'});
});

test('SSE reader handles chunked CRLF and fails on connection loss instead of reconnecting',async t=>{
 let requests=0;const server=http.createServer((req,res)=>{
  requests++;assert.equal(req.url,'/api/event');assert.equal(req.headers.authorization,'test');
  res.writeHead(200,{'content-type':'text/event-stream'});
  const wire='data: '+JSON.stringify(event('started'))+'\r\n\r\n'+'data: '+JSON.stringify(event('delta',{delta:'你好'}))+'\r\n\r\n';
  res.write(wire.slice(0,7));res.end(wire.slice(7));
 });server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const {live,deltas}=fixture({url:`http://127.0.0.1:${server.address().port}`});
 await live.open();await live.pump;
 assert.deepEqual(deltas,['你好']);assert.throws(()=>live.assertHealthy(),{code:'event_stream_disconnected'});assert.equal(requests,1);
});

test('Cancellation closes an idle upstream event subscription',async t=>{
 let closed;const done=new Promise(resolve=>{closed=resolve;});
 const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/event-stream'});res.write(': connected\n\n');res.on('close',closed);});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const {live}=fixture({url:`http://127.0.0.1:${server.address().port}`});await live.open();await live.stop();
 await Promise.race([done,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Subscription leaked')),500))]);
 assert.equal(live.error,undefined);
});
