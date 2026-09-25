# Game Wingman 品牌图标

2026-09-24：采用「W + 双翼」形状，呼应 Wingman 的僚机含义。保留深蓝 `#21333E`、薄荷绿 `#A8D0C6`；主窗口使用深蓝单色标记，深色浮窗使用薄荷绿标记。

概念由内置 imagegen 生成（未使用 CLI fallback），存档于 [生成概念](brand/generated-concept.png)。生产图标按概念重新绘制为对称矢量，去除概念图中的纹理和透明瑕疵；以 [assets/icon.svg](../assets/icon.svg) 为唯一手工维护源文件。

运行 `npm run icons`，通过本地 Electron / Canvas 导出以下资源，无网络请求：

| 文件 | 用途 |
| --- | --- |
| `assets/icon.svg` | 1024 px 尺寸声明、256 单位坐标的矢量源文件 |
| `assets/icon.png` | 1024 × 1024 透明 PNG、原生窗口图标 |
| `assets/icon.ico` | Windows 16 / 24 / 32 / 48 / 64 / 128 / 256 px |
| `assets/icon.icns` | macOS 16–1024 px，含 Retina 条目 |
| `assets/mark.svg`、`assets/mark-ink.svg` | 无底色的浮窗 / 主窗口标记 |
| `assets/trayTemplate.png`、`assets/trayTemplate@2x.png` | macOS 系统菜单栏单色模板 |

Windows 托盘使用带深蓝底色的 ICO，避免黑白系统主题影响辨识。构建时将界面标记复制到 `dist/renderer/brand/`；安装包包含平台图标。macOS 资源已导出，本轮只验证 Windows 运行效果。

## 生成概念的完整提示词

```text
Use case: logo-brand
Asset type: production desktop app icon for Game Wingman, an understated TFT gaming companion.
Primary request: Design one memorable, beautifully balanced logo symbol that fuses the letter W with a pair of swept wings flying in formation. A trusted copilot: composed, precise, quietly capable.
Composition: a single square app icon, centered. Deep ink navy (#21333E) rounded-square tile with softly rounded corners, small transparent margin outside the tile. The symbol fills about 62 percent of the canvas with generous breathing room.
Symbol: bold minimal geometric wing/W silhouette, two balanced angular swept wings meeting through a clean central V-shaped negative space; a subtle sense of forward/upward flight. Pale mint (#A8D0C6) as the main mark, optional small off-white (#F2F5F4) facet only if it strengthens legibility. Simple enough to recognize at 16 pixels. Make the form distinctive and optically balanced.
Style: flat vector-like brand design, mathematically clean edges, solid fills, restrained premium desktop utility aesthetic.
Constraints: exactly one icon, front-facing, actual transparent background outside the navy tile. No text, no letters beside the symbol, no mockup, no presentation sheet, no gradient, no glow, no shadows, no texture, no controller, no robot, no bird face, no crown, no shield, no borrowed game or esports insignia. High resolution square output.
```
