# Managed macOS service component

This is an installer component, not the completed desktop installation flow.
It does not register models with Codex or change the user's normal configuration.
The first tested platform is macOS arm64; x64 and other platforms are not certified.

After preparing a bridge directory and obtaining an executable from
`install-runtime`, use:

```sh
node bin/bridge.mjs install-service /absolute/prepared/directory --binary /absolute/opencode/executable
node bin/bridge.mjs service-status /absolute/prepared/directory
node bin/bridge.mjs remove-service /absolute/prepared/directory
```

The service starts at login through the user's macOS LaunchAgent domain. Paths
with spaces are supported. The project checkout/package must stay at its original
location while the service uses it. The command checks both configured ports
before a first installation, but port availability cannot be reserved across
process startup; inspect service status and HTTP health after installation.

`loaded` means launchd accepted the registration; `running` means launchd reports
a running process. Neither proves upstream login or successful model inference.
The full installer must additionally check bridge health and model workflows.

The service records ownership and a checksum of its property list. A repeated
installation reuses the registration. It refuses to overwrite unknown or edited
service files. A failed initial bootstrap removes only the new registration and
retains logs for diagnosis. Uninstall stops this service and removes its owned
registration, preserving the preparation, local token and logs. It does not
uninstall OpenCode, erase provider login, or edit Codex models.

Keys are not placed in the property list. OpenCode continues using its own local
credential store; bridge authentication stays in its private token file. Only
PATH and the selected executable are explicitly added to the service environment.
Shell-only proxy settings are not yet imported; network/proxy diagnostics remain
part of the full installer work.

Live lifecycle verification on 2026-09-30 installed this component with a newly
prepared directory and separate ports, reached its authenticated model endpoint,
repeated installation, then removed the service while preserving preparation and
token. No inference was performed in that lifecycle test. This is not a clean
operating-system installation, upgrade, reboot, or Desktop picker certification.

## 中文说明

这组命令用于安装、检查和移除 macOS 后台服务，是完整安装器的组成部分。
目前不会自动把模型加入 Codex 菜单，也不会修改用户的 Codex 配置。

服务成功注册与模型能够回答是不同的检查。重复执行会复用本项目的注册记录；
如果文件被用户修改，会保留文件并报出原因。移除服务只停止并取消本项目的
后台注册，保留模型准备目录、凭据和诊断日志。已用独立端口完成真实安装、
重复安装和移除测试，系统重启、升级与完整桌面安装仍需继续验收。
