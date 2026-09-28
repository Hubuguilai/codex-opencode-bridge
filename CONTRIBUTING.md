# Contributing

Use Node.js 22 or newer. Run `npm ci --ignore-scripts`, `npm run check`, and `npm test`.
Tests are offline and need no provider credentials. Keep new runtime dependencies
justified and small. Add protocol regression tests for behavioral fixes.

The optional `npm run smoke -- --live` consumes your own OpenCode access and starts
its own process on the configured ports. Do not run it against another user's service.

A PR claiming tool compatibility must show the client→function call→client execution→
model result loop and identify where tools actually ran. Include upstream/runtime
versions in reproduction notes and omit all user prompts, keys and personal paths.
