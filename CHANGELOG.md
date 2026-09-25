# Changelog

## Advice-first companion preview

- Remove the standalone US name browser from the UI and put comp selection, the next in-game step, equipment and augment guidance on the main screen. Keep the live video preview available behind an expandable control.
- Follow only the player's chosen comp in the overlay. Stage, gold and health can change the next-step prompt; stale observations or outdated comp data do not become current advice. An existing Data Dragon dictionary cache remains an internal name-matching aid.

## Pinned overlay preview

- Keep the floating window visible and topmost while idle and while following the game. A close event no longer dismisses it, and the overlay no longer has an accidental close button; hide it from the main window or tray when wanted.

## Automatic TFT follow preview

- Show the four highest eligible top-four comps on the main window and allow one-click target selection.
- After unique TFT window discovery, begin local capture and request session consent automatically when DeepSeek is configured and enabled. Accepted sessions update visible HUD and equipment crafts; the selected comp's source augment candidates appear at their eligible stage. No consent means no paid frames.
- Keep the older running process from masking the new portable build: exit the old app from its tray before launching the new directory.

## Unreleased

- Add a masked, provider-specific API Key field with OS-encrypted storage, multi-provider `.env`/JSON import, empty template export and per-provider removal. Saving/importing does not enable AI or test credentials; no saved secrets return through IPC. Publish empty configuration templates and retain the existing cumulative DeepSeek CNY 10 cap.

- Show source hero, item and augment icons in comp cards, equipment inventory, recipes, positioning and the compact overlay. Keep quantities, missing components, accessible names and an offline name fallback. Load only validated public raster assets on demand with a seven-day local cache; no additional AI requests.

- Add equipment tracking controls and automatic craft updates for the selected or currently recommended comp. Keep reference builds visible without a fresh inventory, and make manual corrections secondary.
- Show source positioning (39 of 50 current boards) and per-comp silver/gold/prismatic augment candidates with stage availability and a six-hour public cache. Missing positions stay unknown; candidates do not evaluate the player's actual three offers. Preserve live consent and the cumulative CNY 10 cap.

- Check official TFT patches/hotfixes on daily startup, persist public data and comparison history, reuse fresh same-day cache, and refresh rankings after six hours or an official change. Display independent top-four/first-place rank movements and percentage-point differences; preserve dated data on failure with persistent one-hour retry backoff.
- Follow compatible new patch data without relabeling older statistics. Keep equipment recipes separate from ranking downloads and flag official changes for recipe review; no model calls or software binary updates are performed.

- Copy a reviewed OP.GG team code from each comp card or the current overlay, with success/failure feedback. Clipboard writes require an explicit copy click; game input and the cumulative AI budget are unchanged.

- Show a nonfocusable topmost overlay by default and reassert its stacking while capture is active.
- Discover a unique game window automatically, including the standalone TFT client, with title and Windows owner-handle checks. Local preview starts automatically; manual choice, ambiguity and pause are respected.
- Include all 50 current OP.GG main-page comp variants, with source dates, independent win/top-four sorting (top-four by default), Chinese search, paging, per-unit equipment, overlay pinning and bounded public-data refresh on startup or request. Display patch/region/hotfix limits; stale or mismatched data cannot be recommended.
- Add 137 current Set 18 items and 55 recipes, Chinese/English recipe search, manual component/finished-item inventory and fresh AI inventory extraction. Local craft priorities follow the selected comp's core equipment, deduct owned items and avoid double-spending components. The overlay shows the next craft and recipe. Real-game inventory recognition remains unverified.

- Add selected-window live video preview and explicitly consented 5–15 second sampled observations, field changes, freshness labels and stop conditions.
- Prepare the first DeepSeek Flash desktop test with a persistent CNY 10 cap shared by live, manual and probe calls. Persist worst-case reservations before dispatch; retain uncertain charges after failure or restart; block requests when the ledger cannot be verified.
- Add offline budget tests and native mock live tests covering video continuity, consent, cancellation, shared spending and stopping before the next over-budget call. No paid API calls in ordinary tests.

- Redesign the logo as a winged W, with a shared SVG master, regenerated platform icons, and matching window / overlay / tray branding.

- Connect MiniMax CN, DeepSeek and Gemini text/image requests to desktop settings with OS-encrypted credentials and per-image confirmation.
- Add single-frame field extraction, explicit unknowns, name-to-ID matching, manual correction, overlay display and cancellation of obsolete requests.
- Benchmark three small text/image samples per working model. Select DeepSeek Flash by default; use Gemini 3.5 Flash Lite after Gemini 3.8 Flash returned HTTP 503.
- Extend offline and desktop tests for credential isolation, consent cancellation and stale-response rejection. Live probes remain explicit developer actions.

- Fix Windows overlay collapse by temporarily allowing programmatic resizing, then restoring the fixed-size window.
- Verify the Windows development app and portable package using synthetic-window capture; real TFT gameplay remains untested.
- Extend desktop regression checks for collapse/reset/expand and hide/show recovery. Record environment, shortcut availability and separate development/package artifacts via `GWM_ARTIFACT_DIR`.

## 0.1.0 — 2026-09-24

Initial public source preview, published as **Game Wingman**.

- Electron desktop control window and independent compact overlay.
- Explicit window selection, low-frequency preview, pause/resume and local image import.
- Overlay visibility, collapse, opacity, click-through, shortcut and tray recovery paths.
- NA / en_US Set 18 name dictionary sync, search and manual pinning.
- MiniMax, DeepSeek and Gemini text API adapters, disabled by default, with local config and optional fixed-text probe commands.
- Offline provider tests, native synthetic-window smoke tests and Windows/macOS CI checks.
- English and Chinese READMEs, privacy/security notes, data-source research and Windows development handoff.

Not yet implemented: desktop AI settings, screenshot-to-model input, OCR, reviewed tactical-guide retrieval and dynamic recommendations. Windows gameplay and live provider calls are not validated by this release. No installer or signed binary release is published with this source checkpoint.

### Naming consistency

The application wordmark, overlay and packages use Game Wingman. Setup instructions clone into a local `game wingman` directory; the GitHub repository and npm identifier remain `game-wingman`.
