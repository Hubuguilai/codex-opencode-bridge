import { randomUUID } from 'node:crypto';
import { invalid, unsupported, BridgeError } from './errors.mjs';

function textContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) throw invalid('Message content must be text or text parts.');
  return content.map(part => {
    if (!part || !['text', 'input_text', 'output_text'].includes(part.type) || typeof part.text !== 'string') {
      throw unsupported('Only text content is supported; images, files and audio are not accepted.');
    }
    return part.text;
  }).join('\n');
}

export function normalizeRequest(payload, api, config) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw invalid('Expected a JSON object.');
  if (typeof payload.model !== 'string' || !config.models.includes(payload.model)) {
    throw new BridgeError(404, 'model_not_found', 'Choose an enabled provider/model ID from /v1/models.');
  }
  if (payload.stream !== undefined && typeof payload.stream !== 'boolean') throw invalid('stream must be boolean.');
  if (payload.tools !== undefined && (!Array.isArray(payload.tools) || payload.tools.length)) {
    throw unsupported('Native tool forwarding is not implemented. Use text-only mode.');
  }
  if (payload.tool_choice !== undefined && payload.tool_choice !== 'none' && payload.tool_choice !== 'auto') {
    throw unsupported('Tool selection is not supported.');
  }
  for (const key of ['functions', 'function_call', 'previous_response_id', 'conversation', 'reasoning', 'reasoning_effort',
    'temperature', 'top_p', 'max_tokens', 'max_completion_tokens', 'max_output_tokens', 'stop', 'response_format', 'text', 'seed', 'logprobs']) {
    if (payload[key] !== undefined && payload[key] !== null) throw unsupported(`${key} is not supported by this session adapter.`);
  }
  if (payload.n !== undefined && payload.n !== 1) throw unsupported('Only one completion is supported.');
  if (payload.store === true || payload.background === true) throw unsupported('Stored or background responses are not supported.');
  let messages;
  if (api === 'responses') {
    messages = typeof payload.input === 'string' ? [{ role: 'user', content: payload.input }] : payload.input;
  } else messages = payload.messages;
  if (!Array.isArray(messages) || !messages.length) throw invalid('A nonempty message/input list is required.');
  const normalized = messages.map(message => {
    if (!message || (message.type && message.type !== 'message') || message.tool_calls || message.tool_call_id || message.function_call) {
      throw unsupported('Only ordinary text messages are supported.');
    }
    if (!['system', 'developer', 'user', 'assistant'].includes(message.role)) throw invalid('Unsupported message role.');
    return { role: message.role, content: textContent(message.content) };
  });
  if (api === 'responses' && payload.instructions !== undefined) {
    if (typeof payload.instructions !== 'string') throw invalid('instructions must be text.');
    normalized.unshift({ role: 'system', content: payload.instructions });
  }
  if (!normalized.some(x => x.content.trim())) throw invalid('No text was provided.');
  // The session API accepts a single user prompt. This serialization preserves
  // content but is not equivalent to native system/developer-role semantics.
  const prompt = 'Answer the final user request in the supplied conversation. Return text only. Do not use tools.\n'
    + JSON.stringify({ conversation: normalized });
  if (Buffer.byteLength(prompt) > config.maxBodyBytes) throw new BridgeError(413, 'input_too_large', 'Input exceeds the configured byte limit; nothing was truncated.');
  return { model: payload.model, prompt, stream: payload.stream === true, includeUsage: payload.stream_options?.include_usage === true };
}

export function usage(tokens = {}) {
  const nonnegative = x => typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0;
  const input = nonnegative(tokens.input);
  const output = nonnegative(tokens.output);
  const reasoning = nonnegative(tokens.reasoning);
  // OpenCode reports visible output and reasoning separately.
  return { input_tokens: input, output_tokens: output + reasoning, total_tokens: input + output + reasoning,
    output_tokens_details: { reasoning_tokens: reasoning } };
}

export function makeWriter(res, api, request) {
  const id = `${api === 'responses' ? 'resp' : 'chatcmpl'}_${randomUUID().replaceAll('-', '')}`;
  const itemId = `msg_${randomUUID().replaceAll('-', '')}`;
  const created = Math.floor(Date.now() / 1000);
  let sequence = 0, text = '', textStarted = false, toolCalls = [];
  const part = () => ({ type: 'output_text', text, annotations: [], logprobs: [] });
  const item = status => ({ id: itemId, type: 'message', role: 'assistant', status, content: [part()] });
  const output = status => [...(textStarted ? [item(status)] : []), ...toolCalls];
  const response = (status, tokens) => ({ id, object: 'response', created_at: created, model: request.model,
    status, error: null, incomplete_details: null, output: status === 'in_progress' ? [] : output(status),
    parallel_tool_calls: false, store: false,
    ...(tokens ? { usage: usage(tokens) } : {}) });
  const event = (type, value) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence++, ...value })}\n\n`);
  const chunk = (delta, finish = null) => res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk',
    created, model: request.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
  const indices = { item_id: itemId, output_index: 0, content_index: 0 };
  if (request.stream) {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'x-accel-buffering': 'no' });
    res.flushHeaders();
    if (api === 'responses') {
      event('response.created', { response: response('in_progress') });
      event('response.in_progress', { response: response('in_progress') });
    } else chunk({ role: 'assistant' });
  }
  function startText() {
    if (textStarted) return;
    textStarted = true;
    if (request.stream && api === 'responses') {
      event('response.output_item.added', { output_index: 0, item: { ...item('in_progress'), content: [] } });
      event('response.content_part.added', { ...indices, part: part() });
    }
  }
  function finishText() {
    if (request.stream && api === 'responses' && textStarted) {
      event('response.output_text.done', { ...indices, text, logprobs: [] });
      event('response.content_part.done', { ...indices, part: part() });
      event('response.output_item.done', { output_index: 0, item: item('completed') });
    }
  }
  const chatCalls = () => toolCalls.map(call => ({ id: call.call_id, type: 'function', function: { name: call.name, arguments: call.arguments } }));
  return {
    delta(value) {
      startText(); text += value;
      if (!request.stream) return;
      if (api === 'responses') event('response.output_text.delta', { ...indices, delta: value, logprobs: [] });
      else chunk({ content: value });
    },
    calls(calls) {
      toolCalls = calls;
    },
    finish(tokens) {
      if (!textStarted && !toolCalls.length) startText();
      const u = tokens ? usage(tokens) : null;
      const chatUsage = u ? { prompt_tokens: u.input_tokens, completion_tokens: u.output_tokens,
        total_tokens: u.total_tokens, completion_tokens_details: u.output_tokens_details } : undefined;
      if (!request.stream) return json(res, 200, api === 'responses' ? response('completed', tokens) : {
        id, object: 'chat.completion', created, model: request.model,
        choices: [{ index: 0, message: { role: 'assistant', content: text || null, ...(toolCalls.length ? { tool_calls: chatCalls() } : {}) },
          finish_reason: toolCalls.length ? 'tool_calls' : 'stop' }], ...(chatUsage ? { usage: chatUsage } : {}),
      });
      if (api === 'responses') {
        finishText();
        for (const [index, call] of toolCalls.entries()) {
          const output_index = (textStarted ? 1 : 0) + index;
          const custom = call.type === 'custom_tool_call';
          const key = custom ? 'input' : 'arguments';
          const stem = custom ? 'response.custom_tool_call_input' : 'response.function_call_arguments';
          event('response.output_item.added', { output_index, item: { ...call, [key]: '' } });
          event(`${stem}.delta`, { item_id: call.id, output_index, delta: call[key] });
          event(`${stem}.done`, { item_id: call.id, output_index, [key]: call[key] });
          event('response.output_item.done', { output_index, item: call });
        }
        event('response.completed', { response: response('completed', tokens) });
      } else {
        if (toolCalls.length) chunk({ tool_calls: chatCalls().map((call, index) => ({ index, ...call })) });
        chunk({}, toolCalls.length ? 'tool_calls' : 'stop');
        if (request.includeUsage && chatUsage) res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created,
          model: request.model, choices: [], usage: chatUsage })}\n\n`);
        res.write('data: [DONE]\n\n');
      }
      res.end();
    },
    fail(error) {
      if (!request.stream) return json(res, error.status, { error: { code: error.code, message: error.message } });
      const failure = { code: error.code, message: error.message };
      if (api === 'responses') event('response.failed', { response: { ...response('failed'), error: failure } });
      else res.write(`data: ${JSON.stringify({ error: failure })}\n\n`);
      res.end();
    },
  };
}

export function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
}
