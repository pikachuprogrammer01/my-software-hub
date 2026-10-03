# 产品清单与形态事实（内部文档，不发布）

> 目的：为「多产品统一内容与发布契约」提供实测输入。
> 取证时间 2026-10-01，方式：只读审计五个本地仓库。所有结论带 `文件:行号`，未读取任何密钥正文。

## 一、结论先行

五个目录里**只有 2 个是"已接入统一发布契约"的产品**，2 个是"有真实用户但走另一套基础设施"的产品，1 个**根本不是产品**。

| | 判定 | 依据 |
|---|---|---|
| table-flow | ✅ 产品，已接 Gitee | `src/constants/update.ts:23` 硬编码读发布仓 |
| wps-enhancer-go | ✅ 产品，已接 Gitee | `internal/settings/settings.go:57` 默认更新源指向发布仓 |
| auto-clicker-mac | ⚠️ 产品，**零发布基础设施** | 全仓 grep `gitee\|update.json` 零命中，只有 GitHub Releases |
| qoder-proxy | ⚠️ 产品，**无版本分发概念** | 无打包、无 update.json、用户 clone 源码直跑 |
| Automation | ❌ **不是产品** | 无版本、无用户、非 git 仓库、含登录态与密钥 |

## 二、产品清单（契约输入）

| 产品 | kind | 分发通道 | updateMechanism | release notes 消费者与容器预算 | 分级 | 发布状态 |
|---|---|---|---|---|---|---|
| **table-flow** | `browser-extension` | `archive`(zip 自托管) | `manual`（面板提示→下载→覆盖解压） | 面板横幅**单行**，默认宽 420px（`settingsStore.ts:75`），CSS `white-space:nowrap`+`ellipsis`（`UpdateBanner.vue:83-89`）；设置页**完全不渲染 notes**（`UpdateSection.vue:59-69`） | free / Pro + 离线授权 | 已发布 v1.6.1，6–7 天一版，近三周有 1 天一版 |
| **wps-enhancer-go** | `desktop-app`（Wails v3） | `archive`(macos zip) + `installer`(windows NSIS) + `archive`(win zip 供更新器) | `built-in-updater`（启动 3s 后静默检查，`main.go:87-112`）+ 人工替换文件 | 设置页内容区约 **852px**（`style.css:75` `.canvas{max-width:900px}`）；启动通知**单行**（`App.vue:103-113`）；**`notes` 后端已取到、前端从未渲染**（`system.go:151` 有值，`grep notes frontend/src/` 仅 1 处类型声明） | 有完整 Pro/激活码体系，但 UI 被 `featureFlags.ts:3 SHOW_SUBSCRIPTION_UI=false` 关闭 | 已发布 v1.1.0，macOS ad-hoc 签名、无公证 |
| **auto-clicker-mac** | `desktop-app`（SwiftUI 菜单栏） | `archive`(zip) 仅 GitHub Releases | **none**（无网络层，`docs/ARCHITECTURE.md:76` 自证） | **无关于窗口、UI 连版本号都不显示**（`ContentView.swift:57-81`）；唯一原生容器是 360pt 固定宽窗口（`ContentView.swift:38`）+ 单行菜单项 | 无（MIT） | 已发布 v1.1.0，约 7 周无提交 |
| **qoder-proxy** | `local-app-web-ui`（loopback 代理 + React 控制台） | 源码 clone（无打包、无镜像） | **none** | 有本地 Web 控制台，且**已有拉 JSON 并渲染的现成通道**（`usage.json` + `/usage/local`，`app.js:84-91`）——四者中唯一能就地渲染长 Markdown 的产品 | 无（MIT） | 公开开源 v1.6.0，有外部贡献者与 issue |
| ~~Automation~~ | 内部工具 | 无 | 无 | 无 | 无 | **不进清单、不进站点** |

### 由清单直接推出的契约要求

1. **`badge` 层必须有，且是唯一所有产品都有的层**——四个产品都能显示单行文本。
2. **`detail` 长文只有站点和 qoder-proxy 能承载**；table-flow 面板与 auto-clicker 结构上放不下。
3. **`tier` 必须可选，缺省即 `all`**——auto-clicker 与 qoder-proxy 没有任何激活码可挂。
4. **`updateMechanism` 决定站点是否显示下载按钮**：wps 有内置更新器，站点再放 zip 按钮等于给用户两个互相矛盾的升级路径。
5. **需要 `platform`/`arch`/`min_os`/`signed`/`notarized` 字段**——只有桌面 app 需要，扩展与网站不需要，因此 `assets` 必须是数组而非单字段。

## 三、风险登记（按严重度）

### 🔴 P0｜`update.json` 已在两个产品间分叉，且客户端静默失败

- table-flow 分支用 `"url": "<string>"`；wps-enhancer 分支用 `"urls": { "macos-arm64": … }`（复数、平台映射）。
- table-flow 客户端硬性要求 `typeof url === 'string'`，不满足就 `return null`（`updateService.ts:43`）——**整个更新提示消失，零报错、零遥测**。
- 后果：统一契约若把 `url` 换成 `urls`，**已分发的所有 table-flow 用户永久停止收到更新提示**，且没人会知道。

**处置**：契约必须**双形兼容**（`url` 与 `urls` 都接受），且这个改动要**先发客户端、后改数据**——顺序反了不可逆。同时把"字段解析失败"从静默 `return null` 改成可观测（区分"网络失败/格式不认识/已是最新"），否则下次分叉仍然无人发现。

### 🔴 P0｜两份签入的过期快照都已被当真值引用

- `table-flow/release-repo/table-flow/update.json` 停在 **1.4.4**，线上真值 **1.6.1**；而 `SPEC.md:489`、`RELEASE_CHECKLIST.md:126`、`.aoci/baseline.json:1179` **三处主动把它当当前值引用**。
- `wps-enhancer-go/release-repo/update.json` 的 `notes` 写着"占位"，与线上 notes 已实际分叉（快照最后触碰 2026-08-31）。
- 站点仓 `DOWNLOADS.md:37` 已经为这个坑写过一次记录（"过期快照已作废"），但**文件没删、引用没断**。

**处置**：签入快照一律改名 `*.example.json` 并从所有"当前值"引用处摘掉；真值只允许来自线上拉取 + 带 `fetchedAt` 的缓存。

### 🟠 P1｜wps-enhancer 的更新说明在自动链路上是断的

- CI 固定传 `--notes "WPS Enhancer v${version}"`（`release.yml:408`），`release.sh` 的 `--notes` 参数**从不传给** `publish-gitee.sh`。
- 即：走自动流水线发版时，线上 `notes` 只会是机器拼的版本号，人写的说明永远进不去；前端又不渲染它。
- 这个产品的"更新说明"目前**没有任何落地载体**。

### 🟠 P1｜table-flow 对下载物零完整性校验

- `release.sh` 与 `publish-release.sh` 全文无 sha256/checksum；发布后验证只有 `curl -fsS` 可达性（`:227`）。
- `update.json` 无 hash 字段，`updateService` 从不校验。
- 附带：发布脚本**无回滚**，push 失败时 Release 已公开但 `update.json` 未推进（撕裂态）；同版本重跑因"tag 已存在"必失败。

### 🟠 P1｜auto-clicker 对外文案有硬伤

- 已发布的包是 **ad-hoc 签名**，实测 `spctl --assess -t execute` 返回 **rejected**；`docs/RELEASE.md:26` 自己写明"不适合向其他用户分发"。
- README 指引是"解压后双击"（`README.md:40`），全仓 grep `xattr|quarantine|gatekeeper|已损坏` **零命中**——用户第一次打开会被 Gatekeeper 拦且无任何说明。
- 另有 2 个未提交的修复（辅助功能设置页 URL、前台权限刷新），**线上 1.1.0 不含它们**，即已发布版本存在已知用户可见缺陷。

### 🟡 P2｜预发布版本号会被静默误判

`updateService.ts:23-32` 手写版本比较用 `parseInt`，`1.7.0-beta.1` 的 `0-beta` 段被解析为 `0` → **被当作等于 `1.7.0`**。契约必须显式禁止预发布号进入 `version`，或先修客户端。

### 🟡 P2｜macOS 架构覆盖有缺口

wps 的 CI 用 `uname -m` 决定标签（`release.yml:101-105`），runner 是 arm64 → **CI 从不产出 `macos-x86_64`**，尽管更新器和发布脚本都支持该 key。Intel Mac 用户会拿到"有清单无包"。

## 四、扇出实测（比站点仓严重一个量级）

**table-flow 一个产品的 8 组承重事实 ≈ 48 处文字副本**，且**每一组都存在"源码常量旁边还手抄一份字面量"**：

| 事实 | 源码真源 | 抄写处数 | 手抄副本的铁证 |
|---|---|---|---|
| 默认 50 页 | `settingsStore.ts:15` | 9 | — |
| 免费 3 次流程 | `constants/license.ts:10` | 8 | **同一文件 `:82` 又写了一遍** `'3 次自动翻页，页数不限'` |
| 97 条 / 12 类 | `constants/builtinRules.ts`（实测确为 97/12） | 10 | `SCOPE_AND_FEATURES.md:146` 手抄**逐分类分布**（12 个二级数字，零校验） |
| ¥5 / ¥40 | `SubscribeView.vue:25-26`（裸字面量，不在 constants） | 8 | 历史条目里的「月费 ¥4」是**涨价前的正确记录**，不是错误——见下方「设计启示」 |
| 跨域白名单 | `constants/iframeTrustedDomains.ts:15-19` | 4 | UI 半文案另写"`.gov.cn` 等" |
| 候选表 20 张 | `tableScanner.ts:408` **裸魔法数字，无常量** | 4 | 同族歧义：`MAX_TABLES_PER_SCAN=30`、`MAX_MERGE_GAP=20` |
| 200×150 门槛 | `tableScanner.ts:168` 裸数字 | 1 | 站点侧 `usageScope.data.ts:149` 丢了具体数字 |
| 虚拟迭代 200/5000 | `virtualRowReader.ts:60,373` | 多处 | ⚠️ 同名常量在另 3 个文件里值是 **50** |

**版本号散落度**（"改一次版本要动几个文件"）：

| 产品 | 散落处 | 自动化覆盖 | 门禁覆盖 | 当前是否已漂 |
|---|---|---|---|---|
| table-flow | 7（`RELEASE_CHECKLIST.md:20` 自认） | 0 | 6 文件脚本，但**明确豁免**开发期示例值 | **已漂**：`README.md:9` 与 `USAGE_GUIDE.md:5` 写 v1.6.0（真值 1.6.1）、`SCOPE:3` 写"基线 v1.5.0" |
| wps-enhancer | 6 | 2（`release.sh:9,117-158`） | **只比对 3 处**（`release.yml:48-63`） | 数值恰好一致，但 `Info.plist` / `windows/info.json` 不在门禁内 → **下次发版必漂** |
| auto-clicker | 2 真 + 1 手工副本 | CI 从 plist 读 | ✅ tag == plist（`build-intel.yml:49`） | 未漂；`README.md:40` 是未来漂移点 |
| qoder-proxy | 2 | — | — | 一致 |

**值得注意**：auto-clicker 虽然发布基础设施最弱，但**版本一致性做得最好**（单一真源 Info.plist + CI 强校验）。契约应该抄它的模式，而不是假设成熟产品更规范。

### 设计启示：事实有「当前态」与「历史态」两种，不能混校

价格从 ¥4 涨到 ¥5 之后，`CHANGELOG.md:332` 的「月费 ¥4」是**正确历史记录**，而 `/pricing` 的 ¥5 是**当前断言**——字面冲突，但两者都对。

这否掉一种天真的护栏设计：「扫全站，凡 `¥\d+` 必须等于 facts 里的值」会把正确历史记录报成错误，第一版就教会你忽略告警，护栏随之作废。

所以契约与 lint 必须显式分区：

- **当前态**（`/pricing` `/features` `/scope` 的表格与正文）→ 只允许来自占位符或数据渲染，lint 严格校验。
- **历史态**（CHANGELOG 全文、旧版 notes 原文、对照表快照）→ **只追加不修改**，lint 一律豁免。
- 推论：`facts` 里的价格不能是单值常量，至少是 `{ value, since }`，否则新契约会表达不出「涨价」这件事。

## 五、对既有设计的三处修正

1. **"长度预算由平台侧强制"这条要按产品分别定义**，不是一个全局数：table-flow 面板是**单行 420px ≈ 26 个中文字符**（实测 v1.4.4 的 100 字 notes 已被切掉）；wps 设置页可用 852px；auto-clicker 只有 360pt 单行；qoder-proxy 无上限。
2. **`assets` 必须是数组**，且 `url`/`urls` 双形长期共存（见 P0）。
3. **站点不该给 `built-in-updater` 的产品显示下载按钮**（wps），也不该给 `none` 的产品承诺更新提示（auto-clicker、qoder-proxy）。

## 六、已定与待决

**已定（2026-10-01 由你确认）**

- **五个仓全部进站点统一管理**，包括 Automation。因此它需要 `visibility` 分级，且**任何同步/导出脚本禁止整树遍历它**——它不是 git 仓库、无 `.gitignore`，且装着 `browser-data/` 真实登录态与 `credential_vault/` 密钥同置目录。它的对外内容只能在站点侧手写。
- 价格 ¥4 → ¥5 是**涨价史**，不是缺陷。护栏按「当前态/历史态」分区，见第四节。

**待决**

1. **P0 的执行顺序**：先发兼容双形的 table-flow 客户端版本，还是先冻结数据面 schema？顺序错了不可逆。
2. 数据面落点（发布仓 `main` vs 新仓）。
3. URL 路由（全量收进 `/table-flow/` vs 保守）——详见 `SITE-DESIGN.md` 的推荐。
