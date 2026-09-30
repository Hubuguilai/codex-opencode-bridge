// Loaded only by the managed OpenCode v2 process. Uses the documented v2 plugin
// interface without an npm helper dependency. All client tools are transfer stubs:
// their arguments go back to Codex; no client operation executes in OpenCode.
import fs from 'node:fs';
import { clientAliases } from './client-aliases.mjs';
import path from 'node:path';
import {wireImageCounts,wireImageIntegrity} from './wire-media-diagnostics.mjs';

export default {
  id: 'codex-client-tool-relay',
  async setup(ctx) {
    const root = ctx.location.directory;
    const manifestPath = path.join(root, 'bridge-request.json');
    const capturePath = path.join(root, 'bridge-call.json');
    let manifest;
    let registration;
    let aliases = [];
    let captured = false;
    let baseMessageCount;
    let nativeMedia;
    let dispatchSteps = 0;
    const capture = value => {
      if (captured) return;
      const temporary = capturePath + '.tmp';
      fs.writeFileSync(temporary, JSON.stringify({ requestId: manifest.requestId, ...value }), { mode: 0o600 });
      fs.renameSync(temporary, capturePath);
      captured = true;
    };
    const transferAlias = (alias, input) => {
      let translated;
      try { translated = alias.translate(input); }
      catch { capture({kind:'unsupported_alias',alias:alias.name}); throw new Error('CLIENT_ALIAS_UNSUPPORTED'); }
      capture({kind:'call',relayName:alias.target.relayName,input:translated,alias:alias.name});
    };
    await ctx.session.hook('prompt', async () => {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      captured = false;
      aliases = manifest.internalTools === 'client-aliases' ? clientAliases(manifest.tools) : [];
      baseMessageCount = undefined;
      nativeMedia = undefined;
      dispatchSteps = 0;
      if (registration) await registration.dispose();
      registration = await ctx.tool.transform(editor => {
        if (manifest.internalTools === 'hidden') {
          for (const tool of editor.list()) editor.remove(tool.id);
        }
        for (const alias of aliases) {
          const original = editor.list().find(tool => tool.name === alias.name);
          if (!original && !alias.registerIfMissing) continue;
          const replacement={
            description: alias.description,
            input: alias.input,
            execute: async (input, context) => {
              transferAlias(alias, input);
              await new Promise((resolve,reject)=>{
                if(context.signal.aborted)return reject(new Error('CLIENT_TRANSFER_CANCELLED'));
                context.signal.addEventListener('abort',()=>reject(new Error('CLIENT_TRANSFER_CANCELLED')),{once:true});
              });
            },
          };
          if(original)editor.update(original.id,tool=>Object.assign(tool,replacement));
          else editor.add({name:alias.name,...replacement});
        }
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
      if (manifest.internalTools === 'hidden') {
        const allowed = new Set(manifest.tools.map(tool => tool.relayName));
        event.tools = Object.fromEntries(Object.entries(event.tools).filter(([name]) => allowed.has(name)));
      }
      // Metadata only: never persist prompts, tool arguments, headers or credentials.
      fs.writeFileSync(path.join(root, 'bridge-tool-surface.json'), JSON.stringify({
        requestId: manifest.requestId, mode: manifest.internalTools || 'guarded',
        step: dispatchSteps, tools: Object.keys(event.tools).sort(),
      }), { mode: 0o600 });
      if (manifest.messages) {
        baseMessageCount ??= event.messages.length;
        nativeMedia ??= event.messages.flatMap(message => message.content || []).filter(part => part.type === 'media');
        let mediaIndex = 0;
        const messages = structuredClone(manifest.messages).map(message => ({...message, content: message.content.map(part => {
          if (part.type !== 'media') return part;
          const media = nativeMedia[mediaIndex++];
          if (!media) throw new Error('NATIVE_IMAGE_ATTACHMENT_MISSING');
          return media;
        })}));
        if (mediaIndex !== nativeMedia.length) throw new Error('NATIVE_IMAGE_ATTACHMENT_MISMATCH');
        event.messages = [...messages, ...event.messages.slice(baseMessageCount)];
      }
      event.system.push({ type: 'text', text: [
        'This session is a Codex client compatibility turn. The client conversation and tool results are supplied as native messages.',
        aliases.length ? 'Client-executed aliases: '+aliases.map(alias=>alias.name+' -> '+alias.target.name).join(', ')+'. They transfer calls to Codex and never execute in OpenCode. Read/write/edit aliases use client Python through exec_command.' : 'All requested workspace actions MUST be requested through the bridge_client_* top-level function tools.',
        aliases.some(alias=>alias.name==='apply_patch') ? 'Prefer apply_patch for file changes. Pass patchText unchanged to the native Codex patch tool; its diff, approval and result belong to Codex. Do not retry a denied patch through write/edit/shell.' : 'Use the supplied client apply_patch tool for native file diffs when available.',
        manifest.toolTransport === 'codemode'
          ? 'Use execute Code Mode to call the bridge_client_* tools by their catalog names. Code Mode is only a dispatcher; all non-client workspace tools remain blocked.'
          : 'Call the supplied client tools directly, NOT through execute/Code Mode. Other OpenCode internal tools are blocked before execution.',
        'The actual work is executed by the Codex client. Your OpenCode working directory is NOT the client workspace.',
        'Tool results already in the conversation are authoritative client results; do not repeat completed calls.',
        'A client tool denial or failure is real: respect it and do not circumvent it with another tool.',
        'When all requested work is complete, provide a normal final text response based on the actual results.',
        'Tool mapping: ' + manifest.tools.map(t => `${t.namespace ? t.namespace + '.' : ''}${t.name} = ${t.relayName}`).join(', '),
      ].join('\n') });
      const hasImages=(manifest.messages||[]).some(message=>Array.isArray(message.content)&&message.content.some(part=>part.type==='media'||(Array.isArray(part.result?.value)&&part.result.value.some(value=>value.type==='file'&&typeof value.mime==='string'&&value.mime.startsWith('image/')))));
      if(hasImages)event.system.push({type:'text',text:'The supplied conversation contains native image input, including any attached image tool results. Inspect that image content directly. Restrictions on filesystem access or tool use do not prevent examining images already attached to this request. If the pixels are unclear, say so; do not invent details or claim missing visual input merely because no additional tool is allowed.'});
      if (manifest.options) Object.assign(event.options, manifest.options);
    });
    await ctx.session.hook('http.request', async event => {
      if (!manifest || event.kind !== 'primary') return;
      let body;
      try { body = await event.request.clone().json(); } catch {
        if (manifest.internalTools === 'hidden') throw new Error('UNVERIFIABLE_TOOL_SURFACE');
        return;
      }
      if (body.tools !== undefined && !Array.isArray(body.tools)) throw new Error('INVALID_TOOL_SURFACE');
      const names = (body.tools || []).map(tool => tool.function?.name || tool.name || tool.type).sort();
      if (manifest.internalTools === 'hidden' && names.some(name => !manifest.tools.some(tool => tool.relayName === name))) {
        throw new Error('UNEXPECTED_WIRE_TOOL');
      }
      fs.writeFileSync(path.join(root, 'bridge-wire-surface.json'), JSON.stringify({
        requestId: manifest.requestId, mode: manifest.internalTools || 'guarded', tools: names,
        media: wireImageCounts(body), imageIntegrity: wireImageIntegrity(body,manifest.messages),
      }), { mode: 0o600 });
    });
    await ctx.session.hook('http.response', event => {
      if (!manifest || event.kind !== 'primary') return;
      fs.writeFileSync(path.join(root, 'bridge-wire-status.json'), JSON.stringify({
        requestId: manifest.requestId, status: event.response.status,
      }), { mode: 0o600 });
    });
    await ctx.tool.hook('execute.before', event => {
      if (event.tool === 'execute' && manifest?.toolTransport === 'codemode') return;
      const alias = aliases.find(alias => alias.name === event.tool);
      if (alias) {
        transferAlias(alias, event.input);
        // Stop before the original executor even if another registry transform
        // has replaced our stub. Codex receives and executes the captured call.
        throw new Error('CLIENT_TRANSFER_RECORDED');
      }
      if (!manifest?.tools.some(tool => tool.relayName === event.tool)) {
        if (manifest) capture({ kind: 'blocked', tool: event.tool });
        throw new Error('OPENCODE_INTERNAL_TOOL_BLOCKED');
      }
    });
    await ctx.permission.hook('evaluate', event => {
      const clientTool = (event.action === 'execute' && manifest?.toolTransport === 'codemode') || aliases.some(alias => alias.name === event.action) || manifest?.tools.some(tool => tool.relayName === event.action);
      event.effect = clientTool ? 'allow' : 'deny';
      if (!clientTool && manifest) capture({ kind: 'blocked', tool: event.action });
    });
    await ctx.session.hook('retry', event => { event.decision = { retry: false }; });
  },
};
