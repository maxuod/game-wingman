# API 提供方

核查日期：2026-09-24。首批提供方为 MiniMax、DeepSeek、Gemini。统一接口位于 `src/main/ai/providers.ts`，只支持非流式文本输入 / 最终文本输出；目前没有接到桌面 IPC 或屏幕读取流程。

## 实现与验证状态

| 提供方 | 协议 / 固定端点 | 示例模型 | 验证 |
| --- | --- | --- | --- |
| MiniMax | OpenAI-compatible Chat Completions；`https://api.minimax.io/v1/chat/completions` | `MiniMax-M3` | 请求 / 响应模拟测试通过，未真实调用 |
| DeepSeek | Chat Completions；`https://api.deepseek.com/chat/completions` | `deepseek-flash` | 请求 / 响应模拟测试通过，未真实调用 |
| Gemini | 原生 `generateContent`；`https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` | `gemini-3.8-flash` | 请求 / 响应模拟测试通过，未真实调用 |

示例模型来自当日官方文档，不承诺账户权限、价格、时延或以后仍可用。模型 ID 可以通过环境变量替换。MiniMax 使用 `reasoning_split` 和 `max_completion_tokens`；DeepSeek 使用 `max_tokens`；Gemini 使用 `generationConfig.maxOutputTokens`。只读取最终文本，不把推理内容展示为用户建议。

官方依据：[MiniMax OpenAI 兼容接口](https://platform.minimax.io/docs/api-reference/text-openai-api)、[DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)、[Gemini generateContent](https://ai.google.dev/api/generate-content)、[Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)。

提供方可能支持更多模态，但本仓库此时只实现了文本适配，不能据此宣称截图识别已接入。下一阶段需单独验证每个所选模型的图片能力、授权和费用。

## 本地配置

先复制 `.env.example` 为 `.env`（PowerShell 用 `Copy-Item .env.example .env`；macOS 用 `cp .env.example .env`）。只填写自己打算使用的提供方：

```dotenv
AI_ENABLED=false
AI_PROVIDER=minimax
AI_TIMEOUT_MS=30000
MINIMAX_API_KEY=
MINIMAX_MODEL=MiniMax-M3
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-flash
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
```

`.env` 由 Node 开发检查脚本读取，不会自动加载到桌面界面。密钥为空或 `AI_ENABLED` 不是 `true` 时，调用会在本地拒绝。只使用提供方官方账户的 API Key；本版本不接受任意代理 URL，MiniMax 的默认地址为国际端点。

```powershell
npm run api:check -- minimax
npm run api:check -- deepseek
npm run api:check -- gemini
```

检查输出仅包含提供方、模型、端点、启用状态和“是否配置密钥”，不输出密钥。它不联网，不能判断密钥是否有效。

主动将 `AI_ENABLED=true` 后，可以执行 `npm run api:check -- gemini --probe`，同样可替换为另外两家。每次只发一条固定的 `Reply with exactly OK.` 文本，不发送截图或其他本地文件。提供方可能收费；输出仅显示成功状态、回答长度与可用的 token 用量，不打印模型全文。

## 调用边界

- 输入文本上限 32,000 字符，系统说明上限 8,000 字符；输出预算默认为 1,024 tokens，可设 32–8,192。
- 超时默认为 30 秒，可设 1–120 秒；支持 AbortSignal 取消。
- 不自动重试，不自动切换提供方，不跟随 HTTP 重定向。
- 限制响应体为 1 MB；拒绝空内容、被拦截、截断或混入推理标签的结果。
- 失败时返回类别和 HTTP 状态，不回显上游响应体、请求内容或原始异常。
- 密钥在主进程 / Node 层使用，不提供给页面、不写进安装包、不记录请求日志。

这层只负责传输文本，**不会证明回答有事实依据**。后续还需完成经审核的攻略检索、来源 ID 校验、补丁过滤、截图发送前的用户选择、费用限制和过时任务取消；无有效来源时不生成确定性战术建议。
