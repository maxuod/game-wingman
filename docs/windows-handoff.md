# Windows 接续指南

本次同步当前完整 TFT 版本：指定/自动游戏窗口预览、置顶浮窗、三家 API 适配器、DeepSeek 单帧/持续识别、累计 ¥10 预算、OP.GG 阵容和装备参考、每日资料检查与游戏图标。源码包含空白 API 配置模板，不包含个人密钥、用户配置、账本或游戏截图。其他游戏的研究和求解器不属于本次交付。

## 配置 API

普通用户打开“资料与设置 → AI 识别 → API Key 配置”，选择平台后粘贴自己的 Key，点击“加密保存密钥”。也可导入本地 `.env` / JSON，或点击“保存空白模板”后填写。仓库提供 `api-keys.example.json` 与 `.env.example`；空字段跳过，导入按平台字段名归属，不猜测 Key 前缀。

保存/导入不启用 AI、不切换模型、不发起测试。输入框清空后，重启仍可通过当前系统账户读取加密凭据。已保存的密钥不回传界面。连接测试需主动启用请求，标明计费；本轮固定 DeepSeek Flash，连接测试、单帧与持续跟进共用累计 ¥10 账本，不因重启或换游戏重置。

详细操作见 [API 说明](api-providers.md)；装备识别需要额外开启并确认本次持续发送，见[自动装备建议](automatic-equipment.md)。

## 从源码运行

使用 Node.js 22.12–22.x（`.nvmrc` 为 22.23.1），在 PowerShell 执行：

```powershell
git clone https://github.com/maxuod/game-wingman.git "game wingman"
cd "game wingman"
npm ci
npm run check
npm test
npm start
```

Windows 如拦截 `npm.ps1`，可使用 `npm.cmd`。启动外壳、预览和查询公开资料不需要 Key；AI 请求需要用户自己的有效凭据。

## 构建与验证

`npm run package:win` 输出 `release/Game Wingman-win32-x64/`，应保留整个目录；macOS 使用 `npm run package:mac`。本机 API 配置预览包使用 `release/api-config-preview/Game Wingman-win32-x64/`。退出旧实例后再启动新包；没有安装器、代码签名或自动更新软件本体。

普通测试使用模拟网络、假密钥和合成画面，不访问付费 AI。用户正在游戏时用隐藏原生测试 `node scripts/smoke-guides.cjs`，它替换完整窗口清单并指定隔离的 `--user-data-dir`；不得读取真实游戏或真实用户 profile。完整 `npm run test:desktop` 需先退出其他实例；桌面测试本身仅捕获生成的夹具窗口。

本地检查、GitHub CI、打包、真实游戏验证和公开发布分别报告，见[桌面验证记录](desktop-validation.md)。目前真实 TFT 装备识别准确性、窗口化全屏持续覆盖与游戏兼容性仍需实测，不能以合成测试替代。

## 接续约束与入口

- 数据源不限于 OP.GG，但新增来源必须同步维护[来源登记表](data-sources.md)、数据集溯源与第三方说明。已接入和候选必须分开标注。
- 数据版本保持独立：游戏补丁、热修、静态资源版本、地区与统计窗口不能混为一谈。参考[每日更新规则](daily-data-updates.md)。
- 主窗口保留三个主要操作；AI/装备/资料配置放在次级面板。只读可见画面，不接入游戏内存、注入或自动操作。
- 保留系统加密存储、仅主窗口凭据写入、单帧/会话发送确认、旧结果清理和持续预算保护。不要把个人 `.env`、填写后的模板、用户缓存或原始截图提交仓库。
- `src/main/index.ts` 负责窗口/IPC/同意流程；`src/main/ai/` 负责提供方、加密存储、导入格式、预算及抽样；`src/renderer/` 负责主界面、浮窗和图标。`tests/` 为离线检查，`scripts/smoke-guides.cjs` 为隐藏桌面回归入口。
