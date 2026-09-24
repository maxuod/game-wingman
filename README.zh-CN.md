# Game Wingman

**AI 游戏攻略助手实验样品。先以 TFT 为蓝本，再扩展到其他游戏。**

[English](README.md) · [Windows 接续指南](docs/windows-handoff.md) · [API 配置](docs/api-providers.md) · [问题反馈](https://github.com/maxuod/game-wingman/issues/new/choose)

这是 Electron + TypeScript 桌面应用，目标流程是：读取指定游戏窗口 → 识别可见信息 → 检索有来源和版本的攻略 → 在独立浮窗中显示简短解释。首款适配游戏为 TFT，地区以美服 NA、实体名称以 en_US 为准。

公开本项目是为了收集反馈，并为之后的游戏产品积累可复用模块。当前是早期样品，完整 AI 攻略链路尚未完成。

> **试用与封号风险提示**：本项目未获 Riot Games 官方认可。根据当前局势给出实时建议可能违反游戏规则，使用可能导致账号处罚，包括封禁。项目不保证账号安全、识别准确性、攻略有效性或胜率。试用品标签不构成规则豁免，使用前请阅读[试用说明](docs/usage.md)。

## 当前可用范围

- 桌面主窗口、独立置顶浮窗、收起、透明度、点击穿透与恢复入口。
- 选择一个窗口后每 3 秒更新本机预览；暂停、继续、关闭源窗口后停止；支持导入截图。
- 美服 Data Dragon 的 Set 18 英雄 / 羁绊名称字典，可手动同步、搜索和固定到浮窗。
- MiniMax、DeepSeek、Gemini 统一文本 API 调用层、配置检查、可手动发起的固定文本测试。

**尚未完成：** OCR / 视觉识别、截图发送、已审核攻略库、AI 建议与桌面 UI 的连接。名称字典不等于战术攻略库，资源版本也不等于 TFT 补丁或热修覆盖。

macOS 已验证桌面外壳及合成窗口读取。下一阶段以 Windows 作为游戏实测环境；实际 TFT 对局、全屏覆盖与反作弊兼容性尚未验证。详见[验证记录](docs/desktop-validation.md)。

## 简洁的桌面界面

主窗口只有三个主要按钮：选择窗口、开始 / 暂停读取、显示 / 隐藏浮窗。资料和设置收进次级面板，浮窗一次显示一条信息。

![桌面主窗口](docs/images/main-window.png)

截图展示的是当前桌面应用，不是已完成 AI 推荐的演示。`design/` 中的网页只保留作早期设计记录。

## Windows 上继续

安装 Git 和 Node.js 22（22.12–22.x；本机验证版本为 22.23.1），在 PowerShell 执行：

```powershell
git clone https://github.com/maxuod/game-wingman.git
cd game-wingman
npm ci
npm start
```

启动桌面功能不需要 API Key。具体测试顺序和下一位开发者的上下文已写在 [Windows 接续指南](docs/windows-handoff.md)。

```powershell
npm run check
npm test
npm run test:desktop
npm run package:win
```

Windows 便携包位于 `release/Game Wingman-win32-x64/`，必须保留整个目录。macOS 可用 `npm run package:mac` 生成 arm64 `.app`。产物未做发行签名 / 公证，构建通过不代表游戏实测通过。

## 三家 API

```powershell
Copy-Item .env.example .env
npm run api:check -- minimax
npm run api:check -- deepseek
npm run api:check -- gemini
```

以上只在本地检查配置。密钥只填入被 Git 忽略的 `.env`，不要提交到仓库或 Issue。默认 `AI_ENABLED=false`，应用界面不会自动调用模型。

如需主动测试某家 API，将 `.env` 中 `AI_ENABLED` 设为 `true`，再执行：

```powershell
npm run api:check -- minimax --probe
```

这会发送一次固定的文字测试请求，可能产生提供方费用，不发送截图、游戏数据或本地文件。没有自动重试或跨提供方回退。本次发布只完成模拟响应测试，尚无真实模型请求结果。完整配置与接口边界见 [API 提供方说明](docs/api-providers.md)。

## 文档与反馈

[试用说明](docs/usage.md) · [路线图](docs/roadmap.md) · [隐私说明](PRIVACY.md) · [安全反馈](SECURITY.md) · [贡献说明](CONTRIBUTING.md) · [更新记录](CHANGELOG.md)

当前暂停功能开发，停在可以克隆并继续工作的公开交接点。后续先验证 Windows 捕获与浮窗，再连接模型、识别和有来源的攻略解释。

## 许可证

目前是公开源码预览，尚未选定开源复用许可证（`UNLICENSED`），公开可见不等于授予复用许可。第三方依赖和游戏资料分别遵循各自条款，见[第三方说明](THIRD_PARTY_NOTICES.md)。项目没有复制 ARAM-tool 的代码、UI 或商业攻略库。
