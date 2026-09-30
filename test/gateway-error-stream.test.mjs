import {test} from 'node:test';import assert from 'node:assert/strict';import {Readable} from 'node:stream';
import {bridgeGatewayErrorTransform} from '../src/gateway-error-stream.mjs';
async function run(chunks,options){let output='';for await(const chunk of Readable.from(chunks).pipe(bridgeGatewayErrorTransform('text/event-stream',options)))output+=chunk;return output;}
for(const [label,message,code] of [['quota','litellm.APIError: OpenCode provider returned HTTP 429.','upstream_access_or_quota'],['deadline','litellm.APIError: Request cancelled or deadline exceeded.','request_cancelled'],['unknown','PRIVATE_PROVIDER_DETAILS','gateway_upstream_error']])test('Recover gateway '+label+' terminal without raw error leakage',async()=>{
 const input='data: '+JSON.stringify({error:{code:'500',message}})+'\r\n\r\n';
 const wire=await run([...Buffer.from(input)].map(x=>Buffer.from([x])));
 assert.ok(wire.includes('response.failed'));assert.ok(wire.includes(code));assert.ok(!wire.includes('response.completed'));assert.ok(!wire.includes('PRIVATE_PROVIDER_DETAILS'));
});
test('Clean SSE and already valid failures remain byte-identical',async()=>{
 for(const wire of ['event: response.failed\ndata: {"type":"response.failed","response":{"error":{"code":"test"}}}\n\n','data: {"type":"response.completed"}\n\n',': heartbeat\n\n','data: malformed\n\n'])assert.equal(await run([wire]),wire);
 assert.equal(bridgeGatewayErrorTransform('application/json'),undefined);
});
test('Recovered terminal uses the next sequence and suppresses a false later completion',async()=>{
 const prefix='data: {"type":"response.created","sequence_number":8}\n\n';
 const result=await run([prefix+'data: {"error":{"message":"unknown"}}\n\ndata: {"type":"response.completed"}\n\n']);
 assert.ok(result.startsWith(prefix));assert.ok(result.includes('"sequence_number":9'));assert.ok(!result.includes('response.completed'));
});
test('Unbounded and oversized frames fail without inventing successful completion',async()=>{
 await assert.rejects(run(['data: '+'x'.repeat(100)],{maxFrameBytes:40}),/bounded parser/);
 await assert.rejects(run(['data: '+'x'.repeat(100)+'\n\n'],{maxFrameBytes:40}),/bounded parser/);
});
