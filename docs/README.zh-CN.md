# codex-opencode-bridge

让你在 Codex 的模型菜单中选择经过验证的 OpenCode 模型，文件操作和命令仍由
Codex 执行。桥接在本机运行，使用官方 OpenCode 运行时和你自己的模型权限。

[English](../README.md) · [账号与模型获取](opencode-access.md) ·
[验证记录](verification.md) · [发布验收清单](release-readiness.json)

**当前是私有开发候选 0.2.0-rc.1，尚未公开发布。** 安装器已经实现，但还没有完成
干净电脑上的完整桌面安装验收。升级与模型调整的服务生命周期已通过测试；部分首次
安装恢复、真实桌面验收及发布版本的完整模型任务验证仍未完成。安装命令成功不等于所有 Codex 功能已经通过验收。

## 从这里开始

优先验证的平台是 **macOS arm64**。macOS x64 尚未实测，Windows/Linux 桌面安装
不能视作已支持。请先安装 Codex、**Node.js 22.19+ 和 npm**。首次下载 Router 需要
Git；文件工具兼容别名需要 Python 3。目前尚未自动安装 Node。

1. 按[OpenCode 账号与模型获取说明](opencode-access.md)登录自己的供应商，并确认
   准确的模型可以在 OpenCode 中回答。密钥只填进本地登录流程，不要发进聊天。
2. 获取本仓库。仓库仍是私有，需要协作者访问权限。
3. 在仓库目录执行安装命令，或把下方完整提示词复制给 Codex。

```sh
git clone https://github.com/Hubuguilai/codex-opencode-bridge.git
cd codex-opencode-bridge
node bin/bridge.mjs install
node bin/bridge.mjs verify --live
```

安装器会复用已有兼容 Router；缺失时下载固定版本，然后安装独立的 OpenCode
2.0.18、准备默认两款模型、启动本地服务、检查健康状态并注册模型。已有同名供应商
不会被静默覆盖。具体边界见[安装流程](desktop-install.md)。
安装器还会应用仓库随附、经过文件版本核对的 Router 图片兼容改动，并保留受保护的
原文件备份；遇到未知版本或已有源码修改会停止，不会直接覆盖。

`verify --live` 会使用你自己的模型权限，可能消耗付费额度。它启动临时 Codex 客户端，
通过已安装的 Router 连接桥接服务，为每款模型检查随机文字回复和临时文件任务，并为 Muse
分别检查上传图片和工具返回图片。验证记录保存在安装目录的 `verification` 子目录，权限受保护。
排障时可用 `verify --live --route bridge` 单独检查桥接服务。图片验证以模型本身的
声明能力为准，不把 Router 调用其他模型的图片转述算成该模型的视觉能力。
最新完整 Router 测试中，两款模型的文字/文件任务、Muse 上传图片和实际工具返回
图片均通过，并核对了图片字节完整性。[此前失败和最新记录](verification.md#image-byte-integrity-and-task-history-isolation)
均已保留，不能据此承诺所有长对话视觉任务都可靠。
工具返回图片检查要求实际调用 `view_image` 打开指定文件并准确识别图中内容；
命令或 OCR 替代不算通过。该检查不代表真实桌面菜单、权限拒绝、完整工作流或
长上下文已经验收。遇到账号权限或限流错误时，停止后续模型检查。
`doctor` 和 `status` 仍是不会调用模型的只读检查。

成功后完全退出并重新打开 Codex，在模型菜单中选择：

- **Big Pickle (OpenCode Native Bridge)**
- **Muse Spark 1.3 Contributor Free (OpenCode Native Bridge)**

首次验证建议新建对话。菜单可见、文字回答、文件任务成功和图片理解是不同的检查。
以前手动配置的模型可能使用旧名称；新安装器遇到身份冲突会停止，不会直接接管。

## 复制给 Codex 的安装 Prompt

```text
请使用当前 codex-opencode-bridge 仓库维护的安装器完成配置。
先阅读 README.md、docs/desktop-install.md 和 docs/opencode-access.md。
检查 macOS、Node 22.19+/npm、Git、Python 3、Codex、已有 Router 和配置，以及我的
OpenCode 模型访问权限。保留原有 GPT、其他供应商和登录状态。密钥只通过本地登录
流程输入，不要让我贴到聊天中。执行仓库的 install 命令，遵守现有备份与归属检查，
不要绕过冲突或删除不完整的安装记录。如果需要我登录或重启 Codex，说明准确步骤。
安装后运行 verify --live，使用我的模型权限并报告各项结果；然后验证真实菜单，再分别测试文字、读取文件、创建和修改文件、多轮继续任务以及
适用的权限拒绝。Muse 要分别测试上传图片和 view_image 工具返回图片，使用提示词中
未透露的图片细节验证。逐项记录实际结果和未验证事项，不要把服务健康或一句问候
当作完整安装验收，也不要宣称使用效果与原生 GPT 完全一致。
```

## 模型能力与证据

文档核对日期：**2026-09-30**。目录容量、配置阈值和实际测试是不同的信息。

| 模型 | 新安装的上下文 / 自动压缩阈值 | 图片 | 当前证据 |
| --- | --- | --- | --- |
| Big Pickle | 200,000 / 160,000 tokens | 仅文本 | 固定源码 3a096e9 已通过十项工作流；见[测试记录](receipts/big-pickle-frozen-workflows-20260930.json) |
| Muse Spark 1.3 Contributor Free | 1,048,576 / 891,289 tokens | 上传图片、工具返回图片 | 真实 Codex 图片检查通过；固定提交 3a096e9 的十项工作流全部通过 |

Muse 完成过一次总计 1,041,600 tokens 的近容量标记检索测试。它不代表持续负载、
并发、复杂长文推理或精确溢出边界已经通过验证。见[容量记录](muse-capacity.md)和
[图片验证](images.md)。其他模型的历史实验保留在[验证文档](verification.md)，
不能据此把所有模型都列为首发支持。

目前不支持原生音频/视频/PDF 输入、供应商托管工具、可调推理档位、结构化最终输出、
存储/后台 Responses 和 previous_response_id。模型本身的能力和供应商可用性不会
被桥接改变。Codex 执行客户端工具，OpenCode 仍提供自己的运行时与系统上下文。
详见[安全边界](security.md)和[工具语义](client-aliases.md)。

## 遇到问题

```sh
node bin/bridge.mjs doctor
node bin/bridge.mjs status
```

`doctor` 是只读依赖检查，`status` 汇总受管理安装的记录、服务健康和模型目录。
它们不调用模型，也不等于完整安装验收。找不到新安装器的记录不代表旧版手动配置已损坏。它通过 PATH/OPENCODE_BIN 查找 OpenCode；
如果使用独立管理的运行时，需要结合安装记录里的路径判断，不能把“PATH 中未找到”
直接当作模型不可用。见[故障说明](troubleshooting.md)。

可以复制以下诊断 Prompt：

```text
请诊断当前 codex-opencode-bridge 安装，先不要替换配置。
阅读 README.md 和 docs/troubleshooting.md。从准确错误及安装记录开始，检查依赖、
记录中的运行时、service-status、本地健康状态、模型注册和供应商权限。
不要打印令牌、认证文件、原始对话或私有备份。区分本地认证失败、上游 401/403、
本地 bridge_busy、供应商 429、输入上下文超限、输出上限、工具参数不兼容、
不支持的输入/工具、超时与流中断。使用实际失败的
模型和输入方式复现，不要用纯文本问候代替图片或工具返回图片测试。保留现有模型和
诊断证据，通过项目维护的恢复命令进行可逆修复。遇到归属冲突时说明具体原因，
不要强行覆盖；不要循环重试配额错误。报告复现了什么、修改了什么、验证了什么，
以及哪些结论仍不确定。
```

新安装会保存并校验独立的代码副本，后台服务运行该副本。更新仓库文件不会自动替换正在使用的版本，重复安装也保留已选择的版本。旧安装继续保留原来的服务路径。通过下面的升级命令显式切换版本。

## 重试、调整、升级与卸载

- **重复安装或恢复桥接安装失败**：使用相同参数再次运行 `install`。程序校验已有
  文件，保留旧计划与备份，再继续配置。
- **卸载**：运行 `node bin/bridge.mjs uninstall`。移除本项目的模型注册和服务，
  保留已有 Router、其他模型、登录、备份与准备目录。可用相同安装命令重新安装。
- **首次选择模型**：通过 `--models` 指定文档支持的准确 ID。
- **调整已安装模型**：先结束正在运行的任务，再提供希望保留的完整模型列表。
  只保留 Big Pickle：`node bin/bridge.mjs models --models opencode/big-pickle`。
  同时启用两款：`node bin/bridge.mjs models --models opencode/big-pickle,opencode/muse-spark-1.3-contributor-free`。
  程序同步更新服务允许调用的模型与菜单目录，保留本地令牌，检查服务后再发布菜单。
  失败时恢复原选择。完成后重新打开 Codex 并验证实际任务。
- **模型调整中断**：先运行 `node bin/bridge.mjs recover-models`，恢复保存的配置和
  模型目录，再进行其他安装操作。遇到额外用户修改时不会强行覆盖。
  删除整个接入请使用 `uninstall`，不能传入空模型列表。
  后续运行 `install` 时，省略 `--models` 会保留记录中的模型选择。
- **升级**：先结束正在运行的模型任务，再从准备使用的项目版本运行
  `node bin/bridge.mjs upgrade`。程序保存代码副本，按需安装该版本固定的 OpenCode
  运行时，切换本项目服务并检查健康状态。模型注册、凭据和准备配置保持原样。
  新版本启动检查失败时，会自动恢复原版本并检查原服务。
- **回退**：运行 `node bin/bridge.mjs rollback`，切回上一个受管理的代码与运行时
  组合；两个版本的副本都会保留。
- **升级中断**：运行 `node bin/bridge.mjs recover-upgrade` 恢复升级前记录的版本。
  留有升级恢复记录时，应先恢复，再安装或卸载。记录或代码被修改时不会强行覆盖。
  尚未保存独立代码副本的旧安装需要迁移，目前会明确提示，不能直接使用这些命令。
- **Router 首次安装失败**：下载或依赖准备失败后可重新运行 `install`；会先检查源码
  和上次的子进程，再继续准备。上游明确返回“配置未完成”时也可重试。桌面设置阶段
  的崩溃或普通失败仍需状态恢复，不能假定已经回滚。桥接阶段的自动恢复
  不能代替所有 Router 安装阶段的恢复。

这些命令验证的是启动健康，不代表模型工作流已验收。升级后仍需复验实际任务。
固定版本的 Router 兼容修复已纳入管理；任意未来版本的升级和配置格式迁移尚未自动化。
旧服务迁移已通过隔离的真实服务演练，普通用户迁移命令仍待完成，详见[迁移范围](legacy-migration.md)。

默认安装状态目录是 `~/.local/share/codex-opencode-bridge/desktop`。如果首次使用
自定义 `--directory`，后续操作也需使用同一路径。备份可能包含敏感本地状态，请勿
上传。卸载不等于删除全部日志、凭据和第三方依赖。

## 开发与发布

```sh
npm run check
npm test
npm run test:package
```

真实模型测试会使用账号额度，需要操作者明确授权。[开发手动配置](manual-api.md)、
[验证记录](verification.md)、[相关项目](prior-art.md)和[许可证](../LICENSE)
分别记录技术细节、证据及来源。

发布前仍需完成：按本 README 在干净环境安装、真实菜单与登录后的 GPT 保留、
当前源码整套模型任务、重启/升级/完整生命周期，以及 GitHub 默认分支一致性。
未经仓库所有者批准，不公开发布。

升级也会安装仓库随附的 Router 错误事件修复并重新发布模型配置。桥接版本回退时
保留该共享依赖的兼容修复及备份，不会覆盖回旧 Router 源码。
