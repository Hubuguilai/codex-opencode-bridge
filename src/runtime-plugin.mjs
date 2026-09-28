// Loaded only by the managed OpenCode v2 process. Uses the documented v2 plugin
// interface without an npm helper dependency. All client tools are transfer stubs:
// their arguments go back to Codex; no client operation executes in OpenCode.
import fs from 'node:fs';
import path from 'node:path';

export default {
  id: 'codex-client-tool-relay',
  async setup(ctx) {
    const root = ctx.location.directory;
    const manifestPath = path.join(root, 'bridge-request.json');
    const capturePath = path.join(root, 'bridge-call.json');
    let manifest;
    let registration;
    let captured = false;
    let baseMessageCount;
    let dispatchSteps = 0;
    const capture = value => {
      if (captured) return;
      const temporary = capturePath + '.tmp';
      fs.writeFileSync(temporary, JSON.stringify({ requestId: manifest.requestId, ...value }), { mode: 0o600 });
      fs.renameSync(temporary, capturePath);
      captured = true;
    };
    await ctx.session.hook('prompt', async () => {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      captured = false;
      baseMessageCount = undefined;
      dispatchSteps = 0;
      if (registration) await registration.dispose();
      registration = await ctx.tool.transform(editor => {
        for (const tool of manifest.tools) {
          editor.add({
            name: tool.relayName,
            description: `Codex client tool ${tool.namespace ? tool.namespace + '.' : ''}${tool.name}. ${tool.description || ''}`,
            input: tool.parameters,
            options: { codemode: manifest.toolTransport === 'codemode' },
            execute: async (input, context) => {
              // Wait until the bridge has returned this structured call and
              // interrupts the upstream session. Never fabricate a tool result.
              capture({ kind: 'call', relayName: tool.relayName, input });
              await new Promise((resolve, reject) => {
                if (context.signal.aborted) return reject(new Error('CLIENT_TRANSFER_CANCELLED'));
                context.signal.addEventListener('abort', () => reject(new Error('CLIENT_TRANSFER_CANCELLED')), { once: true });
              });
            },
          });
        }
      });
      fs.writeFileSync(path.join(root, 'bridge-plugin-ready'), manifest.requestId, { mode: 0o600 });
    });
    await ctx.session.hook('context', event => {
      if (!manifest) throw new Error('Missing bridge request manifest.');
      if (++dispatchSteps > 4) {
        capture({kind:'limit'});
        throw new Error('DISPATCH_STEP_LIMIT');
      }
      if (manifest.messages) {
        baseMessageCount ??= event.messages.length;
        event.messages = [...structuredClone(manifest.messages), ...event.messages.slice(baseMessageCount)];
      }
      event.system.push({ type: 'text', text: [
        'This session is a Codex client compatibility turn. The client conversation and tool results are supplied as native messages.',
        'All requested workspace actions MUST be requested through the bridge_client_* top-level function tools.',
        manifest.toolTransport === 'codemode'
          ? 'Use execute Code Mode to call the bridge_client_* tools by their catalog names. Code Mode is only a dispatcher; all non-client workspace tools remain blocked.'
          : 'Call them directly, NOT through execute/Code Mode. OpenCode internal tools are blocked before execution.',
        'The actual work is executed by the Codex client. Your OpenCode working directory is NOT the client workspace.',
        'Tool results already in the conversation are authoritative client results; do not repeat completed calls.',
        'A client tool denial or failure is real: respect it and do not circumvent it with another tool.',
        'When all requested work is complete, provide a normal final text response based on the actual results.',
        'Tool mapping: ' + manifest.tools.map(t => `${t.namespace ? t.namespace + '.' : ''}${t.name} = ${t.relayName}`).join(', '),
      ].join('\n') });
      if (manifest.options) Object.assign(event.options, manifest.options);
    });
    await ctx.tool.hook('execute.before', event => {
      if (event.tool === 'execute' && manifest?.toolTransport === 'codemode') return;
      if (!manifest?.tools.some(tool => tool.relayName === event.tool)) {
        if (manifest) capture({ kind: 'blocked', tool: event.tool });
        throw new Error('OPENCODE_INTERNAL_TOOL_BLOCKED');
      }
    });
    await ctx.permission.hook('evaluate', event => {
      const clientTool = (event.action === 'execute' && manifest?.toolTransport === 'codemode') || manifest?.tools.some(tool => tool.relayName === event.action);
      event.effect = clientTool ? 'allow' : 'deny';
      if (!clientTool && manifest) capture({ kind: 'blocked', tool: event.action });
    });
    await ctx.session.hook('retry', event => { event.decision = { retry: false }; });
  },
};
