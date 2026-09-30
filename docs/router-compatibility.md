# Managed Router compatibility

The bridge requires the pinned Router revision in `runtime/router.json` plus the
shipped strict-image change in `runtime/router-compatibility.json`. The change is
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
