# my-software-hub — 产品门户与文档站

> 名下**所有产品**的对外门户：产品目录、定位、安装、使用、更新说明、隐私。TableFlow 只是第一个入驻产品。
> 与发布仓 `my-software-releases` 成族：**发布仓是数据面**（产物与承重事实），**本仓是门户**（渲染 + 对外文案的唯一作者）。
> 数据流严格单向：开发仓 → 发布仓 → 本仓 / 各产品客户端。**本仓不回写任何开发仓，发布脚本不碰本仓。**
> 文档按此顺序读：`VISION.md`（为什么做、决策原则、已否决方案）→ `REQUIREMENTS.md`（PRD，FR/NFR/里程碑）→ `PRODUCTS.md`（五仓实测审计）→ `SITE-DESIGN.md`（架构与迁移阶段）→ `CONTRACT.md`（数据面契约 v1，**已冻结**）。
> 改名与 git 落地见 `RENAME.md`（需人工执行）。
> 渲染栈：**VitePress**。**对外文案全在数据与 markdown 里，组件不携带一句文案**：品牌与首页目录看 `data/site.json` + `data/products.json`，产品正文看 `products/<id>/`。

## 怎么跑

```bash
pnpm install
pnpm dev        # http://localhost:5173（未配 server.port，取 VitePress 默认），改 md 立刻生效
pnpm build      # 前置契约自检 + 产物在 .vitepress/dist（构建时校验死链）
pnpm validate   # 数据面契约自检；加 --strict 让「线上真值分叉」也算失败
pnpm preview    # 本地看构建产物
pnpm sync       # 只手动同步线上版本号到 .vitepress/release.json
```

内容一致性流水线见 [`CONTENT-PIPELINE.md`](./CONTENT-PIPELINE.md)。结构化产品内容源位于 `products/*/content.v1.source.json`，生成包位于 `data/generated/*/`。

站点形态是**纯静态**，无常驻后端；曾实现过的手机服务已撤回，决策记录见 [`PHONE-RUNTIME.md`](./PHONE-RUNTIME.md)。历史任务清单见 [`AGENT-CONTINUATION-PROMPT.md`](./AGENT-CONTINUATION-PROMPT.md)（其中后端相关条目已作废）。

已实测行为：

| 场景 | 结果 |
|------|------|
| 改正文 md → dev 页面 | ✅ 即时热更新 |
| **新增** `products/<id>/x.md` | ✅ 自动成页并进侧栏（dev 由 `scripts/dev.mjs` 监听 md 增删并触发重扫；`pnpm build` 直接生效，无需改任何代码）；但**必须同时登记进 `data/products.json` 的 `sections`**，否则 lint 直接失败——页面没登记就不会出现在侧栏 |
| **删除** md | ✅ 页面与侧栏条目同时消失 |
| 版本号 / 下载按钮 | ✅ 启动与构建时从线上 `update.json` 拉取；离线则沿用 `.vitepress/release.json` 并**明确告警**，不会静默显示旧版本 |
| 死链 | ✅ 构建失败即报错（当前 0 条） |
| 数据面契约 | ✅ `pnpm build` 前置 `validate-contract`；schema 自身坏掉即失败，线上真值分叉只告警（见 `CONTRACT.md` 第七、八节） |

## 目录

```
index.md                 首页 = 产品目录（<SiteHero/> + <ProductDirectory/>，文案零硬编码）
data/site.json           站点品牌唯一真源：名称/标语/描述/图标/页脚/底部联系方式。改名只动这一个文件
data/products.json       L1 注册表：有哪些产品、什么形态、启用哪些页面、图标路径、客户端文案预算
data/mirrors.json        逐字副本登记表（站点路径 ↔ 开发仓源路径 + 两侧哈希 + 同步日期与落后原因）
data/generated/<id>/     由内容源生成的不可变 revision 与 latest 指针
products/<id>/           一产品一目录，全部对外页面（index + 各 section）
products/<id>/content.v1.source.json   该产品的承重事实与客户端文案预算源
public/assets/<id>/icon.png            各产品图标（约定路径，文件后补即可生效，缺失时前端回落字母标记）
public/assets/hub/                     站点品牌图标（svg + 32/180/512 png）
public/assets/qr/                      收款与联系二维码
.vitepress/config.mts    扫 products/ 生成路由与按产品分组的侧栏、拉取版本、注入 per-product 图标与标题
.vitepress/theme/        默认主题 + <SiteHero/> <ProductDirectory/> <ReleaseInfo/> <ProductOverview/> <Fact/>
.vitepress/release.json  线上 update.json 的本地快照（版本事实缓存，只属于 table-flow）
scripts/sync-release.mjs 版本事实同步（dev/build/手动三处共用）
scripts/dev.mjs          dev 包装：md 增删自动重扫导航
schema/                  数据面契约 v1 的机器可读定义（content/products/facts/release-notes/proposal + 提案信封）
scripts/validate-contract.mjs 契约自检（20 项），已前置进 pnpm build
scripts/content-lint.mjs 当前态裸事实 + 注册表与页面一致性 + 逐字副本哈希 三重守卫
scripts/changelog-guard.mjs 发布面改了却没记 CHANGELOG.md 即红（已前置进 pnpm validate）
conformance/fixtures/    客户端一致性夹具（期望表，跨语言共用）
docs/                    仓库内部笔记（发布仓 README 副本、Edge 商店文案）——不发布
VISION.md / REQUIREMENTS.md / PRODUCTS.md / SITE-DESIGN.md / CONTRACT.md / RENAME.md 目标·需求·审计·设计·契约
README.md / DOWNLOADS.md / CLIENT-INTEGRATION.md / PHONE-RUNTIME.md / CONTENT-PIPELINE.md / DEPLOY.md 仓库内部文档
CHANGELOG.md             站点自身的更新日志（不是产品日志，产品日志在 products/<id>/changelog.md）
```

**发布面是白名单，不是黑名单**：只有 `index.md` 与 `products/**` 会成页，其余 md 由 `config.mts` 扫目录自动排除。新增内部笔记不需要登记，也就不会出现"忘了加名单结果连站发布"。

## 形态：纯静态站点

本仓库没有常驻后端：公开页面由 VitePress 构建产物对外托管，客户端读的是发布仓的内容包，
提案与审核走文件队列或 Issue。曾经实现过的手机服务（Hono + SQLite + Termux 部署链）已整体撤回，
原因与恢复方式记在 [PHONE-RUNTIME.md](./PHONE-RUNTIME.md)。

```bash
pnpm verify          # 契约 → 内容 → 夹具 → 发布 dry-run → 站点构建，一条命令
```

## 内容架构契约（已落地）

渲染层不硬编码任何文案或版本号：

1. **一篇 md = 一个页面**。路由与侧栏由 `.vitepress/config.mts` 扫 `products/` 生成；`front-matter` 决定标题、`order` 排序、SEO 描述，`draft: true` 可临时下线一页。
2. **承重事实只在内容源里存一份**。版本号写 `<Fact product="…" id="version.current" />`，下载入口写 `<ReleaseInfo product-id="…" />`，两者都从 `products/<id>/content.v1.source.json` 取；md 里出现裸版本号（`x.y.z`）lint 直接失败。IP 地址（`127.0.0.1`）不算版本号。
3. **站点的下载区由 `updateMechanism` 单一决定**：`manual` 给最新版直链、`built-in-updater` 只说明应用内检查（本站不再放第二个下载按钮）、`none` 只给获取入口且不承诺更新提示。
4. **逐字副本登记在 `data/mirrors.json`**。它们不加 front-matter、不写占位符，以保持与开发仓逐字节一致；登记表里的哈希会在 lint 里核对——**在站点侧手改镜像文件会被挡住**。源仓跑到前面时 `pnpm validate` 只告警，因为副本里可能刻意不含未发布功能。
5. **更新日志**首条应与该产品 `update.json.version` 对得上，对不上时人工核对（见 `products/table-flow/changelog.md` 顶部对照表）。
6. **图片放 `public/assets/`**，md 里用 `/assets/...` 绝对路径；产品图标固定约定 `public/assets/<id>/icon.png`，注册表里登记的就是这个路径——**图后补进去即生效，不用改代码**，缺图时目录卡片回落字母标记。
7. **发布面是白名单**：只有 `index.md` 与 `products/**` 成页，其余 md 自动排除（见上节）。

## 加一页的完整动作

1. `products/<id>/foo.md` 新建，顶部写 `order: 45`、`title: "页面名"`、`description: "一句话摘要"`
2. **把 `foo` 加进 `data/products.json` 里该产品的 `sections`**——不加会被 lint 挡住（页面存在但没登记 = 不会出现在侧栏）
3. 正文写 markdown，需要下载入口就写 `<ReleaseInfo product-id="<id>" />`，需要版本号就写 `<Fact … />`
4. `pnpm dev` 直接看到（约 1 秒后侧栏出现新条目）；`pnpm build` 产出 `/<id>/foo`

## 加一个产品的完整动作

新产品的对外内容全部由本仓撰写，接入只需四步，缺一条 lint 就红：

1. `data/products.json` 登记：`id`（同时是 URL 前缀，一经发布不得改名）、`kind`、`visibility`、`updateMechanism`、`sections`、`budget`、`brand.logo`（写约定路径 `/assets/<id>/icon.png`）
2. `products/<id>/content.v1.source.json` 建内容源（`facts` 每项必须带 `effectiveFromVersion`；查不到生效版本的事实**不要编**，留在 md 里当未登记事实由 lint 报告列出）
3. `products/<id>/*.md` 写页面，`sections` 与文件名一一对应
4. 图标文件后补；`factsSource: manual` 的产品记得在内容源里写 `verifiedAt`，页面会自动带"人工核对于"日期

## 更新日志的来源与纪律

开发仓 `CHANGELOG.md` 是工程台账（源码路径、commit、用例编号），不对外。站点 `products/<id>/changelog.md` 每个版本条目按优先级取文：

1. Gitee Release body / 线上 `update.json` 的 `notes`（**已发布版本的权威口径**）；
2. `table-flow/docs/RELEASE_CHECKLIST.md` 各版本的 `notes：…` 定稿行；
3. 前两者缺失时，从工程台账里只挑**用户能感知的行为变化**重述，实现细节一律删除。

新增版本：先写 `notes`（用户视角一句话）→ 补本仓库条目 → 面板横幅 / 商店 / 站点三处同源。

## 文案同步纪律（三处重复源）

"快速上手 / 使用提示 / FAQ"同时存在于 `products/table-flow/usage-guide.md`（最详，逐字副本）、`UsageGuideContent.vue`（面板内嵌）、`products/table-flow/quickstart.md`（站点改写版）。

约定：**开发仓 `docs/USAGE_GUIDE.md` 为主源**；站点页只摘录主源，不另写一套说法。

## 明确不搬进来的内容

- **授权与激活的密码学细节**：`client-integration.md`、`OFFLINE_ACTIVATION_DESIGN.md`、`PRODUCTION-KEY-ROTATION.md`、`v2-pro-plan.md`、`scripts/keys/`、`license-records.json`（激活码格式、验签算法、公钥存储、服务端接口）→ 站点只讲"签名校验 / 一码一设备 / 离线授权零网络"。
- **工程内部**：`SPEC.md`、`CODE_NAVIGATION.md`、`Agents*.md`、`PLUGIN-LOADER-SPEC.md`、`CANVAS-INTERACTION-SPEC.md`、`E2E_TEST_DESIGN.md`、`DEAD_CODE_AUDIT.md`、`BUG_PRIORITY_PLAN.md`、`PROJECT_COMPLETION_GAPS.md`、`PROGRESS.md`、observability / sentry 系列、各类 `*-design.md`、`skills/`、`.trellis/`。
- **发布操作**：`GITEE_RELEASE_REPO.md`、`RELEASE_CHECKLIST.md` 步骤部分、`release-repo/scripts/`。
- **仓库杂物**：`dist-*`、`coverage`、`test-results`、根目录 zip / xlsx。

## 当前事实

版本号、直链、发布日**一律不在文档里抄**：构建时从线上 `update.json` 拉，拉不到就沿用 `.vitepress/release.json` 并明确告警。要看当前值跑 `pnpm sync`。
站点只挂最新版，不提供历史版本入口。早前"公开最新为 1.4.4"的判断来自开发仓签入的过期快照 `table-flow/release-repo/`，已作废（详见 `DOWNLOADS.md`）。

## 待你决策

1. **`docs/README.md`（发布仓 README 副本）怎么处理**：含 `GITEE_TOKEN` 发布段落与一个失效链接。目前不发布——要改名瘦身成公开"下载中心"页，还是就用 `<ReleaseInfo />` + `/table-flow/install` 取代？
2. **使用手册主源的安装章节是开发者视角**（`git clone` + `pnpm build`）。站点用改写版；主源要不要一起改？
3. **Edge Add-ons 商店详情页 URL 与商店版本号**：文档里查不到，需要你给；给了就补进 `/table-flow/install` 与 `DOWNLOADS.md`。
4. `file://` 本地页面采集需在 `chrome://extensions` 手动勾选"允许访问文件网址"，现有文档完全没写这条用户动作——要不要补进 `/table-flow/install`。
5. **WPS Enhancer 的产物名与显示名不一致**：解压得到 `wps-enhancer-go.app`，Finder/Dock 里显示「WPS 增强工具」，`Info.plist` 的 `CFBundleName` 又是 `WPS 增强工具`，而应用内卸载文案写的是第三种名字。站点文档目前按实测写（两个名字都提），但**这是产品侧该修的**，不是文档该圆场的。
6. **Auto Clicker 的校验文件形态**：`.sha256` 里记录的是打包路径 `dist/Auto-Clicker-v1.1.0-arm64.zip`，用户下载后 `shasum -c` 必然报"找不到文件"（哈希值本身实测正确）。站点已按"比对哈希值"写，但源仓该把文件名对齐。

## 命名与品牌

**仓库名 `my-software-hub`**（2026-10-01，与发布仓 `my-software-releases` 成族）。本地目录与 Qoder 项目记忆目录已同步为 `my-software-hub`，Gitee 远端改名仍待人工执行。

**站点品牌 2026-10-05 定为工作室名**，落在 `data/site.json` 一个文件里（`name` / `tagline` / `description` / 图标 / 页脚）。首页 `/` 已是产品目录页，标题规则同时生效：

| 页面 | 浏览器标题 |
|---|---|
| `/` 与站点级页 | `Pikachu Studio` |
| 产品子页 | `功能全景 · TableFlow` |
| 产品首页 | `TableFlow`（产品名本身就是标题，不再拼后缀） |

⚠️ 工作室名沿用 `Pikachu` 这个词，**与任天堂的宝可梦商标同形**；作为开发者署名使用风险尚可，一旦做成商品化品牌或上商店，风险按商标使用评估。要换名只改 `data/site.json` 的 `name`，全站标题、og、页脚、导航一起跟着变。
