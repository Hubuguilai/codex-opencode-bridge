# Managed Router compatibility

The bridge requires the pinned Router revision in `runtime/router.json` plus the
shipped strict-image and terminal-error change in `runtime/router-compatibility.json`. The change is
part of this repository and package; no developer-machine patch is required.

Only models registered with `bridgeStrictImages: true` receive the new behavior:
unsupported images produce HTTP 422 before a model request. The Router frontend
and API forwarder enforce this separately. Image-capable routes continue to carry
the original image bytes. `visionBridge: false` also prevents this installation
from asking another model to describe images for text-only models.

`install` checks the exact source hashes before modifying either Router file.
It stores original files and an application record in the protected
`.bridge-router-compatibility` directory under the selected Router installation.
Repeated application is idempotent. Interrupted source application can continue
only when every file matches either its exact original or patched version.
Unknown edits, changed backups, symlinks and mismatched records stop the operation.

These files belong to a shared dependency. Bridge uninstall retains the Router,
its compatibility changes and backups. Removing the bridge's registered models
removes their opt-in; unrelated routes retain upstream behavior. Do not restore
old Router source underneath an active strict-media registration. Arbitrary
Router upgrades and dependency downgrade/recovery are not automated yet.

`status` checks source compatibility and model capability metadata without
inference. `verify --live` requires both to match. With an older **managed** bridge
registration, run `models` with the same desired model IDs using the current
release to refresh its owned profiles transactionally. This does not adopt an
older manual service or overwrite unknown Router edits. Full first-time Router
setup recovery remains distinct from this source-change recovery.

## 中文

安装器使用仓库随附的严格图片检查改动，只对本项目注册的模型生效。文字模型收到
图片时直接返回明确错误；视觉模型仍传递原始图片。不会用另一个模型替它读图。

修改前核对准确的源码版本并备份。重复执行不会重复修改；中途失败后，只在原文件、
已修改文件和备份均与记录相符时继续。遇到用户修改或未知版本时保留现场并停止。

卸载桥接时保留共享 Router、兼容改动和备份。旧版受管理安装可用当前版本的
`models` 命令重新指定同一组模型来刷新配置；之前手工配置的服务仍需要单独迁移。
这项恢复能力不代表首次 Router 安装的所有失败阶段、任意 Router 升降级都已覆盖。


## Terminal-error compatibility and upgrading v1

The current compatibility ID is `strict-images-terminal-errors-v2`. On the
`opencode-native-bridge` provider route, a bounded SSE transform converts the
gateway’s untyped error objects back into Responses failure events. Recognized
401/403/429, cancellation/deadline and context messages receive fixed safe
categories; unknown failures receive a generic gateway error. Raw upstream error
content is not copied into client responses. Each parsed frame is limited to
1 MiB; an oversized frame fails explicitly. Other providers are unchanged.

The installer recognizes the exact completed `strict-image-input-v1` record. It
validates every old file and original backup before recording migration intent,
then applies v2. An interrupted v2 migration accepts only the recorded old/new
hashes and resumes; unknown changes stop before mutation. An already interrupted
v1 installation must first be recovered with its matching version.

`upgrade` applies dependency compatibility before stopping the bridge, then
republishes/restarts the registered Router after the new bridge is healthy. An
already-current bridge still performs compatibility checking and publication.
A later upgrade failure restores the earlier bridge and republishes its model
registration. The additive Router compatibility change and original backups
remain: bridge rollback/uninstall does not downgrade shared Router source.

中文版：v2 同时包含严格图片检查和错误事件修复。安装/升级会校验已完成的 v1
记录，保留原始备份后迁移；迁移中断可继续，未知改动不会被覆盖。升级会重新发布
并重启 Router，使源码修复生效。桥接代码回退或卸载时保留共享 Router 的兼容修复，
不会把旧 Router 源码覆盖回去。它不修复模型本身的图片识别能力。


## Read-only preflight for modified manual installations

`node bin/bridge.mjs migration-preflight --router-root /absolute/router` checks
the pinned Git baseline and attempts a three-way merge in private temporary
files. It reports source fingerprints, conflicts and whether original files
remained unchanged. It never writes to the selected Router, changes its Git
index, restarts services, reads credentials or adopts model registrations.
A clean merge is only a source reconciliation result; behavioral compatibility,
service ownership, credentials, model preferences and transaction recovery
still require migration work. The current installer continues to refuse edited
unowned source. This command is not a force-install bypass.

中文版：`migration-preflight` 只读检查旧 Router 的源码合并条件。检测到冲突时
不会向原文件写入冲突标记；检查通过也不代表已迁移。现有安装器仍不会直接接管
有修改但没有归属记录的手工安装。


## Legacy route transaction (internal component)

`inspectLegacyRouterRoute` checks the existing loopback Responses provider, its
explicit local credential reference, equality with the old bridge's local token,
the complete model set and each context preference. Its snapshot contains hashes,
not credential contents. Preparation requires the same model set and preferences.
Normal registration still refuses an unowned provider; the separate internal
`adoptLegacyRouterRoute` operation rechecks the snapshot under Router's transaction
lock, preserves the existing credential, updates the endpoint and strict-image
profiles, and creates a managed ownership record. Private pre-mutation snapshots
remain available. A failed publication restores the old state and republishes it.
A successful adoption can be revalidated by normal managed registration.

The [isolated rehearsal](receipts/legacy-route-adoption.json) uses the real Router
publication and transaction code; only the native signed-in status probe is a
synthetic fixture. It performs no inference and restarts no services. Native
catalog preservation here is not actual account-login or Desktop acceptance.

This component is not exposed as a complete migration CLI. Old-service ownership,
source reconciliation application, new-service health before cutover, durable
process-crash recovery, service rollback and eventual old-service retirement must
be coordinated before using it on a manual installation. Transaction exception
recovery does not by itself certify recovery from process termination.

中文版：已实现并隔离验证旧路由接管组件，保留凭据和上下文偏好，发布失败可恢复。
完整旧服务迁移仍未接入安装命令；本组件测试不代表当前电脑已完成迁移，也不代表
进程意外终止、真实登录状态或桌面菜单验收通过。

## Explicit reconciliation of locally modified source

The internal `reconcileRouterSource` component applies a previously inspected
three-way merge on the pinned Git revision. It stores private original files and
a durable reconciliation intent before applying the compatibility repair. Normal
compatibility inspection, repeated installation and same-version upgrade then
recognize this explicitly adopted source. They reconstruct the expected merge
from the pinned ancestor, shipped repair and saved original customization, rather
than trusting an arbitrary replacement-source hash. Git HEAD and index stay intact.

Stale preflight, overlapping edits, changed original evidence, symbolic links,
subsequent unrecorded source edits and a different compatibility version stop the
operation. A future repair version requires a deliberate reconciliation upgrade;
the current implementation does not silently reinterpret old customizations.
Both exception interruption and a real SIGKILL between source writes are covered
by recovery tests, including stale-lock recovery. This is process interruption
coverage, not a power-loss durability claim.

A [rehearsal on a disposable copy](receipts/source-reconciliation.json) of the
maintainer's actual two compatibility files reproduced the proposed hashes,
retained original customization and passed syntax/repeat/recovery checks. The
active source was unchanged and no service restarted. This does not certify
behavior of every other local modification. Full manual-service migration still
needs to coordinate source adoption, new-service health, route cutover, Router
restart, fallback and old-service retirement. No complete migration CLI is yet
exposed.

中文版：显式源码迁移组件已能保留本地修改并应用兼容修复，普通兼容检查可识别
迁移后的源码；真实强制终止后的恢复测试也已通过。当前电脑的运行源码仍未修改，
完整服务迁移和真实桌面验收仍待完成。
