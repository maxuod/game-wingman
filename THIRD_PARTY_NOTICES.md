# Third-party notices

See the [data-source registry](docs/data-sources.md) for source owners, original links, actual usage, version scope, attribution and integration status. It distinguishes public mainline code from local-only development and candidates. Attribution is required when adding sources; listing a source does not grant reuse rights or imply endorsement.

Game Wingman's own reuse license is not yet selected; `package.json` intentionally says `UNLICENSED`. Public source visibility does not change the licenses of dependencies or external content.

- **Electron**, **TypeScript**, **Playwright**, **@electron/packager** and their dependencies retain their individual licenses. The exact dependency graph is recorded in `package-lock.json`; package distributions include Electron/Chromium license material supplied by their distributors.
- **Riot Games / Teamfight Tactics:** game names, trademarks and assets remain with their respective owners. This is an independent prototype, not an official or endorsed product.
- **Game icons via OP.GG's public CDN:** versioned metadata includes hero, item and augment asset URLs. Raster images are loaded on demand and cached locally for the UI; no image corpus is bundled. These game assets retain their owners' rights and do not acquire the application's license.
- **Riot Data Dragon:** downloaded only on explicit data sync. The repository contains endpoint metadata and research notes, not a bundled game-data corpus. Availability of an endpoint is not a blanket redistribution license.
- **CommunityDragon:** examined as a possible structured-data source. Its tool license does not license Riot game assets. No full CommunityDragon dataset is bundled.
- **OP.GG:** current comp statistics, unit/equipment facts, available positioning and item recipe relationships are attributed and versioned. Augment candidates are fetched on demand and cached as names/IDs/tiers/round availability/icon URLs; no guide descriptions or site code are bundled or executed. Public availability does not grant a blanket reuse license. See [scope and source handling](docs/automatic-equipment.md).
- **ARAM-tool:** reviewed as a workflow reference. No code, UI, guide corpus or game assets from that project are incorporated here. See [the source review](docs/data-source-review.md).
- **MiniMax, DeepSeek and Gemini:** integrations follow their documented API shapes; account permissions, billing and content policies are governed by the providers. No provider secret or SDK credential is included.
- **Original assets:** the small app icon and current UI were created for this project. Public screenshots show the app shell or synthetic test fixtures.
