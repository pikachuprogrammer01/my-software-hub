# my-software-hub — 产品门户与文档站

> 名下**所有产品**的对外门户：产品目录、定位、安装、使用、更新说明、隐私。TableFlow 只是第一个入驻产品。
> 与发布仓 `my-software-releases` 成族：**发布仓是数据面**（产物与承重事实），**本仓是门户**（渲染 + 对外文案的唯一作者）。
> 数据流严格单向：开发仓 → 发布仓 → 本仓 / 各产品客户端。**本仓不回写任何开发仓，发布脚本不碰本仓。**
> 文档按此顺序读：`VISION.md`（为什么做、决策原则、已否决方案）→ `REQUIREMENTS.md`（PRD，FR/NFR/里程碑）→ `PRODUCTS.md`（五仓实测审计）→ `SITE-DESIGN.md`（架构与迁移阶段）→ `CONTRACT.md`（数据面契约 v1，**已冻结**）。
> 改名与 git 落地见 `RENAME.md`（需人工执行）。
> 渲染栈：**VitePress**。**页面文案 100% 在 markdown 里，改 md 即改站点。**

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

后续手机服务器运行规范见 [`PHONE-RUNTIME.md`](./PHONE-RUNTIME.md)：默认 Android + Termux 实际运行 Node/Hono HTTP 服务；不是手机浏览适配。后端与手机部署仍待实现，完整后续任务见 [`AGENT-CONTINUATION-PROMPT.md`](./AGENT-CONTINUATION-PROMPT.md)。

已实测行为：

| 场景 | 结果 |
|------|------|
| 改正文 md → dev 页面 | ✅ 即时热更新 |
| **新增** `content/x.md` | ✅ 自动成页并进侧栏（dev 由 `scripts/dev.mjs` 监听 md 增删并触发重扫；`pnpm build` 直接生效，无需改任何代码） |
| **删除** md | ✅ 页面与侧栏条目同时消失 |
| 版本号 / 下载按钮 | ✅ 启动与构建时从线上 `update.json` 拉取；离线则沿用 `.vitepress/release.json` 并**明确告警**，不会静默显示旧版本 |
| 死链 | ✅ 构建失败即报错（当前 0 条） |
| 数据面契约 | ✅ `pnpm build` 前置 `validate-contract`；schema 自身坏掉即失败，线上真值分叉只告警（见 `CONTRACT.md` 第七、八节） |

## 目录

```
index.md                 首页（hero + 功能卡片 + <ReleaseInfo />）
content/*.md             对外正文页（8 篇）      → /overview /install /quickstart /update
                                                    /features /scope /pricing /faq
docs/USAGE_GUIDE.md      逐字副本 → /reference/usage-guide
docs/PRIVACY_POLICY.md   逐字副本 → /reference/privacy-policy
CHANGELOG.md             用户可见更新日志 → /changelog
public/assets/           图标 + 收款/联系二维码（站点静态资源根）
.vitepress/config.mts    扫目录生成路由与侧栏、拉取版本、排除内部文档
.vitepress/theme/        默认主题 + <ReleaseInfo /> 组件
.vitepress/release.json  线上 update.json 的本地快照（版本事实缓存）
scripts/sync-release.mjs 版本事实同步（dev/build/手动三处共用）
scripts/dev.mjs          dev 包装：md 增删自动重扫导航
schema/                    数据面契约 v1 的机器可读定义（4 份 *.v1.json）
scripts/validate-contract.mjs 契约自检（20 项），已前置进 pnpm build
VISION.md / REQUIREMENTS.md 目标与目的 / 需求文档（PRD）· PRODUCTS.md 五仓实测审计 · SITE-DESIGN.md 站点设计 · CONTRACT.md 数据面契约 · RENAME.md 改名执行手册
README.md / DOWNLOADS.md 仓库内部文档 · 以上均**不发布**（见 config 的 INTERNAL 名单）
UsageGuideContent.vue    开发仓面板内嵌指南原文（文案基准，不发布）
```

## 内容架构契约（已落地）

渲染层不硬编码任何文案或版本号：

1. **一篇 md = 一个页面**。侧栏与路由由 `.vitepress/config.mts` 扫描 `content/`、`docs/`、根目录生成；`front-matter` 决定标题、`order` 排序、SEO 描述，`draft: true` 可临时下线一页。
2. **版本与下载链接来自线上 `update.json`**（扩展同款清单）。页面里写 `<ReleaseInfo />` 就得到"免费下载 v1.6.1"按钮 + 官方更新说明，**不要手写版本号**。
3. **`docs/` 里的逐字副本不加 front-matter**，保持与开发仓 `cmp` 一致；标题取它的 H1，排序按文件名。
4. **更新日志**首条应与 `update.json.version` 对得上，对不上时人工核对（见 `CHANGELOG.md` 顶部对照表）。
5. **图片放 `public/assets/`**，md 里用 `/assets/...` 绝对路径；不在 `public/` 下 VitePress 不会对外服务。
6. **内部文档靠 `INTERNAL` 名单排除**（`README.md`、`DOWNLOADS.md`、`docs/README.md`、`docs/EDGE_ADDONS_LISTING.md`），新增内部笔记记得登记，否则会连站发布。

## 加一页的完整动作

1. `content/foo.md` 新建，顶部写 `order: 45`、`title: "页面名"`、`description: "一句话摘要"`
2. 正文写 markdown，需要下载按钮就写 `<ReleaseInfo />`
3. `pnpm dev` 直接看到（约 1 秒后侧栏出现新条目）；`pnpm build` 产出 `/foo`

## 更新日志的来源与纪律

开发仓 `CHANGELOG.md` 是工程台账（源码路径、commit、用例编号），不对外。站点 `CHANGELOG.md` 每个版本条目按优先级取文：

1. Gitee Release body / 线上 `update.json` 的 `notes`（**已发布版本的权威口径**）；
2. `table-flow/docs/RELEASE_CHECKLIST.md` 各版本的 `notes：…` 定稿行；
3. 前两者缺失时，从工程台账里只挑**用户能感知的行为变化**重述，实现细节一律删除。

新增版本：先写 `notes`（用户视角一句话）→ 补本仓库条目 → 面板横幅 / 商店 / 站点三处同源。

## 文案同步纪律（三处重复源）

"快速上手 / 使用提示 / FAQ"同时存在于 `docs/USAGE_GUIDE.md`（最详）、`UsageGuideContent.vue`（面板内嵌）、`content/quickstart.md`（站点）。

约定：**`docs/USAGE_GUIDE.md` 为主源**；站点页只摘录主源，不另写一套说法。

## 明确不搬进来的内容

- **授权与激活的密码学细节**：`client-integration.md`、`OFFLINE_ACTIVATION_DESIGN.md`、`PRODUCTION-KEY-ROTATION.md`、`v2-pro-plan.md`、`scripts/keys/`、`license-records.json`（激活码格式、验签算法、公钥存储、服务端接口）→ 站点只讲"签名校验 / 一码一设备 / 离线授权零网络"。
- **工程内部**：`SPEC.md`、`CODE_NAVIGATION.md`、`Agents*.md`、`PLUGIN-LOADER-SPEC.md`、`CANVAS-INTERACTION-SPEC.md`、`E2E_TEST_DESIGN.md`、`DEAD_CODE_AUDIT.md`、`BUG_PRIORITY_PLAN.md`、`PROJECT_COMPLETION_GAPS.md`、`PROGRESS.md`、observability / sentry 系列、各类 `*-design.md`、`skills/`、`.trellis/`。
- **发布操作**：`GITEE_RELEASE_REPO.md`、`RELEASE_CHECKLIST.md` 步骤部分、`release-repo/scripts/`。
- **仓库杂物**：`dist-*`、`coverage`、`test-results`、根目录 zip / xlsx。

## 当前事实（已核实）

- 线上 `update.json` = **v1.6.1**，Gitee latest tag = `table-flow-v1.6.1`，zip 直链 200（4.65 MB，发布日 2026-09-26）。
- **站点只挂最新版**，不提供历史版本入口。
- 我早前"公开最新为 1.4.4"的判断来自开发仓签入的过期快照 `table-flow/release-repo/`，已作废（详见 `DOWNLOADS.md`）。

## 待你决策

1. **`docs/README.md`（发布仓 README 副本）怎么处理**：含 `GITEE_TOKEN` 发布段落与一个失效链接。目前已被排除、不发布——要改名瘦身成公开"下载中心"页，还是就用 `<ReleaseInfo />` + `/install` 取代？
2. **`docs/USAGE_GUIDE.md` 安装章节是开发者视角**（`git clone` + `pnpm build`）。站点用改写版；主源要不要一起改？
3. **Edge Add-ons 商店详情页 URL 与商店版本号**：文档里查不到，需要你给；给了就补进 `/install` 与 `DOWNLOADS.md`。
4. `file://` 本地页面采集需在 `chrome://extensions` 手动勾选"允许访问文件网址"，现有文档完全没写这条用户动作——要不要补进 `/install`。

## 命名

**仓库名已定为 `my-software-hub`**（2026-10-01，与发布仓 `my-software-releases` 成族）。`package.json` 与本仓文档已改；以下三处**待人工执行**：

1. **Gitee 远端仓**改名或新建后迁移 push 地址。
2. **本地目录** `/Users/pikachu/code/table-flow-site` → `my-software-hub`。⚠️ 连带影响：Qoder 的**项目记忆目录按绝对路径编码**（`~/.qoder/projects/-Users-pikachu-code-table-flow-site/memory/`），改目录名后须同步改名该目录，否则已积累的项目记忆不再自动加载。
3. 目录改名会同时使 dev server 与 IDE 工作区路径失效，需在干净时点一次性做。

**站点对外品牌名**（浏览器标签页与搜索结果的标题）走**开发者署名**方向，但**推迟到 `SITE-DESIGN.md` 阶段 1（路由迁移）一并切换**。原因：当前 `/` 就是 TableFlow 首页，此刻把全局 `title` 换成个人品牌会让用户误以为是个人主页，且 TableFlow 全部产品页的搜索标题会同时失去产品名——是净损失。阶段 1 之后 `/` 变成产品目录，个人品牌才名副其实；届时产品页用 `:title · TableFlow`、目录页用品牌名，两套 `titleTemplate` 并存。
