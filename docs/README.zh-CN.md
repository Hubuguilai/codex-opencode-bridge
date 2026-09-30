# codex-opencode-bridge

让你在 Codex 的模型菜单中选择经过验证的 OpenCode 模型，文件操作和命令仍由
Codex 执行。桥接在本机运行，使用官方 OpenCode 运行时和你自己的模型权限。

[English](../README.md) · [账号与模型获取](opencode-access.md) ·
[验证记录](verification.md) · [发布验收清单](release-readiness.json)

**当前是私有开发候选 0.2.0-rc.1，尚未公开发布。** 安装器已经实现，但还没有完成
干净电脑上的完整桌面安装验收。升级、修改模型集合、部分首次安装恢复及当前源码的
完整模型任务验证仍未完成。安装命令成功不等于所有 Codex 功能已经通过验收。

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
```

安装器会复用已有兼容 Router；缺失时下载固定版本，然后安装独立的 OpenCode
2.0.18、准备默认两款模型、启动本地服务、检查健康状态并注册模型。已有同名供应商
不会被静默覆盖。具体边界见[安装流程](desktop-install.md)。

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
安装后验证真实菜单，再分别测试文字、读取文件、创建和修改文件、多轮继续任务以及
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
本地 bridge_busy、供应商 429、不支持的输入/工具、超时与流中断。使用实际失败的
模型和输入方式复现，不要用纯文本问候代替图片或工具返回图片测试。保留现有模型和
诊断证据，通过项目维护的恢复命令进行可逆修复。遇到归属冲突时说明具体原因，
不要强行覆盖；不要循环重试配额错误。报告复现了什么、修改了什么、验证了什么，
以及哪些结论仍不确定。
```

## 重试、调整、升级与卸载

- **重复安装或恢复桥接安装失败**：使用相同参数再次运行 `install`。程序校验已有
  文件，保留旧计划与备份，再继续配置。
- **卸载**：运行 `node bin/bridge.mjs uninstall`。移除本项目的模型注册和服务，
  保留已有 Router、其他模型、登录、备份与准备目录。可用相同安装命令重新安装。
- **首次选择模型**：通过 `--models` 指定文档支持的准确 ID。修改已安装的模型集合
  尚未实现。
- **升级**：自动升级及回滚命令尚未实现。不要覆盖正在运行的代码后就认定升级成功。
- **Router 首次安装失败**：它有单独的不完整记录，需要诊断；桥接阶段的自动恢复
  不能代替所有 Router 安装阶段的恢复。

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
