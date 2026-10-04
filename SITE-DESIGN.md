# 站点设计：多产品内容平台

> 后续部署补充（2026-10-04 更新）：当前部署假设是**静态托管 + 发布仓分发**，不建后台、不建数据库。手机作为服务器的方案已撤回，决策记录见 `PHONE-RUNTIME.md`。

> 输入：`PRODUCTS.md` 的产品清单与实测风险。
> 范围：**只设计本站点**。其他项目的接入物在第八节，等站点自洽后再交付。
> 状态：待你批准，未实施。

## 一、定位与三条不变原则

站点从「TableFlow 官网」升级为「**名下所有产品的对外内容平台**」。它同时扮演两个角色，必须分开对待：

- **作者**：对外文案（定位、措辞、边界怎么讲、FAQ）的唯一写者。
- **读者**：产品事实（版本、数字、能力矩阵、更新说明）的下游消费者。

不变原则，任何实现细节与它们冲突时以原则为准：

1. **内容面与渲染面物理分离。** 数据是 Git 仓里的源文件，不是 `pnpm build` 产物。已分发的客户端读的 URL 永不出现在构建产物路径里。
2. **不建 CMS、不建后台、不建数据库。** Git 即 CMS。`draft: true`（`config.mts:34,54`）已经白送了「未发布先预览」这个 CMS 核心卖点。
3. **站点不回写任何开发仓；发布脚本不碰站点仓。** 单向数据流，双向写必然漂移。

## 二、内容分层：三条写入路径

| 层 | 内容 | 位置 | 写者 | 变更频率 |
|---|---|---|---|---|
| **L1 注册表** | 有哪些产品、什么形态、启用哪些页面、客户端文案预算 | 站点仓 `data/products.json` | 人（你） | 新增产品时 |
| **L2 事实** | 版本、下载、承重数字、能力矩阵、更新说明 | 发布仓 → 站点仓 `data/snapshot/<id>/*.json` | 机器 / 半人工 | 每次发版 |
| **L3 文案** | 定位、术语、边界表述、FAQ、安装步骤叙述 | 站点仓 `products/<id>/**/*.md` | 人（你） | 随产品演进 |

L1 是骨架，也是将来交给其他项目时它们要读的唯一索引。

**L2 必须允许两种来源**，因为五个产品成熟度差异极大：

```jsonc
"factsSource": "release-repo"   // table-flow / wps-enhancer：已接发布仓，机器拉
"factsSource": "manual"         // auto-clicker / qoder-proxy / Automation：站点手填
```

`manual` 的产品必须在页面上显示**「人工核对于 <日期>」**（沿用 `docs/PRIVACY_POLICY.md:4` 已有的模式），且 lint 对它们**只告警不失败**。没有这个开关，你会在第一天就把三个还没接基础设施的产品卡在建站外。

## 三、目录与路由

```
data/products.json                    L1 注册表（站点骨架）
data/snapshot/<id>/update.json        L2 快照，提交入库，带 fetchedAt
data/snapshot/<id>/facts.json
data/snapshot/<id>/release-notes.json
products/<id>/                        L3 文案，一产品一目录
  index.md  features.md  scope.md  install.md  update.md
  pricing.md  faq.md  changelog.md  privacy.md   ← 按 kind 取用，不必齐全
public/assets/<id>/                   各产品图标与截图
```

路由：`/` = 产品目录页；`/<id>/` = 产品首页；`/<id>/features` 等。

**`visibility` 三态**，解决「都进站点但不等价」：

| 值 | 首页目录 | 导航 | 站点地图 | 适用 |
|---|---|---|---|---|
| `featured` | 主推卡片 | 顶栏 | ✅ | table-flow |
| `listed` | 列出 | 目录内 | ✅ | wps-enhancer / auto-clicker / qoder-proxy |
| `internal` | ❌ | ❌ | ❌ 仅直链 | **Automation** |

Automation 走 `internal` 是它进清单的**前提条件**：它无版本、无用户、非 git 仓库，且装着真实登录态与密钥。`internal` 意味着站点只放一页存在性说明，内容全部 L3 手写，**任何同步/导出脚本的路径遍历不得进入它的目录**。

### URL 迁移：已核实**不需要做 301**

查证结果（2026-10-01）：站点仓无任何部署痕迹（无 `.github/`、无 vercel/netlify 配置、无 CNAME、`package.json` 无 deploy 脚本），Qoder Sites 账号下 0 个项目，且仓库**尚未纳入 git**。

⇒ 站点从未公开。**直接一步到位走统一前缀 `/table-flow/…`，不保留旧路径、不做壳页、不做 301。** 省掉第八节阶段 1 的最大风险项。

唯一残留风险：若你曾从别的机器手工上传过产物，则已有外链存在。若有这种情况告诉我，我再补薄壳页（`frontmatter.head` 注入 `http-equiv=refresh` + `rel=canonical`，比部署层 301 更可控且仍受构建期死链校验覆盖）。

## 四、渲染模型：section 库 + kind 投影

不做 `if (kind === …)` 分支地狱。做法是**一份 section 库 + 一张 kind→默认 section 映射表（只写在代码里一处）**，产品可在 `products.json` 覆盖。

| kind | 默认 section |
|---|---|
| `browser-extension` | overview / features / scope / install / update / pricing / changelog / faq / privacy |
| `desktop-app` | overview / features / **system-requirements** / install / update / pricing / changelog / faq / privacy |
| `local-app-web-ui` | overview / quickstart / **config** / changelog —— 无 install、无 pricing |
| `internal` | 单页存在性说明 |

### 下载区由 `updateMechanism` 单一决定（防矛盾指引）

这是本轮最重要的渲染规则。实测证据：`index.md:57` 已经在手写「Edge 用户…自动更新；Chrome 用户…下载压缩包」这种分叉句子，`content/update.md:17` 用表格区分两条路径——都是缺这个字段的产物。

| updateMechanism | 站点渲染 | 禁止渲染 |
|---|---|---|
| `manual` | 最新版直链按钮 | 历史版本入口 |
| `browser-auto` | 商店按钮 +「浏览器自动更新」 | 直链下载按钮 |
| `built-in-updater` | 「应用内自动检查」+ 安装包**仅供首次安装** | 第二个下载按钮 |
| `none` | 只写「获取方式」，**不承诺任何更新提示** | 下载按钮、"会自动提醒你" |
| `continuous-deploy` | 只有访问地址 | 版本号徽章、下载 |

wps-enhancer 是 `built-in-updater`（`settings.go:57` 默认开启、`main.go:87-112` 启动即检查）——站点再放一个 zip 按钮，等于给用户两条互相矛盾的升级路径。

### 客户端文案预算进注册表

`budget` 字段不是排版偏好，是**硬约束**，来自实测：

```jsonc
"budget": { "badge": 12, "summary": 26 }   // table-flow：面板横幅单行、420px、nowrap+ellipsis
```

依据：`UpdateBanner.vue:83-89` 的 `white-space:nowrap` + `text-overflow:ellipsis`，实测 v1.4.4 的 100 字 notes 已被切掉。wps 设置页可用 852px、auto-clicker 只有 360pt 单行且**无关于窗口**、qoder-proxy 无上限。

发布说明的 `summary` 超过该产品 `budget` → **lint 失败**，不是警告。约束写内容的人，比让 N 个客户端各自截断便宜得多。

## 五、数据契约字段（站点侧）

`release-notes` 的分层文案，每层各服务一类容器：

```jsonc
{ "schema": 1, "product": "table-flow", "revision": "2026-10-01a",
  "releases": [ {
    "version": "1.6.1", "published_at": "2026-09-26", "channel": "stable",
    "badge":   "≤12 字，toast / 菜单 / 通知标题",
    "summary": "≤26 字，面板横幅单行",
    "changes": [ { "kind": "fix", "breaking": false, "tier": "all",
                   "text": "≤120 字，原生面板", "detail": "不限长，仅站点渲染" } ],
    "assets": [ { "channel": "archive", "url": "…", "sha256": "…", "size": 4650167 } ]
  } ] }
```

三条设计律（不变）：**只传语义不传视觉**（无 `icon`/`accent` 字段，语义→视觉映射归各客户端）；**未知枚举必须有 default 分支**（新增 `kind` 不得砸老客户端）；**为不同消费者提供不同切片**（`release-notes-latest` 只含一条，客户端拉这个；站点拉全量）。

`facts` 里的价格必须是 `{ value, since }` 而不是单值——涨价是真实发生过的事，单值常量表达不出来。

## 六、护栏：区分「当前态」与「历史态」

这是从 ¥4 那次误判里得到的设计修正，也是护栏能不能活下来的关键。

**天真做法会自毁**：「扫全站，凡 `¥\d+` 必须等于 facts 值」会把 `CHANGELOG.md:332` 的涨价前记录报成错误。第一版就教会你忽略告警，护栏作废。

正确分区：

| 区 | 范围 | 规则 |
|---|---|---|
| **当前态** | `products/**`（除 changelog）、首页 | 承重数字**只允许来自占位符/数据渲染**，裸字面量即 lint 失败 |
| **历史态** | `**/changelog.md`、`release-notes.json`、对照表快照 | **只追加不修改**，lint 一律豁免 |

再加三条交叉校验（只对 `factsSource: release-repo` 的产品生效）：

- 快照 `version` 必须等于该产品 changelog 首条版本 —— 这条正是 `/reference/usage-guide` 写 v1.6.0 而真值 1.6.1 那类事故的解药。
- `products.json` 里每个 `listed` 产品的 `releaseBranch` 必须能匿名拉到 raw URL。
- 快照拉取失败 → 沿用旧快照 + 页面顶部注入告警条，**不得静默**。

**快照引用纪律**：`data/snapshot/**` 是缓存，**永不允许被任何文档当「当前值」引用**。这条针对的是实测到的事故——`table-flow/release-repo/` 停在 1.4.4 却被 `SPEC.md:489`、`RELEASE_CHECKLIST.md:126`、`.aoci/baseline.json:1179` 三处当真值。

## 七、多产品化的新风险：隔离与降级

五个产品进一个站点，会新增一个单产品时不存在的故障模式：**一个产品的数据坏掉，不得阻断整站构建与发布**。

- 逐产品 try/catch 拉取与解析；失败产品渲染「数据暂不可用」并从首页目录摘除。
- L3 纯 md 页面**永不依赖远端**，必须永远可发布。
- lint 失败分两级：`current` 区数字不一致 = 阻断；`manual` 产品缺字段 = 告警。

这是多产品架构的真实代价，属于「设计时不处理、运行时才发现」的那类问题。

## 八、迁移阶段（每阶段独立可发布、可回滚）

| 阶段 | 内容 | 风险 |
|---|---|---|
| **-1** | **站点仓纳入 git 并推到远端**（`git init` + 首次提交 + 远端备份）——「Git 即 CMS」的前提 | 零 |
| 0 | 建 `data/products.json`，只登记 table-flow，站点行为完全不变 | 零 |
| 1 | `/` 改双态（目录 + `/table-flow/`），现有 8 篇 content 迁入 `products/table-flow/` | 低（已核实无需 301） |
| 2 | **登记 wps-enhancer** | 高 |
| 3 | 登记 auto-clicker / qoder-proxy（`factsSource: manual` + 核对日期） | 低 |
| 4 | 登记 Automation（`visibility: internal`，无任何同步路径） | 低 |
| 5 | changelog 手写历史冻结，接 `release-notes.json` | 中 |

**阶段 2 要刻意提前，哪怕 wps 的 facts 先手填。** 理由：只有一个产品时做的「多产品抽象」全是猜测；接第二个（桌面 app，与扩展在 section、下载、签名、min_os、更新机制上差异最大）会暴露八成错误抽象。在阶段 1 打磨干净再接第二个，等于把返工留到最贵的时候。

## 九、后续交接给其他项目时交付什么

顺序是**站点先自洽，再让别人接**。届时交付四件：

1. `CONTRACT.md`（放发布仓 `main`，提供方持有契约）
2. `schema/*.v1.json` + `products.json` schema
3. `conformance/fixtures/` 六个用例（正常 / 未知枚举 / 超长 / 缺可选字段 / 错 product / 高 schema 版本）+ 期望渲染结果 —— 跨语言无法共享 SDK，**一致性靠夹具而不是靠文档自觉**
4. 每产品一页《接入清单》：改哪个文件、raw URL 是什么、谁审批

## 十、明确不做

- 自建 CMS / 后台 / 在线编辑 / 数据库
- 历史版本下载入口（已定策略）
- i18n（qoder-proxy 已有中英双语 README，但站点先只做中文；`products.json` 预留 `locale` 字段，避免将来加不进）
- 站点写回任何开发仓
- 让发布脚本读写站点仓

## 十一、未验证项（诚实标注）

| 待验证 | 影响 |
|---|---|
| per-product 品牌色注入（Layout 组件写 CSS 变量） | 若不可行，多产品视觉只能统一主题 |
| VitePress 动态路由 `[id].md` 与 `cleanUrls` + `rewrites` 的组合 | 决定路由是数据驱动还是每产品一套 md |
| wps-enhancer 远程 tag 序列 | 本机 SSH 不通，未核实；不影响设计 |

### 但先补一个前提：站点仓还不是 git 仓库

第二节的不变原则 2 是「**Git 即 CMS**」——它的成立依赖版本历史、回滚、blame、双人审阅。当前 `my-software-hub`（原 `table-flow-site`）**尚未纳入 git**（无 `.git`），所以这个前提现在是空的：改错一份 `data/products.json` 无法回滚，也查不到"这个 50 页是谁什么时候写的"。

对一个要承载 5 个产品对外内容的平台，这是**优先级高于任何架构改造的一步**。列为阶段 -1。
