# Security and lifecycle boundaries

- The listener is fixed to 127.0.0.1. Every API route except readiness requires a
  timing-safe Bearer check. Browser Origin requests are refused; no CORS is enabled.
- The child OpenCode server uses a fresh random Basic-auth password. Provider
  credentials remain managed by OpenCode; they are never copied into this repository.
- Each server run creates its own empty working directory; sessions are temporary.
  This directory is not a sandbox. The OpenCode process inherits the user's OS
  privileges and OpenCode configuration (including configured plugins/MCP).
- The Plan agent retains its upstream defaults. A prototype experiment denying
  every internal tool produced an upstream free-tier rejection. Do not describe
  this implementation as an isolated or tool-free inference service.
- The API refuses client-supplied tools. Detection of unexpected upstream tool
  parts aborts the answer but is not a pre-execution security boundary.
- On cancellation, deadlines and errors the known session is interrupted and deleted.
  Cleanup calls have independent bounded deadlines and report failure codes.
  A process crash, lost create response, or unavailable server can leave a session
  behind. There is no crash-recovery journal yet. Never delete unrelated sessions.
- Upstream session DELETE may return HTTP 204; that is successful cleanup.
- No prompts or responses are logged by this bridge. OpenCode has its own database,
  logging, telemetry and provider data handling; deleting a session is not a promise
  of secure data erasure or zero upstream retention.
- No retries of a generation, account rotation or automatic quota fallback.
- Do not expose this service to the Internet or treat it as a multi-user gateway.

## Removing it

Stop the bridge with Ctrl-C (or send SIGTERM to its process), then remove its checkout
if no longer wanted. The user-controlled `BRIDGE_STATE_DIR` can be removed separately
once this service has stopped; this removes its local token and leftover work dirs.
Do not remove `~/.local/share/opencode` or Codex auth/config as part of uninstall.

No LaunchAgent, model catalog or Codex configuration is installed by this project.
The older prototype's existing LaunchAgent is separate and remains unaffected.
