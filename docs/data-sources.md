# 数据来源与署名 / Data sources and attribution

登记日期：2026-09-24。Game Wingman 的数据来源**不限于 OP.GG**：官方资料用于核对规则和补丁，社区结构化资料用于补充实体关系，统计平台用于阵容与配装参考。选源依据是版本匹配、字段质量、统计口径和可用条件。

本页对应当前 TFT 代码版本。下表明确标注已接入、仅研究及候选；其他游戏的本地研究记录不随本次 TFT 更新发布。

This registry distinguishes integrated TFT sources, research inputs and candidates. A listed source is not necessarily an active integration. Source attribution does not imply endorsement or grant a reuse license.

## 已使用的 TFT 来源

| 来源及署名 | 使用内容与处理 | 接入状态 / 范围 | 版本与更新依据 |
| --- | --- | --- | --- |
| [Riot Games — TFT Data Dragon](https://developer.riotgames.com/docs/tft#data-dragon) | 英雄、羁绊的 ID 和英文名称；按赛季过滤作为识别字典 | 已接入；手动同步 NA realm / en_US；不是阵容统计库 | 从 [NA realm](https://ddragon.leagueoflegends.com/realms/na.json) 读取资源版本；本次核查 16.19.1。缓存记录 `version`、`checkedAt` |
| [Riot Games — TFT 官方更新](https://teamfighttactics.leagueoflegends.com/en-us/news/game-updates/) | 补丁号、热修标记、发布日期、内容指纹与装备核查提示；不收录整篇公告 | 本次 TFT 版本已接入每日资料检查；用于核对补丁，不是软件本体更新 | 本次依据为 [18.3 / 9 月 24 日 B 热修](https://teamfighttactics.leagueoflegends.com/en-us/news/game-updates/teamfight-tactics-patch-18-3/)；发布与获取时间分开记录 |
| [OP.GG — TFT 阵容统计](https://op.gg/tft/meta-trends/comps) | 阵容、棋子、目标配装、来源坐标、阵容码和统计事实；阵容说明使用本地模板，不复制攻略正文 | 本次 TFT 版本已接入 50 套主页面变体，39 套含完整坐标；全服 / 全段位 / 近 24 小时，非独立 NA 样本 | TFT 18.3；每条含 `sourceUrl`、`patch`、`updatedAt` 和样本量；获取时间记录在快照的 `rankingCheckedAt`；每日启动检查，排名超过 6 小时或官方变化时刷新 |
| [OP.GG — TFT 装备](https://op.gg/tft/game-guide/items) | 137 件装备、55 种配方；整理名称和成分关系，供本地按目标阵容补缺计算 | 本次 TFT 版本已接入；装备配方独立于阵容排行更新 | Set 18 / 18.3；快照记录来源及核查时间。官方变更后需核查，不自动把旧配方标为新版本 |
| [OP.GG — 阵容海克斯候选](https://op.gg/tft/meta-trends/comps) | 按阵容读取候选 ID、名称、等级、可出现阶段与图标链接；不保存说明正文 | 本次 TFT 版本按展开加载，缓存 6 小时；不代表玩家当前三个选项的排名 | 每份缓存含阵容 ID、补丁和读取时间；没有来源数据时不编造候选 |
| [OP.GG 公共图片 CDN](https://c-tft-api.op.gg/img/set/18/tft-item/DA_LastWhisper.png)；游戏资产权利归 Riot Games 等各自权利人 | 来源元数据中的英雄、装备和海克斯图片，用于配装、站位及合成图示 | 本次 TFT 版本按需加载，缓存复用 7 天；仓库不打包图片全集 | 图片 URL 保留赛季路径；不因图片路径含赛季号就认定统计或配方版本相同 |

本地计算规则由 Game Wingman 实现：按目标核心和来源配装顺序补缺，扣除已有成装，避免重复分配同一散件。这个排序不是 OP.GG 对当前对局的实时判断，AI 识别结果也不是外部攻略来源。

Data Dragon 的资源版本不等于 TFT 补丁号；`en_US` 不等于 NA 对局统计。官方公告包含 18.3B，不代表每份资源或统计已单独覆盖该热修。历史核查和哈希见 [TFT 来源核查](tft-data-sources-2026-09-24.md)及[核查摘要](data/tft-na-source-audit-2026-09-24.json)。

## 可补充的来源：目前未接入推荐运行时

| 来源 / 维护者 | 适合补充什么 | 本次证据与尚需核对的事项 |
| --- | --- | --- |
| [CommunityDragon](https://raw.communitydragon.org/latest/cdragon/tft/) / CommunityDragon contributors | 英雄、羁绊、装备与强化的结构化关系、资源引用 | 已完成独立数据研究；固定 `16.19` 与当次滚动版本的哈希保存在上述核查摘要。存在缺失数值、占位符及历史变体；不以工具代码许可证代替游戏内容的使用条件 |
| [MetaTFT](https://www.metatft.com/comps) / MetaTFT | 候选阵容及装备统计，供后续交叉核对 | 本次公开页面需要 JavaScript；尚未核定自动取数入口、统计口径或使用条件，没有集成或复制其数据集 |
| [Tactics.tools](https://tactics.tools/team-compositions) / Tactics.tools | 阵容分类、配装、平均名次与样本筛选的另一参考 | 公开页展示 Ranked、Diamond+ 和补丁筛选，不能直接与 OP.GG 全段位数字比较。仍需核对赛季实体、时间窗、样本、字段与使用条件；没有集成 |
| [TFT_DDragon](https://github.com/noxelisdev/TFT_DDragon) / noxelisdev | 带 Git 历史的资源镜像，便于追踪变更 | 已研究；镜像与上游不能算两份独立证据。固定提交及版本核对见历史核查；未作为运行时来源 |

后续优先核对 CommunityDragon 的实体关系，再评估其他统计平台。未确认的 API、许可、样本口径或数值明确记为未知；不把候选网站当成已接入服务，也不自动增加付费服务。

## 其他游戏与实现参考

- **Slay the Spire Wiki contributors**：[wiki.gg](https://slaythespire.wiki.gg/)、[Fandom](https://slay-the-spire.fandom.com/wiki/Slay_the_Spire_Wiki)。本地一代研究资料记录页面 URL、修订号、编辑历史、获取时间、哈希及修改说明；尚未接入桌面推荐，也不代表已审核的战斗规则。Wiki 衍生研究数据另行署名并遵循记录的 CC BY-SA 4.0；见 [wiki.gg 权利信息](https://slaythespire.wiki.gg/api.php?action=query&meta=siteinfo&siprop=rightsinfo&format=json)、[Fandom 许可说明](https://www.fandom.com/licensing)和 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)。发布这类数据时必须同时带上逐页来源、贡献者历史和独立的数据许可说明；本页不替代这些记录。
- **gregario / [tft-oracle](https://github.com/gregario/tft-oracle)**：查询层实现研究，不是另一份独立统计样本；工具代码许可与其上游游戏数据分开记录。
- **MJ33520 / [ARAM-tool](https://github.com/MJ33520/ARAM-tool)**：只研究数据接入与缓存流程，没有复制代码、UI 或攻略库；见[参考审查](data-source-review.md)。

## 每次新增或更新来源时必须记录

| 字段 | 记录要求 |
| --- | --- |
| 身份与署名 | 稳定 `source_id`、平台 / 作者 / 贡献者名称、原始页面或接口 URL；图片同时记录分发来源和权利归属 |
| 实际使用范围 | 使用了哪些字段、是否翻译或整理、是否缓存或随包发布；区分官方事实、社区统计、作者观点及本地算法 |
| 版本与时间 | 游戏、赛季、正式服 / PBE、游戏补丁、热修、资源版本分别记录；来源更新时间与 UTC 获取时间分开，未知不猜测 |
| 统计口径 | 地区、队列、段位、样本量、时间窗、指标定义；前四率与吃鸡率独立，默认前四率 |
| 可追溯性 | 能固定时保存 commit / revision / 内容哈希；动态页面保存所用事实快照及过滤条件，避免只留 `latest` 链接 |
| 使用条件 | 对应许可或条款链接、核对日期、当前核对结论和修改说明；标注来源不等于获得再发布许可，代码许可不自动适用于游戏资产或攻略正文 |
| 质量与状态 | 已发布 / 本地接入 / 研究 / 候选、审核状态、缺失字段、过期及热修覆盖；只将已确认且适配当前版本的记录用于相应用途 |

这些是新增来源的登记要求，不表示已有的每种缓存都包含全部字段。上述各来源行说明当前已经记录的范围；接入新来源时同时补全其必要元数据。

不同网站的样本可能重叠，阵容分组和段位筛选也可能不同。未对齐口径前保留各自统计和署名，不直接平均胜率、不相加样本量。规则变更以对应官方公告为核对基准；来源冲突保留差异和版本，不让模型补造结论。第三方内容权利与项目 `UNLICENSED` 状态分别处理，见[第三方说明](../THIRD_PARTY_NOTICES.md)。

## GitHub 维护位置

README 中英文入口链接到本页；第三方权利说明放在 `THIRD_PARTY_NOTICES.md`；具体数据集携带自身来源、修订及许可记录。新增来源的代码或数据变更应同时更新这三处适用的记录，不能只在聊天或本地临时文件里署名。界面中的来源入口应指向实际使用的平台；当前运行时仍显示它实际使用的 OP.GG / Riot 来源，本次 API 配置更新没有切换数据提供方。
