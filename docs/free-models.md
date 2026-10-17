# Free-model catalog snapshot — 2026-10-17

The public [OpenCode inference catalog](https://opencode.ai/inference/v1/models)
and [official pricing table](https://opencode.ai/v2/docs/console/models/#pricing)
were checked on **2026-10-17 (China Standard Time)**. The captured UTC time and
source results are in the [sanitized receipt](receipts/free-models-catalog-20261017.json).
This page distinguishes catalog presence, documented price and bridge testing.
An API listing or a name ending in `-free` is not a successful inference test.

## Current API candidates

All IDs below were present in the API. “Free” means the official table explicitly
listed free input/output at this check, not guaranteed future pricing, account
eligibility or unrestricted access. The model-selection command accepts only IDs
with a maintained profile in `src/model-profiles.mjs`.

| Model | Exact OpenCode ID | Official input/output price | Bridge status |
| --- | --- | --- | --- |
| Big Pickle | `opencode/big-pickle` | Free | Default profile; recorded text/file checks passed. Not rerun in this catalog check. |
| Muse Spark 1.3 Contributor Free | `opencode/muse-spark-1.3-contributor-free` | Free | Optional profile; recorded image/tool evidence; fresh no-login check was region-denied. |
| Space Bunny Free | `opencode/space-bunny-free` | Free | Historical text/tool profile; not rerun in this check. |
| MiMo V2.6 Flash Free | `opencode/mimo-v2.6-flash-free` | Free | Historical text/tool profile; not rerun in this check. |
| LongCat 2.5 Preview Free | `opencode/longcat-2.5-preview-free` | Free | Historical text/tool profile; not rerun in this check. |
| GLM 5.3 Flash Free | `opencode/glm-5.3-flash-free` | Free | Fresh no-login text probe failed; no maintained profile. |
| DeepSeek V4.1 Flash Free | `opencode/deepseek-v4.1-flash-free` | Free | Fresh no-login text probe failed; no maintained profile. Distinct from old V4. |
| Beam Free | `opencode/beam-free` | Free | New candidate; no bridge profile or workflow verification. |
| LL Alpha Free | `opencode/ll-alpha-free` | Free | New candidate; no bridge profile or workflow verification. |
| Nemotron 3.5 Super VL Free | `opencode/nemotron-3.5-super-vl-free` | Free | New candidate; no bridge profile or image/workflow verification. |
| Nemotron 3.5 Lightning Free | `opencode/nemotron-3.5-lightning-free` | Free | No bridge profile; historical repair workflow timed out. |
| Muse Spark 1.2 Contributor Free | `opencode/muse-spark-1.2-contributor-free` | No matching current price row | No bridge profile. Current free pricing is not verified by the name alone. |

The API also lists `opencode/jev-1.13-free`, with free input/output in the pricing
table. Its System One endpoint evaluates structured decisions, so it is not
treated as a conversational Codex candidate.

## Changes since October 1

Five IDs were added: `beam-free`, `deepseek-v4.1-flash-free`, `glm-5.3-flash-free`,
`ll-alpha-free` and `nemotron-3.5-super-vl-free`. All five also have free price rows.

Four previously recorded IDs are absent from the current API:

| Exact OpenCode ID | Current interpretation |
| --- | --- |
| `opencode/nemotron-3-ultra-free` | Still in the price table, absent from the API. Existing historical bridge profile retained for installed configurations; revalidation required, not a recommended new selection. |
| `opencode/mimo-v2.5-free` | Still in the price table, absent from the API; no bridge profile. |
| `opencode/deepseek-v4-flash-free` | Absent from the current API and price table; no bridge profile. V4.1 is a separate candidate, not an alias. |
| `opencode/ling-3.0-flash-fin-free` | Absent from the current API and price table; no bridge profile. Historical diagnostic reported an unavailable endpoint. |

Absence is a discovery result, not proof of permanent retirement or a failed call.
`exo-free` is another free-priced entry absent from the API. Conversely, Muse 1.2
Contributor Free appears in the API without a matching current price-table row.
These discrepancies remain explicit rather than combining both sources into a
single “available and free” claim.

## Bridge compatibility

Six historical profiles remain in the source, including Nemotron 3 Ultra for
existing installations. Catalog candidates without a profile cannot be selected
by the maintained installer. A new profile requires route and client-tool
verification before being presented as usable. Only Muse 1.3 currently enables
image inputs. Names or upstream metadata describing VL, images or large context
windows do not extend the bridge's verified capabilities.

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

Current models.dev metadata could not be refreshed because its download did not
complete. The [October 1 receipt](receipts/free-models-catalog-20261001.json) is
preserved as historical evidence, not reused as current pricing or capacity.
See [source-specific workflow evidence](verification.md) for previous tests.

[English README](../README.md) · [中文 README](README.zh-CN.md)
