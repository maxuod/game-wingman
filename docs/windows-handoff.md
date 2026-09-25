# Windows 接续指南

来源政策更新（2026-09-24）：数据来源不限于 OP.GG，统一在[来源登记表](data-sources.md)和第三方说明中署名，区分公开主线、本地接入、研究与候选。新增来源同时维护数据集溯源。此次为文档变更，没有接入新的运行时 API 或改变预算。

公开交接点：2026-09-24，版本 0.1.0，仓库 https://github.com/maxuod/game-wingman 。产品名称已统一为 **Game Wingman**，主窗口、浮窗和软件包统一显示同一名称。此时按要求暂停进一步功能开发，下一次以 Windows 作为 TFT 游戏实测环境；保留 macOS 桌面架构。

## 在新电脑启动

安装 Git 与 Node.js 22.12–22.x；仓库 `.nvmrc` 为 22.23.1。在 PowerShell 中：

```powershell
git clone https://github.com/maxuod/game-wingman.git "game wingman"
cd "game wingman"
npm ci
npm run check
npm test
npm start
```

无需复制这台 Mac 的 `node_modules`、`dist`、`release` 或用户数据。新机器应重新安装本机依赖。普通 PowerShell 即可，不需要管理员身份。若 PowerShell 拦截 npm.ps1，可用 `npm.cmd` 执行同样命令，无需放宽整个系统的执行策略。

桌面测试使用它自己创建的合成窗口：

```powershell
npm run test:desktop
npm run package:win
```

先退出正在运行的应用再测试。测试不会读取你的游戏或整个桌面。API 模拟测试包含在 `npm test` 中，不需要密钥。便携产物为 `release/Game Wingman-win32-x64/Game Wingman.exe`，需保留同目录依赖。当前没有已验证的正式 Windows 安装器。

## 项目上下文

- 目标是实时读取可见画面、识别实体、从攻略库检索、在小浮窗里给出有来源的解释。首款游戏 TFT，**美服 NA / en_US**。
- 这是公开试用样品，用来收集 GitHub 反馈和为更多游戏产品提供蓝本；不是已经验证的上分工具。
- UI 必须非常简洁：主窗口三个主要操作，浮窗单条信息，资料与设置放到次级面板。不要回到网页展示稿或大聊天面板。
- 参考 ARAM-tool 的数据流程思路，UI 与代码独立实现；没有复制其代码或攻略库。
- API 首批支持 MiniMax、DeepSeek、Gemini。文本调用层和检查 CLI 已实现；真实密钥、截图输入与桌面接线尚未完成。
- 实时识别 / 动态建议仍在产品范围；保持现有封号风险说明和未获官方认可的标注。

## 先验证 Windows

1. 主窗口和浮窗能启动；选择合成窗口、读取、暂停、重新选择都正确。
2. `Ctrl Shift O` 显示 / 隐藏，`Ctrl Shift I` 切换穿透；快捷键被占用时有恢复入口。
3. 焦点不被浮窗抢走；点击穿透、托盘恢复、窗口关闭后停止读取。
4. 用户主动选择游戏窗口后，再记录 TFT 窗口模式 / 无边框模式的读取结果；独占全屏单独测，不推定所有模式都能覆盖。
5. 记录 Windows 版本、分辨率、缩放、显示器数、游戏补丁、实际结果。截图可选且需脱敏，原始画面不要提交仓库。

## 下一步开发顺序

1. 解决 Windows 采集 / 浮窗问题，补齐实际测试记录。
2. 用自己的密钥依次手动验证三家文本 API；参考 [API 提供方说明](api-providers.md)。不要在对话或 Issue 中粘贴密钥。
3. 在“资料与设置”加入提供方 / 模型 / 凭据状态，完成 Windows Credential Manager 等系统安全存储方案，再接入主进程调用。
4. 明确用户选择的截图发送范围，完成一次手动截图识别；保留实体 ID、人工校正和 unknown，不把模型常识当作画面事实。
5. 建立少量自有、审核过的攻略样例与检索，绑定来源和适用补丁；之后再连接低频动态更新与浮窗解释。

## 文件入口

| 路径 | 用途 |
| --- | --- |
| `src/main/index.ts` | 系统窗口、采集授权、IPC、快捷键、托盘 |
| `src/main/catalog.ts` | Riot Data Dragon 名称字典 |
| `src/main/ai/providers.ts` | 三家文本 API 适配器 |
| `src/preload/index.ts` | 窄 IPC 边界 |
| `src/renderer/` | 主窗口与浮窗 UI |
| `src/shared/types.ts` | 桌面状态和接口 |
| `tests/` | 离线测试 |
| `scripts/smoke.cjs` | 原生合成窗口测试 |
| `.env.example` | 无密钥配置模板 |
| `docs/desktop-validation.md` | 当前证据和未测试边界 |

开发代理接续提示：先阅读 README.zh-CN.md、本文件与 docs/api-providers.md；保留现有简洁 UI 和可见信息输入边界；Windows 实测后再做 AI 接线，不要把 API 适配测试描述成真实模型或实际游戏已验证。
