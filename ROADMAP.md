# Roadmap

## 0.2.0-rc.1 delivered scope

- [x] Authenticated local OpenCode v2 runtime and Chat/Responses transport
- [x] Official plugin relay of actual Codex tool schemas/calls/results
- [x] Native message history, namespaces, custom tool input and call identities
- [x] Real Codex file/command/follow-up/repair workflows on Space Bunny Free
- [x] Live denied approval, cancellation, timeout and recovery checks
- [x] Negative Nemotron receipts retained; experimental status is explicit
- [x] Independent Router/LiteLLM/forwarder protocol rehearsal with mock upstream
- [x] Reversible isolated configuration preparation; no live settings overwritten
- [x] English/Chinese documentation, MIT license, prior-art review and CI

## Follow-up: tool visibility

- [x] Official plugin removal of internal registrations and context schemas
- [x] HTTP request tool-name checks with sanitized A/B/A receipts
- [x] Full real-Codex Space Bunny hidden-tool workflow receipt
- [ ] Repeated hidden-tool workflow reliability and failure diagnosis
- [ ] Upstream-supported path for Nemotron hidden-tool requests (currently 403)

## Remaining product work

- [ ] Reliable native workflows for Nemotron and other runtime-only free models
- [ ] Live Desktop picker migration and UI acceptance, separately authorized
- [ ] More models certified with their own repeated real-client receipts
- [ ] Long-context/multimodal validation and per-model maximum capability evidence
- [ ] Crash-recovery journal for sessions whose creation response was lost
- [ ] Stronger isolation of third-party plugins/MCP beyond trusted local configuration
- [x] Incremental native visible-text events, explicit failure semantics and real-client regression
- [ ] Public-release decision after support boundaries and upstream access are reviewed

The private candidate is not a universal or unlimited free API gateway. Windows,
multi-user hosting, automatic key/account routing and quota circumvention are
outside the current scope. See [verification](docs/verification.md) for the exact
model boundary and [acceptance contract](docs/native-codex-target.md) for the goal.
