# Unified installer candidate

The unified command reuses an existing compatible Codex Router. When absent, it
downloads the source revision pinned in `runtime/router.json`, installs its locked
Node dependencies and invokes its own installer. Managed upgrades, model-set
changes are implemented and isolated-tested; recovery of a failed first-time Router setup remains pending. This is a development
candidate, not the complete README installation promised for the release.

From the bridge checkout/package, on macOS:

```sh
node bin/bridge.mjs install
```

Defaults: install under `~/.local/share/codex-opencode-bridge/desktop`, discover
Router under `~/.local/share/codex-router`, and select Big Pickle plus Muse Spark
1.3 Contributor Free. Override discovery with `--router-root`; use `--directory`
for a separate managed installation and `--models` for documented model IDs.
An existing selected Router must already be set up for this user's Codex. Existing bridge
providers are not silently adopted; identity conflicts stop before registration.

The command installs its pinned OpenCode runtime, chooses unused local ports,
prepares model configuration, registers a macOS service, waits for bridge and
OpenCode health, then publishes model entries through the Router. A successful
return still requires model-access and real Codex workflow verification. It does
not equate a health response with a working model or restart Codex automatically.

Repeat installation with the same options rechecks the service and registration
without adding duplicates. On failure, the installation phase is saved in
`desktop-install.json`, the new service is stopped where possible, and local
preparation and rollback evidence remain. Re-run the same install command to
resume a bridge-stage failure: it validates prepared files, preserves the old plan
in history, and regenerates a current plan when no registration exists. Existing
registrations undergo ownership checks. A verified dead installer lock is
recoverable; ambiguous locks are retained for diagnosis. Router bootstrap failures
have a separate record and are not yet automatically resumed. Do not delete
evidence or edit credentials to force a retry.

To remove this installation's routes and service:

```sh
node bin/bridge.mjs uninstall
```

Use the same `--directory` if a custom location was selected. The existing shared
Router, other models, provider logins, backups, and bridge preparation remain.
Removal stops if ownership checks find user edits or dependent models. Re-running install after uninstall reuses the verified preparation and regenerates
the integration plan. Runtime cleanup and upgrades are not yet integrated.

## Installation Prompt for the current candidate

This prompt uses the maintained installer and reports any unresolved prerequisite
or incomplete installation. Full clean-machine acceptance remains pending.

```text
Set up this codex-opencode-bridge checkout using its maintained installer.
Read README.md and docs/desktop-install.md first. Check macOS, Node/npm, Codex,
the existing Codex Router location, and the user's OpenCode model access.
Keep credentials in local provider login flows; never ask me to paste keys here.
Run the supported install command, using explicit paths only when discovery needs
them. Preserve existing models and login. If prerequisites or ownership conflict,
report the exact missing step; do not overwrite existing installation records.
After installation, distinguish service health, model access, picker visibility,
and real text/tool/image workflow results. Explain any required Codex restart.
Do not call the installation verified until those client checks actually pass.
```

## 中文说明

当前可用的统一安装命令会串起运行时、模型准备、后台服务和模型注册。它会
复用已有兼容的 Codex Router；缺失时会下载固定版本并调用上游安装器。首次完整
桌面安装尚未实测。升级和修改模型集合已经通过隔离测试，Router 首次安装失败的恢复尚未完成，
因此仍是开发候选。桥接安装阶段失败后可重新执行同一安装命令；程序会校验原文件、
保留旧计划和备份，并继续配置。卸载后也可用同一命令重新安装。

安装成功返回只代表配置流程完成，还需验证模型权限、重启后的菜单及真实任务。
卸载保留已有 Router、其他模型、账号登录和备份；遇到用户修改时会停止并说明原因。

可交给 Codex 的候选版提示词：

```text
请阅读当前 codex-opencode-bridge 仓库的 README.md 和 docs/desktop-install.md，
使用仓库维护的安装命令配置 Big Pickle 与 Muse。先检查 macOS、Node/npm、Codex、
已有 Router 和 OpenCode 模型权限。密钥只通过本地登录流程输入，不要让我贴进聊天。
保留现有模型和登录。若前置条件缺失或已有配置冲突，报告具体原因，不要覆盖配置
来强行继续，也不要自行编造尚未实现的安装步骤。安装后分别验证服务健康、模型权限、
菜单可见性和真实文字/工具/图片任务，并说明是否需要我重启 Codex。未实测的项目
明确标记为未验证，不要把安装命令成功当作全部验收通过。
```


Pinned dependency checks on 2026-09-30 downloaded the exact upstream revision and
installed its Node dependencies. The upstream full setup step was intercepted in
that download test, so a complete first-time desktop setup is **not yet verified**.
A separate real publication test used the unmodified downloaded source, generated
both bridge model entries, removed them again, and preserved an adopted user
catalog file. It did not restart a service, inspect a Desktop picker, or exercise
a signed-in GPT session. Fresh Router setup uses `--no-provider` without
`--no-discovery`: the latter disables all configured routes and prevents the
new bridge models from being published.


## Reproduce the tested lifecycle

```sh
node scripts/desktop-lifecycle-check.mjs --live /absolute/router-directory
```

This opt-in check creates an actual macOS bridge service with isolated Router and
Codex configuration, publishes real model catalog entries, tests repeat install,
uninstall, reinstall and an injected post-health failure followed by resume. It
then stops its service and checks that both ports are released. It uses the
pinned OpenCode runtime and makes no model requests. The existing Router service
is not restarted, and no Desktop picker or signed-in GPT session is exercised.
The successful 2026-09-30 [receipt](receipts/desktop-lifecycle.json) is narrower
than full clean-machine acceptance.
