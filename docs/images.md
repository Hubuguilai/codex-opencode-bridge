# Image input through official OpenCode

Native mode accepts inline PNG/JPEG/WebP/GIF image data URLs in user messages
for models explicitly listed in `BRIDGE_IMAGE_MODELS`. This is a capability
allowlist, not a way to add vision to a text-only model. The default is empty.

Responses `input_image` and Chat Completions `image_url` parts are preserved
alongside text in the original order. The bridge submits image attachments to
the official OpenCode prompt API and reuses the resulting native media assets
in its context hook. This matters on OpenCode 2.0.18, where a media asset is a
runtime object, not a JSON object with `mediaType` and `data` fields. Base64 is
never embedded as prose in the fallback conversation prompt.

Remote/file URLs, file IDs, audio/video/PDF,
images in assistant/system messages, and images in tool results are currently
rejected explicitly. The HTTP body byte limit still applies. This does not
establish multimodal or long-context parity with an OpenAI model.

Nonautomatic detail settings are rejected by default. Codex clients can send
`high`/`original` image detail even without a matching model capability. For
desktop compatibility, `BRIDGE_IMAGE_DETAIL_POLICY=auto` explicitly delegates
low/high/original hints to OpenCode's automatic image processing, preserving the
submitted bytes at the bridge boundary and emitting `image_detail_auto` in the
response warning header and service log. This does not promise original image
resolution or identical token accounting after OpenCode preprocessing.

Live verification on 2026-09-29: the exact model
`opencode/muse-spark-1.3-contributor-free` read a random six-character code and
identified three colored squares in order through the native bridge. Separate
Codex patch create/update/denial scenarios passed. The plain external Zen
Responses route returned an OpenCode-only free-tier denial; these results apply
to the official OpenCode runtime route, not unrestricted direct API access.
