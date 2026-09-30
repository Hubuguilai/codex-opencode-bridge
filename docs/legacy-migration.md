# Legacy macOS migration — internal candidate

The migration coordinator is implemented and has passed an isolated real-service
rehearsal. It is not yet exposed as an end-user CLI command. Do not replace the
normal installation instructions with a hand-written migration procedure.

It validates an explicit running legacy native bridge LaunchAgent, matching
loopback Router endpoint, protected local token and complete model selection.
It saves the original plist and a private migration journal, prepares an independent
managed release on different ports, and retains the original context preferences.
The candidate must become healthy before source reconciliation and route cutover.
Only after publication and further health checks does it stop the old service and
remove its startup plist. Its original private backup remains available.

A migration failure first restores the original service and waits for health,
then restores the original provider and model entries, then stops the candidate.
Route recovery accepts known before/after states of the adopted entries, preserves
unrelated model entries, and refuses unknown changes. Registration writes are
atomic. The migration record retains enough state for explicit recovery; it is
not a claim that every coordinator process-termination boundary is certified.
Edited candidate credentials are preserved and cause migration to stop rather
than being silently overwritten.

The [real-service receipt](receipts/desktop-migration.json) covers healthy cutover,
injected failure after actual publication, retry, repeated migration, credential
and context preservation, and recovery from a reconstructed retirement boundary.
It uses real launchd services, the pinned official OpenCode runtime and actual
Router publication in isolated state. The native login-status probe is synthetic.
It performs no model inference and suppresses shared Router service restart.
All test services were stopped afterward.

Initial rehearsals found and fixed an empty visibility-list call, a readiness
race when restoring the old service, and a missing dependency binding for the
new readiness helper. These failures are retained in the verification ledger.

Seven real SIGKILL checkpoints now pass: partial preparation, healthy candidate,
provider-only write, model write, publication completed, legacy retired and
completed journal before installation bookkeeping. See the
[crash receipt](receipts/desktop-migration-crash-recovery.json). This covers those
checkpoints, not every possible dependency/publication-child interruption.

Required before exposing the command: reconciliation plus cutover on a customized Router fixture,
Router restart with current client requests, and end-user command/diagnostic
integration. Actual account, Desktop picker, model workflow and clean-user
acceptance remain separate requirements. The maintainer's active manual
installation has not been migrated by this rehearsal.

中文版：旧服务迁移编排已在隔离的真实 macOS 服务和 Router 上验证，但还没有开放为
普通用户迁移命令。已验证先启动健康的新服务、切换路由、停用旧服务，以及失败回退、
重复执行和旧服务停用后的恢复。七个关键时点的真实进程强制终止及恢复测试已通过；仍需完成带本地修改的
Router 联合演练、Router 重启及桌面验收。演练没有迁移当前用户的运行服务。
