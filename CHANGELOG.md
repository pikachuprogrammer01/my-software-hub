# 站点更新日志

本站（`my-software-hub` 门户）自身的变更史。**不是产品更新日志**——产品日志在 `products/<id>/changelog.md`，跟着产品发版走。

- 类型与本仓提交规范同源：`feat` 新增能力 / `fix` 修错 / `refactor!` 破坏性改动 / `chore` 工程杂项 / `docs` 文档与方案。
- 一行 = 一个提交批次里的一件事，句子和 commit message 一致，不另写一套说法。
- 行尾短哈希可 `git show <哈希>` 复核；最新一节没有哈希，因为它就是当前 HEAD 这批。
- 根目录 md 不在发布白名单内（`config.mts` 只放 `index.md` 与 `products/**`），本文件不上线、不需要登记。

## 2026-10-19

- docs(products): TableFlow 文档跟进主仓 v2.0.1 口径——usage-guide 镜像的当前版本行与 privacy 适用版本改为 v2.0.1（新增「统一表格接入架构 + 调试控制台 Grid 画像」），登记哈希与 `pendingRelease` 记 2.0.1；changelog 补 v2.0.1 待发布条目，features 加「统一表格接入」行并把调试台写成八页签，scope 补 LBI div 网格适配、横向虚拟列投影修复与 Grid 页签排障指向，faq 新增「div 网格为什么没被识别」一问
- chore(sync): TableFlow 两份逐字镜像跟上主仓 v2.0.0——usage-guide 前进到「选择表格 / 设置填充行列 / 检查映射 / 批量填充」四步改版版（含「行 × 列」区域自动识别、None 映射、前 10 行 × 前 10 列对照表、填完一轮回第 1 行、免费次数 3 → 5），privacy 适用版本改为 v2.0.0；登记表哈希与同步日更新为 2026-10-19，`pendingRelease` 记 2.0.0
- feat(products): Excel 填充网页改为免费分档——单页批量填写免费（自动翻页与采集共享同一份免费额度），网页填充模板仍为 Pro；features / scope / pricing / quickstart / overview 五页同步新四步、区域选择、对照表与「只有显式开启才点分页入口」的边界
- feat(content): 登记 `limits.freePaging.flows` 承重事实——默认授予的采集流程次数不再是 md 里的裸数字，改为内容源单点维护（生效版本 2.0.0），pricing 与 faq 改用 `<Fact>` 取值；内容源 `update.*` 文案切到 v2.0.0 口径
- feat(products): TableFlow 更新日志补 v2.0.0 条目并并入官方更新说明对照表（列为当前版本），覆盖 Excel 填充网页、表格统计 v2、免费额度跨卸载重装保持、默认授予次数调整与两项导入/填充修复；新增「Excel 填充网页要 Pro 吗」FAQ

## 2026-10-17

- docs(products): TableFlow 网页填充口径跟上主仓 `5f15788`——usage-guide 镜像逐字前进到「行/列/单元格范围选择 + 填充模板 + 控件适配器」版并重算登记哈希（`pendingRelease` 1.7.0 保持）；features 页四步闭环、下拉严格匹配、填充模板、撤销上次填充与设置项名（默认值→偏好）同步新口径；scope 页两处边界行改写为「真实表格行或普通表单 + open Shadow DOM / 同源 iframe 组合」
- feat(products): 安装页 Edge 行补 Edge Add-ons 商店页面链接（iedocnmbkmhoeccfdoilabeffkncbhmn，已核对开发者 pikachuprogrammer01 与线上 v1.6.1 一致）；快速上手页「面板里的四步」改为采集工作流口径并补面板头部入口（模式切换 Excel 填充网页 / 统计 / 调试），一次完整导出流程同步批量勾选、虚拟列表补全、页数预算与统计入口
- feat(products): TableFlow 获取通道改为三条——Chrome 已上架 Chrome Web Store（商店页面链接进安装页），安装/更新/对比三页口径同步：Chrome 用户首选商店自动更新，压缩包降级为 360 极速等其余 Chromium 内核浏览器通道；usage-guide 镜像随主仓「Edge 商店与 Chrome 应用商店用户由浏览器自动更新」表述重新同步并更新登记哈希
- chore(sync): TableFlow 文档面整体跟上主仓——usage-guide.md 逐字镜像前进到「表格统计 + Excel 填充网页（Pro）+ 批量导出」版并更新镜像登记哈希（同步日 2026-10-17，pendingRelease 记 1.7.0）
- feat(products): TableFlow 功能全景/适用范围/免费与 Pro/常见问题/安装五页同步新能力口径——表格统计（免费 15 项指标）、Excel 填充网页（Pro）、批量当前页采集导出（Pro）、Markdown 导出、脚注标记剥离、自定义导出文件名、ul/li 列表表格、加载更多 append 采集；翻页页数改为自起始页起算的预算口径
- feat(products): TableFlow 免费额度口径改为「平台真值」——默认 3 次授予、耗尽后预算内自动核对、平台重置/追加后自动恢复、卸载重装不刷新；离线授权到期转免费需联网补进定价与 FAQ
- feat(products): 安装页权限清单补 `identity` / `identity.email` 与授权服务器定点主机权限（不申请 cookies 权限）；产品首页与快速上手补统计与网页填充入口、对比表导出格式加 Markdown
- refactor(theme): 直链下载按钮统一为「免费下载 latest」——不再把快照版本号打印在按钮上，同时去掉按钮下方的更新摘要与「该版本自 X 起未变化」快照日期两行；`DOWNLOADS.md` 的 Hero 文案模板同步，并修掉模板行尾多出的右括号
- feat(theme): 全站不再显示版本号——移除目录卡片与产品落地页的 `v1.6.1` 徽章、`<ReleaseInfo>` 的「当前版本 vX」、两个下载面板标题里的版本号（改「下载最新版」），auto-clicker 概览与 FAQ 里两处 `<Fact id="version.current">` 改写为不标版本的说法；下载文件名与直链 href 仍带版本号（那是下载物的真名，不能省）
- feat(content): TableFlow 版本号改为构建期从线上清单注入——`packageFromSource` 读 `.vitepress/release.json`（`update.json` 快照）写入 `version.current`，内容源里删掉该条字面量，`validateSource` 拒绝再把它写回源里；发新版只需改 `update.json`，站点仓零改动。快照是拉取失败占位 `0.0.0` 时不注入
- fix(content): 内容包 hash 不再受键书写顺序影响——`payloadHash` 递归排序对象键，此前挪动一条 fact 的位置就会算出新 revision、让历史里凭空多一份同内容包；顺带补 5 条注入用例，`test-content.mjs` 44 → 49
- feat(content): 版本号注入扩到所有接了发布仓的产品——`sync-release.mjs` 从单产品 `.vitepress/release.json` 改为多产品 `.vitepress/releases.json`，按 `releaseBranch` 各拉一份清单；WPS Enhancer 与 Auto Clicker 的内容源删掉写死的 `version.current`，下载地址改为 `{version}` 模板由构建期填充（WPS 的 Gitee/GitHub 下载源、Auto Clicker 的 Gitee/GitHub zip base 都不再手拼版本号）；`validateSource` 对这类产品同时拒绝写死的版本号与写死的下载地址
- feat(data): Auto Clicker 登记 `releaseBranch: auto-clicker-mac`——它本来就有 `my-software-releases` 的 update.json 清单，只是没接上，版本号才一直是源里手写的；接上后进入发布 dry-run 链路
- fix(theme): Auto Clicker 下载面板不再列出带版本号的文件名（`Auto-Clicker-v1.1.0-arm64.zip`），只留平台与来源；`products/table-flow/changelog.md` 去掉手写的「**当前最新版**」标注，改为指向安装页按钮，日志标题只保留发布日期
- 站点不再有任何手写的版本号：`README.md`、`DOWNLOADS.md`、`CLIENT-INTEGRATION.md` 的口径同步为「版本号由拉取清单注入、页面不显示、源里禁止写死」

## 2026-10-16

- chore(sync): privacy.md 镜像跟上主源 eff78be 之后的合并版——开发仓在政策里补了「离线授权到期后本机按免费用户处理、免费翻页需联网」一句，登记表哈希与同步日更新为 2026-10-16

## 2026-10-15

- feat(products): TableFlow 隐私政策同步设备特征采集披露——安装时上传的 6 项设备特征、屏幕分辨率与 WebGL 渲染器改由固定采集页读取、用途限定与保留期限，并补上 1.6.1 已申请却从未披露的 `identity` / `identity.email` 权限说明；按「只说明采集什么、不用于其他用途」的口径不写服务端 Cookie 机制
- chore(sync): 镜像登记表 `data/mirrors.json` 的 privacy.md 哈希与同步日更新为 2026-10-15（主源 `table-flow/docs/PRIVACY_POLICY.md` 同批改写，逐字节一致）

## 2026-10-10

- feat(theme): 新增全局样式层 `custom.css`，统一品牌色、正文字号、焦点态与产品落地页的宽画布版式
- feat(site): 站点文案与导航改为作品集口径——导航拆成「所有作品 / 精选项目 / 其他产品 / GitHub ↗」，首页文案集中到 `data/site.json` 的 `home` 键
- feat(theme): 首页 Hero 与作品目录重构为作品集布局，沿用产品真实图标与内容包，补移动端断点
- feat(products): 产品首页改为独立落地页（`pageClass: product-landing-page`），去掉手写目录链接，改由 `<ProductOverview/>` 承载
- chore(sync): 同步 TableFlow 发布说明为「发布两步化验证」
- fix(theme): 自定义样式层改为在默认主题之后引入——两者变量同权重，排在前面会被 VitePress 的 `:root`/`.dark` 覆盖，整层配色从未生效

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
