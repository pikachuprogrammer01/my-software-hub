# 站点更新日志

本站（`my-software-hub` 门户）自身的变更史。**不是产品更新日志**——产品日志在 `products/<id>/changelog.md`，跟着产品发版走。

- 类型与本仓提交规范同源：`feat` 新增能力 / `fix` 修错 / `refactor!` 破坏性改动 / `chore` 工程杂项 / `docs` 文档与方案。
- 一行 = 一个提交批次里的一件事，句子和 commit message 一致，不另写一套说法。
- 行尾短哈希可 `git show <哈希>` 复核；最新一节没有哈希，因为它就是当前 HEAD 这批。
- 根目录 md 不在发布白名单内（`config.mts` 只放 `index.md` 与 `products/**`），本文件不上线、不需要登记。

## 2026-10-10

- feat(theme): 新增全局样式层 `custom.css`，统一品牌色、正文字号、焦点态与产品落地页的宽画布版式
- feat(site): 站点文案与导航改为作品集口径——导航拆成「所有作品 / 精选项目 / 其他产品 / GitHub ↗」，首页文案集中到 `data/site.json` 的 `home` 键

## 2026-10-07

- fix(auto-clicker): 下载直链改指发布仓的 Gitee 版本 tag 与 GitHub release，本站不再托管安装包（删掉 `public/assets/auto-clicker-mac/v1.1.0/` 两个 zip）
- feat(lint): `public/` 里出现安装包即 lint 红——站点只挂直链，二进制归发布仓
- feat(guard): 新增 `scripts/changelog-guard.mjs`，动了发布面却没记本日志就让 `pnpm validate` 红
- fix(sync): 版本事实没变时不重写 `.vitepress/release.json`（每次构建刷 `fetchedAt` 会让工作树永远脏），页面文案随之改为"该版本自 X 起未变化"
- fix(scripts): `sync-release.mjs` 的 CLI 入口判定要过 realpath——macOS 上 `/var`、`/tmp` 是软链，只比字符串会让 `pnpm sync` 静默空转
- feat(deploy): 旧地址 301 到新路由（`public/_redirects`，11 条），`/overview` 这类历史链接不再 404
- feat(site): 每一页底部挂出联系邮箱与用途说明，文案与邮箱只在 `data/site.json` 的 `contact` 键存一份
- refactor(theme): 底部区块走 `layout-bottom` 插槽——VitePress 自带页脚在带侧栏的产品页会被隐藏，塞进 `themeConfig.footer` 等于只在首页出现
- fix(site): 底部联系邮箱换号，说明文案收窄为一句（地址只在 `data/site.json` 存一处，改一处即全站生效）
- feat(products): 路由改为一产品一目录 `products/<id>/`，`/` 从 TableFlow 首页变成产品目录页，侧栏按产品分组
- feat(data): `data/site.json` 立为站点品牌唯一真源，`data/products.json` 的 `visibility` 决定谁进目录
- feat(theme): 新增 `<SiteHero/>` `<ProductDirectory/>` 与各产品下载按钮组件；`<Fact/>` `<ReleaseInfo/>` `<ProductOverview/>` 改为按产品取内容源
- feat(assets): 站点与产品图标按约定路径落 `public/assets/<id>/`，缺图时目录卡片回落字母标记
- refactor(assets): 删掉根目录那张 1.4 MB 的 `public/assets/icon.png`
- docs(content): 逐字副本登记表 `data/mirrors.json`（站点路径 ↔ 开发仓源路径 + 两侧哈希 + 同步日期与落后原因）
- chore(lint): 注册表与页面一致性、逐字副本哈希、裸事实三重守卫随新目录结构更新
- docs: 补建本文件；删掉已失效的 `PHONE-RUNTIME.md`、`RENAME.md` 与两份 agent 交接稿

## 2026-10-05

- docs(deploy): 站点落 Cloudflare Pages——补 Pages/Workers 判据与自定义域步骤 `aeb2984`

## 2026-10-04

- feat(deploy): 站点落 Cloudflare Pages——补工作区 packages 字段修构建机，加 sitemap 与 robots `2c33e35`
- chore: 清干净后端残留——文档不再命令重建，依赖不再带原生包 `0d97684`
- refactor!: 撤回全部后端，站点定为纯静态（撤回前状态见标签 `pre-static-only`）`d6d9d95`
- docs(plan): 后端改 Vercel + 反代域名，记录推翻项与待决问题 `d59ba27`
- docs(plan): 公开站点 + 会员私密内容方案（已否决，被上一条推翻）`f55ef39`
- feat(deploy): 绑非回环地址时打暴露面告警，补 Tailscale 访问路径 `89b649d`
- fix(deploy): shell 变量一律 `${VAR}`，消除非 UTF-8 locale 下的未定义变量崩溃 `84d2ba3`
- chore(verify): 失败步骤落盘全量日志并先打印首个错误块 `4a51a01`
- fix(tests): 部署演练各用独立产物目录，消除互相删包的竞态 `52bc9b9`
- fix(runtime): 端口交给内核分配，消除并发演练互相抢端口 `ce2e924`
- docs(deploy): 修正手机侧安装顺序，驱动试验由 install 将切换前把关 `b6a840f`
- chore(release): 运行时版本从 1.0.0 起算 `84b002e`
- fix(site): 侧栏重复条目与 revision 文案重复，pnpm 构建脚本策略显式化 `e6668fe`
- docs(handoff): 客户端接入与手机部署交接，检查清单落到证据 `b643c03`
- feat(runtime): Hono + SQLite/Drizzle 提案服务与 Termux 部署链 `9653532`
- fix(content): 漂移检查不再被 Git revision 掩护，历史 revision 不可变 `9e8a886`

## 2026-10-03

- chore: 建立可复核基线（内容与站点仓现状，手机运行改造前）`c104ca0`
