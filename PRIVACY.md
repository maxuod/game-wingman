# Privacy / 隐私说明

Updated: 2026-09-24. This describes the current prototype, not future functionality.

## Desktop application

- You explicitly choose a window or import an image. The app does not automatically capture the whole desktop or record audio.
- Preview frames stay in application memory. Pausing releases the capture stream and retains the last preview; switching input, closing the main window or quitting clears it.
- The app does not upload screenshots or game state and has no telemetry or automatic feedback submission.
- Clicking **Sync data** contacts Riot Data Dragon and stores a public name dictionary in the OS application-data directory under `Game Wingman/tft-na-catalog.json`.
- Electron and the operating system may maintain normal application caches, permissions and diagnostic information. “No application screenshot saving” does not guarantee that operating-system swap or diagnostics never write memory to disk.

## Optional developer API probe

`api:check` without `--probe` is local only. `--probe` requires a selected provider key and `AI_ENABLED=true`; it sends one fixed text prompt to MiniMax, DeepSeek or Gemini. Provider policies and charges apply. It does not read or send screenshots, environment variables other than the selected credentials/config, or local files. No live probe runs automatically during install, startup, tests or CI.

Keys remain in your local environment or ignored `.env`, which is plaintext on your computer and is not a credential vault. Do not sync or share it. This configuration path is a developer facility; secure OS credential storage is still a follow-up task before a user-facing API settings UI.

## Feedback

GitHub Issues and pull requests are public. Remove keys, account identifiers, player chat, notifications and personal data before attaching evidence. No screenshot is required to report a bug. See [SECURITY.md](SECURITY.md) for sensitive security reports.

中文：当前桌面版不上传截图、不录音、不自动发送诊断。可选 API 检查只有手动加 `--probe` 且主动启用后才发送固定文字。`.env` 仅作本地开发配置，不是加密凭据库；请勿提交或公开。
