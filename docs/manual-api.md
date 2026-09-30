# Developer manual and historical notes

Archived from the pre-installer README on 2026-09-30. Version-specific claims below
are historical; use the current README and release-readiness.json for current status.

# codex-opencode-bridge

A local, authenticated **OpenCode v2 to Codex compatibility bridge**.
Experimental native-tool mode relays structured tool calls to Codex for execution.
Version **0.2.0-rc.1**. The repository remains private; no public release has been made.

**Desktop installer work is in progress.** `prepare` now supports Big Pickle and
Muse Spark 1.3 Contributor Free with model-specific context and image settings.
`doctor` performs read-only prerequisite checks; it does not claim a desktop
installation or model entitlement. The automatic install/upgrade/uninstall flow
is not yet ready. Track the [release gates](release-readiness.json).

Muse's recursive tool-schema compatibility is implemented inside this bridge,
including namespaced tools; it no longer depends on a private Router patch.
The provider sees a relaxed recursive schema, and Codex retains tool argument
validation. This emits `recursive_tool_schema_relaxed` when applied.


**Product target:** native Codex workspace and tool workflows for supported models.
Current real-Codex ten-scenario tests pass 10/10 for Big Pickle and MiMo V2.6 Flash Free.
LongCat 2.5 Preview Free and Nemotron 3 Ultra Free pass 9/10; exact patch contents
and repair generation respectively still failed. A UUID-derived session-ID regression
caused the earlier provider 403s; native-format preallocation fixes those rejections
in all four retested models. Bunny's earlier 9/10 result is on the previous source.
This remains experimental text/tool compatibility; see the
[controlled diagnosis](session-id-regression.md) and [evidence](verification.md).
See the [native integration acceptance contract](native-codex-target.md).

[中文说明](README.zh-CN.md) · [Prior art](prior-art.md) · [Verification](verification.md)

```text
Codex / compatible client
  → local bridge (Bearer authentication, 127.0.0.1)
  → official OpenCode v2 server + guarded client-tool plugin
  → model available to the user's OpenCode installation
```

## What works, and what does not

- `GET /health`, authenticated `GET /v1/models`.
- `POST /v1/chat/completions` and `POST /v1/responses`: text, JSON and SSE.
- Native streaming subscribes to OpenCode v2 live text events before prompting,
  forwards text as it arrives, and reconciles with final snapshots without replay.
  Text mode still polls snapshots; observed chunking depends on runtime behavior.
- Native message roles and matched tool-call/result history are translated into
  each fresh session; text mode serializes history. Neither silently truncates it.
- Client disconnect/deadline → interrupt and delete the known upstream session.
- Model allowlist, request/output byte limits, bounded concurrency, authenticated loopback.
- No runtime npm dependencies; Node.js 22+ and a separately installed OpenCode v2 required.

With `BRIDGE_MODE=native-tools`, Responses function tools, namespaces and custom
freeform tools are relayed to Codex. Chat supports function tools. The managed
OpenCode plugin captures arguments and waits; Codex performs the actual action.
An opt-in `BRIDGE_INTERNAL_TOOLS=hidden` mode removes internal tool registrations,
filters the model context and rejects unexpected tool names in outgoing HTTP
requests. This changes tool visibility, not upstream access eligibility.
See [the tool-surface comparison](tool-surface.md).

`BRIDGE_INTERNAL_TOOLS=client-aliases` also makes familiar `read`, `write`, `edit`
and `shell` names transfer to the client’s actual `exec_command`. All actions and
permissions stay in Codex. File aliases require client Python 3 and appear as
command execution, not native patch diffs. See [alias semantics and limits](client-aliases.md).
When a compatible custom client `apply_patch` is supplied, the patch alias forwards
its input unchanged and prefers native file changes. Create/update/denial and diff
events have real Codex client evidence against a deterministic fake model; the
updated tool surface still needs live per-model regression.
See [real-client evidence and remaining gates](native-tool-progress.md).

Images, audio, file uploads, adjustable reasoning controls, structured output,
`previous_response_id`, stored responses and background responses are unsupported.
Responses streaming errors arrive as `response.failed` after HTTP headers have been sent.
Partial text is not a completed answer; event disconnects fail explicitly and are
never automatically reconnected across a possible text gap. See [streaming evidence](native-streaming.md).

The upstream is the **official OpenCode runtime**, including its system context
and user-level configuration. Native mode blocks internal actions before execution
and transfers client calls without executing them. Client tool history uses native
OpenCode message structures. Its single instruction role combines system/developer
messages, and OpenCode retains its own system context. An empty working directory
is **not an OS sandbox**. Run with trusted local OpenCode configuration. The legacy
default `text` mode uses a Plan session, rejects client tools and only detects
internal tools after observation; use native mode for Codex workflow experiments.
See [security and lifecycle boundaries](security.md).

## Quick start

Install Node.js 22+ and [OpenCode](https://opencode.ai). Configure your own access
in OpenCode. The currently exercised runtime is `@opencode/cli` **2.0.18**; older
`opencode-ai` v1 servers have a different API and are not supported.

```sh
git clone https://github.com/Hubuguilai/codex-opencode-bridge.git
cd codex-opencode-bridge
npm ci --ignore-scripts
node bin/bridge.mjs init
BRIDGE_MODE=native-tools BRIDGE_MODELS=opencode/space-bunny-free npm start
```

The repository is private, so cloning currently requires collaborator access.
If `opencode` is not on PATH, set `OPENCODE_BIN` to its absolute executable path.
The bridge never downloads a binary or searches arbitrary npm caches automatically.

Default URL: `http://127.0.0.1:4396/v1`. The child runtime listens on port 4397.
These differ from the original local prototype's ports. Use Ctrl-C to stop both.
The local token is generated outside the repository with mode 0600. It is never
printed; `init` reports its path.

From a second terminal (with the same state-dir override, if used):

```sh
export BRIDGE_TOKEN="$(cat "${BRIDGE_STATE_DIR:-$HOME/.local/share/codex-opencode-bridge-project}/local-token")"
curl http://127.0.0.1:4396/v1/models -H "Authorization: Bearer $BRIDGE_TOKEN"
curl http://127.0.0.1:4396/v1/chat/completions \
  -H "Authorization: Bearer $BRIDGE_TOKEN" -H 'Content-Type: application/json' \
  --data '{"model":"opencode/space-bunny-free","messages":[{"role":"user","content":"Hello"}],"stream":true}'
```

Shell-expanded curl headers may be visible in local process listings. For automated
clients, load the token file directly in the client process instead of passing it
on the command line. This token authenticates the local bridge, not the model provider.

## Prepare multiple models together

```sh
node bin/bridge.mjs prepare /absolute/new/bridge-config \
  --models opencode/space-bunny-free,opencode/nemotron-3-ultra-free,opencode/mimo-v2.6-flash-free,opencode/longcat-2.5-preview-free,opencode/big-pickle
```

This generates one catalog and matching bridge allowlist with client aliases
selected. The first model is the default; `--model` may choose another selected
ID. It writes only the new directory and refuses duplicate or unverified models.
Follow [Codex integration](codex.md) to run it. These artifacts do not install
a live Desktop route or replace your existing native GPT configuration.

Start it with `node bin/bridge.mjs serve-prepared /absolute/new/bridge-config`.
See [startup, restart and recovery evidence](operations.md).
For coexistence in an existing Desktop picker, use the export-only
[Router integration preview](desktop-integration.md); it preserves existing
entries and creates a separate route for each selected bridge model.

## Configuration

| Environment variable | Default | Meaning |
|---|---|---|
| `BRIDGE_MODE` | `text` | `native-tools` enables guarded client-tool relay |
| `BRIDGE_INTERNAL_TOOLS` | `guarded` | `guarded` blocks originals; `hidden` removes schemas (direct only); `client-aliases` transfers read/write/edit/shell to Codex. See [alias contract](client-aliases.md). |
| `BRIDGE_TOOL_TRANSPORT` | `direct` | Optional experimental `codemode` dispatcher; not the verified default |
| `OPENCODE_BIN` | PATH, then `~/.opencode/bin/opencode` | Installed executable |
| `BRIDGE_MODELS` | `opencode/nemotron-3-ultra-free` | Comma-separated exact `provider/model` IDs |
| `BRIDGE_IMAGE_MODELS` | Empty | Verified image-capable subset of `BRIDGE_MODELS`, native mode only. See [image support](images.md). |
| `BRIDGE_IMAGE_DETAIL_POLICY` | `strict` | Optional `auto` maps client low/high/original detail hints to OpenCode automatic image processing with an `image_detail_auto` warning. |
| `BRIDGE_PORT` | `4396` | Loopback bridge port |
| `OPENCODE_PORT` | `4397` | Managed OpenCode port |
| `BRIDGE_STATE_DIR` | `~/.local/share/codex-opencode-bridge-project` | Local token and temporary work dirs |
| `BRIDGE_TOKEN` | Generated token file | Optional local auth token; at least 24 characters |
| `BRIDGE_TIMEOUT_MS` | `180000` | Generation deadline; cleanup may take 4 additional seconds |
| `BRIDGE_POLL_MS` | `250` | Snapshot polling interval |
| `BRIDGE_MAX_BODY_BYTES` | `16000000` | Raw JSON and serialized prompt byte limit |
| `BRIDGE_MAX_OUTPUT_BYTES` | `8000000` | Output byte limit |
| `BRIDGE_MAX_CONCURRENT` | `2` (text) | Native mode always admits one request per managed runtime; overflow returns 429 |

A configured model ID is an allowlist entry, not proof of availability. No token
context limit, price or multimodal capability is invented in `/v1/models`.
Body byte limits are not model token limits; a 1M context claim requires separate
model evidence and real long-input validation.

## Codex integration

See [integration notes](codex.md). The Responses endpoint permits experiments
with a custom provider; the Chat Completions endpoint can sit behind an existing
router. **Installing this service alone does not add a Desktop model picker entry.**
Provider/catalog integration is separate. Use the supplied isolated acceptance
harness before preparing a picker integration. Keep working providers intact.

## Reversible preparation

```sh
node bin/bridge.mjs prepare /absolute/new/directory --model opencode/space-bunny-free
# Optional: --catalog /absolute/existing/models.json preserves its entries in a copy.
node bin/bridge.mjs remove-prepared /absolute/new/directory
```

Preparation creates a dedicated token/state directory, client configuration
fragment, model catalog and bridge environment descriptor. It never edits the
active Codex configuration or installs a background service. Removal refuses user
edits, extra files or active/leftover runtime work directories. See
[installation and router rehearsal](codex.md).

## Development and tests

```sh
npm run check
npm test
npm run test:package
# Explicitly sends two real requests using your own OpenCode access:
npm run smoke -- --live
# Real ephemeral Codex threads: file operations, follow-up, repair and denial:
BRIDGE_TEST_MODEL=opencode/space-bunny-free node scripts/native-acceptance.mjs --live
```

CI runs offline protocol and tarball-installation tests on macOS/Linux and Node
22/24. The package check installs the local archive into a temporary prefix with
no registry access, then exercises its executable and five-model setup; it does
not publish a package. The live smoke test
starts a separate managed server, exercises Chat JSON and Responses SSE, and tears
it down. Change both ports if occupied. It does not edit Codex/Router settings.

## Scope and upstream access

This project does not supply credentials or quotas, rotate accounts, spoof an
OpenCode identity, or promise unlimited free API access. Provider restrictions and
availability still apply. A working request does not establish permission to
redistribute another service. Use access you are authorized to use.

This is an independently written extraction of a locally tested prototype, not a
fork of another gateway. Existing alternatives and their tradeoffs are documented
in [the dated comparison](prior-art.md). MIT license covers this bridge code,
not access to third-party models.


[Official model access and managed runtime setup](opencode-access.md).

[Managed macOS service component / 后台服务组件](managed-service.md).

[Router registration / 模型注册组件](router-registration.md).

[Unified installer candidate and Codex Prompt / 统一安装候选与提示词](desktop-install.md).
