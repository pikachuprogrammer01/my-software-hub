# 需求文档（PRD）· my-software-hub

> 后续实施补充（2026-10-03）：执行范围新增手机 HTTP 托管与提案 API，详见 `PHONE-RUNTIME.md` 和 `AGENT-CONTINUATION-PROMPT.md`。旧稿将后台/数据库列为范围外的条款不适用于新提案控制面；公共内容主源及存量客户端契约保持不变。

> 版本 v1.0 · 2026-10-01 · 状态：**待批准**
> 上游：`VISION.md`（目标、决策原则、已否决方案）。冲突时以 `VISION.md` 第五节为准。
> 依据：`PRODUCTS.md`（五仓实测审计）、`SITE-DESIGN.md`（设计）、`CONTRACT.md`+`schema/*.v1.json`（已冻结契约）。

## 1. 范围

**范围内**：站点的多产品化改造、数据面契约的消费端、更新说明的作者端与发布端、护栏工具链。
**范围外**：各产品开发仓的改造（本文档只定义接口与交付物，不承诺对方实现）。

## 2. 角色与主场景

| 角色 | 主场景 |
|---|---|
| R1 作者 | 发一版 → 写一次 release-notes → 站点与客户端同时更新，无需改代码 |
| R1 作者 | 加一个产品 → 在 `products.json` 登记一条 + 写几篇 md → 自动成站 |
| R2 用户 | 访问 `/` 看到产品目录 → 进入产品页看到如实的能力边界与最新版 |
| R3 客户端 | 拉 `release-notes-latest.v1.json` → 按自己容器渲染 → 拉不到时用内置副本并告知 |
| R4 接手者 | 读 `CONTRACT.md` → 跑 `pnpm validate` → 知道什么能改什么不能改 |

## 3. 功能需求

优先级：**P0** 阻塞发布 · **P1** 首个里程碑必做 · **P2** 有价值可延 · **P3** 预留。

### A 组 · 多产品门户

| # | 需求 | 优先级 | 验收标准（可测） |
|---|---|---|---|
| FR-1 | 产品注册表 `data/products.json`，符合 `schema/products.v1.json` | P1 | `pnpm validate` 通过；条目覆盖 5 个产品 |
| FR-2 | `/` 为产品目录页，按 `visibility` 分组渲染；`internal` 产品**不出现**在目录、导航与 sitemap | P1 | 抓取 `/` 与 `sitemap.xml`，断言无 `automation` |
| FR-3 | 统一路由前缀 `/<产品id>/`；产品 id 一经发布不得改名 | P1 | 五产品各自页面可访问；改 id 会导致 lint 失败 |
| FR-4 | `kind` 决定默认 section 集合；未知 `kind` **回落通用模板而非构建失败** | P1 | 注入一个 `kind:"firmware-tool"` 的产品，build 仍通过 |
| FR-5 | 下载区由 `updateMechanism` 单一决定（见 `CONTRACT.md` 第四节表） | P1 | `built-in-updater` 产品页面无下载按钮；`none` 产品无"会自动提醒你"字样 |
| FR-6 | 每产品独立侧栏与导航（VitePress 路径前缀多套 sidebar） | P1 | 两产品页面侧栏条目互不串台 |
| FR-7 | 每产品独立 SEO（`title`/`description`/`og:image`） | P2 | 各产品页 head 断言含自身产品名 |
| FR-8 | per-product 品牌色 | P3 | **技术可行性未验证**，见 `SITE-DESIGN.md` 第十一节 |

### B 组 · 数据面消费

| # | 需求 | 优先级 | 验收标准 |
|---|---|---|---|
| FR-9 | 构建期拉取发布仓 `update.json`/`facts`/`release-notes`，写入 `data/snapshot/<id>/` 并**提交入库**，带 `fetchedAt` | P1 | 快照文件在版本控制内；含 `fetchedAt` |
| FR-10 | 拉取失败 → 沿用旧快照 + 页面顶部注入告警条，**不得静默** | P1 | 断网跑 build，页面出现告警且构建成功 |
| FR-11 | 单产品数据损坏**不阻断整站构建**（逐产品 try/catch，失败产品从目录摘除） | P1 | 故意写坏一个产品的 JSON，其余 4 产品页面正常产出 |
| FR-12 | `factsSource: manual` 的产品，页面必须展示「人工核对于 X」 | P1 | 三个 manual 产品页面均含该字样 |
| FR-13 | 快照**禁止被文档当"当前值"引用**；当前态数字一律走占位符 | P1 | lint 能在 md 中检出裸字面量并失败（见 FR-16） |

### C 组 · 更新说明作者端

| # | 需求 | 优先级 | 验收标准 |
|---|---|---|---|
| FR-14 | `release-notes.v1.json` 四层文案（`badge`/`summary`/`changes[].text`/`changes[].detail`） | P1 | schema 校验通过；站点渲染 `detail` |
| FR-15 | 按产品 `budget` 对 `badge`/`summary`/`text` 做**超长即 lint 失败** | P1 | 给 table-flow 写一条 60 字 summary，lint 失败 |
| FR-16 | lint 分「当前态 / 历史态」两区：当前区裸字面量失败，历史区（changelog、旧 notes）**一律豁免** | P1 | 在 changelog 写「月费 ¥4」不报错；在 pricing 写错价报错 |
| FR-17 | `/changelog` 由 `release-notes` 渲染；v0.1–v1.3 手写长文**冻结为历史态**，不再新增 | P1 | 冻结段落内容逐字不变；新条目来自数据 |
| FR-18 | 交叉校验：快照 `version` 必须等于该产品 changelog 首条 | P1 | 人为错开一版，`pnpm validate` 告警（非 strict 不阻断） |

### D 组 · 接入方（R3）交付物

| # | 需求 | 优先级 | 验收标准 |
|---|---|---|---|
| FR-19 | `conformance/fixtures/` 六用例 + 期望渲染结果（正常/未知枚举/超长/缺可选/错 product/高 schema 版本） | P1 | 六文件存在，且各附期望结果说明 |
| FR-20 | 客户端 MUST 七条写入 `CONTRACT.md` 第五节（已存在），并在接入清单复述 | P1 | 文档存在 |
| FR-21 | `release-notes-latest.v1.json` 端点（仅最新一条），供客户端拉取 | P1 | 体积 < 4 KB；只含 1 个 release |
| FR-22 | 每产品一页《接入清单》：改哪个文件、raw URL、谁审批 | P2 | 五产品各一页 |

### E 组 · 工程基线

| # | 需求 | 优先级 | 验收标准 |
|---|---|---|---|
| FR-23 | **站点仓纳入 git**（`VISION.md` 假设 A1 与"Git 即 CMS"的前提） | **P0** | `git log` 有历史；改错文件可回滚 |
| FR-24 | `pnpm build` 前置契约自检 | P1 | 已实现并验证（20 项通过） |
| FR-25 | 构建可完全离线复跑（回落内置快照，不失败） | P1 | 断网 `pnpm build` 成功 |
| FR-26 | 仓库名/目录/远端统一为 `my-software-hub` | P1 | 见第 9 节改名交付 |

## 4. 非功能需求

| # | 要求 | 目标 |
|---|---|---|
| NFR-1 | 死链 | 构建期校验，**0 条**（现状已达成） |
| NFR-2 | 构建时长 | 五产品全量 < 60 s（现状 1.8 s，留足余量） |
| NFR-3 | 可回滚性 | 任一次内容变更可单步回退，不需人工修复 |
| NFR-4 | 写作体验不退化 | 改一篇正文的步数 **不多于今天**（改 md → 看效果）。这是验收项，不是愿望 |
| NFR-5 | 对外口径只收窄 | 未实现能力不得出现在承诺位（`content/scope.md` 已有 ❌ 矩阵，迁移后须逐条保住） |
| NFR-6 | 无障碍 | 状态不只靠颜色表达（现 `scope.md:83` 自认此项待补） |

## 5. 约束与依赖

**硬约束**
- C1 已分发客户端硬编码的 raw URL **永不可变**（`table-flow/src/constants/update.ts:23` 被打进 3 个 chunk）。
- C2 契约 append-only：存量字段不改名、不改形、不删除。
- C3 站点不写回任何开发仓；发布脚本不读写站点仓。
- C4 **任何同步/导出脚本不得路径遍历 `Automation` 目录**——非 git 仓库、无 `.gitignore`、含真实登录态与和加密库同目录的 fernet key。

**外部依赖**
- D1 发布仓需新增 `facts.json` / `release-notes*.json` / `products.json` → **需你在我方之外完成**，站点先以 `factsSource: manual` 起步不被阻塞。
- D2 table-flow 客户端需修 fail-loud（`updateService.ts:39-46`）与 wps 需修 notes 断链 → 登记在 `CONTRACT.md` 存量偏差，**不阻塞本 PRD**。
- D3 Edge 商店详情页 URL 与商店版本号仍缺（`README.md` 待决项），影响 `browser-auto` 产品的下载区文案。

## 6. 里程碑

| 里程碑 | 内容 | 完成判据 |
|---|---|---|
| **M0** | FR-23 纳入 git | 有历史、可回滚 |
| **M1** | FR-1/2/3/9/10/11/13 + 路由迁移（含品牌标题切换） | 五产品注册表落盘；`/` 是目录；断网可构建；单产品损坏不砸全站 |
| **M2** | FR-4/5/6/12/17/18 + **接入 wps-enhancer** | 第二个产品（桌面 app，形态差异最大）跑通——**这是抽象是否成立的真检验点** |
| **M3** | FR-14/15/16 + D1 落地 | 发一版只写 release-notes（G3 达成） |
| **M4** | FR-19/20/21/22 | 第一个外部客户端接入 ≤0.5 人日（G5 达成） |

> M2 刻意排在更新说明自动化（M3）之前。理由见 `SITE-DESIGN.md` 第八节：只有一个产品时做的多产品抽象全是猜测。

## 7. 风险登记

| # | 风险 | 概率 | 影响 | 处置 |
|---|---|---|---|---|
| R1 | 过度抽象：为不存在的第三产品形态设计 | 中 | 高 | M2 用真实桌面 app 砸通，而非继续推演 |
| R2 | 写作体验退化（改文案要先动 json） | 中 | **高**（会让你绕过机制，护栏作废） | NFR-4 列为验收项；L3 文案永远留在 md |
| R3 | lint 误报导致告警被忽略 | 中 | 高 | 当前态/历史态分区（FR-16）；manual 产品只告警 |
| R4 | Gitee 不可用拖住构建 | 低 | 中 | FR-10/FR-25 降级 + 离线复跑 |
| R5 | 契约变更砸已分发客户端 | 低 | **不可逆** | append-only + `.v1` 冻结 + 新大版本走新文件 |
| R6 | 同步脚本误推 `Automation` 敏感数据 | 低 | **严重** | C4 硬约束 + 该仓不进任何自动化路径 |
| R7 | 单人 bus factor：文档即唯一记忆 | 中 | 中 | 本 PRD/`VISION.md`/`CONTRACT.md` 三件套 + git 历史（M0） |

## 8. 明确不做（Out of Scope）

自建 CMS/后台/数据库 · 多语言 i18n（仅预留 `locale`）· 历史版本下载入口 · 封闭枚举 · 向客户端下发视觉字段 · 站点写回开发仓 · 自动部署/CI · 评论与用户系统 · 把 `url` 迁移成 `urls`。

## 9. 改名交付（本 PRD 的一部分）

| 项 | 状态 |
|---|---|
| `package.json` name/description | ✅ 已改 |
| `README.md` 头部与命名节 | ✅ 已改 |
| `CONTRACT.md` / `SITE-DESIGN.md` 内仓名引用 | ✅ 已改 |
| 本地目录 `/Users/pikachu/code/table-flow-site` | ⬜ **需人工执行**，见 `RENAME.md` |
| Gitee 远端仓名 | ⬜ 需人工执行 |
| Qoder 项目记忆目录（按绝对路径编码） | ⬜ 需人工执行，**有连带风险**，见 `RENAME.md` |

## 10. 验收总则

一个里程碑算完成，当且仅当：

1. `pnpm validate && pnpm build` 全绿；
2. 断网状态下重跑仍成功（降级路径被真实验证过，不是"应该可以"）；
3. 交付说明写明**验证了什么、剩余风险是什么**——不接受"已实现"作为结论；
4. 抽查一条真实内容变更，确认步数不多于今天（NFR-4）。
