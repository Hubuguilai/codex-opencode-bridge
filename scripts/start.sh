#!/bin/bash
# Bootstrap only. Model/service logic remains in the bridge installer.
set -euo pipefail
umask 077
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
if [[ "$(uname -s)" != Darwin ]]; then
  echo '当前一键安装仅支持 macOS / This installer currently supports macOS.' >&2; exit 2
fi
support_dir="${BRIDGE_BOOTSTRAP_DIR:-$HOME/.local/share/codex-opencode-bridge/bootstrap}"
node_ok() { command -v node >/dev/null 2>&1 && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=19)?0:1)' >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; }
if ! node_ok; then
  case "$(uname -m)" in
    arm64) node_arch=arm64; node_sha=23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53 ;;
    x86_64) node_arch=x64; node_sha=8a677b0219178efd6eb0e475457c4afb452b521a92f6e67845a73bd85727f2a8 ;;
    *) echo 'Unsupported Mac architecture.' >&2; exit 2 ;;
  esac
  node_name="node-v22.23.3-darwin-$node_arch"
  node_dir="$support_dir/$node_name"
  [[ ! -L "$support_dir" && ! -L "$node_dir" ]] || { echo 'Bootstrap path is a symlink; preserve it and diagnose.' >&2; exit 2; }
  mkdir -p "$support_dir"
  if [[ ! -e "$node_dir" ]]; then
    stage_dir="$(mktemp -d "$support_dir/.download.XXXXXX")"
    trap 'rm -rf "$stage_dir"' EXIT
    echo '正在准备独立 Node.js，不改动系统安装 / Preparing private Node.js…'
    curl --fail --location --proto '=https' --tlsv1.2 --connect-timeout 20 --max-time 180 \
      "https://nodejs.org/dist/v22.23.3/$node_name.tar.gz" -o "$stage_dir/node.tar.gz"
    actual_sha="$(shasum -a 256 "$stage_dir/node.tar.gz" | awk '{print $1}')"
    [[ "$actual_sha" == "$node_sha" ]] || { echo 'Node download checksum mismatch.' >&2; exit 2; }
    tar -xzf "$stage_dir/node.tar.gz" -C "$stage_dir"
    # Never overwrite an existing installation, including a concurrent install.
    [[ ! -e "$node_dir" ]] || { echo 'Node destination appeared; rerun the command.' >&2; exit 2; }
    mv "$stage_dir/$node_name" "$node_dir"
  fi
  export PATH="$node_dir/bin:$PATH"
  node_ok || { echo 'Private Node.js is incomplete. Preserve it for diagnosis.' >&2; exit 2; }
fi
# Desktop builds may carry their own CLI even when it is absent from PATH.
if ! command -v codex >/dev/null 2>&1; then
  for app_root in /Applications "$HOME/Applications"; do
    for app_name in Codex ChatGPT; do
      for suffix in Contents/Resources/codex Contents/Resources/codex-cli/bin/codex Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex; do
        candidate="$app_root/$app_name.app/$suffix"
        if [[ -x "$candidate" ]]; then export PATH="$(dirname "$candidate"):$PATH"; break 3; fi
      done
    done
  done
fi
for prerequisite in git python3 codex; do
  if ! "$prerequisite" --version >/dev/null 2>&1; then
    if [[ "$prerequisite" == codex ]]; then
      echo '未找到 Codex CLI。让 Codex 按 docs/agent-install.md 定位桌面内置 CLI，或安装官方 CLI 后重试。' >&2
    else
      echo '需要 Apple 开发工具：运行 xcode-select --install，在系统窗口完成安装，再回到同一对话继续。' >&2
    fi
    exit 2
  fi
done
if [[ "${1:-}" == --dependencies-only ]]; then
  [[ $# == 1 ]] || { echo 'Unexpected arguments.' >&2; exit 2; }
  echo '依赖已就绪 / Dependencies ready. No model or service configuration changed.'
  exit 0
fi
cd "$repo_dir"
exec node bin/bridge.mjs "${@:-help}"
