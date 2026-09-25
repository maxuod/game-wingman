# API 提供方与手动识别

## 填写自己的 API Key

打开软件“设置 → AI 识别 → API Key 配置”。选择 DeepSeek、Gemini 或 MiniMax 国内，粘贴对应密钥并点击“加密保存密钥”。输入框保存后清空，软件重启后继续使用系统加密凭据；已保存的密钥不会回传页面。平台需自己选定，不按相似的 Key 前缀猜测。

也可点击“保存空白模板”，填好本地文件后“导入密钥文件”。GitHub 中提供 [api-keys.example.json](../api-keys.example.json) 和 [.env.example](../.env.example) 空模板；复制为 `api-keys.json` 或 `.env`，只填自己使用的平台，其他字段留空。软件按 `DEEPSEEK_API_KEY`、`GEMINI_API_KEY`、`MINIMAX_API_KEY` 字段识别归属。普通用户无需修改源码或启动开发 CLI。

导入只保存密钥，不导入 `AI_ENABLED`、模型或会话授权。保存成功不代表 Key 有效；需要测试时，勾选“允许 AI 请求”并保存，再点击“测试 DeepSeek 连接（计费）”。本轮桌面仍固定 DeepSeek Flash，其他两家 Key 可以保存，但不会自动切换使用；连接测试、单帧与持续识别共用累计 ¥10 预算。

不要把填写后的文件上传 GitHub。默认密钥文件名已加入 Git 忽略，打包规则只包含程序代码和资源；实际凭据保存在操作系统应用数据目录。自定义名称的凭据文件也应放在仓库外。输入框中的新 Key 仅单向交给主进程加密，配置查询只返回是否已配置。也可以选定平台后“移除所选密钥”。

新增“装备合成 → 开启装备自动识别”：复用同一 DeepSeek 会话确认、5–15 秒抽样和累计 ¥10 预算，识别清单直接更新本地合成建议，手动纠正为备用。查看阵容配装/站位/海克斯无需 AI；海克斯从 OP.GG 按阵容读取并独立缓存。见[自动装备说明](automatic-equipment.md)。

2026-09-24 最新：equipment-preview 已含 OP.GG 全部 50 套阵容及 137 件装备/55 种配方；可见己方装备提取随已授权的识别请求执行，本地按清单和所选阵容计算合成优先级。详见[使用与来源](guide-preview.md)。公开资料刷新和合成计算不调用模型，DeepSeek 累计 ¥10 上限不变。

更新：2026-09-24。三家适配器均已接入。当前首次对局测试版固定 DeepSeek Flash，桌面所有 AI 请求共用跨重启累计 ¥10 预算。另行确认会话后可持续抽样识别；没有自动重试或跨提供方回退。详见[首次测试说明](deepseek-first-test.md)。

| 提供方 | 当前默认模型 | 固定端点 | 本机真实调用 |
| --- | --- | --- | --- |
| DeepSeek | `deepseek-flash` | `https://api.deepseek.com/chat/completions` | 文本 / 合成图片通过，当前默认 |
| MiniMax 国内 | `MiniMax-M3` | `https://api.minimax.cn/v1/chat/completions` | 文本 / 合成图片通过 |
| Gemini | `gemini-3.5-flash-lite` | `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` | 文本 / 合成图片通过 |

MiniMax 可手动选择国际区 `https://api.minimax.io/v1/chat/completions`，本轮未测试国际区。地址不接受任意代理 URL。接口依据：[MiniMax 官方说明](https://platform.minimax.cn/docs/api-reference/text-openai-api)、[DeepSeek 图片输入](https://api-docs.deepseek.com/guides/vision/)、[Gemini 图片输入](https://ai.google.dev/gemini-api/docs/image-understanding)和[密钥说明](https://ai.google.dev/gemini-api/docs/api-key)。

## 速度与选择

每个可用模型各 3 次短文本、3 次自制图片；统计响应完成时间，不是首 token 延迟。相同任务提取阶段、金币、生命、等级和可见名称，缺失生命值必须返回 null。结果均通过字段校验。输入为自制清晰标签图片，不是真实 TFT 对局。

| 模型 | 文本中位耗时 | 图片中位耗时 | 图片范围 |
| --- | --- | --- | --- |
| DeepSeek Flash | 0.678 秒 | 1.074 秒 | 0.968–1.310 秒 |
| Gemini 3.5 Flash Lite | 0.652 秒 | 1.526 秒 | 1.212–1.572 秒 |
| MiniMax M3 国内 | 1.384 秒 | 1.740 秒 | 1.697–1.921 秒 |

Gemini 3.8 Flash 两次文字请求返回 HTTP 503，失败耗时不列入速度排名。读取账户可用模型列表后，显式改测 3.5 Flash Lite 成功。这是本轮开发时的人工选择，程序没有自动换模型逻辑。

当前优先使用 DeepSeek 做单帧识别。3 次样本不足以判断稳定性、真实 TFT 准确率、拥塞时表现或长期成本。各模型的 token 定义和价格不同，本轮只记录用量，没有声称哪个最便宜。原始无密钥测量见 `docs/data/ai-benchmark-2026-09-24.json`。

## 桌面使用

1. 打开“设置 → AI 识别”。本轮基准测试已锁定 DeepSeek / deepseek-flash；其他提供方凭据保留。
2. “导入密钥文件”支持本机 `.env` 或 JSON，字段为 `DEEPSEEK_API_KEY`、`GEMINI_API_KEY`、`MINIMAX_API_KEY`。仅主进程读取，可以一次导入三家。
3. 启用“允许 AI 请求”并保存。“测试文字连接”只发送一次固定 `Reply with exactly OK.`，计入本轮预算。
4. 选择窗口读取画面或导入图片。点击“识别这一帧”会暂停预览，并弹出原生确认框，列明提供方、模型、端点和画面时间。取消不发送。
5. 确认后发送一张压缩截图。结果保留未知字段，可在“核对字段”中编辑并确认；装备清单在“装备合成”中核对。选择目标阵容后，本地计算合成参考；超过 15 秒的 AI 清单不再用于当前建议。
6. 若要视频跟进，先读取所选窗口，再点击“开始本次跟进”并确认。每 5–15 秒发送当前抽样图片，最长 60 分钟 / 720 次；¥10 预算不足以预留下一次请求时提前停止。实时结果与变化记录另行显示，不沿用旧值填充未知字段。

重新开始读取、切换输入、更改模型或取消请求会废弃旧任务，迟到响应不会覆盖新状态。图片文字不能调用工具或改变提供方。实体匹配使用本机名称字典，未匹配项保留 `id: null`。通过格式检查的数值仍可能识别错误。

## 凭据与传输边界

- 桌面通过 Electron `safeStorage` 加密凭据，Windows 使用系统账户保护。文件在 `%APPDATA%\Game Wingman\ai-settings.json`，位于源码之外。开发版与便携版共用此目录，测试另用临时 profile。
- 解密还依赖该应用 profile 的系统加密状态（Windows 的 Local State）；不要只复制凭据 JSON 到其他 profile 或机器，另机应重新导入。
- 页面只获得配置和是否有密钥，不获得明文或密文。系统加密不可用时拒绝保存。移除按钮删除对应密钥。原导入文件不会自动删除，仍由用户管理。
- 手动截图每次确认；持续跟进单独确认所选窗口的会话授权。预览本身不上传、不默认保存。API 费用和提供方数据处理政策适用。
- 手动请求超时 30 秒，实时请求 10 秒，单张内联图片最多 8 MB base64，响应体最多 1 MB，输出预算 1024 tokens。拒绝截断、拦截、空白及混入推理标签的输出。
- 金额账本在主进程发送前持久预留，返回有效 token 用量后保守核算；失败或未知用量保留预留额。普通测试只使用临时 profile 和假账本。独立 CLI 不属于桌面预算，不应并行用于本轮测试。
- MiniMax M3 / DeepSeek 关闭 thinking；Gemini 3 使用 low thinking。只读取最终文本，不展示推理内容。
- 失败只暴露类别 / HTTP 状态和通用说明，不回显上游响应体、密钥或原始网络异常。

## 开发检查

`npm test` 和 `npm run test:desktop` 使用模拟 AI 网络响应、合成图片和假密钥，不使用个人凭据或产生模型费用。

`.env` 开发检查继续可用；MiniMax 国内需设置 `MINIMAX_REGION=cn`。`api:check` 不带 `--probe` 时只检查配置；加 `--probe` 且 `AI_ENABLED=true` 时发送固定文字。桌面不会自动读取源码目录中的 `.env`。

显式运行真实基准（已导入凭据并允许手动请求）：

```powershell
npm run build
npx electron scripts/ai-live.cjs --benchmark
```

基准最多每家 6 个小请求，首个错误后停止该提供方，图片由应用自制；记录在 `artifacts/ai-benchmark/`。此命令可能收费，不能加入 CI 或普通测试。

尚未完成：真实游戏装备识别质量、逐回合运营以及对手/强化符文/当前棋盘强度判断。配装补缺规则已经接入，但不代表经过真实对局验证的最优决策。
