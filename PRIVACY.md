# Privacy / 隐私说明

Updated: 2026-09-24. This describes the current prototype, not future functionality.

## Desktop application

- Equipment tracking uses the existing explicit live-image consent and shared CNY 10 budget. Fresh recognized inventories automatically drive local crafts for a selected or currently recommended comp; manual corrections are optional. Viewing a comp's augment section sends only its public ID, TFT patch and language to OP.GG. The main process reads the page's public recommendation module as text, never executes it, and uses a fixed OP.GG endpoint. Names/tiers/round availability are cached in `tft-augment-cache/` under the app profile; no screenshots, credentials or player identifiers enter this public cache or request.

- You choose a window or import an image. User-authorized auto discovery can select a unique game window by exact title and, on Windows, game-process main-window handle; ambiguous matches require selection. This uses window/process metadata, not game memory or client credentials. It starts local preview only. The app does not capture the whole desktop or record audio.
- Preview frames stay in application memory. Pausing releases the capture stream and retains the last preview; switching input, closing the main window or quitting clears it.
- Preview alone does not upload screenshots. **Recognize this frame** pauses capture and asks for confirmation before sending one image. **Start live tracking** separately asks for session consent naming the selected window, model and endpoint; consenting sends sampled screenshots every 5–15 seconds until stopped, capped or expired. No audio, telemetry or automatic feedback submission.
- Recognized fields stay in session memory and can be corrected. A new input or resumed capture clears observations and cancels pending recognition. Consented recognition also attempts to extract the current player's remaining item components and finished items. A manually confirmed inventory stays in session memory until reset or input change. Local craft planning uses this inventory and the explicitly selected comp; it does not evaluate opponents or augments. Ambiguous or stale AI inventories cannot produce current craft advice.
- Live fields and up to eight change summaries stay in session memory. Their capture time and stopped/stale status remain visible. Screenshots are not saved by the app.
- The first DeepSeek test stores a durable local budget ledger (`Game Wingman/deepseek-baseline-budget.jsonl`): request ID, timestamps, token counts, latency, reservations and settlements. No images, prompts, names or keys are included. It persists across restart to enforce the cumulative CNY 10 cap; manual and probe requests share that cap. See [budget behavior](docs/deepseek-first-test.md).
- Clicking **Sync data** contacts Riot Data Dragon and stores a public name dictionary in the OS application-data directory under `Game Wingman/tft-na-catalog.json`.
- Versioned snapshots contain all 50 current OP.GG main-page comp variants, 137 items and 55 recipes. Daily startup checks fetch Riot's fixed public updates directory, a validated official patch URL and the fixed OP.GG comps page. Valid same-day cache is reused; rankings refresh after six hours or an official change, with one-hour retry backoff on failure. Manual refresh can force a check. These requests contain no keys, screenshots or game data. They do not download software or rewrite equipment recipes.
- `Game Wingman/tft-public-data-v1.json` stores validated public comp facts, official patch metadata/content hashes, check/attempt timestamps and ranking comparisons across restart. It contains no screenshot, player identifier, personal equipment inventory or key. Remote scripts and strategy prose are not used. Official patch changes flag recipes for review; **View source** opens a fixed or validated official public page in the system browser.
- **Copy team code** writes the selected reviewed OP.GG code to the system clipboard only when clicked. No clipboard reading, automatic copying, game input or network request occurs for this action.
- Electron and the operating system may maintain normal application caches, permissions and diagnostic information. “No application screenshot saving” does not guarantee that operating-system swap or diagnostics never write memory to disk.

## Optional developer API probe

API keys can be pasted into a masked desktop field after selecting the provider, or imported from a user-selected `.env` / JSON file. A newly entered key travels one way through a main-window-only IPC call to OS encryption; it is never returned by settings/state queries. The input clears after saving, changing key provider or closing the settings dialog. Saved ciphertext is outside the repository. Saving/importing never enables AI, switches the active model, tests a key or spends the budget. Exported templates contain empty fields only, even when keys are already configured; removal targets the explicitly selected key provider. Known filled-template filenames are Git-ignored and excluded from packages.

Visible hero/item/augment icons are fetched by the main process from validated `https://c-tft-api.op.gg/img/set/…` raster-asset paths, without cookies, AI credentials, screenshots or gameplay fields. Assets are fetched only as needed, at most four at once, and cached under `Game Wingman/tft-icon-cache/` for seven days of reuse. Public metadata caches include these URLs. Images are bounded to 256 KB, redirects are rejected, and unavailable images retain a name fallback. Renderers receive local data URLs, with remote connections still disabled by CSP. Viewing icons does not call a model.

`api:check` without `--probe` is local only. `--probe` requires a selected provider key and `AI_ENABLED=true`; it sends one fixed text prompt to MiniMax, DeepSeek or Gemini. Provider policies and charges apply. It does not read or send screenshots, environment variables other than the selected credentials/config, or local files. No live probe runs automatically during install, startup, tests or CI.

The desktop imports credentials from a user-selected local `.env` or JSON file in the main process, encrypts them using Electron safeStorage, and saves them under the OS application-data directory in `Game Wingman/ai-settings.json`. Windows encryption is scoped to the OS account. Settings expose presence flags, never keys or ciphertext. There is no plaintext fallback. Removing a provider key deletes its encrypted value. Imported source files are not deleted and remain the user's responsibility.

The developer CLI can still use environment variables or ignored `.env`, which is plaintext and is not a credential vault. The explicit `scripts/ai-live.cjs --benchmark` command makes paid calls with fixed text and application-generated images using configured credentials. It never runs during ordinary tests or CI.

## Feedback

GitHub Issues and pull requests are public. Remove keys, account identifiers, player chat, notifications and personal data before attaching evidence. No screenshot is required to report a bug. See [SECURITY.md](SECURITY.md) for sensitive security reports.

中文：窗口预览仅在本机；手动识别每张确认，持续跟进则在另行确认会话后每 5–15 秒发送抽样图片。暂停、切换来源、退出或达到限制即停止。本次 DeepSeek 测试预算跨重启累计 ¥10，账本只保留用量和耗时，不含截图或密钥。没有遥测。凭据在主进程通过系统加密存储，页面只显示是否配置。原始导入文件仍可能是明文，请勿提交或公开。
