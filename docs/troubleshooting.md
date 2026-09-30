# Troubleshooting / 故障诊断

Start with the exact model, input mode, error code and time. Do not print tokens,
keys, auth files, private backups or raw request bodies. A short text response
cannot disprove an image/tool-history failure. This guide describes current
errors; some upstream generation failures still use a broad category.

| Symptom / code | Meaning | Next step |
| --- | --- | --- |
| Local `401 unauthorized` | Bridge token does not match | Check the owned service and Router credential linkage; do not replace OpenCode login |
| `upstream_access_or_quota`, HTTP 401 | Provider rejected authentication | Use the official local OpenCode login flow and verify the same provider/model |
| Same code, HTTP 403 | Model/account/route access was denied | Confirm eligibility and exact route; a catalog listing is not permission |
| Same code, HTTP 429 | Provider allowance or rate limit | Check the console and retry timing; do not loop or bypass limits |
| Local `429 bridge_busy` | The local bridge has an active request | Allow that request to finish or cancel it in its client; check cleanup before another request |
| `unsupported_feature` / `unsupported_tool_alias` | Request mode or tool arguments are not supported | Inspect the actual feature and configured profile; do not silently delete content |
| Text-only error after `view_image` | Wrong model/profile, old runtime, or missing tool-image conversion | Muse's uploaded-image and tool-result paths are separately tested; Big Pickle remains text-only |
| `recursive_tool_schema_relaxed` warning | Muse's recursive JSON schema was relaxed for upstream compatibility | This is a compatibility warning, not a task success claim; client argument validation remains |
| `input_too_large` / HTTP 413 | Request exceeded the configured byte limit | Check attachment/request size; this is not a token-context measurement |
| `generation_failed` | OpenCode reported a generation error | Inspect private local runtime diagnostics for schema/context/provider details; this category is not yet fully specific |
| `request_cancelled` / HTTP 504 | Cancellation or deadline | Check whether the client cancelled, whether the model was slow, and whether the session cleaned up |
| Stream closes without completion | No completed answer was received | Record the final stream event and matching runtime error; do not treat partial text as success |
| `relay_plugin_unavailable` | Client-tool guard did not load | Verify the pinned runtime, installed bridge package and plugin setup before sending another task |
| Ownership/configuration conflict | Existing files differ from managed records | Preserve the files and inspect the change; do not use force/reset to hide it |

## Inspect an installed bridge

The installation record is `desktop-install.json` under the selected installation
directory. It contains paths and phase information, not the bridge token. Use its
`prepared` path with:

```sh
node bin/bridge.mjs service-status /absolute/prepared/directory
```

`loaded` means macOS accepted the service registration. `running` means launchd
reports a process. Neither establishes provider access. A helper can read the
local token privately for authenticated health/model checks; it must not put the
value into displayed commands, URLs or logs.

The bridge-stage `install` command can resume its own incomplete record or an
uninstalled preparation. It validates files and retains earlier plans. A Router
bootstrap incomplete record, user edits, or an ambiguous lock require diagnosis.
Never remove a lock solely because a request has been slow: verify the owning
process is no longer alive.

## Evidence to report

Report the model ID, installed revision/runtime version, failing input mode,
error category, affected operation, exact checks performed and their results.
Distinguish configuration changes from service reloads, application restarts,
picker checks and completed model turns. Sanitized evidence is enough; raw
credentials or private conversations are not needed in an issue report.

## 中文要点

先区分本地桥接和上游模型：本地令牌错误不等于 OpenCode 登录失败，本地忙碌不等于
供应商额度用尽，请求字节超限也不等于模型上下文窗口超限。

当前仍有较宽泛的 `generation_failed` 分类，不能仅凭这一行断言一定是上下文、
网络或模型能力问题。需要结合私有运行日志进一步判断。长时间没有结果时，也不要
直接删除锁或重启另一份服务；先检查原进程和请求是否仍在运行。

图片故障必须按图片输入方式复现。直接上传图片能用，不代表 `view_image` 返回的
图片也能用；反之亦然。完成错误定位后应重试原失败方式，而不是只测试一句问候。
