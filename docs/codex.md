# Codex connection notes

There are two distinct integration layers:

1. This process serves model-like HTTP interfaces.
2. Codex or an existing router chooses the endpoint and publishes model metadata.

The project does not modify the global Codex configuration or its model picker.
Keep existing native GPT and other provider entries intact.

## Existing router

Use `http://127.0.0.1:4396/v1` as an OpenAI Chat Completions upstream, with the local
bridge token as its credential. Use the exact model ID returned by `/v1/models`,
for example `opencode/nemotron-3-ultra-free`.

The router must support a **text-only** route with no native tool definitions or
unsupported reasoning/sampling fields. v0.1 rejects these with 422; it never silently
pretends to execute tools. No new Desktop picker entry has been installed by this
project. The older prototype was less strict and silently ignored tools; do not
replace it with this version without testing the router request shape first.

## Responses provider experiment

The example `examples/codex-provider.toml` shows the API wiring, not a claim that all
Codex workflows are compatible. Load `BRIDGE_TOKEN` into the environment of the
client process, and merge only the relevant provider/profile sections after review.
An ordinary coding request includes tools and will fail deliberately in v0.1.
The API protocol is validated independently by tests and live smoke requests.

Model token limits are not inferred from the adapter's byte limit. Add catalog
metadata only after verifying the exact upstream model. Do not clone another
model's tool capabilities to make the picker look enabled.

## Future complete coding support

Required proof before claiming native Codex tools:

1. Carry genuine client tool definitions to the intended model without replacing
   them with OpenCode's own filesystem/shell tools.
2. Return structured function calls and stream their arguments correctly.
3. Execute through Codex's normal approval/runtime path.
4. Send tool results back to the same logical model turn and finish the answer.
5. Verify no tool executes in the bridge's working directory instead.

This is intentionally not simulated by parsing model-written JSON as if it were
native function calling.
