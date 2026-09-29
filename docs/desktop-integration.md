# Desktop picker integration preview

The bridge does not replace an existing model router. Export a reviewable plan
for a prepared bridge and an explicitly selected Codex Router state directory:

```sh
node bin/bridge.mjs prepare-router /absolute/new/router-plan \
  --prepared /absolute/bridge-config \
  --router-state /absolute/router-state
```

The output is a private directory containing:

- `REVIEW.md`: proposed menu entries and activation steps.
- `provider-addition.json`: a separate loopback Responses provider.
- `user-model-additions.json`: exact upstream IDs and router model metadata.
- `menu-preview.json`: original catalog entries followed by the new entries.
- `router-plan.json`: the above plan, source-file fingerprints and the token's
  local path. The token itself is never copied.

This command is **export-only**. It does not edit Router state, credentials,
Codex configuration, service definitions or running processes. It refuses an
existing output directory and conflicts with the new provider/model identities.
The existing native GPT/login routes, other providers and older prototype remain
untouched. Do not replace all user models or generic providers with an additions
file: these are append-only proposals, not whole-store replacements.

## Five-model proposal

The verified local export preserved all fields of 53 existing catalog entries,
in the same order, and appended five entries:

| Display label | Exact upstream model |
|---|---|
| Space Bunny Free (OpenCode Native Bridge) | `opencode/space-bunny-free` |
| Nemotron 3 Ultra Free (OpenCode Native Bridge) | `opencode/nemotron-3-ultra-free` |
| MiMo V2.6 Flash Free (OpenCode Native Bridge) | `opencode/mimo-v2.6-flash-free` |
| LongCat 2.5 Preview Free (OpenCode Native Bridge) | `opencode/longcat-2.5-preview-free` |
| Big Pickle (OpenCode Native Bridge) | `opencode/big-pickle` |

Provider ID: `opencode-native-bridge`. Routed IDs include that prefix and retain
the exact upstream ID. The default prepared URL is `http://127.0.0.1:4396/v1`,
using Responses passthrough and upstream-default reasoning. This uses the 32k
acceptance budget, not a claimed provider maximum. Access/quota failures remain
possible even after successful installation.

## What was verified

The optional integration check consumes the exported plan:

```sh
node scripts/router-rehearsal.mjs \
  --router-root /absolute/installed/codex-router \
  --plan /absolute/router-plan
```

It creates isolated Router state, generated local credentials, a real installed
Router/LiteLLM/forwarder stack and a **mock upstream** on ports 4696–4699. All five
routes were recognized. Requests retained their exact model mapping, namespace
tool schemas and reasoning settings; completed Responses calls retained their
name, namespace, arguments and call ID. The real Codex catalog parser recognized
all five new IDs. Source Router documents were rehashed after the test and were
unchanged; temporary state was removed.

The [receipt](receipts/router-five-model-rehearsal.json) records the installed
Router revision plus a source hash because that checkout had existing local
changes. The bridge did not modify that checkout. This verifies the inspected
integration shape, not every future Router revision or another operating system.

## Activation remains a separate step

Before any live mutation, verify the plan's source-file hashes still match. Start
the prepared bridge, register its token through the installed Router's credential
store, append the reviewed entries, and use the Router's shared publication path
for every installed client. Coordinate any service refresh with running tasks.
Do not edit native ChatGPT authentication or repurpose the old prototype route.

The [official Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
states that `model_catalog_json` loads at startup. The inspected Router's own
installation instructions leave fully quitting and reopening Codex to the user.
After that restart, verify the actual picker and execute a real file/tool task.
A generated catalog or successful catalog parser is not a completed Desktop GUI
acceptance test. No live route activation or app termination was performed for
this preview.
