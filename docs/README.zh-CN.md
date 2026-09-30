# 在 Codex 里使用 OpenCode 模型

**实验性预发布版：0.2.0-rc.1。** [已验证范围与已知限制](public-release.md)。

**先取得模型，再把下面一段话复制给 Codex。安装、配置和测试交给它完成。**
你不需要提前下载这个项目，也不需要手动修改配置文件。

[English](../README.md) · 当前优先支持 macOS Apple Silicon，处于试用阶段。
Intel Mac 尚未实测；Windows/Linux 暂不提供这条安装路径。

## 第一步：选好你要用的模型

**第一次使用，推荐先选 Big Pickle。** 它能处理文字、代码和文件任务，不支持看图。
2026-09-30 的独立测试中，它在没有账号、没有 API Key 的 OpenCode 环境里直接回答成功。
你可以直接进入第二步，让 Codex 安装并确认你所在地当前也能使用；**不必为了它先购买 Go 订阅**。
免费供应、限流和地区规则可能变化。

**需要看图，再选 Muse Spark 1.3 Contributor Free。** 它在官方免费目录中，但本次
无登录测试返回“当前国家不可用”。不要把这个错误当成安装失败，也不要为了消除错误
盲目充值。已有可用账号的用户，应先确认 OpenCode 中这个准确模型能回答。
[按步骤取得模型：免费、登录、Go 订阅分别怎么做 →](opencode-access.md)

**需要账号和 Key？照这条路径操作：**

1. 打开 [OpenCode 登录页](https://opencode.ai/auth)，选择自己的 **GitHub 或 Google** 账号登录。
2. 进入控制台后使用默认工作区；需要选择时点 **Select workspace**。
3. 首页如果有 **Copy Key**，直接复制。否则点 **API Keys → Create API Key**。
4. 名称填 `Codex Bridge`，点 **Create**，再点击新 Key 那一行的复制图标。
5. 先保存到自己的密码管理器，**不要把 Key 发进聊天**。继续下面第二步；Codex 需要认证时会给你本地登录入口。
6. 在那个本地窗口输入 Key，登录成功后回到原对话说“登录完成，请继续”。

看到 **Enable billing** 是账单设置，**Subscribe to Go** 是可选订阅，都不要误当成
本项目必须购买的东西。每一步应该看到什么、找不到 Key 或遇到收费页面如何处理，
见[带完成标志的详细注册教程](opencode-access.md)。

## 第二步：把这一整段复制给 Codex

打开 Codex，选择一个目前能正常使用的模型，新建**本地**对话。可以使用任意空文件夹；
不需要先把本仓库添加成项目。复制下面整段并发送：

```text
请帮我在这台 Mac 的 Codex 中安装并配置 codex-opencode-bridge：
https://github.com/Hubuguilai/codex-opencode-bridge
请下载仓库 main 分支，先阅读 README 和 docs/agent-install.md，再实际完成安装，
不要只给我操作步骤。我没有提前下载项目或准备运行环境，请你检查并准备所需依赖。
默认安装 Big Pickle；如果我另行说明需要 Muse，也请加入并分别验证。
请使用项目提供的统一安装入口，保留已有 GPT、其他模型、登录和配置。
我授权运行所选模型的必要验证；不要替我购买订阅、充值或开启付费后备。
需要我登录 OpenCode 或完成系统授权时，一次告诉我一个具体操作；API Key 只在
本地登录窗口输入，不要让我发进聊天。完成后报告测试结果，并告诉我重开 Codex 后
应该选择哪个模型。若失败，请诊断并修复可逆问题，明确仍需我处理的事项。
```

想同时加入 Muse？在上述 Prompt 末尾加一句：
**“我已确认 Muse Spark 1.3 Contributor Free 在我的 OpenCode 中可用，请同时安装并验证它的图片能力。”**
不确定就先装 Big Pickle，之后再加。

过程中通常只需你完成必要的 OpenCode 登录或系统开发工具安装提示。
Codex 会继续处理余下步骤。安装可能下载依赖，请等它报告结果，不用反复发送 Prompt。

## 第三步：重开 Codex，选择模型

等 Codex 报告实际测试通过后，**完全退出 Codex，再重新打开**。点击输入框旁的模型菜单：

| 你选择安装的模型 | 菜单中显示的名字 |
| --- | --- |
| 默认 | **Big Pickle (OpenCode Native Bridge)** |
| 可选视觉模型 | **Muse Spark 1.3 Contributor Free (OpenCode Native Bridge)** |

新建对话，试试：“在当前空文件夹创建 hello.txt，写入 hello，再读取文件确认内容。”
Muse 可以再上传一张无敏感信息的图片，让它描述具体内容。菜单出现但任务失败时，使用下面的诊断 Prompt。

## 没装好？复制这一段

```text
请诊断我的 codex-opencode-bridge 安装。先查找之前的项目目录和安装记录，阅读其中
的 docs/agent-install.md 和 docs/troubleshooting.md。不要覆盖配置或重装一遍碰运气。
检查 status、后台服务、模型菜单注册以及实际失败的模型；区分仓库下载失败、缺依赖、
OpenCode 登录、地区/模型权限、429 限流、图片不支持和流中断。
不要输出 Key、认证文件或原始私有对话。只用项目维护的恢复方式处理可逆故障。
告诉我出了什么问题、修复并验证了什么，以及现在只需要我完成的一个操作。
```

## 以后怎么管理

继续在同一 Codex 对话里说下面任意一句即可；具体命令由它按[安装操作手册](agent-install.md)执行：

- “检查桥接是否正常。”
- “我确认 Muse 可用，请保留 Big Pickle 并加上 Muse，测试图片。”
- “升级桥接，并验证还能正常使用。”
- “卸载桥接，保留我的其他模型和登录。”

当前只优先交付这两款模型；支持 OpenCode 不等于它里面所有模型都已经适配。
不支持原生音频、视频或 PDF 输入。完整能力、上下文与历史测试见[进阶说明](advanced.zh-CN.md#模型能力与证据)。
[本轮实测与未验收事项](onboarding-verification.md)明确区分隔离演练和真实新用户桌面验收。
