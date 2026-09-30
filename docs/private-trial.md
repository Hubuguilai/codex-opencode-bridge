> Historical private-trial record. For the subsequent owner-authorized public scope, see [public-release.md](public-release.md).

# Private trial delivery / 私有试用交付

**0.2.0-rc.1 · 2026-09-30 · private, not a public release.**

按维护者要求，本轮以可评审的私有试用版本收尾。未通过的完整发布验收保留为后续事项，
不再为本次交付扩展边界测试。This is a bounded private trial candidate; deferred
acceptance gates below have not been passed.

## 用户入口 / Start here

- [中文 README：安装与可复制的 Codex Prompt](README.zh-CN.md#复制给-codex-的安装-prompt)
- [English README](../README.md)
- [OpenCode 账号、模型权限及官方入口](opencode-access.md)
- [故障排查](troubleshooting.md)；中文 README 同时包含完整诊断 Prompt。

普通安装入口为 `node bin/bridge.mjs install`，安装后执行
`node bin/bridge.mjs verify --live`，再重新打开 Codex 检查模型菜单。
真实验证使用用户自己的模型权限，可能消耗额度。依赖和冲突处理以 README 为准。

首批面向用户的配置是 Big Pickle（文本）与 Muse Spark 1.3 Contributor Free
（文本及图片）。安装器提供状态检查、模型调整、升级、回退、恢复和卸载。
仓库不提供共享账号、密钥或无限免费额度。

## 已验证 / Evidence

- 本地 222 项单元测试、语法检查及离线安装包检查通过。
- macOS 与 Linux、Node 22/24 的 GitHub CI 通过；这不代表 Linux 桌面安装已认证。
- 真实 Codex 经 Router 的两款模型文字/文件任务、Muse 上传图片及实际 `view_image`
  工具图片检查通过；图片字节完整性检查已记录。
- 隔离 macOS 服务的安装、重复执行、模型调整、升级、回退和移除有真实记录。
- 旧安装迁移组件完成七个真实 SIGKILL 检查点恢复演练，但尚未作为普通用户命令开放。

不同验证对应的源码版本及此前失败保留在[验证记录](verification.md)与
[机器可读检查表](release-readiness.json)。历史十项工作流、容量测试不能替代当前
完整桌面验收，也不能据此承诺与原生 GPT 的所有功能一致。

## 明确延期 / Deferred

1. 干净 macOS 用户或电脑仅按 README 完成安装，及最终版本的真实桌面菜单验收。
2. 登录后的 GPT 保留和当前版本全套模型工作流；已有隔离测试不替代这些检查。
3. 任意旧手动安装的一键迁移、任意崩溃时机恢复、完整长上下文与持续负载认证。
4. Windows/Linux 桌面安装，以及原生音频、视频、PDF 输入。

本次交付没有迁移维护者当前正在运行的手动安装，也没有重启其 Codex。
仓库中的视觉修复与测试不代表旧安装截图中的问题已经在原会话复验解决。
需仓库所有者另行决定是否公开；本候选不改变仓库私有状态。
