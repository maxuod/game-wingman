# 桌面验证记录

## API Key 配置与完整 TFT 同步（2026-09-24）

- 待发布 TFT 代码的 `npm run check` 和全部 50 项离线测试通过；本次交付不包含独立 STS1 研究代码。下方更早的本地历史记录可能包含该研究测试，不能把它们算作本次 TFT 交付项。
- 新增密码输入框、平台选择、加密保存、移除、JSON/.env 多平台导入和空白模板导出。模板和配置解析测试覆盖空字段、BOM、无效字段/类型/大小、控制字符及不回显原始内容；存储测试验证持久化和不切换平台。
- 隐藏原生联调及实际 `api-config-preview/resources/app.asar` 回归通过。已保存 Key 时导出的模板仍全空；保存/导入不启用 AI、密钥不出现在状态或明文存储，平台切换/关闭后输入清空，重启保留密钥状态且不回显。浮窗不可写凭据或导出模板。
- 同轮保留验证 50 套阵容复制、137 件装备/55 配方、图片解码、图标和浮窗边界、自动识窗夹具、每日缓存、合成建议更新与过时撤销。三次 AI 请求均模拟，真实付费调用为零；证据 `artifacts/api-config-packaged/`。普通配置操作产生零 AI 请求。
- Windows x64 便携包生成于 `release/api-config-preview/Game Wingman-win32-x64/`，使用原应用 profile 与累计 ¥10 账本。没有替换正在运行的旧实例；源码同步、GitHub CI、真实游戏准确性及二进制发布分别记录，不能由此推定真实 TFT 识别准确率。

## 游戏图标与图形合成提示（2026-09-24）

- 英雄、装备与海克斯改用来源图标，覆盖阵容卡片、库存、配方、目标配装、站位和浮窗。保留数量角标、缺件提示、来源、悬停/键盘名称及缺图文字回退。
- 类型检查与完整 53 项离线测试通过（含原有 STS1 测试）。新增覆盖图标 URL 白名单、无凭据请求、大小/格式限制、四路并发、请求去重、七天缓存、重启复用、失败退避及来源元数据提取。
- 隐藏原生测试和实际 `release/icon-preview/Game Wingman-win32-x64/resources/app.asar` 回归通过：合成图标随装备变化、未知清单撤下旧配方、数量角标、键盘名称、缺图回退、图片成功解码、站位方向、浮窗图标/按钮边界、原有 50 套阵容复制/自动识窗/资料更新。测试窗口使用独立 profile、假密钥、合成视频和模拟网络；三次 AI 请求均为模拟，真实付费请求为零。
- 单独读取并验证了 63 个来源图片（英雄/装备/海克斯），均成功；包内视觉回归复用这些已下载的公共图片，不联网读取游戏内容。截图和报告位于 `artifacts/icon-packaged/`，含真实来源图标和合成测试状态，不能当成真实游戏识别结果。
- Windows x64 包 `release/icon-preview/Game Wingman-win32-x64/Game Wingman.exe` 已生成；保留原运行实例，退出旧版后启动新包，累计 ¥10 账本沿用。本轮没有真实游戏识别准确率、macOS、CI、推送或发布验证。

## 自动装备识别与阵容详情（2026-09-24）

- `npm run check`、完整 48 项离线测试通过（保留 6 项 STS1）。新增覆盖来源站位缺失/边界/重叠、自动推荐阵容计算、海克斯数据边界、限定公开请求、并发去重、缓存重启与失败回退。
- 隐藏 Electron 联调及 `auto-equipment-preview/resources/app.asar` 的同套回归通过。假密钥、合成视频与模拟网络完成 3 次 AI 请求，验证取消确认时零发送、自动轻语→红霸符、未知与停止后撤下建议、目标配装保留、28 格棋盘方向、海克斯按需读取和 IPC 限制。没有真实 AI 调用，也没有测试中读取用户游戏或改动系统剪贴板。证据 `artifacts/auto-equipment-packaged/`。
- 真实公共来源读取成功：当前 39/50 套阵容有完整坐标；主宰艾希 17 个海克斯候选（银 1、金 11、彩 5）。首次请求页面、公开模块文本和推荐数据共 3 次；不执行脚本、不传截图或 AI Key。只保存事实字段，见[功能说明](automatic-equipment.md)。
- Windows x64 便携目录：`release/auto-equipment-preview/Game Wingman-win32-x64/`。包内回归截图人工检查，站位方向及宽度正常、中文配方与候选可读。当前旧版主窗口已最小化，保留其运行，新包尚未替换正在使用的实例。退出旧版后启动新 EXE；原累计 ¥10 预算不变。
- 本轮没有真实 TFT 装备准确率验证、海克斯三选一评测、macOS 复测、CI、推送或发布。

## 启动自动资料更新（2026-09-24）

- 类型检查通过，完整离线套件 44 项通过（其中 6 项为独立 STS1 基础测试）。本轮新增 4 项覆盖官方来源、热修、双排序比较、跨日/6 小时检查、缓存重启、断网重试及新补丁切换。后续补充的官方版本回退检查通过相关回归。
- 隐藏原生测试及实际 `daily-data-preview/resources/app.asar` 内容回归通过，包含排名箭头、配方不随排名刷新、固定官方链接与同日重启后零公开请求。原有 50 套复制、装备计算和自动识窗夹具仍通过。证据 `artifacts/daily-data-packaged/`。
- 真实官方/OP.GG 联网检查成功：官方 18.3B、50 套阵容；首次 3 次公共 HTTP 请求，持久缓存重载后的检查为 0 次。只保存官方版本摘要/指纹和公开阵容事实，报告 `artifacts/update-source/report.json`；没有截图上传或付费 AI。
- Windows x64 自动更新版打包成功：`release/daily-data-preview/Game Wingman-win32-x64/Game Wingman.exe`。本轮未测试真实装备识别质量、macOS、CI 或发布；累计 ¥10 账本不变。
- 已通过 Windows Computer Use 退出 equipment-preview 并启动实际 daily-data-preview EXE。阵容页显示“官方 18.3B 已核对；排名和胜率未变，统计已核对”，默认前四率和全部 50 套阵容；“自动更新与排名变化”可展开。当前没有游戏窗口，未开启 AI。

自动更新的是 TFT 补丁及资料。配方检测到官方变更后需核查，不会自动把旧表重标为新版本，规则见[daily-data-updates.md](daily-data-updates.md)。


## 全量阵容与装备（2026-09-24 最新）

- `npm run check`、`npm test` 通过，34 项离线测试；覆盖全量解析、补丁/赛季/时效约束、55 种配方、重复散件和已有成装扣除、AI 清单过时/停止处理及原有预算/凭据边界。
- 隐藏原生验证通过：50 套阵容的 5 页与全部复制按钮，中文搜索、装备链接、目标阵容、手动清单、优先合成及浮窗完整配方、非法 IPC、剪贴板失败、公开刷新成功/失败、模拟窗口自动读取及暂停/手动覆盖。使用测试窗口、合成视频、固定公开数据替身和模拟剪贴板，没有读取真实游戏或付费调用。
- 真实公开 OP.GG 刷新在 23:51 UTC 通过，返回 50 套、137 件装备、55 种配方，阵容装备 ID 全部闭合。18.3 统计更新时间约 22:59 UTC，未隔离当天 18.3B 热修。
- Windows x64 `equipment-preview` 打包成功；同一隐藏测试再次加载实际包内 `resources/app.asar` 的代码和资源通过，Electron 运行时与打包版本一致。这是包内容回归，非真实游戏准确性测试。
- 开发版证据 `artifacts/guides-native/`，包内容证据 `artifacts/equipment-packaged/`。人工检查主窗口装备方案及浮窗截图，配方文字完整，中文正常。测试中的 24%/55% 等统计为合成值，不是公开数据记录。
- 新包 `release/equipment-preview/Game Wingman-win32-x64/Game Wingman.exe`，沿用正式 profile 与累计 ¥10 账本。没有发布、推送、CI 或 macOS 复测。实际装备识别质量、长局表现和用户客户端接受阵容码仍未验证。
- 随后通过 Windows Computer Use 退出旧 guide-copy-preview，启动实际 equipment-preview EXE。主窗口与浮窗均存在；实际阵容面板显示“已刷新全部 50 套阵容及装备配方”、默认前四率及 5 页列表。当前没有匹配到游戏窗口，停在等待状态；本轮没有开启付费 AI。已为用户打开装备合成入口。

下方为较早版本的历史验证，不代表当前仍只有三套阵容或只有 HUD 识别。

## 2026-09-24 — OP.GG、自动识窗与默认置顶

TypeScript 检查和 30 项离线测试通过。隐藏原生专项验证默认前四率、独立吃鸡率排序、固定阵容、固定来源跳转、公开数据刷新及失败回退；原生浮窗 isAlwaysOnTop=true、isFocusable=false、默认显示意图通过。唯一合成窗口自动预览，多候选、暂停及手动选择行为通过，AI 请求为零。证据：artifacts/guides-native/。专项测试发现 IPC 返回与状态广播顺序不固定，可能已找到窗口却未启动预览。已改为从已渲染状态触发自动预览，保留每个来源只尝试一次、暂停不重启的保护；测试使用持续绘制的合成视频。

OP.GG 实际公开页面及新刷新请求通过统计解析，比例与样本均取同类阵容口径，详见[来源](guide-preview.md)。没有付费模型调用。游戏实际窗口元数据识别到 TFTClient-Win64-Shipping / TFT；真实游戏覆盖与识别准确率不由合成测试代替。本轮未重测 macOS、完整可见桌面烟雾测试或发布。


## 2026-09-24 — 首次 DeepSeek 视频测试准备

本轮开发版通过 TypeScript 检查、26 项离线测试及原生桌面模拟测试。合成窗口视频轨报告 15 fps，无音轨；持续采样识别、取消/开始会话、请求期间预览继续、字段变化、暂停和迟到响应处理通过。金额测试覆盖发送前持久预留、按 token 保守核算、失败/缺失用量留存、重启恢复、并发不超额、损坏或写入失败锁定，以及 360 次模拟调用的累计。

原生模拟用量在累计 ¥8.448976 后成功阻止下一次 ¥2.105344 预留，未越过 ¥10。此数字是故意放大的假用量，不是真实扣款。手动连接测试与新会话也无法绕过同一预算。开发版证据在 `artifacts/live-dev/`：`smoke-report.json`、`app-live.png`、`app-live-budget.png`、`app-live-overlay.png` 和不含个人数据的模拟账本。

本轮全部模型调用均为假密钥与 mock fetch，未调用真实 API。测试时另有旧实例占用快捷键，快捷键与点击穿透项目明确跳过；真实 TFT 对局、窗口兼容性、准确率和长时间资源占用仍待用户实测。测试步骤和金额边界见 [首次 DeepSeek 测试](deepseek-first-test.md)。

Windows x64 `release/baseline-preview/Game Wingman-win32-x64/Game Wingman.exe` 已完成打包，并使用实际便携 EXE 重跑全部桌面模拟流程通过。打包版同样报告 15 fps、无音频、超预算前停止；证据位于 `artifacts/live-packaged/`。开发版和便携版的实时界面、费用面板、浮窗均已留存截图；开发版截图已人工检查。快捷键占用的跳过项同上。产物仅在本地，未推送源码或发布。

后续修正：两个合成测试窗口的 data URL 未声明字符编码，导致 UTF-8 中点 `·` 被错误显示为 `Â·`。已补充 URL charset 和 HTML UTF-8 声明，并在隐藏的原生 Electron 窗口验证 document.characterSet 与实际文本。没有模型调用。之前截图中的乱码仅来自合成页面；测试脚本不进入便携包，因此此次无需重新打包。

日期：2026-09-24，版本 0.1.0。Windows 开发版与便携包已完成本机合成窗口验证；原 macOS 记录保留如下。应用 UI 从本地文件加载，测试不使用 HTTP 服务。

## Logo 更新验证

新双翼 W 图标已应用到主窗口、浮窗、Windows 托盘和原生窗口图标；SVG 源文件及平台资源导出方式见 [品牌图标](brand.md)。

- `npm run icons`、`npm run check`、`npm test` 通过，14 项离线测试。
- 开发版和重新打包后的 Windows 便携版均通过桌面合成窗口回归，AI 使用模拟网络。截图与报告位于 `artifacts/windows-brand-dev/`、`artifacts/windows-brand-packaged/`。
- 人工检查主窗口 / 浮窗的小尺寸标记，并从新 EXE 提取图标确认打包资源已替换。现有应用占用快捷键，点击穿透分支跳过；未重测 macOS。
- 新包：`release/brand-preview/Game Wingman-win32-x64/Game Wingman.exe`。保留整个目录，先退出运行中的旧版再启动；源码和二进制均未发布。

## AI 接入后的验证

本轮新增桌面三家模型配置、系统加密凭据、逐帧发送确认、结构化识别、未知字段、人工校正和浮窗显示。普通测试全部使用假密钥和模拟 AI 网络；真实测量另行显式运行。

- `npm run check`、`npm test` 通过，共 14 项离线测试，覆盖原有接口以及凭据加密 / 重载 / 移除、三家图片请求格式和识别字段校验。
- 开发版及新的 Windows 便携包均通过完整合成窗口测试，并验证 AI 凭据不出现在页面或明文文件、取消发送不调用网络、修改输入后丢弃迟到结果、人工校正和浮窗显示。
- 上述桌面 AI 测试使用模拟 fetch，截图在 `artifacts/windows-ai-dev/` 和 `artifacts/windows-ai-packaged/`。旧版应用仍运行并占用全局快捷键，本轮明确跳过原生点击穿透分支，未将跳过记为通过；基础验证阶段的快捷键结果见下方历史记录。
- 另对三家各执行 3 次短文本和 3 次自制图片真实调用，全部完成结构化字段检查。Gemini 3.8 Flash 两次 503 后人工改用 3.5 Flash Lite，详见 [测量与配置](api-providers.md)。
- 新便携包再通过三次完整真实调用：原生图片导入 → 主进程确认流程 → 所选提供方 → 字段校验 → 界面显示。图片为应用自制，测试中的确认框由显式 live probe 自动确认。MiniMax / DeepSeek / Gemini 分别为 3.372 / 1.259 / 1.657 秒，均提取正确；单次端到端结果不并入前述基准中位数。
- 真实调用证据：`artifacts/ai-benchmark/live-ui-results.json` 及 `live-ui-*.png`。未读取用户的真实游戏、桌面或私人图片。未在本轮重测 macOS，未推送或触发新的 GitHub CI。

当前预览包：`release/ai-preview/Game Wingman-win32-x64/Game Wingman.exe`，必须保留整个目录。构建命令为 `npm run build` 后 `node scripts/package.mjs win32 x64 ai-preview`。打包时发现 Windows 解压后立即重命名目录会报 EPERM，加入 2 秒解压后等待后本机打包通过。旧程序保持运行，使用新包前请先退出旧版，避免单实例锁恢复旧窗口。

凭据已保存到正式应用 profile；Windows safeStorage 解密还依赖对应 profile 的 Local State，因此不能仅复制 `ai-settings.json` 到任意测试 profile 或另一台机器。测试复制的是同一用户的加密设置与 Local State，结束后删除临时 profile，不导出明文。另机使用应重新导入自己的 Key。

仍待完成：真实 TFT 的识别准确性与完整字段覆盖、实际游戏中的快捷键 / 穿透 / 焦点、审核后的攻略检索、动态建议、长时间性能和费用评估。

## Windows 基础验证（AI 接入前的历史记录）

环境：Windows 11 家庭版 x64，系统版本 10.0.26200；构建 / 测试 Node 22.23.1，Electron 44.4.5。连接两个显示器，主屏 2560 × 1440、副屏 1440 × 2560，均为 100% 缩放。本次在主屏运行，未验证跨屏移动、显示器拔插或其他缩放比例。

| 检查 | 结果 |
| --- | --- |
| `npm ci`、`npm run check`、`npm test` | 通过，11 项离线测试；未调用真实模型 |
| 开发版桌面测试 | 通过：主窗口、置顶浮窗、收起 / 展开、收起后重置、隐藏恢复、恢复显示不抢焦点、IPC 隔离、图片导入 |
| 合成窗口采集 | 开发版与便携包均通过：连续两帧、暂停释放流、继续、源窗口关闭后停止、拒绝旧 epoch |
| 快捷键与穿透 | 两个快捷键注册成功；原生穿透接口开启与恢复通过；未模拟全局按键或验证物理鼠标穿透 |
| Windows x64 打包 | 本机打包成功，便携包启动后再次通过上述桌面测试 |
| 便携包资料同步 | 实际下载 NA Data Dragon 资源 16.19.1；搜索 Lux 并固定到浮窗通过 |

修复了 Windows 浮窗无法收起的问题：`resizable: false` 下直接调用 `setSize`，原生高度仍为 248；调整为在同步调整尺寸时临时解锁，然后恢复禁止手动缩放。已断言收起高度 52、展开高度 248、重置后的尺寸和最终不可手动缩放状态。首轮还出现过一次置顶即时断言失败，后续开发版与打包版未重现，暂未确定原因；长时间窗口状态稳定性仍需观察。

本地证据：`artifacts/windows-dev/`、`artifacts/windows-packaged/`，各含 `smoke-report.json` 与主窗口、浮窗、合成捕获、资料及设置截图。这些文件被 Git 忽略。`GWM_ARTIFACT_DIR` 可指定测试输出目录，以保留开发版和便携包的独立记录。

便携程序位于 `release/Game Wingman-win32-x64/Game Wingman.exe`，需保留整个目录。本轮没有上传二进制、推送源码或触发新的 GitHub CI；原有 CI 成功记录不代表本轮修改已在 CI 验证。macOS 未在本轮重新运行。

仍未验证：真实 TFT 窗口 / 无边框 / 独占全屏、游戏焦点与物理穿透、反作弊兼容性、托盘手动恢复、长期性能。未采集个人窗口、发送截图或调用付费 API；AI / OCR / 攻略检索能力没有变化。

本机采用独立的 `%LOCALAPPDATA%\GameWingman\tooling\node-v22.23.1-win-x64` 运行构建，下载包已通过官方 SHA-256 校验。系统默认 Node 24 未更改。PowerShell 重现便携包测试：

```powershell
$env:Path = "$env:LOCALAPPDATA\GameWingman\tooling\node-v22.23.1-win-x64;$env:Path"
$env:GWM_EXECUTABLE = (Resolve-Path 'release/Game Wingman-win32-x64/Game Wingman.exe').Path
$env:GWM_ARTIFACT_DIR = 'artifacts/windows-packaged'
$env:GWM_LIVE_DATA = '1' # 仅访问公共资料端点，不调用模型
node scripts/smoke.cjs
Remove-Item Env:GWM_EXECUTABLE, Env:GWM_ARTIFACT_DIR, Env:GWM_LIVE_DATA
```

## macOS 初次交接环境

macOS 27.2 / Apple Silicon arm64，Node 22.23.1，Electron 44.4.5。以下保留初次交接记录；Windows 最新结果以上述补充为准。

## macOS 初次验证通过

- TypeScript 主进程、preload、渲染层编译；3 项数据入口测试：版本路径校验、历史赛季过滤、损坏缓存拒绝。
- 开发版与打包后的 macOS `.app` 均通过原生桌面烟雾测试。
- 真实主窗口 880 × 650、独立浮窗 320 × 248；浮窗原生置顶，收起高度 52，显示 / 隐藏与状态同步正常。
- 调用原生点击穿透接口与恢复接口均通过；快捷键注册结果可见，注册失败时不启用穿透。未以自动化断言冒充 TFT 对局中的鼠标穿透实测。
- 渲染层无法使用 Node `require`；浮窗尝试获取窗口列表、切换采集来源或导入图片均被主进程拒绝。
- 原生图片导入链路通过。测试使用本程序生成的色块图片，不使用个人图片。
- 当前系统已经授予屏幕录制权限；用本程序创建的 `Capture QA synthetic` 窗口验证：选定窗口、连续两次抓帧、暂停释放流、继续读取、源窗口销毁后停止、拒绝旧 epoch 帧。没有读取其他真实游戏或私人窗口，也没有修改系统权限设置。
- 实时下载 NA realm 对应的 Data Dragon 资源 `16.19.1`，筛选 Set 18 英雄与羁绊后为 141 个名称条目（包含形态，不能作为英雄总数）。英文搜索 `Lux`、手动固定到浮窗通过。
- 已检查主窗口、浮窗、捕获预览与资料面板截图；设置分成“美服资料 / 浮窗设置”两个页签。

本地证据保存在未纳入版本控制的 `artifacts/`：`smoke-report.json`、`app-main.png`、`app-overlay.png`、`app-capture.png`、`app-settings.png`、`app-overlay-settings.png`。画面输入都是合成测试内容。

## 构建产物

| 目标 | 产物 | 验证范围 |
| --- | --- | --- |
| macOS arm64 | `release/Game Wingman-darwin-arm64/Game Wingman.app` | 打包完成；打包后二次运行与上述桌面测试通过 |
| Windows x64 | `release/Game Wingman-win32-x64/Game Wingman.exe` 及同目录依赖 | 初次交接完成交叉打包；现已在 Windows 本机重新打包并通过合成窗口测试，见上方补充 |

macOS 本地二进制具有 ad hoc 签名，不是开发者身份签名，也未公证。Windows 未签名。当前是本地产物，二进制未上传 GitHub、未发布安装器；复制 Windows 便携版需要整个目录。

## 未验证与后续范围

- 实际 TFT 对局、反作弊行为、封号风险、独占全屏、macOS 全屏空间、多显示器和缩放兼容。
- 新安装应用的系统授权交互、权限运行中撤回、窗口最小化与遮挡、长时间性能及资源占用。
- Intel Mac、最低系统版本，以及本次 Windows 11 环境之外的系统配置。
- OCR / 视觉识别、人工校正、经过审核的攻略库、模型调用与来源绑定的动态建议。这些仍是原目标的后续开发步骤，名称查询不能替代它们。

资料资源版本不代表 TFT 补丁版本，当前字典也没有证明包含 18.3 B 的所有热修。来源分析见 [美服 TFT 数据源核查](tft-data-sources-2026-09-24.md)。

## 重现

```sh
npm ci
npm test
npm run test:desktop
```

仅在当前应用已经获得屏幕权限时，桌面测试会捕获其自己创建的合成窗口；否则跳过捕获并记录原因，不自动更改系统授权。首次应先完全退出运行中的应用，避免单实例锁影响测试。

`GWM_LIVE_DATA=1 npm run test:desktop` 额外验证实际公共资料端点。打包后可通过 `GWM_EXECUTABLE` 指定本机产物中的可执行文件再次运行 `node scripts/smoke.cjs`。源代码测试、打包成功、游戏实测和公开发布是不同阶段。

## 公开源码交接补充

产品统一为 Game Wingman；新增三家文本 API 适配器和 Windows 接续文档。`npm test` 当前共 11 项通过，其中提供方测试全部为模拟网络响应。没有使用真实模型密钥、没有付费调用、没有把屏幕发送给提供方。源码发布与桌面 UI 的 AI 接线是不同阶段。

实际新版便携 EXE 已启动，旧 baseline-preview 已退出。通过 Windows Computer Use 查看程序自身预览，确认自动选中 TFT 并显示当前游戏画面，状态为本机实时预览；没有开启付费 AI 跟进。浮窗默认可见，OP.GG 前四率候选可见。屏幕读取验证不等于完整窗口化全屏置顶稳定性、战术适配或识别准确率验证。

## 2026-09-24 — 复制 OP.GG 阵容码

新增卡片与浮窗复制按钮，三个 teamCode 与实际 OP.GG 页面逐项核对。类型检查、30 项离线测试及隐藏原生专项通过。专项校验选择不自动写入、三卡片与浮窗绑定正确代码、非法 ID 拒绝、复制失败后可重试、浮窗按钮不越界。测试替换 Electron clipboard.writeText，没有读取或覆盖用户系统剪贴板，没有游戏输入或付费 API 调用。粘贴到实际 TFT 的导入结果未由自动化代测。

复制版实际便携 EXE 已启动并替换旧 guide-preview。通过程序浮窗确认“复制阵容码”入口可见、读取状态已恢复；未代用户粘贴到游戏。
