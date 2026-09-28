# Security and lifecycle boundaries

- The listener is fixed to 127.0.0.1. Every API route except readiness requires a
  timing-safe Bearer check. Browser Origin requests are refused; no CORS is enabled.
- The child OpenCode server uses a fresh random Basic-auth password. Provider
  credentials remain managed by OpenCode; they are never copied into this repository.
- Each server run creates its own empty working directory; sessions are temporary.
  This directory is not a sandbox. The OpenCode process inherits the user's OS
  privileges and OpenCode configuration (including configured plugins/MCP).
- Native mode registers client tools through the official v2 plugin API. Its
  executors only record structured arguments; they never execute client work.
  Both permission evaluation and before-execution hooks block OpenCode internal
  actions. Each request waits for its own plugin-ready acknowledgement and uses
  one atomic tool capture. Only one native request is admitted at a time.
- Legacy text mode uses a Plan session and refuses client tools. Detection of
  unexpected upstream tools in that mode is not a pre-execution boundary.
- Plugin guards do not constrain trusted third-party plugins or arbitrary local
  processes. They are not a replacement for OS sandboxing. The bridge bearer token
  is removed from the managed child's environment.
- On cancellation, deadlines and errors the known session is interrupted and deleted.
  Cleanup calls have independent bounded deadlines and report failure codes.
  A process crash, lost create response, or unavailable server can leave a session
  behind. There is no crash-recovery journal yet. Never delete unrelated sessions.
- Upstream session DELETE may return HTTP 204; that is successful cleanup.
- No prompts or responses are logged by this bridge. OpenCode has its own database,
  logging, telemetry and provider data handling; deleting a session is not a promise
  of secure data erasure or zero upstream retention.
- One corrective generation is allowed only after a bridge-disabled internal-tool
  choice, before any text is streamed, within the original deadline. User tool
  denials, provider access/quota errors, timeouts and partial streams are never
  retried. No account rotation or automatic quota fallback.
- Do not expose this service to the Internet or treat it as a multi-user gateway.

## Removing it

Stop the bridge with Ctrl-C (or send SIGTERM to its process), then remove its checkout
if no longer wanted. The user-controlled `BRIDGE_STATE_DIR` can be removed separately
once this service has stopped; this removes its local token and leftover work dirs.
Do not remove `~/.local/share/opencode` or Codex auth/config as part of uninstall.

No LaunchAgent, model catalog or Codex configuration is installed by this project.
The older prototype's existing LaunchAgent is separate and remains unaffected.
