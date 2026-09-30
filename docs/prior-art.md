# Prior-art review — 2026-09-28

Reviewed repository metadata, README and selected implementation paths using GitHub.
These are implementation/documentation observations, **not live compatibility tests
of the third-party projects**. Stars are deliberately not used as quality evidence.

| Repository | License at review | Architecture / relevance |
|---|---|---|
| [TiaraBasori/OpenCode2API](https://github.com/TiaraBasori/OpenCode2API) | MIT | Closest feature set: local OpenCode runtime, Chat/Responses SSE, external tool contracts, continuation and Docker. README advertises more coverage than our prototype. |
| [grigio/opencode-openai-api-proxy](https://github.com/grigio/opencode-openai-api-proxy) | MIT | Local OpenCode server plus direct-model routes. Includes a v2 client and Codex notes. Mode determines whether tools run in client or server. |
| [bunrots/codex-opencode-go-bridge](https://github.com/bunrots/codex-opencode-go-bridge) | No detected repository license | Responses ↔ Go Chat Completions adapter; targets paid Go/native client tools, not official local free-model sessions. Source not reused. |
| [6Kmfi6HP/opencode2api](https://github.com/6Kmfi6HP/opencode2api) | GitHub reports NOASSERTION; not a reuse clearance | Direct Zen/Go gateway. Relevant evidence that upstream protocol/eligibility differs by route and changes over time. |

Snapshots inspected:

- TiaraBasori: `1c80d16801b1d79bdb865ed93f14b5de4bad4d69`; selected `src/proxy.js`
  uses `@opencode-ai/sdk`, `client.session.create` and `client.session.prompt`.
  Tool contract definitions also reviewed. Compatibility with our installed v2.0.18
  has not been established by running this project.
- grigio: `e9af5678852c8135d90c055de12341a7288d5fe9`; selected `proxy/v2-client.ts`
  contains v2 session calls and handling for differing prompt envelopes. Its README
  describes additional direct upstream paths and identity/header handling; those
  paths are not implemented here.
- bunrots: `51090fc2fe406969eb970a134a19604de22c74d6`; README explicitly separates
  Desktop provider selection from the worker/CLI protocol experiment.

## Correction to the earlier compatibility conclusion

[Issue 19](https://github.com/6Kmfi6HP/opencode2api/issues/19) originally reported
free-model 403 failures while the official client worked. It is now **closed**, with
maintainer comments reporting fixes and successful model probes. Therefore the old
issue is not evidence that every current external gateway fails. The maintainer's
claim is also not a local verification or a universal guarantee of free-tier access.

## Decision

Do not claim novelty or rebuild the entire feature surface of existing gateways.
Keep this private project as a small, auditable, dependency-free v2 session adapter
based on the user's already exercised prototype. Prioritize explicit feature
boundaries, authenticated loopback, cancellation and verification. Our first version
is **less capable** than the tool support claimed by the closest alternatives.

Revisit adoption/forking of the MIT projects if native tool forwarding becomes the
next requirement. First reproduce their full client→tool→result loop on the exact
runtime/model and document where tools execute; do not infer this from README text.
No source code from these repositories was copied into this implementation.

Official interface references:

- [OpenAI Responses streaming](https://developers.openai.com/api/docs/guides/streaming-responses)
- [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
- [OpenCode server documentation](https://dev.opencode.ai/docs/server/)

For OpenCode v2 request shapes, the installed 2.0.18 server's `/openapi.json` was
queried directly. It requires `{text}` on `/api/session/{id}/prompt`; older/other
versions can differ. HTTP 200 HTML is not treated as JSON API readiness.

## Native-tool implementation decision — 2026-09-29

The requirement advanced beyond v0.1. Review of OpenCode2API's parser and prompt
contract found a text-markup normalization path; no code was copied. This project
instead uses the official v2 plugin registration and tool hooks to capture actual
function invocations. The installed `@opencode/plugin` and `@opencode/ai` 2.0.18
schema declarations were inspected for native message/tool-result shapes. SDK
packages are not bundled or imported as runtime dependencies.

Relevant official interfaces:

- [OpenCode v2 plugins](https://opencode.ai/v2/docs/build/plugins)
- [OpenCode v2 tools and Code Mode boundaries](https://opencode.ai/v2/docs/tools/)
- [OpenCode v2 permission rules](https://opencode.ai/v2/docs/permissions)

The direct dispatcher has a complete Space Bunny control receipt. The opt-in
Code Mode dispatcher remains experimental. Nemotron did not pass the complete
workflow gate, and removing all internal tool definitions produced an upstream
access rejection. Neither a README claim nor an isolated successful call overrides
those local negative results. No identity/header spoofing was introduced.
