# Codex integration and coexistence

Native mode requires `BRIDGE_MODE=native-tools`. The first tested combination is
OpenCode 2.0.18, Codex 0.157.1 and `opencode/nemotron-3-ultra-free`. Five models have now passed complete real-client suites with `client-aliases`;
see [the exact matrix](verification.md). The bridge uses Responses for Codex's function/custom tools. Chat supports ordinary function tools.
It never performs the client file/command operations itself.

## Isolated, repeatable verification

```sh
node scripts/native-acceptance.mjs --live
```

This starts separate bridge/OpenCode ports 4596/4597, creates disposable client
workspaces and ephemeral Codex app-server threads, and writes a sanitized receipt
under `generated/`. It does not edit the normal Codex or Router configuration.
Set both port environment variables if occupied. Each turn has a 180-second cap.
The operator's installed OpenCode and existing provider access are used.
`--repair-only` and `--lifecycle-only` select focused diagnostic runs.

The fixture checks actual files independently. A completed model message alone
is not a passed file-work test. Approval requests in the harness are declined;
there is no automatic approval of unknown operations.

## Client settings

`examples/codex-provider.toml` is a wiring example; `examples/native-models.json`
is the companion model catalog. The catalog uses a **conservative 32k test budget**,
not a claim about the model's maximum context. Set `model_catalog_json` to its
absolute path in a dedicated client configuration.

Use `model_reasoning_effort="default"` and `model_reasoning_summary="none"`.
An inherited high/medium effort or detailed summary is explicitly rejected. The
single `default` choice means keep the upstream setting, not disable reasoning.
Hosted web search, image input and structured final-output schemas are unsupported.
The example disables app and subagent tools to match the acceptance test scope;
this is not a claim that arbitrary Desktop tools have been certified.

The complete conversation must accompany each request. `previous_response_id`,
stored/background responses and foreign encrypted reasoning are unsupported.
Serial function calls and matching tool outputs are carried through each turn.
Custom freeform input is transported through a string field; the Codex client
remains responsible for validating and executing its own tool.

## Existing Desktop picker / router

A custom provider and a model catalog do not automatically create cross-provider
routing in an existing Desktop installation. To keep native GPT and existing
providers together, integrate this service with an existing router that supports
Responses forwarding and explicit model metadata. Use a **new provider/model ID**
for this development build; do not overwrite the older prototype route.

Upstream URL: `http://127.0.0.1:4396/v1`; upstream model ID:
`opencode/nemotron-3-ultra-free`; credential: the bridge's private local token.
Preserve the single upstream-default reasoning setting. Prefer Responses passthrough
so namespaces and custom tools do not have to be flattened by another layer.

The current work has not migrated the operator's active picker or live router.
An isolated full-router rehearsal and reversible configuration preparation are
implemented; live Desktop activation remains a separate operation.
Do not describe the CLI/app-server proof as a completed Desktop installation.

## Prepare and remove a configuration directory

```sh
node bin/bridge.mjs prepare /absolute/new/bridge-config --model opencode/space-bunny-free
# Copy an existing catalog without changing its source:
node bin/bridge.mjs prepare /absolute/another/new-directory --catalog /absolute/models.json
```

The command refuses an existing output directory or duplicate model ID. It writes
`models.json`, `codex.config.toml`, `bridge-env.json`, a private token under `state/`
and an ownership manifest. These are reviewable installation artifacts, not an
automatic switch of your current model provider. The root provider in the fragment
selects the standalone bridge; coexistence in one picker still needs the existing
router route described above.

To launch the prepared bridge, set `BRIDGE_STATE_DIR` to its `state` directory,
`BRIDGE_MODE=native-tools` and `BRIDGE_MODELS` to the prepared model, then run
`npm start`. Load `state/local-token` into the dedicated client's `BRIDGE_TOKEN`
environment without putting it on a command line or committing it.

After stopping the service:

```sh
node bin/bridge.mjs remove-prepared /absolute/new/bridge-config
```

Removal checks the manifest and file hashes and refuses edited/extra files or
runtime work directories. It never removes Codex/OpenCode authentication or the
original catalog. No LaunchAgent/system service is installed by these commands.

The optional router rehearsal is reproducible with an installed Codex Router
checkout and its existing LiteLLM environment:

```sh
node scripts/router-rehearsal.mjs --router-root /absolute/codex-router
```

It uses isolated state and ports 4696–4699 with a mock upstream, then removes them.
The check validates protocol coexistence, not live UI deployment.
