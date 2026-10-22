# PR #5: 300 client tools pre-merge check

Checked 2026-10-22 against a77e36e (PR head), base dda1c11.

## Data path and limits

`POST /v1/responses` or `/v1/chat/completions` -> server byte-bound JSON reader -> `normalizeNativeRequest` -> namespace expansion in `normalizeTools` -> `OpenCodeBackend.generate` writes the full manifest -> runtime plugin prompt hook registers every relay -> context hook -> OpenCode provider SDK serializes tools -> provider -> plugin capture -> backend restores original name/namespace -> API writer.

PR #5 removes only the arbitrary 256-tool count rejection. Duplicate identities, per-tool name/schema validation and the configured request byte limit still apply. Relay names include an index after sanitization/truncation, preserving uniqueness. `tool_choice: none` intentionally disables tools. Direct/guarded transport also exposes runtime internal tools; the provider total can exceed the client count. The isolated runtime probe uses direct/hidden mode to measure exactly 300 client tools. Code Mode is a different transport and this probe does not establish its capacity.

The manifest and plugin loops have no additional fixed catalog-count cap. Provider/SDK limits are separate and model-specific; inspecting bridge code cannot establish them. A 300-tool catalog can also exhaust context bytes/tokens. Do not trim tools silently or automatically retry a provider rejection.

## Added checks

- `npm test` includes a real loopback HTTP bridge/OpenCode-API fixture integration: all 300 names, namespaces and schemas survive the manifest/plugin registration path; the final relay returns the original identity and arguments; provider count rejection, unknown errors, byte limits and cleanup are checked. The plugin context and OpenCode API are simulated here.
- CI additionally installs pinned official OpenCode 2.0.18 and runs `node scripts/large-tools-live.mjs --local-provider`: real runtime, plugin hooks, SDK serialization, loopback provider wire catalog (300 unique names and original schemas), synthetic final tool selection, and structured relay response. No actual model inference occurs in this job.
- Explicit provider invalid-request messages reporting a tool-count limit now return HTTP 422 / `upstream_tool_limit`, with fixed safe advice. Schema/context categories retain precedence, unrecognized errors remain `generation_failed`, and provider text is not echoed. A non-JSON OpenCode HTTP failure remains a redacted `opencode_http_error`; it is not assumed to mean a tool-count limit.
- Real model probe: `OPENCODE_BIN=/path/to/official/opencode BRIDGE_TEST_MODEL=provider/model node scripts/large-tools-live.mjs --live-model`. Uses existing authorized provider access, temporary runtime state and ports, no client action execution. It verifies wire/context counts and selection of tool 299. A pass applies only to that runtime/model/transport at that time.

## Local execution boundary

Syntax check, diff whitespace check and 25 focused normalization/backend/error unit tests passed. The first full suite attempt had 200 passes and 32 failures because this execution sandbox rejects loopback listeners with EPERM (including existing HTTP tests). This is not evidence of provider rejection. An explicit live probe was attempted but failed at local port allocation with `local_listen_not_permitted`; no real upstream inference occurred and model entitlement/capacity remains unverified. Do not report this as a 300-tool end-to-end success.

Merge gate: the updated HTTP and official-runtime CI jobs must pass before merging. Even after those pass, document the removal as bridge-capacity support, not universal provider acceptance of 300 tools. A real-provider result is an additional model-specific acceptance check, not grounds to restore an arbitrary global 256 cap.
