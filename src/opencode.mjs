import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { findOpenCode } from './config.mjs';
import { BridgeError } from './errors.mjs';

export class OpenCodeBackend {
  constructor({ url, password, directory, pollMs = 250, maxOutputBytes = 8000000, warn = () => {} }) {
    this.url = url;
    this.directory = directory;
    this.pollMs = pollMs;
    this.maxOutputBytes = maxOutputBytes;
    this.warn = warn;
    this.authorization = `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`;
  }
  async call(route, { method = 'GET', body, signal = AbortSignal.timeout(10000) } = {}) {
    const response = await fetch(this.url + route, {
      method, signal, redirect: 'error', headers: { authorization: this.authorization, 'content-type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new BridgeError(502, 'opencode_http_error', `OpenCode returned HTTP ${response.status}.`);
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
    const [providerID, id] = request.model.split('/');
    let route;
    let completed = false;
    let previous = '';
    try {
      signal.throwIfAborted();
      const created = await this.call('/api/session', { method: 'POST', body: {
        title: 'Temporary bridge request', model: { id, providerID },
        location: { directory: this.directory }, agent: 'plan',
      } });
      if (typeof created?.data?.id !== 'string' || !created.data.id.startsWith('ses_')) throw new BridgeError(502, 'opencode_protocol_error', 'OpenCode returned no session ID.');
      route = `/api/session/${encodeURIComponent(created.data.id)}`;
      signal.throwIfAborted();
      await this.call(`${route}/prompt`, { method: 'POST', body: { text: request.prompt }, signal });
      while (true) {
        signal.throwIfAborted();
        const result = await this.call(`${route}/message?limit=100`, { signal });
        if (!Array.isArray(result.data)) throw new BridgeError(502, 'opencode_protocol_error', 'Invalid OpenCode message response.');
        const assistants = result.data.filter(x => x.type === 'assistant');
        if (assistants.length > 1) throw new BridgeError(502, 'unexpected_agent_loop', 'Unexpected multi-step agent execution in text-only mode.');
        const assistant = assistants[0];
        if (assistant) {
          if ([401, 403, 429].includes(assistant.error?.status)) {
            throw new BridgeError(assistant.error.status, 'upstream_access_or_quota', 'OpenCode provider denied access or quota. Check your model entitlement in OpenCode.');
          }
          if (assistant.finish === 'error' || assistant.error) throw new BridgeError(502, 'generation_failed', 'OpenCode generation failed.');
          if ((assistant.content || []).some(x => x.type === 'tool' || x.type === 'tool-call')) {
            throw new BridgeError(502, 'unexpected_tool_call', 'OpenCode attempted a tool call in text-only mode.');
          }
          const text = (assistant.content || []).filter(x => x.type === 'text' && typeof x.text === 'string').map(x => x.text).join('');
          if (!text.startsWith(previous)) throw new BridgeError(502, 'non_append_output', 'Upstream changed already-delivered text.');
          if (Buffer.byteLength(text) > this.maxOutputBytes) throw new BridgeError(502, 'output_too_large', 'Output exceeded the configured byte limit.');
          if (text.length > previous.length) await onDelta(text.slice(previous.length));
          previous = text;
          if (assistant.time?.completed) {
            if (assistant.finish === 'tool-calls' || assistant.finish === 'length') {
              throw new BridgeError(502, 'incomplete_generation', 'OpenCode did not complete a plain text answer.');
            }
            if (!text) throw new BridgeError(502, 'empty_generation', 'OpenCode returned no text.');
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
      if (route && !completed) {
        await this.call(`${route}/interrupt`, { method: 'POST', signal: AbortSignal.timeout(2000) }).catch(() => this.warn('session_interrupt_failed'));
      }
      if (route) await this.call(route, { method: 'DELETE', signal: AbortSignal.timeout(2000) }).catch(() => this.warn('session_cleanup_failed'));
    }
  }
}

export async function startOpenCode(config, env = process.env) {
  const binary = findOpenCode(env);
  const directory = fs.mkdtempSync(path.join(config.stateDir, 'work-'));
  const password = randomBytes(32).toString('base64url');
  const child = spawn(binary, ['serve', '--hostname', '127.0.0.1', '--port', String(config.upstreamPort)], {
    cwd: directory, env: { ...env, OPENCODE_SERVER_PASSWORD: password }, stdio: 'ignore',
  });
  let ended = false;
  child.on('error', () => { ended = true; });
  child.on('exit', () => { ended = true; });
  const backend = new OpenCodeBackend({ url: `http://127.0.0.1:${config.upstreamPort}`, password, directory,
    pollMs: config.pollMs, maxOutputBytes: config.maxOutputBytes,
    warn: code => process.stderr.write(`[bridge] ${code}\n`),
  });
  const stop = async () => {
    if (!ended) {
      child.kill('SIGTERM');
      for (let i = 0; i < 20 && !ended; i++) await delay(100);
      if (!ended) child.kill('SIGKILL');
    }
    fs.rmSync(directory, { recursive: true, force: true });
  };
  try {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (ended) throw new Error('OpenCode could not start. Check binary version and port availability.');
      try { await backend.health(); return { backend, child, stop }; } catch {}
      await delay(200);
    }
    throw new Error('OpenCode v2 startup timed out. Check OPENCODE_BIN and port availability.');
  } catch (error) { await stop(); throw error; }
}
