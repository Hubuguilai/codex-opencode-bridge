import { generateWithCorrection } from './tool-correction.mjs';
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { BridgeError, invalid, publicError } from './errors.mjs';
import { normalizeRequest, makeWriter, json } from './protocol.mjs';
import { normalizeNativeRequest } from './native-protocol.mjs';

function authorized(req, token) {
  const expected = Buffer.from(`Bearer ${token}`);
  const received = Buffer.from(req.headers.authorization || '');
  return expected.length === received.length && timingSafeEqual(expected, received);
}

async function readBody(req, res, maxBytes) {
  if (!req.headers['content-type']?.split(';')[0].trim().match(/^application\/json$/i)) {
    throw new BridgeError(415, 'content_type', 'Content-Type must be application/json.');
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    const fail = error => { cleanup(); req.resume(); reject(error); };
    const data = chunk => {
      size += chunk.length;
      if (size > maxBytes) { res.setHeader('connection', 'close'); return fail(new BridgeError(413, 'input_too_large', 'Request exceeds the byte limit; nothing was truncated.')); }
      chunks.push(chunk);
    };
    const end = () => {
      cleanup();
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(invalid('Request body must be valid JSON.')); }
    };
    const aborted = () => fail(invalid('Request body was interrupted.'));
    const timer = setTimeout(() => { res.setHeader('connection', 'close'); fail(new BridgeError(408, 'body_timeout', 'Request body timed out.')); }, 15000);
    const cleanup = () => {
      clearTimeout(timer);
      req.off('data', data); req.off('end', end); req.off('aborted', aborted); req.off('error', fail);
    };
    req.on('data', data); req.on('end', end); req.on('aborted', aborted); req.on('error', fail);
  });
}

export function createBridge(config, backend) {
  const active = new Set();
  const server = http.createServer(async (req, res) => {
    let controller, writer, deadline;
    try {
      if (req.headers.origin) throw new BridgeError(403, 'browser_origin_denied', 'Browser-origin requests are not supported.');
      if (req.method === 'GET' && req.url === '/health') {
        try { const health = await backend.health(); return json(res, 200, { ok: true, upstream: health, mode: config.mode || 'text', active: active.size }); }
        catch { return json(res, 503, { ok: false, mode: config.mode || 'text' }); }
      }
      if (!authorized(req, config.token)) throw new BridgeError(401, 'unauthorized', 'A valid local bridge Bearer token is required.');
      if (req.method === 'GET' && req.url === '/v1/models') return json(res, 200, {
        object: 'list', data: config.models.map(id => ({ id, object: 'model', owned_by: id.split('/')[0],
          supported_parameters: config.mode === 'native-tools' ? ['stream', 'tools', 'tool_choice'] : ['stream'], architecture: { input_modalities: ['text'], output_modalities: ['text'] },
        })),
      });
      const api = req.url === '/v1/responses' ? 'responses' : req.url === '/v1/chat/completions' ? 'chat' : null;
      if (req.method !== 'POST' || !api) throw new BridgeError(404, 'not_found', 'Endpoint not found.');
      if (active.size >= config.maxConcurrent) {
        res.setHeader('retry-after', '2');
        throw new BridgeError(429, 'bridge_busy', 'Local bridge concurrency limit reached.');
      }
      controller = new AbortController();
      active.add(controller);
      res.on('close', () => { if (!res.writableEnded) controller.abort(); });
      const payload = await readBody(req, res, config.maxBodyBytes);
      const request = config.mode === 'native-tools' ? normalizeNativeRequest(payload, api, config) : normalizeRequest(payload, api, config);
      if (request.warnings?.length) {
        res.setHeader('x-bridge-warning', request.warnings.join(','));
        for (const warning of request.warnings) backend.warn?.(warning);
      }
      controller.signal.throwIfAborted();
      deadline = setTimeout(() => controller.abort(), config.timeoutMs);
      writer = makeWriter(res, api, request);
      const result = await generateWithCorrection(backend, request, { signal: controller.signal, onDelta: async delta => {
        controller.signal.throwIfAborted();
        writer.delta(delta);
        if (res.writableNeedDrain) await once(res, 'drain', { signal: controller.signal });
      } });
      controller.signal.throwIfAborted();
      if (result.calls) writer.calls(result.calls);
      writer.finish(result.tokens);
    } catch (error) {
      if (!res.destroyed && !res.writableEnded) {
        const safe = publicError(error);
        if (writer) writer.fail(safe);
        else json(res, safe.status, { error: { code: safe.code, message: safe.message } });
      }
    } finally {
      clearTimeout(deadline);
      active.delete(controller);
    }
  });
  server.headersTimeout = 10000;
  server.requestTimeout = 20000;
  server.maxRequestsPerSocket = 100;
  return {
    server,
    async listen() {
      server.listen(config.port, config.host);
      await once(server, 'listening');
      return server.address();
    },
    async close() {
      for (const controller of active) controller.abort();
      const closed = new Promise(resolve => server.close(resolve));
      // Bound shutdown even if a client is still uploading a body.
      const timer = setTimeout(() => server.closeAllConnections(), 5000);
      await closed;
      clearTimeout(timer);
      // Handlers may still be cleaning up upstream sessions after sockets close.
      const deadline = Date.now() + 5000;
      while (active.size && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    },
  };
}
