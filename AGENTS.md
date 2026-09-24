# Game Wingman development context

Read `README.zh-CN.md`, `docs/windows-handoff.md` and `docs/api-providers.md` before continuing this project.

- Build a desktop app for Windows/macOS. Do not replace it with a website. The next gameplay validation target is Windows.
- Keep UI simple: three primary controls, a single-item floating overlay, secondary data/settings panels.
- First game: TFT, NA / en_US. Keep asset version, TFT patch, hotfix coverage and NA match statistics distinct.
- Capture only explicitly selected windows or imported images. No game-memory reading, process injection or input automation.
- Current AI layer supports MiniMax, DeepSeek and Gemini text requests. It is not connected to the UI, screenshots, OCR or guides yet.
- Keep credentials in the main/Node layer. Never expose keys in renderer IPC, commit `.env`, bundle keys or silently send screenshots.
- Do not make live paid provider calls as part of tests. Use injected mock fetch. Live probes must be explicitly requested and configured.
- No automatic provider fallback: switching providers changes data recipients and cost.
- Tactical explanations need reviewed, versioned sources. Never pass off a name dictionary, unverified model output or an old frame as a current guide.
- Keep experimental-use and account-ban notices visible in documentation. Do not claim Riot approval or game compatibility from synthetic tests.
- Preserve unrelated work. State local checks, CI checks, packaging, real game validation and publication separately.
- This is currently a public source preview with `UNLICENSED` status; do not invent a reuse license or copy third-party guide corpora.

Commands: `npm ci`, `npm run check`, `npm test`; for desktop changes, `npm run test:desktop` with all running instances closed. Native tests use generated fixture windows only. `npm run package:win` builds a portable x64 directory; `npm run package:mac` builds an arm64 app.

Update the handoff and validation documents when capabilities change. Windows validation, user-facing credentials, screenshot consent, recognition and reviewed retrieval are the next milestones; see the roadmap.
