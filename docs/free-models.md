# Free-model catalog snapshot — 2026-10-01

Checked at **2026-10-01 21:53 China Standard Time (UTC+08:00)**. This is a dated
catalog and pricing check, not a new generation, installation or workflow test.

Each conversational model below was present in the public [OpenCode Zen model
endpoint](https://opencode.ai/zen/v1/models) and had zero input/output prices in
[models.dev's OpenCode metadata](https://models.dev/api.json) at the check time.
The [official Zen pricing documentation](https://opencode.ai/docs/zen/#pricing)
is another source; its table does not yet describe every entry in the live API
snapshot. Names containing “free” alone are not treated as pricing evidence.

| Model | Exact OpenCode ID | Bridge status |
| --- | --- | --- |
| Big Pickle | `opencode/big-pickle` | Existing bridge profile; see README for default/optional/experimental status. |
| DeepSeek V4 Flash Free | `opencode/deepseek-v4-flash-free` | No bridge profile; not installable through the maintained model-selection command. Historical repair check failed before a client command. |
| Muse Spark 1.3 Free | `opencode/muse-spark-1.3-contributor-free` | Existing bridge profile; see README for default/optional/experimental status. |
| Muse Spark 1.2 Free | `opencode/muse-spark-1.2-contributor-free` | No bridge profile; not installable through the maintained model-selection command. |
| MiMo-V2.6-Flash Free | `opencode/mimo-v2.6-flash-free` | Existing bridge profile; see README for default/optional/experimental status. |
| Space Bunny Free | `opencode/space-bunny-free` | Existing bridge profile; see README for default/optional/experimental status. |
| LongCat 2.5 Preview Free | `opencode/longcat-2.5-preview-free` | Existing bridge profile; see README for default/optional/experimental status. |
| MiMo V2.5 Free | `opencode/mimo-v2.5-free` | No bridge profile; not installable through the maintained model-selection command. |
| Ling 3.0 Flash Fin Free | `opencode/ling-3.0-flash-fin-free` | No bridge profile; not installable through the maintained model-selection command. Historical diagnostic reported an unavailable endpoint. |
| Nemotron 3 Ultra Free | `opencode/nemotron-3-ultra-free` | Existing bridge profile; see README for default/optional/experimental status. |
| Nemotron 3.5 Lightning Free | `opencode/nemotron-3.5-lightning-free` | No bridge profile; not installable through the maintained model-selection command. Historical repair workflow timed out. |

Jev 1.13 Free is also listed and labelled free in the official documentation,
but its System One endpoint evaluates structured decisions instead of serving
ordinary chat. It is not included as a conversational Codex model candidate.

Only six IDs currently have profiles in `src/model-profiles.mjs`. The default
quickstart is Big Pickle; Muse is an explicit optional route. Four other profiles
are historical text/tool experiments, not current release certification. Other
catalog entries need adaptation and verification before the installer can select
them. See [source-specific workflow evidence](verification.md).

No inference was sent during this check. Availability, account/region access and
limits still need validation on the user's exact route. Model metadata describing
images, audio, video or PDF does not extend this bridge's supported inputs.

[Sanitized source snapshot](receipts/free-models-catalog-20261001.json) ·
[English README](../README.md) · [中文 README](README.zh-CN.md)
