# TFT 美服数据源核查

检查日期：2026-09-24。目标：美服 NA、正式服、英文游戏实体；中文界面可独立保留。结论来自公开接口和仓库实际文件，不仅依据搜索摘要。没有登录美服客户端或抽样真实美服对局。

## 选择结论

采用 **官方 Data Dragon 作为实体基准，CommunityDragon 补充结构化关系，本地 SQLite 组织查询，官方补丁说明记录热修差异** 的组合。TFT_DDragon 可作有 Git 历史的镜像参考；tft-oracle 可参考查询层实现。没有在本轮候选中确认一套同时满足当前热修、完整数值、美服统计和攻略内容的现成开放数据库。

## 当前版本基准

- TFT：Set 18 / Enchanted Wilds，官方美区补丁页为 **18.3**，页面新增 **9 月 24 日 18.3 B 热修**。[官方补丁说明](https://teamfighttactics.leagueoflegends.com/en-us/news/game-updates/teamfight-tactics-patch-18-3/)
- NA Data Dragon：`16.19.1`，语言 `en_US`。[美服 realm](https://ddragon.leagueoflegends.com/realms/na.json)
- CommunityDragon：本次 `latest` 与固定 `16.19` 路径的英文 TFT 文件 SHA-256 完全一致；服务器 Last-Modified 为 `2026-09-24 00:52:47 UTC`。

`18.3` 是 TFT 对外补丁号，`16.19.1` 是本次资源包版本，不能混用。官方公告含当天热修不等于我们已实测美服部署；当前数据文件的完整热修覆盖尚未确认。

## 候选比较

| 来源 | 本次新鲜度证据 | 内容与用途 | 限制 |
| --- | --- | --- | --- |
| [Riot Data Dragon](https://developer.riotgames.com/docs/tft#data-dragon) | NA realm 为 16.19.1；英雄、羁绊、强化符文接口均成功返回 | ID、英文名、图标；部分实体描述；识别字典的基准 | 官方公开游戏资料，不是附通用开源许可证的攻略库；没有完整胜率与运营攻略 |
| [CommunityDragon](https://raw.communitydragon.org/latest/cdragon/tft/) | 9 月 24 日更新；含 TFTSet18 | 英雄、羁绊、装备/强化引用、基础属性与描述 | 部分数值字段缺失；包含历史赛季和变体；不可直接称为完整当前数据 |
| [noxelisdev/TFT_DDragon](https://github.com/noxelisdev/TFT_DDragon) | 9 月 24 日 16:26:51 UTC 提交 Added patch 18.3 | 有 Git 历史的公开镜像，适合跟踪变更 | 本次英雄、羁绊、强化文件与官方同版本逐字节一致；并非独立攻略源；未发现独立许可证 |
| [gregario/tft-oracle](https://github.com/gregario/tft-oracle) | 最新代码提交 5 月 2 日；数据取自 CommunityDragon | MIT 开源的 TFT 查询服务，可参考数据入库和工具接口 | 代码更新时间不等于数据更新时间；不能独立解决上游缺失或证明 18.3 B 覆盖 |

镜像核查固定 commit：[0f0db94593ac1e41cf897572e12d05659d63729b](https://github.com/noxelisdev/TFT_DDragon/commit/0f0db94593ac1e41cf897572e12d05659d63729b)。tft-oracle 代码固定 commit：`741a285a06eecd7904626e16956895ca2ad89bf6`。CommunityDragon 提取工具 [CDTB](https://github.com/CommunityDragon/CDTB) 为 LGPL-3.0，工具代码许可与 Riot 游戏资产的使用范围分别处理。

## 实际可读取的入口

- [官方英文英雄数据](https://ddragon.leagueoflegends.com/cdn/16.19.1/data/en_US/tft-champion.json)
- [官方英文羁绊数据](https://ddragon.leagueoflegends.com/cdn/16.19.1/data/en_US/tft-trait.json)
- [官方英文强化符文数据](https://ddragon.leagueoflegends.com/cdn/16.19.1/data/en_US/tft-augments.json)
- [CommunityDragon 固定资源版本](https://raw.communitydragon.org/16.19/cdragon/tft/en_us.json)
- [CommunityDragon 当前滚动入口](https://raw.communitydragon.org/latest/cdragon/tft/en_us.json)
- [镜像的英文资料目录](https://github.com/noxelisdev/TFT_DDragon/tree/0f0db94593ac1e41cf897572e12d05659d63729b/data/en_US)

原始文件保存在本地临时目录用于核对，未将整套第三方数据打包进项目。项目内只记录[本次核查摘要](data/tft-na-source-audit-2026-09-24.json)。

## 实际发现的数据缺口

CommunityDragon 的 `TFTSet18` 下有 91 条角色记录，74 条带羁绊，36 条羁绊，592 个强化引用、770 个物品引用。计数包含形态、召唤物或其他特殊条目，**不是可购买英雄/有效强化的数量**。

在 74 条带羁绊的角色记录中，72 条的技能 `variables` 为空，74 条技能说明含未替换的 `@...@` 占位符。例如 Kha'Zix 的说明没有可直接核对本次 B 热修伤害的技能参数。因此可用于实体识别和关系查询，但不能把未解析的说明交给模型补数值。

该变体同时出现 `number: 18`、`mutator: TFTSet18` 与 `name: Set10`。实际实体包含当前赛季内容，所以不能仅按名称判断赛季过期，也不能简单取最大赛季号当作正式模式。适配器应显式指定并核查 `set_id`、`mutator` 和代表实体。

本轮搜索也出现使用 Set 18 **PBE** 数据的项目；未将它们列为美服正式服数据基准。搜索摘要可能滞后于 GitHub 文件，镜像此次就是实际文件已到 18.3、摘要仍停在 18.1。

## 如何满足“美服最新”

1. 地区固定 NA，实体语言使用 `en_US` / `en_us`；界面语言另设，不以中文界面选择国服数据。
2. 将 `tft_patch`、`hotfix_revision`、`asset_version`、`set_id`、`mutator`、`retrieved_at`、`content_hash` 分开存储。
3. 对滚动入口先下载到暂存区，再验证代表实体、占位符、数值缺失和当前热修变更；通过后才替换本地快照。
4. 未确认热修的内容显示“18.3 数据，9 月 24 日热修待核对”；不显示笼统的“已是最新”。热修修订需附官方依据并单独记录，不用模型猜测补齐。
5. 静态资料的英文语言包并不等于美服胜率。若后续需要美服统计，应使用符合来源条件的 NA 比赛样本，记录平台、队列、段位、补丁、时间窗和样本量；本轮没有获取此类统计库。

UI 原创要求保持不变；任何数据源均通过适配器进入我们自己的信息结构和交互设计。
