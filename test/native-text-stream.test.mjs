import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NativeTextStream} from '../src/native-text-stream.mjs';
const message=(id,text)=>({id,type:'assistant',content:[{type:'text',text}]});

test('Native snapshots emit growing text and dispatch continuations once',async()=>{
 const stream=new NativeTextStream(1000),deltas=[];
 const send=async text=>deltas.push(text);
 await stream.update([message('a','你')],send);
 await stream.update([message('a','你好')],send);
 await stream.update([message('a','你好'),message('b','Next')],send);
 await stream.update([message('a','你好'),message('b','Next step')],send);
 await stream.update([message('a','你好'),message('b','Next step')],send);
 assert.deepEqual(deltas,['你','好','\n\nNext',' step']);
});

test('Rewritten, removed and reordered messages fail instead of corrupting streamed output',async()=>{
 for(const next of [[message('a','changed')],[],[message('b','hello')]]){
  const stream=new NativeTextStream(1000);await stream.update([message('a','hello')],async()=>{});
  await assert.rejects(stream.update(next,async()=>assert.fail('No corrupt delta')),{code:'non_append_output'});
 }
});

test('Byte limit applies across assistant steps and backpressure must settle before progress',async()=>{
 const stream=new NativeTextStream(8);
 let release;const blocked=new Promise(resolve=>{release=resolve;});
 const sending=stream.update([message('a','你')],()=>blocked);
 assert.equal(stream.text,'');release();await sending;assert.equal(stream.text,'你');
 await assert.rejects(stream.update([message('a','你'),message('b','你好')],async()=>assert.fail('Over budget')),{code:'output_too_large'});
});
