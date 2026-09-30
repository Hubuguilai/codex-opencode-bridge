# Contributing

Use Node.js 22 or newer. Run `npm ci --ignore-scripts`, `npm run check`, `npm test`,
and `npm run test:package`.
Tests are offline and need no provider credentials. Keep new runtime dependencies
justified and small. Add protocol regression tests for behavioral fixes.

The package check builds a local tarball and installs it offline into a temporary
prefix with lifecycle scripts disabled. It exercises the installed executable,
five-model preparation, source catalog preservation, Router plan export and
removal. It checks required packaged assets and rejects known local-state files,
credential patterns and personal paths. These pattern checks are not an exhaustive
secret audit. Nothing is published or installed globally; no provider API is used.

The optional `npm run smoke -- --live` consumes your own OpenCode access and starts
its own process on the configured ports. Do not run it against another user's service.

A PR claiming tool compatibility must show the client→function call→client execution→
model result loop and identify where tools actually ran. Include upstream/runtime
versions in reproduction notes and omit all user prompts, keys and personal paths.
