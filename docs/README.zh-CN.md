# codex-opencode-bridge

把用户有权使用的 OpenCode 模型接入 Codex 的本地兼容服务。当前为私有候选版本 **0.2.0-rc.1**。Space Bunny Free、Nemotron 3 Ultra Free、MiMo V2.6 Flash Free 、LongCat 2.5 Preview Free 和 Big Pickle 已通过真实客户端完整验收。整体仍属于实验性文本与工具兼容，不代表所有模型和界面功能完全一致。

## 已经验证到哪一步

通过真实 Codex CLI 和会话服务，已经分别完成：读取随机标记、计算并写入 Markdown、
执行验证命令、同一会话继续修改、修复失败的 Python 测试。修复过程中出现了 Codex
原生文件修改事件。审批拒绝后目标文件不存在；取消、超时及后续恢复测试也已经通过。
客户端工具别名模式下，以上模型已通过七项验收；Nemotron 在同一运行时源码上连续两次完整通过。旧版本的失败记录仍然保留。

曾发生模型误选 OpenCode 内部工具的失败。桥接阻止了该操作，而没有让 OpenCode
绕过 Codex 修改文件。当前最多允许一次纠正性重试；上游访问拒绝、配额错误、已经
输出部分内容的请求和用户拒绝不会因此被重试。完整记录见
[开发验收证据](native-tool-progress.md)。

## 工作方式

Codex 把对话和工具定义发给桥接；桥接通过 OpenCode 官方 v2 插件注册真实函数工具。
模型返回结构化参数后，插件只记录并等待中断，桥接将调用交回 Codex。文件、命令和
补丁由 Codex 自己执行，结果再进入下一次模型请求。这里没有把文本中的 JSON 或标签
冒充成工具调用，也没有让第二个 OpenCode 代理替 Codex 完成工作。

当前已经使用 OpenCode 原生消息结构传递对话和配对的工具调用/结果。系统与开发者
指令映射到 OpenCode 的同一种指令角色，其系统上下文仍参与，因此不能宣称与 GPT
模型完全相同。原生流式模式订阅 OpenCode v2 的实时文本事件，边生成边转发，结束时与完整消息核对。
事件断连会明确失败，不会自动重连并假设中间没有丢字。详见 [流式验证](native-streaming.md)。

## 运行

需要 Node.js 22+、已安装的 OpenCode v2 和自己的上游访问权限。已实测版本是
OpenCode 2.0.18、Codex 0.157.1。旧的 v1 服务接口不兼容。

```sh
npm ci --ignore-scripts
node bin/bridge.mjs init
BRIDGE_MODE=native-tools BRIDGE_MODELS=opencode/space-bunny-free npm start
```

如果 OpenCode 不在 PATH 中，设置 `OPENCODE_BIN` 为已安装可执行文件的绝对路径。
服务默认只监听 `127.0.0.1:4396`，管理的 OpenCode 使用 4397 端口；Ctrl-C 一起停止。
本地访问令牌放在仓库外的私有文件中，`init` 只打印文件路径，不打印令牌。
默认 `text` 模式保留旧版纯文本能力；Codex 工具任务必须明确启用 `native-tools`。

运行实际验收：

```sh
BRIDGE_TEST_MODEL=opencode/space-bunny-free node scripts/native-acceptance.mjs --live
```

验收默认使用另一对端口 4596/4597、临时工作区和临时 Codex 会话；不修改当前
Codex/Router 配置，不迁移已有模型。脱敏结果保存在 `generated/`，原始提示词和模型
输出不会进入发布记录。该命令会实际使用上游额度。

## 能力与限制

- 支持文本、流式响应、Responses 函数工具、命名空间及自定义自由格式工具。
- 支持 Chat Completions 函数工具；自定义工具使用 Responses。
- 思考选项只有 `default`，表示保持上游默认行为；不会伪装成支持 low/high。
- 不支持图像、音频、文件上传、托管搜索、结构化最终输出、存储响应或后台响应。
- 模型目录中的 32k 是保守测试预算，不是模型上下文上限。
- 每个运行实例同时只处理一个原生工具请求，超出返回 429。
- 普通 HTTP 200 或一句问候不等于工具兼容验收。

[Codex 配置说明](codex.md)提供独立测试样例。安装服务不会自动增加桌面模型菜单项。
与 GPT、DeepSeek 等现有模型共存需要已有路由器的独立提供方和模型目录配置；
独立 Router → 网关 → 转发层的协议演练已通过，保留原目录条目并完成清理；这使用的是
模拟上游，不等于桌面界面已经部署。当前没有改动用户正在使用的菜单。

`prepare` 命令在新目录生成配置、目录副本和本地令牌；`remove-prepared` 可以撤销，
遇到用户修改或残留运行目录会拒绝删除。它们不会替换默认 Codex 配置或安装常驻服务。

临时工作目录与插件限制不等于操作系统沙箱，仍需信任本机 OpenCode 和其插件配置。
项目不提供账号、密钥或免费额度，不绕过供应商访问规则。MIT 许可证只覆盖本项目代码。

## 彻底隐藏内部工具（实验功能）

`BRIDGE_INTERNAL_TOOLS=hidden` 配合 `BRIDGE_MODE=native-tools` 和默认的 direct
传输，会移除 OpenCode 内部工具注册、过滤模型上下文工具列表，并检查发送给上游的
HTTP 工具名称。模型仅看到桥接的 Codex 工具；执行前的权限保护仍保留。
默认的 `guarded` 模式继续保留内部定义但禁止执行。

真实 A/B/A 对照中，Nemotron 的 guarded 两次成功，hidden 返回 HTTP 403；
Space Bunny 三次均成功返回客户端工具调用。这证明隐藏机制可以生效，但不能保证
每个模型允许这样的请求。完整工作流及适用范围见 [工具屏蔽验证](tool-surface.md)。


## 多模型与客户端工具别名

`BRIDGE_INTERNAL_TOOLS=client-aliases` 把模型惯用的 `read`、`write`、`edit`、`shell`
转换成实际 Codex `exec_command` 调用。OpenCode 的原始工具执行器仍被拦截，文件修改和
命令运行由 Codex 执行，并遵守其审批结果。模型也可以直接选用原本的 Codex 工具。

文件别名需要客户端环境中的 Python 3，文本修改会在 Codex 里显示为命令执行；这条
路径不会伪造 `apply_patch` 文件差异界面。因此现在可以报告真实工作流通过，仍不能
宣称所有使用细节与 GPT 一模一样。[语义与限制](client-aliases.md)给出了完整边界。

多模型验收可以复现：

```sh
BRIDGE_MATRIX_DIR=generated/my-matrix node scripts/model-matrix.mjs --live \
  --models opencode/nemotron-3-ultra-free,opencode/mimo-v2.6-flash-free,opencode/space-bunny-free
```

每个精确模型 ID 独立运行，记录源码摘要、真实文件校验、拒绝权限和取消恢复。
可加 `--repair-only` 先检查修复任务；它不能替代完整验收。模型列表不等于访问权限，
官网 API 列表、models.dev 和当前 OpenCode 运行时列表也可能不同；以实际调用结果为准。


一次准备五个通过验收的模型：

```sh
node bin/bridge.mjs prepare /absolute/new/bridge-config \
  --models opencode/space-bunny-free,opencode/nemotron-3-ultra-free,opencode/mimo-v2.6-flash-free,opencode/longcat-2.5-preview-free,opencode/big-pickle
```

生成的模型目录和服务允许列表保持一致，默认选用第一个模型，并启用客户端工具别名。
可用 `--model` 指定列表中的另一个默认模型。生成配置仍与当前正在使用的桌面配置分开，
不会自动重启服务或替换 GPT、DeepSeek 等已有路线。


生成后可以直接启动，不必重新手填环境变量：

```sh
node bin/bridge.mjs serve-prepared /absolute/new/bridge-config
```

命令会检查配置完整性，使用该目录自己的模型列表、端口和访问令牌；终端中遗留的
`BRIDGE_*` 设置不会覆盖它。已安装 OpenCode 的路径、上游凭据和网络设置仍可继承。
配置修改或目录搬迁后需要重新生成；这些检查用于防止误配置，不是可信软件签名。
启动服务本身不会修改桌面的模型菜单，也不会安装后台常驻服务。


## 桌面模型菜单接入预览

新增 `prepare-router` 可以基于现有路由器目录，生成独立提供方、五个模型条目和完整的
菜单预览。此次本机预览保留原有 53 个条目，新增 5 个，合计 58 个；不会修改正在使用
的路由配置、复制密钥或重启服务。新增名称均带 `(OpenCode Native Bridge)`，与旧桥接区分。

五条路线已通过独立 Router/LiteLLM/转发层测试，Codex 本身也能解析新目录。此处上游
是模拟服务，因此它证明接入结构与工具调用传递，不代表上游访问限制已经解除。
真正激活仍需刷新共享路由服务、由用户退出再打开 Codex，再检查实际菜单与真实任务。
详见 [桌面接入说明](desktop-integration.md)。
