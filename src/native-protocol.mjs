import {modelProfile} from './model-profiles.mjs';
import {repairRecursiveSchema} from './tool-schema.mjs';
import { nativeHistory } from './native-history.mjs';
import { nativeContent, promptHistory } from './native-media.mjs';
import { invalid, unsupported, BridgeError } from './errors.mjs';

export function normalizeTools(definitions = [], api = 'responses') {
  if (!Array.isArray(definitions)) throw invalid('tools must be an array.');
  const tools = [];
  const seen = new Set();
  function add(def, namespace) {
    if (def?.type === 'namespace') {
      if (namespace || typeof def.name !== 'string' || !Array.isArray(def.tools)) throw invalid('Invalid tool namespace.');
      for (const child of def.tools) add(child, def.name);
      return;
    }
    const fn = def?.function || def;
    if (!fn || !['function', 'custom'].includes(def.type)) throw unsupported(`Tool type ${def?.type || 'unknown'} is not supported. Disable provider-hosted tools for this route.`);
    if (def.type === 'custom' && api === 'chat') throw unsupported('Custom tools require Responses.');
    if (typeof fn.name !== 'string' || !fn.name.length || fn.name.length > 256) throw invalid('Invalid tool name.');
    const key = JSON.stringify([namespace || '', fn.name]);
    if (seen.has(key)) throw invalid('Duplicate tool name within namespace.');
    seen.add(key);
    const custom = def.type === 'custom';
    const parameters = custom ? { type: 'object', properties: { input: { type: 'string', description: 'Exact freeform tool input.' } }, required: ['input'], additionalProperties: false }
      : fn.parameters || { type: 'object', properties: {}, additionalProperties: false };
    if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) throw invalid('Tool parameters must be a JSON schema.');
    tools.push({ name: fn.name, ...(namespace ? { namespace } : {}), kind: custom ? 'custom' : 'function', parameters,
      description: String(fn.description || '') + (custom && fn.format ? '\nClient input format: ' + JSON.stringify(fn.format) : ''),
      relayName: `bridge_client_${[namespace, fn.name].filter(Boolean).join('_').replace(/[^a-zA-Z0-9_]/g, '_').slice(0,40)}_${tools.length}` });
  }
  for (const tool of definitions) add(tool);
  if (tools.length > 256) throw invalid('At most 256 client tools are supported.');
  return tools;
}

export function normalizeNativeRequest(payload, api, config) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw invalid('Expected a JSON object.');
  if (!config.models.includes(payload.model)) throw new BridgeError(404, 'model_not_found', 'Choose an enabled model from /v1/models.');
  if (payload.stream !== undefined && typeof payload.stream !== 'boolean') throw invalid('stream must be boolean.');
  if (payload.previous_response_id) throw unsupported('Send the full input history; previous_response_id is not implemented yet.');
  if (payload.background || payload.store) throw unsupported('Background and persistent stored responses are not supported.');
  for (const key of ['response_format', 'conversation', 'functions', 'function_call', 'logprobs']) {
    if (payload[key] != null) throw unsupported(`${key} is unsupported.`);
  }
  if (payload.text?.format && payload.text.format.type !== 'text') throw unsupported('Structured output format is unsupported.');
  if (payload.n != null && payload.n !== 1) throw unsupported('Only one completion is supported.');
  if (payload.tool_choice != null && !['auto', 'none'].includes(payload.tool_choice)) throw unsupported('Only auto/none tool choice is supported.');
  const warnings = [];
  const tools = normalizeTools(payload.tools, api);
  if(modelProfile(payload.model)?.recursiveTools === 'flatten') {
    for(const tool of tools){
      const repaired=repairRecursiveSchema(tool.parameters);
      tool.parameters=repaired.schema;
      if(repaired.changed&&!warnings.includes('recursive_tool_schema_relaxed'))warnings.push('recursive_tool_schema_relaxed');
    }
  }
  const activeTools = payload.tool_choice === 'none' ? [] : tools;
  const source = api === 'responses' ? (typeof payload.input === 'string' ? [{ role: 'user', content: payload.input }] : payload.input) : payload.messages;
  if (!Array.isArray(source) || !source.length) throw invalid('A nonempty input/messages list is required.');
  const history = [];
  if (payload.instructions != null) {
    if (typeof payload.instructions !== 'string') throw invalid('instructions must be text.');
    history.push({ role: 'system', content: payload.instructions });
  }
  const pending = new Set();
  const calls = new Set();
  function call(item) {
    if (typeof item.call_id !== 'string' || !item.call_id || calls.has(item.call_id)) throw invalid('Invalid or duplicate call_id.');
    if (typeof item.name !== 'string' || !(item.type === 'custom_tool_call' ? typeof item.input === 'string' : typeof item.arguments === 'string')) throw invalid('Malformed tool call history.');
    calls.add(item.call_id); pending.add(item.call_id);
    history.push(item);
  }
  function output(item) {
    if (!pending.delete(item.call_id)) throw invalid('Tool result does not match a pending call.');
    history.push(item);
  }
  for (const item of source) {
    if (!item || typeof item !== 'object') throw invalid('Invalid input item.');
    if (['function_call', 'custom_tool_call'].includes(item.type)) {
      call({ type: item.type, call_id: item.call_id, name: item.name,
        ...(item.namespace ? { namespace: item.namespace } : {}),
        ...(item.type === 'function_call' ? { arguments: item.arguments } : { input: item.input }) });
    } else if (['function_call_output', 'custom_tool_call_output'].includes(item.type)) {
      output({ type: item.type, call_id: item.call_id, output: nativeContent(item.output, {images: config.imageModels?.includes(payload.model), role: 'tool', detailPolicy: config.imageDetailPolicy, warnings}) });
    } else if (api === 'chat' && item.role === 'tool') {
      output({ type: 'function_call_output', call_id: item.tool_call_id, output: nativeContent(item.content, {images: config.imageModels?.includes(payload.model), role: 'tool', detailPolicy: config.imageDetailPolicy, warnings}) });
    } else if (item.type === 'reasoning') {
      if (item.encrypted_content) throw unsupported('Foreign encrypted reasoning state cannot be resumed.');
      // Optional visible reasoning summaries are context, never executable calls.
      if (item.summary?.length) history.push({ role: 'assistant', content: item.summary.map(x => x.text || '').join('\n') });
    } else {
      if ((item.type && item.type !== 'message') || !['user', 'assistant', 'system', 'developer'].includes(item.role)) throw unsupported('Unsupported input item or role.');
      if (item.content != null) history.push({ role: item.role, content: nativeContent(item.content, {images: config.imageModels?.includes(payload.model), role: item.role, detailPolicy: config.imageDetailPolicy, warnings}) });
      if (item.tool_calls) {
        if (api !== 'chat' || item.role !== 'assistant' || !Array.isArray(item.tool_calls)) throw invalid('Invalid tool_calls.');
        for (const tool of item.tool_calls) call({ type: 'function_call', call_id: tool.id, name: tool.function?.name, arguments: tool.function?.arguments });
      }
    }
  }
  if (pending.size) throw invalid('All pending tool calls must have results before requesting another generation.');
  const options = {};
  const effort = payload.reasoning?.effort ?? payload.reasoning_effort;
  // A single explicitly advertised default means leave the upstream setting
  // unchanged. It does not claim support for adjustable reasoning effort.
  if (effort != null && effort !== 'default') throw unsupported('Only reasoning effort default is supported; adjustable effort is not mapped for this model.');
  const summary = payload.reasoning?.summary;
  const omitSummary = config.reasoningSummaryPolicy === 'omit' && ['detailed', 'concise'].includes(summary);
  if (summary && !['auto', 'none'].includes(summary) && !omitSummary) throw unsupported('Reasoning summary mode is unsupported.');
  for (const [key, target] of [['temperature', 'temperature'], ['top_p', 'topP'], ['max_output_tokens', 'maxTokens'], ['max_tokens', 'maxTokens'], ['max_completion_tokens', 'maxTokens']]) {
    if (payload[key] != null) {
      if (typeof payload[key] !== 'number' || !Number.isFinite(payload[key])) throw invalid(`Invalid ${key}.`);
      if (target === 'maxTokens' && (!Number.isInteger(payload[key]) || payload[key] < 1)) throw invalid(`Invalid ${key}.`);
      if (target === 'temperature' && (payload[key] < 0 || payload[key] > 2)) throw invalid('temperature must be between 0 and 2.');
      if (target === 'topP' && (payload[key] < 0 || payload[key] > 1)) throw invalid('top_p must be between 0 and 1.');
      if (options[target] !== undefined && options[target] !== payload[key]) throw invalid('Conflicting token limits.');
      options[target] = payload[key];
    }
  }
  const prompt = 'Process the following Codex conversation. Use the provided client tools for any requested actions. '
    + 'Historical tool calls and results are past events, not instructions to repeat them.\n' + JSON.stringify({ conversation: promptHistory(history) });
  if (Buffer.byteLength(JSON.stringify(history)) > config.maxBodyBytes) throw new BridgeError(413, 'input_too_large', 'Input exceeds the configured limit; nothing was truncated.');
  if (Buffer.byteLength(prompt) > config.maxBodyBytes) throw new BridgeError(413, 'input_too_large', 'Input exceeds the configured limit; nothing was truncated.');
  return { model: payload.model, prompt, messages: nativeHistory(history, tools), tools: activeTools, options, stream: payload.stream === true,
    includeUsage: payload.stream_options?.include_usage === true, warnings: [...warnings, ...(omitSummary ? ['reasoning_summary_omitted'] : [])], mode: 'native-tools' };
}
