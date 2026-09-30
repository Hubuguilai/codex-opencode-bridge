import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { createBridge } from '../src/server.mjs';
import { OpenCodeBackend } from '../src/opencode.mjs';
import { normalizeRequest } from '../src/protocol.mjs';

const model = 'opencode/test-model';
const config = { host: '127.0.0.1', port: 0, token: 'local-test-token-not-a-real-key', models: [model],
  maxBodyBytes: 4096, maxConcurrent: 2, timeoutMs: 2000 };
const payload = { model, messages: [{ role: 'user', content: '你好' }] };
async function fixture(t, handler, overrides = {}) {
  const calls = [];
  let polls = 0;
  const upstream = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    calls.push({ path: req.url, method: req.method, body });
    res.setHeader('content-type', 'application/json');
    if (handler && await handler(req, res, body)) return;
    let result = {};
    if (req.url === '/api/info') result = { version: '2.0.18' };
    else if (req.url === '/api/session') result = { data: { id: body.id } };
    else if (req.url.endsWith('/message?limit=100&order=asc')) {
      polls++;
      result = { data: [{ type: 'assistant', content: [{ type: 'text', text: polls === 1 ? '你' : '你好' }],
        time: polls === 1 ? {} : { completed: Date.now() }, finish: 'stop', tokens: { input: 5, output: 2, reasoning: 3 } }] };
    }
    res.end(JSON.stringify(result));
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const backend = new OpenCodeBackend({ url: `http://127.0.0.1:${upstream.address().port}`, password: 'test',
    directory: '/tmp/bridge-fixture', pollMs: 20 });
  const bridge = createBridge({ ...config, ...overrides }, backend);
  const address = await bridge.listen();
  t.after(async () => { await bridge.close(); upstream.closeAllConnections(); await new Promise(r => upstream.close(r)); });
  const request = (path, body, extra = {}) => fetch(`http://127.0.0.1:${address.port}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json', ...extra.headers },
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== 'headers')),
  });
  return { request, calls, backend, bridge };
}

test('Chat preserves Unicode and usage and deletes the session', async t => {
  const { request, calls } = await fixture(t);
  const response = await request('/v1/chat/completions', payload);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.choices[0].message.content, '你好');
  assert.equal(body.usage.total_tokens, 10);
  const create = calls.find(x => x.path === '/api/session');
  assert.equal(create.body.agent, 'plan');
  assert.equal(calls.at(-1).method, 'DELETE');
});

test('Responses streams incremental deltas and complete event in order', async t => {
  const { request } = await fixture(t);
  const response = await request('/v1/responses', { model, input: 'Hello', stream: true, store: false });
  const events = (await response.text()).split('\n').filter(x => x.startsWith('data: ')).map(x => JSON.parse(x.slice(6)));
  assert.equal(events[0].type, 'response.created');
  assert.deepEqual(events.map(x => x.sequence_number), events.map((_, i) => i));
  assert.deepEqual(events.filter(x => x.type === 'response.output_text.delta').map(x => x.delta), ['你', '好']);
  assert.equal(events.at(-1).response.output[0].content[0].text, '你好');
  assert.equal(events.at(-1).type, 'response.completed');
});

test('Chat SSE includes usage when requested and DONE', async t => {
  const { request } = await fixture(t);
  const response = await request('/v1/chat/completions', { ...payload, stream: true, stream_options: { include_usage: true } });
  const wire = await response.text();
  assert.match(wire, /"content":"你"/); assert.match(wire, /"content":"好"/);
  assert.match(wire, /"total_tokens":10/); assert.ok(wire.endsWith('data: [DONE]\n\n'));
});

test('Non-streaming Responses supports instructions and assistant history', async t => {
  const { request, calls } = await fixture(t);
  const response = await request('/v1/responses', { model, instructions: 'Be concise', input: [
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Earlier' }] },
    { role: 'user', content: [{ type: 'input_text', text: 'Continue' }] },
  ] });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'completed');
  const prompt = calls.find(x => x.path.endsWith('/prompt')).body.text;
  assert.match(prompt, /Be concise/); assert.match(prompt, /Earlier/); assert.match(prompt, /Continue/);
});

test('Authentication and browser origin requests fail before upstream access', async t => {
  const { request, calls } = await fixture(t);
  assert.equal((await request('/v1/models', undefined, { headers: { authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await request('/v1/models', undefined, { headers: { origin: 'https://example.com' } })).status, 403);
  assert.equal(calls.length, 0);
});

test('Malformed and unsupported input never creates an upstream session', async t => {
  const { request, calls } = await fixture(t);
  for (const [body, status] of [
    ['{broken', 400], [null, 400], [{ ...payload, model: 'missing/model' }, 404],
    [{ ...payload, tools: [{ type: 'function' }] }, 422], [{ ...payload, reasoning_effort: 'high' }, 422],
    [{ ...payload, messages: [{ role: 'user', content: [{ type: 'input_image', image_url: 'x' }] }] }, 422],
    [{ ...payload, messages: [{ role: 'user', content: '中'.repeat(2000) }] }, 413],
  ]) assert.equal((await request('/v1/chat/completions', body)).status, status);
  assert.equal(calls.length, 0);
});

test('Does not silently truncate long text', () => {
  const content = '古'.repeat(1000);
  assert.ok(normalizeRequest({ ...payload, messages: [{ role: 'user', content }] }, 'chat', config).prompt.includes(content));
  assert.throws(() => normalizeRequest({ ...payload, messages: [{ role: 'user', content: content.repeat(2) }] }, 'chat', config), { status: 413 });
});

test('Health checks upstream; an HTML SPA fallback is not healthy', async t => {
  const { request } = await fixture(t, (req, res) => {
    if (req.url !== '/api/info') return false;
    res.setHeader('content-type', 'text/html'); res.end('<html>SPA</html>'); return true;
  });
  assert.equal((await request('/health')).status, 503);
});

test('Upstream errors are redacted; session is interrupted and deleted', async t => {
  const { request, calls } = await fixture(t, (req, res) => {
    if (!req.url.endsWith('/prompt')) return false;
    res.statusCode = 403; res.end(JSON.stringify({ secret: 'do-not-leak-this' })); return true;
  });
  const response = await request('/v1/chat/completions', payload);
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /do-not-leak/);
  assert.ok(calls.some(x => x.path.endsWith('/interrupt')));
  assert.equal(calls.at(-1).method, 'DELETE');
});

test('Stream failures do not emit a successful completed/DONE event', async t => {
  const { request } = await fixture(t, (req, res) => {
    if (!req.url.endsWith('/prompt')) return false;
    res.statusCode = 500; res.end('{}'); return true;
  });
  const response = await request('/v1/responses', { model, input: 'hello', stream: true });
  const wire = await response.text();
  assert.match(wire, /response.failed/); assert.doesNotMatch(wire, /response.completed/);
});

test('Client cancellation interrupts and deletes an active session', async t => {
  const { request, calls } = await fixture(t, (req, res) => {
    if (!req.url.endsWith('/message?limit=100&order=asc')) return false;
    res.end(JSON.stringify({ data: [] })); return true;
  });
  const controller = new AbortController();
  const response = await request('/v1/responses', { model, input: 'hello', stream: true }, { signal: controller.signal });
  const consuming = response.text().catch(() => {});
  for (let i = 0; i < 100 && !calls.some(x => x.path.endsWith('/prompt')); i++) await delay(10);
  controller.abort(); await consuming;
  for (let i = 0; i < 100 && !calls.some(x => x.method === 'DELETE'); i++) await delay(10);
  assert.ok(calls.some(x => x.path.endsWith('/interrupt')));
  assert.ok(calls.some(x => x.method === 'DELETE'));
});

test('Model listing only includes explicitly enabled IDs and no invented token limits', async t => {
  const { request } = await fixture(t);
  const response = await request('/v1/models');
  const { data } = await response.json();
  assert.deepEqual(data.map(x => x.id), [model]);
  assert.equal(data[0].context_length, undefined);
});

test('Upstream HTTP 204 deletion is successful cleanup', async t => {
  const { request, backend } = await fixture(t, (req, res) => {
    if (req.method !== 'DELETE') return false;
    res.statusCode = 204; res.removeHeader('content-type'); res.end(); return true;
  });
  const warnings = []; backend.warn = code => warnings.push(code);
  assert.equal((await request('/v1/chat/completions', payload)).status, 200);
  assert.deepEqual(warnings, []);
});

test('Generation timeout interrupts, cleans up and returns 504', async t => {
  const { request, calls } = await fixture(t, (req, res) => {
    if (!req.url.endsWith('/message?limit=100&order=asc')) return false;
    res.end('{"data":[]}'); return true;
  }, { timeoutMs: 80 });
  assert.equal((await request('/v1/chat/completions', payload)).status, 504);
  assert.ok(calls.some(x => x.path.endsWith('/interrupt')));
  assert.equal(calls.at(-1).method, 'DELETE');
});

test('Concurrent overflow is rejected without creating another session', async t => {
  const { request, calls } = await fixture(t, (req, res) => {
    if (!req.url.endsWith('/message?limit=100&order=asc')) return false;
    res.end('{"data":[]}'); return true;
  }, { maxConcurrent: 1, timeoutMs: 200 });
  const first = await request('/v1/responses', { model, input: 'hello', stream: true });
  assert.equal((await request('/v1/chat/completions', payload)).status, 429);
  await first.text();
  assert.equal(calls.filter(x => x.path === '/api/session').length, 1);
});

for (const status of [401,403,429]) test(`Upstream HTTP ${status} is explicit in JSON and SSE without exposing provider text or retrying`, async t => {
  const { request,calls } = await fixture(t, (req, res) => {
    if (!req.url.endsWith('/message?limit=100&order=asc')) return false;
    res.end(JSON.stringify({ data: [
      { type: 'idle', outcome: 'failed' },
      { type: 'assistant', finish: 'error', error: { status, message: 'private upstream detail' } },
    ] })); return true;
  });
  const response = await request('/v1/chat/completions', payload);
  assert.equal(response.status, status);
  const error=(await response.json()).error;
  assert.equal(error.code,'upstream_access_or_quota');assert.match(error.message,new RegExp('HTTP '+status));
  assert.doesNotMatch(error.message,/private upstream detail/);
  assert.match(error.message,status===401?/authentication was rejected/:status===403?/access was rejected/:/rate or quota limit/);
  const stream=await request('/v1/responses',{model,input:'test',stream:true});
  const wire=await stream.text();assert.match(wire,/response.failed/);assert.match(wire,new RegExp('HTTP '+status));assert.doesNotMatch(wire,/private upstream detail/);
  assert.equal(calls.filter(call=>call.path==='/api/session').length,2);
});

for(const scenario of [
 {type:'provider.invalid-request',status:400,message:'Maximum context length exceeded. PRIVATE_SENTINEL',code:'context_length_exceeded',http:400},
 {type:'provider.invalid-request',status:422,message:'Invalid schema for function example. PRIVATE_SENTINEL',code:'upstream_tool_schema',http:422},
 {type:'provider.invalid-request',status:400,message:'Unrecognized setting PRIVATE_SENTINEL',code:'generation_failed',http:502},
 {type:'unknown',status:500,message:'context_length_exceeded PRIVATE_SENTINEL',code:'generation_failed',http:502},
])test(`Provider error ${scenario.code}/${scenario.status} has a safe JSON/SSE outcome`,async t=>{
 const {request,calls}=await fixture(t,(req,res)=>{
  if(!req.url.endsWith('/message?limit=100&order=asc'))return false;
  res.end(JSON.stringify({data:[{type:'assistant',finish:'error',error:{type:scenario.type,status:scenario.status,message:scenario.message}}]}));return true;
 });
 const response=await request('/v1/responses',{model,input:'test'});assert.equal(response.status,scenario.http);
 const error=(await response.json()).error;assert.equal(error.code,scenario.code);assert.ok(!JSON.stringify(error).includes('PRIVATE_SENTINEL'));
 const stream=await request('/v1/responses',{model,input:'test',stream:true}),wire=await stream.text();
 assert.ok(wire.includes('response.failed'));assert.ok(wire.includes(scenario.code));assert.ok(!wire.includes('response.completed'));assert.ok(!wire.includes('PRIVATE_SENTINEL'));
 assert.equal(calls.filter(x=>x.path==='/api/session').length,2);
});

test('Changed upstream text fails instead of silently corrupting a streamed answer', async t => {
  let n = 0;
  const { request } = await fixture(t, (req, res) => {
    if (!req.url.endsWith('/message?limit=100&order=asc')) return false;
    res.end(JSON.stringify({ data: [{ type: 'assistant', content: [{ type: 'text', text: n++ === 0 ? 'abc' : 'xyz' }], time: {} }] })); return true;
  });
  const response = await request('/v1/responses', { model, input: 'hello', stream: true });
  const wire = await response.text();
  assert.match(wire, /non_append_output/); assert.doesNotMatch(wire, /response.completed/);
});

test('Known create session is cleaned even if client cancelled while creation completed', async t => {
  const { backend, calls } = await fixture(t, async (req) => {
    if (req.url === '/api/session') await delay(40);
    return false;
  });
  const controller = new AbortController();
  const pending = backend.generate({ model, prompt: 'hello' }, { signal: controller.signal, onDelta: () => {} });
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(pending);
  assert.equal(calls.at(-1).method, 'DELETE');
  assert.ok(!calls.some(x => x.path.endsWith('/prompt')));
});


test('Lost creation reply still cleans the committed client-selected session without sending a prompt',async t=>{
 const {backend,calls}=await fixture(t,async(req,res)=>{
  if(req.url==='/api/session'){res.destroy();return true;}return false;
 });
 await assert.rejects(backend.generate({model,prompt:'not sent'},{signal:AbortSignal.timeout(1000),onDelta:()=>{}}));
 const created=calls.find(x=>x.path==='/api/session');assert.match(created.body.id,/^ses_[a-f0-9]{12}[A-Za-z0-9]{14}$/);
 assert.deepEqual(calls.slice(-2).map(x=>[x.path,x.method]),[[`/api/session/${created.body.id}/interrupt`,'POST'],[`/api/session/${created.body.id}`,'DELETE']]);
 assert.equal(calls.some(x=>x.path.endsWith('/prompt')),false);
});

test('Mismatched creation identity fails without prompting or deleting the returned unrelated ID',async t=>{
 const {backend,calls}=await fixture(t,async(req,res)=>{
  if(req.url==='/api/session'){res.end(JSON.stringify({data:{id:'ses_unrelated'}}));return true;}return false;
 });
 await assert.rejects(backend.generate({model,prompt:'not sent'},{signal:AbortSignal.timeout(1000),onDelta:()=>{}}),{code:'opencode_protocol_error'});
 assert.equal(calls.some(x=>x.path.includes('ses_unrelated')||x.path.endsWith('/prompt')),false);
 assert.equal(calls.at(-1).path,'/api/session/'+calls[0].body.id);
});
