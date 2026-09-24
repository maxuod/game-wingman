# ARAM-tool 数据参考审查

检查日期：2026-09-24。参考项目：[MJ33520/ARAM-tool](https://github.com/MJ33520/ARAM-tool)。检查固定在 commit `f73215e844bfa10769ca234b90f38cc214efd00f`，仅阅读源码和上游页面；未运行其程序或爬虫。

## 结论

适合借鉴数据接入、缓存、名称归一化和证据优先的组织方式。它接入的是 ARAM 海克斯大乱斗内容，不是现成 TFT 攻略库；本项目独立实现数据接口与 UI/UX。

## 核实到的数据路径

| 环节 | 参考项目的实现 | 我们的处理 |
| --- | --- | --- |
| 上游 | ApexLol.info 英雄与海克斯页面 | 作为 ARAM 来源研究，不导入 TFT 库 |
| 获取 | HTML 解析器提取联动、评级、说明等字段 | 来源适配器输出统一结构，不与界面绑定 |
| 缓存 | 本地 JSON，带来源和获取时间 | 首版可导入 JSON，运行时查询 SQLite；补充游戏、补丁、使用依据 |
| 名称匹配 | 中文、英文及别名归一化 | 绑定赛季实体 ID；模糊匹配只生成候选，允许校正 |
| 生成 | 先抽取缓存内容，再交给模型解释 | 保留来源 ID；证据缺失显示无匹配 |

证据：[抓取与缓存结构](https://github.com/MJ33520/ARAM-tool/blob/f73215e844bfa10769ca234b90f38cc214efd00f/apexlol_scraper.py#L170)、[数据查询](https://github.com/MJ33520/ARAM-tool/blob/f73215e844bfa10769ca234b90f38cc214efd00f/apexlol_data.py)、[模型调用](https://github.com/MJ33520/ARAM-tool/blob/f73215e844bfa10769ca234b90f38cc214efd00f/gemini_analyzer.py#L73)。

## 不能只依据 README 的地方

- README 写手动更新，但固定版本的启动逻辑在缓存缺失、过期或即将过期时会后台刷新。我们单独定义并展示数据更新策略。[启动逻辑](https://github.com/MJ33520/ARAM-tool/blob/f73215e844bfa10769ca234b90f38cc214efd00f/main.py#L549)
- 源码还包含 LCU 和 Live Client 数据接口；它不只是一套屏幕识别实现。我们仍按用户要求使用画面输入，不引入这些接口。[客户端模块](https://github.com/MJ33520/ARAM-tool/blob/f73215e844bfa10769ca234b90f38cc214efd00f/lcu_client.py)
- 未命中缓存时，部分模型调用允许自行推荐。我们不沿用这个默认行为，防止将模型猜测显示成数据库依据。[调用分支](https://github.com/MJ33520/ARAM-tool/blob/f73215e844bfa10769ca234b90f38cc214efd00f/gemini_analyzer.py#L89)

## 代码与上游内容的使用范围

参考项目 README 标注 MIT；本次完整文件树中没有独立 LICENSE 文件，GitHub API 的 license 字段为 null。这是查阅结果，不是对其授权效力的法律结论。本轮没有复制其代码、视觉样式或攻略文本。[README](https://github.com/MJ33520/ARAM-tool/blob/f73215e844bfa10769ca234b90f38cc214efd00f/README.md)

ApexLol 当前条款限制大规模自动抓取和批量再发布，投稿与原创内容另有不同使用条件。不能因参考项目写了 MIT，就把上游攻略也认定为可自由打包分发。当前仅研究数据路径，不运行抓取或收录正文。[ApexLol 服务条款](https://apexlol.info/zh/terms)

## TFT 的实际来源方案

后续用户明确要求美服最新数据；实际接口、版本和字段缺口以[美服专项核查](tft-data-sources-2026-09-24.md)为准。

1. **实体资料**：先接入 Riot TFT Data Dragon 的名称、ID 和图标；逐字段检查完整性，记录赛季和补丁。它提供静态资产，不直接提供完整运营攻略。[官方文档](https://developer.riotgames.com/docs/tft#data-dragon)
2. **攻略知识**：首批使用自编或明确允许用于该样品的少量攻略；阵容、装备、阶段与适用条件结构化。数据来源尚未全部确定，不能把示例视作当前版本建议。
3. **外部知识源**：独立适配器接入，不把某个网站的页面结构或评级体系写死在 AI 和 UI 中。
4. **更新**：补丁匹配优先于缓存年龄；新内容校验后原子替换，下载失败保留旧快照并标注状态，旧补丁内容不自动参与当前推荐。

导入记录建议包含 `game_id`、`set_id`、`patch_scope`、`locale`、`entity_ids`、`source_url`、`author`、`usage_basis`、`retrieved_at`、`review_status` 和 `content_hash`。

原始资料、整理后的攻略和 AI 解释分层保存；社区评级不得改写为统计胜率。输出能回答“从哪里来、适用于哪个版本、为什么出现在这里”。
