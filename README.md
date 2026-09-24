# Game Wingman

**An experimental desktop game companion. TFT first, more games later.**

[简体中文](README.zh-CN.md) · [Windows handoff](docs/windows-handoff.md) · [API providers](docs/api-providers.md) · [Report a bug](https://github.com/maxuod/game-wingman/issues/new/choose)

Game Wingman is a Windows/macOS desktop application built with Electron and TypeScript. The intended workflow is to read a selected game window, recognize visible information, retrieve versioned guides, and present a short explanation in a floating overlay. The first reference game is **Teamfight Tactics on NA, with en_US entity names**.

This public preview is for feedback and for developing reusable capture, recognition, retrieval and overlay components. It is an early prototype, not a finished AI coach.

> **Experimental software and account risk:** This project is not endorsed by Riot Games. Contextual real-time advice may conflict with game policies, and use may result in account penalties, including bans. No account-safety, accuracy or performance guarantees are made. A prototype label does not exempt a tool from game rules. Read the [trial notice](docs/usage.md) before use.

## What works today

| Component | Status |
| --- | --- |
| Desktop control window and independent always-on-top overlay | Implemented; macOS smoke-tested |
| Selected-window preview, pause/resume, image import | Implemented; tested with a synthetic window on macOS |
| Collapsing, transparency, click-through and recovery controls | Implemented; game-specific compatibility unverified |
| NA Data Dragon name lookup | Manual sync, search and pinning for Set 18 champions/traits |
| MiniMax / DeepSeek / Gemini | Text API adapters + local config/probe CLI; mocked contract tests pass |
| OCR, screenshot-to-model input, reviewed guide retrieval, dynamic AI advice | **Not connected yet** |
| Windows | Target for the next development session; real TFT testing pending |

The name dictionary is **not** a tactical guide database or an NA win-rate dataset. A Data Dragon asset version does not establish the TFT patch or hotfix coverage. See the [dated data-source review](docs/tft-data-sources-2026-09-24.md).

## Interface

The main screen has three primary actions: select a window, start/pause capture, and show/hide the overlay. Sources and settings live in a secondary panel. The overlay shows one item at a time.

![Game Wingman desktop control window](docs/images/main-window.png)

<img src="docs/images/overlay.png" width="320" alt="Game Wingman floating overlay in its waiting state">

These are application screenshots. They show the current capture/lookup shell, not completed AI recommendations. The old `design/overlay-concept.html` is an archived design study, not the product entry point.

## Run from source

Use Git and **Node.js 22.12–22.x**; `.nvmrc` pins the locally tested version. No API key is needed to run the desktop shell.

```sh
git clone https://github.com/maxuod/game-wingman.git
cd game-wingman
npm ci
npm start
```

On Windows, run these commands in PowerShell or a terminal. On macOS, selected-window capture may require Screen Recording permission; development launches can appear as Electron. Restart the application after granting permission if necessary. Image import remains available without screen capture.

```sh
npm run check          # Type checks
npm test               # Build + offline tests; no paid API requests
npm run test:desktop   # Native smoke tests using only a generated fixture window
npm run package:win    # Windows x64 portable application folder
npm run package:mac    # macOS arm64 .app
```

Output is under `release/`. Keep the entire Windows application folder together. Builds are unsigned/unnotarized development artifacts. A successful build or synthetic test is not evidence of compatibility with TFT or anti-cheat software. The [Windows handoff](docs/windows-handoff.md) is the starting point for the next session.

## API providers

MiniMax, DeepSeek and Gemini share a text request interface in `src/main/ai/providers.ts`. Provider, model and credentials are separate. The current UI never calls this layer or uploads screenshots.

Copy `.env.example` to `.env` and fill only the provider you intend to test:

```powershell
Copy-Item .env.example .env
npm run api:check -- minimax
npm run api:check -- deepseek
npm run api:check -- gemini
```

These checks are local and do not validate a key against the provider. For an **optional live probe**, set `AI_ENABLED=true` in your local `.env`, then run:

```sh
npm run api:check -- minimax --probe
```

A probe sends one fixed text prompt to the selected provider. Charges may apply. It sends no screenshot, game state or local file. There are no automatic retries or cross-provider fallbacks. No live provider calls were made for this initial publication; [configuration, model examples and limits](docs/api-providers.md) are documented separately.

## Privacy and security

Desktop preview frames stay in application memory; the application does not save or upload them. Public entity data can be cached locally. API keys are never committed, exposed through renderer IPC or bundled. The package uses an explicit file allowlist. See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md).

## Development and feedback

- [Windows handoff and next tasks](docs/windows-handoff.md)
- [Roadmap](docs/roadmap.md) / [Change log](CHANGELOG.md)
- [Desktop validation and limitations](docs/desktop-validation.md)
- [Technical design](docs/technical-plan.md) / [Product scope](docs/product-brief.md)
- [Contributing](CONTRIBUTING.md) / [Issues](https://github.com/maxuod/game-wingman/issues)

The next milestone is Windows capture/overlay verification, followed by a consent-based model connection, visible-information recognition and source-bound guide explanations. Development is paused at this public handoff checkpoint.

## License and third-party content

This is a **public source preview; no open-source reuse license has been selected yet** (`UNLICENSED`). Public availability is not a license grant. Dependency licenses remain their own; see [third-party notices](THIRD_PARTY_NOTICES.md). Riot names and assets belong to their respective owners. No ARAM-tool code, commercial guide corpus or third-party UI assets are copied into this project.
