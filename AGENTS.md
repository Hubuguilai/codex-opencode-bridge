# Working on this repository

- Preserve the user's active Codex/Router/OpenCode configuration and services.
- Do not commit credentials, local auth files, prompts, logs or user paths.
- Use the installed official OpenCode runtime; do not add identity-spoofing or quota evasion.
- Keep provider eligibility separate from transport compatibility.
- Run npm run check and npm test for implementation changes.
- Live tests use real model access and must be explicitly requested/authorized.
- Unsupported features must fail explicitly. Never silently discard content or tool calls.
- Plan mode/empty directories are not an OS security boundary; document the distinction.
- Keep this repository private unless the owner explicitly authorizes publication.
