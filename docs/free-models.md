# Free-model catalog snapshot — 2026-10-29

The public [OpenCode inference catalog](https://opencode.ai/inference/v1/models)
and [official pricing table](https://opencode.ai/v2/docs/console/models/#pricing)
were checked on **2026-10-29 (China Standard Time)**. See the
[sanitized comparison receipt](receipts/free-models-catalog-20261029.json).
The catalog-only receipt remains separate from the subsequent
[October 29 live probe](receipts/free-models-live-20261029.json). Neither check
changed installed configuration or services. Catalog presence and free pricing
are separate from successful bridge testing.

## Current API candidates

These eight conversational IDs appear in both the API and the official table
with free input/output. Availability, eligibility and limits can change.
Only IDs with a maintained profile in `src/model-profiles.mjs` can be selected by
the maintained installer. Latest live checks below are from October 30; the
catalog/prices remain the separate October 29 snapshot.

| Model | Exact OpenCode ID | Official input/output price | Bridge status |
| --- | --- | --- | --- |
| Big Pickle | `opencode/big-pickle` | Free | Default profile; October 29 text check hit rate_limit; historical text/file checks passed. |
| MiMo V2.6 Flash Free | `opencode/mimo-v2.6-flash-free` | Free | Experimental profile; October 30 text gate returned rate_limit; file tools not reached. |
| Flint 40B Free | `opencode/flint-40b-free` | Free | October 29 text check failed: generation_failed; file tools not reached; no profile added. |
| Beam Free | `opencode/beam-free` | Free | October 30 text gate returned generation_failed; file tools not reached; no profile added. |
| DeepSeek V4.1 Flash Free | `opencode/deepseek-v4.1-flash-free` | Free | October 30 text gate returned generation_failed; file tools not reached; no profile added. |
| GLM 5.3 Flash Free | `opencode/glm-5.3-flash-free` | Free | October 30 text gate returned generation_failed; file tools not reached; no profile added. |
| Nemotron 3.5 Lightning Free | `opencode/nemotron-3.5-lightning-free` | Free | October 30 text gate returned rate_limit; file tools not reached; no profile added. |
| Nemotron 3.5 Super VL Free | `opencode/nemotron-3.5-super-vl-free` | Free | October 30 text gate returned generation_failed; file tools not reached; no profile added. |

`opencode/jev-1.13-free` is also listed and free-priced. Its System One endpoint
returns structured decisions rather than conversational text, so it is excluded
from the eight conversational candidates above.

## Changes since October 17

Added: **Flint 40B Free** (`opencode/flint-40b-free`).

Five previously listed IDs are absent from the current API and matching free
price rows. None is recommended for a new installation:

| Model | Exact OpenCode ID | Retained project state |
| --- | --- | --- |
| Space Bunny Free | `opencode/space-bunny-free` | Historical profile and evidence retained. |
| LongCat 2.5 Preview Free | `opencode/longcat-2.5-preview-free` | Historical profile and evidence retained. |
| LL Alpha Free | `opencode/ll-alpha-free` | No maintained profile. |
| Muse Spark 1.2 Contributor Free | `opencode/muse-spark-1.2-contributor-free` | No maintained profile. |
| Muse Spark 1.3 Contributor Free | `opencode/muse-spark-1.3-contributor-free` | Historical image profile and evidence retained. |

Paid Muse Spark 1.2/1.3 entries remain separate models. Do not silently replace a
missing free ID with a paid one. Directory absence does not establish permanent
retirement or prove a failed inference call.

Nemotron 3 Ultra Free remains in the price table but is absent from the API.
Its historical profile remains for existing installations, pending revalidation.
MiMo V2.5 Free, old DeepSeek V4 Flash Free and Ling 3.0 Flash Fin Free also remain
absent from the API; none is a suggested new selection.
The [October 17 snapshot](receipts/free-models-catalog-20261017.json) and
[October 1 snapshot](receipts/free-models-catalog-20261001.json) are preserved.

## Bridge compatibility

Six profiles remain in the source for compatibility with existing installations;
only Big Pickle and MiMo V2.6 Flash Free also appear in today's API catalog.
Keeping a profile does not certify current upstream access. No profile is added
or removed in this documentation update. Flint and other candidates without a
profile require adaptation and live client-tool verification before installation.

Only the historical Muse 1.3 profile enables images. Because its free ID is absent,
there is no currently listed free candidate with a verified image route in this
project. Model names, VL labels and upstream context metadata do not extend the
bridge's verified capabilities. No maximum-context claim is added.

### October 30 independent model checks

Attempted all six remaining candidates independently through pinned official
OpenCode 2.0.18, the bridge and a real Codex app-server, with fresh no-login
runtime/client state. MiMo's quota rejection did not skip the other five models.

| Model | Text gate | File-tool gate |
| --- | --- | --- |
| MiMo V2.6 Flash Free | rate_limit (HTTP 429 category) | Not reached |
| DeepSeek V4.1 Flash Free | generation_failed | Not reached |
| Beam Free | generation_failed | Not reached |
| Nemotron 3.5 Super VL Free | generation_failed | Not reached |
| Nemotron 3.5 Lightning Free | provider.quota, HTTP 429, free usage limit | Not reached |
| GLM 5.3 Flash Free | generation_failed | Not reached |

No model passed both gates; no new installer profiles were added. The four
unclassified generation failures are not counted as quota errors. A further
DeepSeek diagnostic exposed only an idle failed outcome, without a provider error
or HTTP status; its cause remains unknown. These are dated route-specific results,
not proof of permanent model retirement.

The observation does not establish whether free models share one quota pool.
Use one bounded check per distinct candidate; after a model returns 429, stop that
model for the round and continue checking the other candidates independently.
Do not retry the limited model immediately or change identity/network to avoid
its restriction. See the [sanitized six-model receipt](receipts/free-models-live-20261030.json).

### October 29 live probe

Used pinned **official OpenCode 2.0.18 → bridge → real Codex app-server** with
fresh isolated runtime/client state and no provider login. The two gates were an
exact-text response and a real client-tool read/compute/write/verify task.

| Model | Text gate | File-tool gate | Outcome |
| --- | --- | --- | --- |
| Flint 40B Free | Failed: `generation_failed` | Not reached | Not added to installer profiles. |
| Big Pickle | Failed: upstream `rate_limit` (HTTP 429 category) | Not reached | Stopped requests; historical successes remain historical. |
| Other six current candidates | Not run after quota stop | Not run | No new compatibility conclusion. |

No model passed both gates in this run. The failure category does not establish
Flint's root cause or permanent unavailability. Runtime discovery also failed to
identify the Big Pickle control, so it is not used as evidence of model absence.
There were no quota retries, alternate identities, paid fallback or service/config
changes. Temporary runtime and client state were cleaned up. Existing model
profiles remain unchanged. See the [sanitized live receipt](receipts/free-models-live-20261029.json).

### October 29 quota diagnosis

A separate diagnostic through the same fresh no-login official runtime reproduced
Big Pickle's rejection. OpenCode's original structured error was
`type: provider.quota`, `status: 429`, with the message “Free usage limit reached.”
This identifies an upstream free-usage allowance restriction, not the bridge's
local concurrency guard. The runtime exposed only type, message and status; it
did not expose a reset timestamp or Retry-After value.

The [upstream service response](https://github.com/anomalyco/opencode/issues/58186)
describes free limits by account, workspace and network. This isolated no-login
probe cannot determine which counter applies. A
[separate report](https://github.com/anomalyco/opencode/issues/59027) observed a
00:00 UTC reset, but that does not establish this route's exact reset time.
Do not infer remaining allowance or a guaranteed recovery time from HTTP 429.

Retry after a daily boundary rather than looping immediately. Resume with pending
models and keep passed and failed results separately. A quota error stops only
that exact model for the round; continue one check of each other distinct model.
The initial October 29 global-stop policy was overly conservative and is replaced
by the independent October 30 checks above. Only add an installer profile after both text and real
client-file-tool gates pass. See the
[sanitized diagnosis](receipts/free-model-quota-diagnosis-20261029.json).

### October 17 compatibility probe

GLM 5.3 Flash Free and DeepSeek V4.1 Flash Free were each tried through the pinned
**official OpenCode 2.0.18 → bridge → real Codex app-server** route in fresh,
isolated client/runtime state with no provider login or credentials. Both failed
at the first text check with `generation_failed`; neither reached the file-tool
check. A second diagnostic attempt reproduced the text failures. The runtime's
model/provider discovery responses in this environment did not report either ID.

These observations do not identify a root cause or prove that authenticated
routes fail. They establish that this fresh no-login route did not pass. Neither
model is added to the maintained installer. No silent model substitution, image
support or maximum-context claim is introduced. The pinned runtime remains
2.0.18; an upgrade needs a separate successful compatibility check.

[Sanitized compatibility receipt](receipts/free-models-probe-20261017.json).
No existing Codex/Router/OpenCode configuration or service was changed. The probe
used temporary state and owned child processes, which were cleaned up afterward.

The October 17 probe above is historical and route-specific; it is not a fresh
October 29 result or proof that every authenticated route fails. Historical
experiments also appear in [source-specific workflow evidence](verification.md).
No models.dev metadata or model capacity was refreshed in these checks.

[English README](../README.md) · [中文 README](README.zh-CN.md)
