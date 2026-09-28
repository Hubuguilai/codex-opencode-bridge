# codex-opencode-bridge

A local, authenticated **text-response bridge for the OpenCode v2 session API**.
Exposes OpenAI-compatible Chat Completions and a text subset of Responses.
Experimental v0.1.0; this repository is currently private.

**Product target:** native Codex workspace and tool workflows for supported models.
The text-only implementation below is a baseline, not completion of that goal.
See the [native integration acceptance contract](docs/native-codex-target.md).

[中文说明](docs/README.zh-CN.md) · [Prior art](docs/prior-art.md) · [Verification](docs/verification.md)

```text
Codex / compatible client
  → local bridge (Bearer authentication, 127.0.0.1)
  → official OpenCode v2 server (temporary Plan session)
  → model available to the user's OpenCode installation
```

## What works, and what does not

- `GET /health`, authenticated `GET /v1/models`.
- `POST /v1/chat/completions` and `POST /v1/responses`: text, JSON and SSE.
- Incremental text delivery by polling live OpenCode message snapshots. If a runtime
  exposes text only at completion, it arrives as a single delta; no fake word streaming.
- Full text history serialized into each fresh session; no silent truncation.
- Client disconnect/deadline → interrupt and delete the known upstream session.
- Model allowlist, request/output byte limits, bounded concurrency, authenticated loopback.
- No runtime npm dependencies; Node.js 22+ and a separately installed OpenCode v2 required.

**Not a full Codex coding backend.** Native Codex tool definitions/calls are rejected
with HTTP 422. Images, audio, files, sampling/reasoning controls, structured output,
`previous_response_id`, stored responses and background responses are unsupported.
Responses streaming errors arrive as `response.failed` after HTTP headers have been sent.

The upstream is an **OpenCode Plan agent**, not a raw model endpoint. OpenCode's own
system prompt, tools, permissions and user-level configuration can affect behavior.
An empty working directory is **not an OS sandbox**. Internal tools are not forwarded
to Codex; if observed in the response, this adapter aborts the request, but they may
already have run inside OpenCode. Run only with trusted local OpenCode configuration.
See [security and lifecycle boundaries](docs/security.md).

## Quick start

Install Node.js 22+ and [OpenCode](https://opencode.ai). Configure your own access
in OpenCode. The currently exercised runtime is `@opencode/cli` **2.0.18**; older
`opencode-ai` v1 servers have a different API and are not supported.

```sh
git clone https://github.com/Hubuguilai/codex-opencode-bridge.git
cd codex-opencode-bridge
npm ci --ignore-scripts
node bin/bridge.mjs init
npm start
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
  --data '{"model":"opencode/nemotron-3-ultra-free","messages":[{"role":"user","content":"Hello"}],"stream":true}'
```

Shell-expanded curl headers may be visible in local process listings. For automated
clients, load the token file directly in the client process instead of passing it
on the command line. This token authenticates the local bridge, not the model provider.

## Configuration

| Environment variable | Default | Meaning |
|---|---|---|
| `OPENCODE_BIN` | PATH, then `~/.opencode/bin/opencode` | Installed executable |
| `BRIDGE_MODELS` | `opencode/nemotron-3-ultra-free` | Comma-separated exact `provider/model` IDs |
| `BRIDGE_PORT` | `4396` | Loopback bridge port |
| `OPENCODE_PORT` | `4397` | Managed OpenCode port |
| `BRIDGE_STATE_DIR` | `~/.local/share/codex-opencode-bridge-project` | Local token and temporary work dirs |
| `BRIDGE_TOKEN` | Generated token file | Optional local auth token; at least 24 characters |
| `BRIDGE_TIMEOUT_MS` | `180000` | Generation deadline; cleanup may take 4 additional seconds |
| `BRIDGE_POLL_MS` | `250` | Snapshot polling interval |
| `BRIDGE_MAX_BODY_BYTES` | `16000000` | Raw JSON and serialized prompt byte limit |
| `BRIDGE_MAX_OUTPUT_BYTES` | `8000000` | Output byte limit |
| `BRIDGE_MAX_CONCURRENT` | `2` | Simultaneous admitted requests; overflow returns 429 |

A configured model ID is an allowlist entry, not proof of availability. No token
context limit, price or multimodal capability is invented in `/v1/models`.
Body byte limits are not model token limits; a 1M context claim requires separate
model evidence and real long-input validation.

## Codex integration

See [integration notes](docs/codex.md). The Responses endpoint permits experiments
with a custom provider; the Chat Completions endpoint can sit behind an existing
router. **Installing this service alone does not add a Desktop model picker entry.**
Provider/catalog integration is separate, and a normal Codex request with tools
will be rejected in v0.1. Do not replace a working provider with this build blindly.

## Development and tests

```sh
npm run check
npm test
# Explicitly sends two real requests using your own OpenCode access:
npm run smoke -- --live
```

CI runs offline protocol tests on macOS/Linux and Node 22/24. The live smoke test
starts a separate managed server, exercises Chat JSON and Responses SSE, and tears
it down. Change both ports if occupied. It does not edit Codex/Router settings.

## Scope and upstream access

This project does not supply credentials or quotas, rotate accounts, spoof an
OpenCode identity, or promise unlimited free API access. Provider restrictions and
availability still apply. A working request does not establish permission to
redistribute another service. Use access you are authorized to use.

This is an independently written extraction of a locally tested prototype, not a
fork of another gateway. Existing alternatives and their tradeoffs are documented
in [the dated comparison](docs/prior-art.md). MIT license covers this bridge code,
not access to third-party models.
