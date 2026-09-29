import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { findOpenCode } from './config.mjs';
import { BridgeError } from './errors.mjs';
import { NativeEvents } from './native-events.mjs';
import { NativeTextStream } from './native-text-stream.mjs';
import { SessionJournal } from './session-journal.mjs';
import { RuntimeOwnership } from './runtime-ownership.mjs';

const providerDenialMessages = {
  401: 'OpenCode provider returned HTTP 401: authentication was rejected. Check the provider authentication configured in OpenCode.',
  403: 'OpenCode provider returned HTTP 403: access was rejected. Check model entitlement or provider access restrictions in OpenCode; this does not establish quota exhaustion.',
  429: 'OpenCode provider returned HTTP 429: a rate or quota limit was reached. Check the provider allowance or retry timing; the bridge will not retry automatically.',
};

export class OpenCodeBackend {
  constructor({ url, password, directory, pollMs = 250, maxOutputBytes = 8000000, mode = 'text', toolTransport = 'direct', internalTools = 'guarded', journal, warn = () => {} }) {
    this.url = url;
    this.directory = directory;
    this.pollMs = pollMs;
    this.maxOutputBytes = maxOutputBytes;
    this.warn = warn;
    this.mode = mode;
    this.toolTransport = toolTransport;
    this.internalTools = internalTools;
    this.journal = journal;
    this.authorization = `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`;
  }
  async call(route, { method = 'GET', body, signal = AbortSignal.timeout(10000) } = {}) {
    const response = await fetch(this.url + route, {
      method, signal, redirect: 'error', headers: { authorization: this.authorization, 'content-type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const error = new BridgeError(502, 'opencode_http_error', `OpenCode returned HTTP ${response.status}.`);
      error.upstreamStatus = response.status;
      throw error;
    }
    if (response.status === 204) return null;
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new BridgeError(502, 'opencode_protocol_error', 'Expected OpenCode v2 JSON; received a non-JSON response.');
    }
    return response.json();
  }
  async health(signal = AbortSignal.timeout(1500)) {
    const info = await this.call('/api/info', { signal });
    if (typeof info.version !== 'string' || !info.version.startsWith('2.')) {
      throw new BridgeError(502, 'unsupported_opencode_version', 'This adapter requires the OpenCode v2 session API.');
    }
    return { version: info.version };
  }
  async generate(request, { signal, onDelta }) {
    if (this.mode === 'native-tools' && this.busy) throw new BridgeError(429, 'bridge_busy', 'OpenCode runtime is busy.');
    this.busy = true;
    const [providerID, id] = request.model.split('/');
    const native = this.mode === 'native-tools';
    const requestId = randomUUID();
    const capturePath = path.join(this.directory, 'bridge-call.json');
    let route, live, sessionID;
    let creationConfirmed = false;
    let completed = false;
    let previous = '';
    const nativeText = new NativeTextStream(this.maxOutputBytes);
    try {
      signal.throwIfAborted();
      if (native) {
        fs.rmSync(capturePath, { force: true });
        fs.rmSync(path.join(this.directory, 'bridge-plugin-ready'), { force: true });
        fs.writeFileSync(path.join(this.directory, 'bridge-request.json'), JSON.stringify({ requestId, tools: request.tools || [], messages: request.messages, toolTransport: this.toolTransport, internalTools: this.internalTools, options: request.options }), { mode: 0o600 });
      }
      // The official v2 create endpoint accepts a client-generated session ID.
      // Know the cleanup target even when creation commits but its reply is lost.
      sessionID = `ses_${randomUUID().replaceAll('-', '')}`;
      this.journal?.begin(sessionID);
      route = `/api/session/${sessionID}`;
      const created = await this.call('/api/session', { method: 'POST', body: {
        id: sessionID, title: 'Temporary bridge request', model: { id, providerID },
        location: { directory: this.directory }, agent: native ? 'build' : 'plan',
        ...(native ? { permissions: [{ action: '*', resource: '*', effect: 'ask' }] } : {}),
      } });
      if (created?.data?.id !== sessionID) throw new BridgeError(502, 'opencode_protocol_error', 'OpenCode did not preserve the requested session ID.');
      creationConfirmed = true;
      signal.throwIfAborted();
      if (native && request.stream) {
        live = new NativeEvents({url:this.url,authorization:this.authorization,sessionID:created.data.id,signal,onDelta,maxBytes:this.maxOutputBytes});
        await live.open();
      }
      await this.call(`${route}/prompt`, { method: 'POST', body: { text: request.prompt }, signal });
      // OpenCode initializes location plugins lazily when the first prompt runs.
      // All runtime actions require approval until the plugin is active; the
      // plugin then denies internal actions and permits only transfer stubs.
      if (native) {
        const ready = () => {
          try { return fs.readFileSync(path.join(this.directory, 'bridge-plugin-ready'), 'utf8') === requestId; } catch { return false; }
        };
        for (let i = 0; i < 100 && !ready(); i++) await delay(50, undefined, { signal });
        if (!ready()) throw new BridgeError(502, 'relay_plugin_unavailable', 'Client tool guard plugin did not load; refusing generation.');
      }
      while (true) {
        signal.throwIfAborted();
        live?.assertHealthy();
        const result = await this.call(`${route}/message?limit=100&order=asc`, { signal });
        if (!Array.isArray(result.data)) throw new BridgeError(502, 'opencode_protocol_error', 'Invalid OpenCode message response.');
        const assistants = result.data.filter(x => x.type === 'assistant');
        if (native && assistants.length > 4) throw new BridgeError(502, 'dispatch_step_limit', 'OpenCode dispatch exceeded four model steps without a client transfer.');
        if (!native && assistants.length > 1) throw new BridgeError(502, 'unexpected_agent_loop', 'Unexpected multi-step agent execution in text-only mode.');
        if (native && fs.existsSync(capturePath)) {
          let capture;
          try { capture = JSON.parse(fs.readFileSync(capturePath, 'utf8')); } catch { await delay(this.pollMs, undefined, { signal }); continue; }
          if (capture.requestId !== requestId) throw new BridgeError(502, 'relay_state_mismatch', 'Unexpected client tool relay state.');
          if (capture.kind === 'unsupported_alias') throw new BridgeError(422, 'unsupported_tool_alias', 'The selected client alias does not support these parameters. Use the original supplied Codex tool.');
          if (capture.kind === 'limit') throw new BridgeError(502, 'dispatch_step_limit', 'OpenCode dispatch exceeded four model steps without a client transfer.');
          if (capture.kind === 'blocked') {
            const name = ['read','shell','write','edit','execute','glob','grep','question','skill','subagent','webfetch','websearch'].includes(capture.tool) ? capture.tool : 'unknown';
            this.warn('internal_tool_blocked_' + name);
            throw new BridgeError(422, 'internal_tool_blocked', 'The model selected an OpenCode internal tool; execution was blocked. Retry the task using client tools.');
          }
          const tool = request.tools.find(x => x.relayName === capture.relayName);
          if (!tool || capture.kind !== 'call') throw new BridgeError(502, 'unknown_client_tool', 'Unrecognized client tool call.');
          if (!capture.input || typeof capture.input !== 'object' || Array.isArray(capture.input)) throw new BridgeError(502, 'invalid_tool_arguments', 'Invalid client tool arguments.');
          if (tool.kind === 'custom' && typeof capture.input.input !== 'string') throw new BridgeError(502, 'invalid_tool_arguments', 'Invalid custom tool input.');
          if (['read','shell','write','edit','apply_patch'].includes(capture.alias)) this.warn('client_alias_' + capture.alias);
          if (live) await live.finish(assistants);
          else await nativeText.update(assistants, onDelta);
          return { calls: [{ type: tool.kind === 'custom' ? 'custom_tool_call' : 'function_call',
            id: `fc_${randomUUID().replaceAll('-', '')}`, call_id: `call_${randomUUID().replaceAll('-', '')}`,
            name: tool.name, ...(tool.namespace ? { namespace: tool.namespace } : {}),
            ...(tool.kind === 'custom' ? { input: capture.input.input } : { arguments: JSON.stringify(capture.input) }),
          }], tokens: null };
        }
        const assistant = assistants.at(-1);
        if (assistant) {
          if ([401, 403, 429].includes(assistant.error?.status)) {
            throw new BridgeError(assistant.error.status, 'upstream_access_or_quota', providerDenialMessages[assistant.error.status]);
          }
          if (assistant.finish === 'error' || assistant.error) throw new BridgeError(502, 'generation_failed', 'OpenCode generation failed.');
          if (!native && (assistant.content || []).some(x => x.type === 'tool' || x.type === 'tool-call')) {
            throw new BridgeError(502, 'unexpected_tool_call', 'OpenCode attempted a tool call in text-only mode.');
          }
          const text = (assistant.content || []).filter(x => x.type === 'text' && typeof x.text === 'string').map(x => x.text).join('');
          if (!native && !text.startsWith(previous)) throw new BridgeError(502, 'non_append_output', 'Upstream changed already-delivered text.');
          if (Buffer.byteLength(text) > this.maxOutputBytes) throw new BridgeError(502, 'output_too_large', 'Output exceeded the configured byte limit.');
          if (!native && text.length > previous.length) await onDelta(text.slice(previous.length));
          if (native && !live) await nativeText.update(assistants, onDelta);
          previous = text;
          if (assistant.time?.completed && !(native && assistant.finish === 'tool-calls')) {
            if (assistant.finish === 'tool-calls' || assistant.finish === 'length') {
              throw new BridgeError(502, 'incomplete_generation', 'OpenCode did not complete a plain text answer.');
            }
            if (!text) throw new BridgeError(502, 'empty_generation', 'OpenCode returned no text.');
            if (live) await live.finish(assistants);
            completed = true;
            return { tokens: assistant.tokens || {} };
          }
        }
        if (result.data.some(x => x.type === 'idle' && x.outcome === 'failed')) {
          throw new BridgeError(502, 'generation_failed', 'OpenCode generation failed.');
        }
        await delay(this.pollMs, undefined, { signal });
      }
    } finally {
      if (live) await live.stop();
      if (route && !completed) {
        await this.call(`${route}/interrupt`, { method: 'POST', signal: AbortSignal.timeout(2000) }).catch(() => this.warn('session_interrupt_failed'));
      }
      if (route) {
        try {
          await this.call(route, { method: 'DELETE', signal: AbortSignal.timeout(2000) });
          // A failed create response can race a late commit even after DELETE.
          // Keep its intent until a separate ownership-aware recovery can prove
          // the old runtime is stopped and the session is absent.
          if (creationConfirmed) this.journal?.complete(sessionID);
          else if (this.journal) this.warn('session_recovery_pending');
        } catch { this.warn('session_cleanup_failed'); }
      }
      if (native) {
        fs.rmSync(capturePath, { force: true });
        fs.rmSync(path.join(this.directory, 'bridge-request.json'), { force: true });
      }
      this.busy = false;
    }
  }
}

export async function startOpenCode(config, env = process.env) {
  const binary = findOpenCode(env);
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(config.stateDir, 'work-')));
  const journal = new SessionJournal(directory);
  const ownership = new RuntimeOwnership(directory, journal.runID);
  if (config.mode === 'native-tools') {
    const pluginDir = path.join(directory, '.opencode/plugins/codex-relay');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'index.js'), `export { default } from ${JSON.stringify(new URL('./runtime-plugin.mjs', import.meta.url).href)};\n`);
    fs.writeFileSync(path.join(directory, 'opencode.json'), JSON.stringify({ plugins: [pluginDir], share: 'disabled', snapshots: false, lsp: false, formatter: false, update: 'disable' }));
  }
  const password = randomBytes(32).toString('base64url');
  const childEnv = { ...env, OPENCODE_SERVER_PASSWORD: password };
  delete childEnv.BRIDGE_TOKEN;
  const child = spawn(binary, ['serve', '--hostname', '127.0.0.1', '--port', String(config.upstreamPort)], {
    cwd: directory, env: childEnv, stdio: 'ignore',
  });
  let ended = false;
  child.on('error', () => { ended = true; });
  child.on('exit', () => { ended = true; });
  const backend = new OpenCodeBackend({ url: `http://127.0.0.1:${config.upstreamPort}`, password, directory,
    pollMs: config.pollMs, maxOutputBytes: config.maxOutputBytes, mode: config.mode, toolTransport: config.toolTransport, internalTools: config.internalTools, journal,
    warn: code => process.stderr.write(`[bridge] ${code}\n`),
  });
  let directoryRemoved = false;
  let stopPromise;
  const stop = () => stopPromise ??= (async () => {
    if (directoryRemoved) return;
    if (!ended) {
      child.kill('SIGTERM');
      for (let i = 0; i < 20 && !ended; i++) await delay(100);
      if (!ended) {
        child.kill('SIGKILL');
        for (let i = 0; i < 20 && !ended; i++) await delay(100);
      }
    }
    if (ended) ownership.stopped();
    if (!ended || journal.hasPending()) backend.warn('runtime_recovery_pending');
    else { fs.rmSync(directory, { recursive: true, force: true }); directoryRemoved = true; }
  })();
  try {
    if (child.pid) ownership.started(child.pid);
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (ended) throw new Error('OpenCode could not start. Check binary version and port availability.');
      try { await backend.health(); return { backend, child, stop }; } catch {}
      await delay(200);
    }
    throw new Error('OpenCode v2 startup timed out. Check OPENCODE_BIN and port availability.');
  } catch (error) { await stop(); throw error; }
}
