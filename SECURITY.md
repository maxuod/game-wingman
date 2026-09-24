# Security policy / 安全反馈

This is an experimental prototype. There is no production-support or response-time guarantee. Security fixes target the current `main` branch.

Please report sensitive vulnerabilities through [GitHub private vulnerability reporting](https://github.com/maxuod/game-wingman/security/advisories/new). Do not put credentials, exploitable private data, player screenshots or account details in public issues. If private reporting is unavailable, open an issue containing only a request for a private reporting channel.

For ordinary bugs, use the [issue templates](https://github.com/maxuod/game-wingman/issues/new/choose).

Current boundaries:

- Sandboxed renderers, context isolation, no renderer Node access, strict local-page IPC authorization.
- No external navigation or new windows from renderer content.
- Fixed official API hosts, redirects denied, bounded response sizes, no automatic provider fallback.
- No secrets in source, renderer IPC or packaged artifacts; package contents use an allowlist.
- User-selected capture only; no process injection, game-memory access or input automation.

These are implementation boundaries, not a security audit or game-policy approval. If you accidentally expose an API key, revoke it with the provider; removing a committed file alone does not revoke a credential.

中文：敏感漏洞请使用上面的 GitHub 私密报告入口，普通错误使用 Issue 模板。不要把密钥、私人画面或账号信息发到公开 Issue。当前没有完成外部安全审计。
