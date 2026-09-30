# Account walkthrough provenance

Checked 2026-09-30. These are public source/documentation checks, not a completed
signed-in browser session. The web fetch could not follow the auth redirect and
the in-app browser timed out. No account was created, payment submitted, key
created, or existing credential read. No screenshots of an account are claimed.

The official repository tree used was
`anomalyco/opencode@2fa3363c924c5c3e367b84a87ae478296a0ed59b`.

| Tutorial detail | Official source |
| --- | --- |
| GitHub and Google sign-in; verified email requirements | [auth.ts](https://github.com/anomalyco/opencode/blob/2fa3363c924c5c3e367b84a87ae478296a0ed59b/packages/console/function/src/auth.ts) |
| Workspace chooser, Create New Workspace and Create flow | [workspace-picker.tsx](https://github.com/anomalyco/opencode/blob/2fa3363c924c5c3e367b84a87ae478296a0ed59b/packages/console/app/src/routes/workspace-picker.tsx) |
| API Keys navigation | [workspace route](https://github.com/anomalyco/opencode/blob/2fa3363c924c5c3e367b84a87ae478296a0ed59b/packages/console/app/src/routes/workspace/%5Bid%5D.tsx) |
| Create key name field, creation action, copy icon and masked display | [key-section.tsx](https://github.com/anomalyco/opencode/blob/2fa3363c924c5c3e367b84a87ae478296a0ed59b/packages/console/app/src/routes/workspace/%5Bid%5D/keys/key-section.tsx) |
| New-user Copy Key shortcut and billing/login hints | [new-user-section.tsx](https://github.com/anomalyco/opencode/blob/2fa3363c924c5c3e367b84a87ae478296a0ed59b/packages/console/app/src/routes/workspace/%5Bid%5D/new-user-section.tsx) |
| Exact English control labels | [en.ts](https://github.com/anomalyco/opencode/blob/2fa3363c924c5c3e367b84a87ae478296a0ed59b/packages/console/app/src/i18n/en.ts) |

Source availability does not establish which deployment or experiment a user
will see. Payment requirements and eligibility must be read in that user's console.

The README and agent prompt are deliberately written for the public release
scenario. Editing those documents does not authorize or perform a repository
visibility change. Prior private-trial receipts remain historical evidence.
