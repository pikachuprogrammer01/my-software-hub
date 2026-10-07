# 数据面契约 v1（已冻结）

> 后续实施说明（2026-10-04 更新）：冻结的存量 update.json/字段与 URL 契约保持不变。站点为纯静态、**无常驻后端与数据库**；内容包导出与发布由电脑侧适配器承担（默认 dry-run），提案走离线 JSON 交接。曾实现过的提案 API 与手机部署已撤回，见 `PHONE-RUNTIME.md`。“不建后台/数据库”这条约束重新成立。

> 冻结日期：2026-10-01。机器可读定义：`schema/*.v1.json`。可执行验证：`node scripts/validate-contract.mjs`（20 项，含两份**线上** `update.json` 实拉校验）。
> 本文件的最终归属是发布仓 `my-software-releases` 的 `main:docs/CONTRACT.md`（提供方持有契约）。现暂存站点仓，交接时整体迁走。

## 一、三个仓的角色

| 仓 | 角色 | 写什么 | 绝不写 |
|---|---|---|---|
| 各产品**开发仓** | 事实的源头 | 代码常量、工程台账 | 对外文案、站点页面 |
| **发布仓** `my-software-releases` | 数据面（唯一对外真源） | `update.json`、`facts.json`、`release-notes*.json`、`products.json` | 站点页面、源码、密钥 |
| **站点仓** `my-software-hub` | 渲染器 + A 类文案作者 | 对外文案、主题、lint、快照缓存 | 任何开发仓文件 |

数据流严格单向：**开发仓 → 发布仓 → （站点 / 客户端）**。站点不写回，发布脚本不碰站点仓。

## 二、冻结的含义：三条铁律

**律 1｜append-only。存量字段永不改名、不改形、不删除。**

`url: string`（table-flow 用）与 `urls: {platform-arch}`（wps-enhancer 用）**都是永久合法形态，不是"待迁移的历史包袱"**。这是本轮冻结最关键的取舍：

> 已分发的 table-flow 客户端硬性要求 `typeof url === 'string'`（`src/services/updateService.ts:43`），不满足就整体 `return null`——更新提示消失、零报错、零遥测。若契约把 `url` 判为废弃并推动迁移，所有老用户会静默失去更新检测且不可逆。

因此**「先冻结 schema」这条路径之所以安全，正是因为冻结的是"两种形态并存"而不是"统一到一种"**。若将来要统一，那是一次新的大版本 + 新文件，且必须先完成客户端发布。

**律 2｜存量文件宽松，新增文件严格。**

`update.json` 已在线上存在且**没有** `schema` 字段 → manifest schema 必须允许其缺省（隐含 1）。而 `facts.json` / `release-notes.json` / `products.json` 是新建的 → `schema`、`product` 一律必填。冻结不能要求先改线上文件。

**律 3｜未知值必须回落，不得抛错。**

`kind`、`channel`、`status` 等枚举**故意不用封闭 enum**（schema 里是 `pattern`）。封闭 enum 会让"新增一个 kind"变成破坏性变更，与律 1 冲突。规则：

- 新增枚举值 = 向后兼容变更。
- 客户端遇到未知值 → 回落 `misc` / 通用样式 / 忽略该条，**禁止异常、禁止整块不渲染**。
- 拼写错误（`fixx`）由 **lint** 拦，不由 schema 拦。

**分工：schema 管兼容，lint 管质量。** schema 只保证"老客户端不会崩"，正确性由 `check-drift` / `lint-content` 负责。

## 三、文件与 URL 契约

```
main:products.json                                  产品索引（站点骨架）
main:docs/CONTRACT.md · schema/*.v1.json            本契约
<产品分支>:update.json                              已分发客户端读取，URL 永不变更
<产品分支>:facts.v1.json                            承重事实
<产品分支>:release-notes.v1.json                    全量历史（站点拉）
<产品分支>:release-notes-latest.v1.json             仅最新一条（客户端拉）
```

**不可变清单**（一经发布永久有效，只能新增）：

1. `.../raw/<产品分支>/update.json` —— 已硬编码进分发包（table-flow 在 `src/constants/update.ts:23`，被打进 3 个 chunk）。
2. `schema` 大版本号与文件名后缀 `.v1` —— 破坏性变更走 `.v2.json` 新文件，`.v1` 冻结在最后一个兼容版本继续供老客户端读。
3. `products.json` 里的 `id` —— 它是 URL 前缀。

## 四、字段要点

完整约束见 `schema/*.v1.json`（每个字段带 `description` 说明理由）。此处只记**不看 schema 就会做错**的几条：

| 字段 | 规则 | 为什么 |
|---|---|---|
| `version` | **只允许 `x.y.z` 三段纯数字** | table-flow 客户端用手写逐段 `parseInt` 比较（`updateService.ts:23-32`），`1.7.0-beta.1` 会被判成**等于** `1.7.0` → 静默不提示更新 |
| `notes` | 单行、≤200 字，**兼容字段** | 新内容一律写 `release-notes`；`notes` 只为老客户端保留 |
| `facts.limits` | **开放键值表**，值为 `{value, unit?, since?}` | 冻结信封、放开载荷：新增一条事实只需加键，不动 schema |
| `facts.pricing` | **数组**，每条带 `since`/`until` | 价格有时间维度。¥4→¥5 是真实发生过的历史，单值常量表达不出来 |
| `facts.provenance` | `release-repo` \| `manual`；`manual` **必须**给 `verified_at` | 五个产品成熟度不一，未接基础设施的只能手填，但必须暴露"人工核对于 X"且 lint 只告警不失败 |
| `release-notes` 文案 | 四层：`badge` / `summary` / `changes[].text` / `changes[].detail` | 每层对应一类容器，消费者各取一层，**任何客户端都不做截断** |
| `assets` | **数组**，元素含 `platform`/`arch`/`sha256`/`min_os`/`signed`/`notarized` | 桌面 app 多平台多产物；扩展与网站可整块缺省 |
| 视觉字段 | **禁止** `icon`/`accent`/`color`/`style` | 一旦下发，客户端就会依赖它，视觉决策回流内容面 = 新的双写点。语义→视觉映射归各客户端 |

**文案预算（`products.json.budget`，lint 硬拦）**：来自实测，不是偏好。

| 产品 | badge | summary | text | 依据 |
|---|---|---|---|---|
| table-flow | 12 | **26** | 120 | 面板横幅 `white-space:nowrap`+`ellipsis`（`UpdateBanner.vue:83-89`），默认宽 420px（`settingsStore.ts:75`）；实测 v1.4.4 的 100 字 notes 已被切掉 |
| wps-enhancer | 12 | 60 | 300 | 设置页内容区约 852px（`style.css:75`）；启动通知单行 |
| auto-clicker | 10 | 20 | 60 | 360pt 固定宽窗口（`ContentView.swift:38`）+ 单行菜单；**当前无关于窗口、UI 不显示版本号** |
| qoder-proxy | 12 | 80 | 2000 | ⚠️ 2026-10-05 实测更正：控制台把 JSON 渲染成 antd 组件，**没有 Markdown 渲染器**，长文在应用内无处可放；2000 是"尚未有消费容器"的占位值，等它真接内容时按实测重定 |

## 五、客户端接入 MUST

1. 必需字段只认 4 个：`schema`、`product`、`version`、`changes[].kind`。其余一律可选。
2. 校验 `product` 等于自身，不等则**丢弃并回退**（防 URL 配错串产品）。
3. 未知 `kind` / `channel` / `status` → 回落，不抛异常。
4. 打包时内置一份 fallback 快照；拉取失败时用它并显示"离线副本（最后同步 X）"。
5. 缓存 key = `version`；同版本内文案修订靠 `revision` 失效。
6. 只渲染纯文本与受控标记，**不渲染 HTML**。
7. **失败必须可观测**：能区分"网络失败 / 格式不认识 / 已是最新"，不得统一 `return null`。

> ⚠️ **已登记的存量偏差**（不阻断冻结，但需排期）：
> - table-flow 违反 MUST 7 —— `updateService.ts:39-46` 所有异常路径一律静默 `return null`。冻结律 1 移除了**触发器**，但没移除**脆弱性**：Gitee 返回 502 或 HTML 错误页时，用户仍会无声失去更新提示。
> - table-flow 违反 MUST 4 —— 无内置兜底快照、无备用域名。
> - wps-enhancer 违反 MUST 3 的前提 —— 前端取了 `notes` 但**从未渲染**（`system.go:151` 有值，`frontend/src/` 零消费）；且 CI 把 `notes` 固定覆盖成 `"WPS Enhancer v${version}"`（`release.yml:408`），人写的说明进不去。
> - 两个产品的 `update.json` 都无 `sha256`，客户端对下载物零完整性校验。

## 六、站点侧消费规则

- 拉取后写入站点仓 `data/snapshot/<id>/*.json` 并**提交入库**，带 `fetchedAt`。拉不到 → 沿用旧快照 + 页面顶部注入告警条，**不得静默**。
- **快照永不允许被任何文档当"当前值"引用**（引用一律走占位符）。针对实测事故：`table-flow/release-repo/` 停在 1.4.4 却被 `SPEC.md:489`、`RELEASE_CHECKLIST.md:126`、`.aoci/baseline.json:1179` 当真值。
- lint 分两区：**当前态**（`products/**` 除 changelog、首页）裸字面量即失败；**历史态**（changelog、旧 notes 原文）只追加不修改、一律豁免。混校会把涨价前的正确记录报成错误。
- 交叉校验只对 `factsSource: release-repo` 的产品阻断；`manual` 的产品只告警。
- 单产品数据损坏**不得阻断整站构建**：逐产品 try/catch，失败产品渲染"数据暂不可用"并从目录摘除。

## 七、版本与兼容

- 加可选字段 / 加枚举值 / 加 `limits` 键 → 兼容变更，不发新版本。
- 改必填、改类型、删字段、改 `id` → 破坏性，走 `*.v2.json` 新文件，`.v1` 冻结继续服务老客户端。
- 站点声明支持 `[1, 2)`；`schema` 高于已知版本 → 按已知版本尽力渲染 + 告警，**不得崩**。

## 八、验证

```bash
pnpm validate          # 契约自检（本地确定性 + 线上实拉）
pnpm validate:strict   # 线上真值与 schema 分叉也算失败（人工核对、交接前用）
pnpm build             # 已前置 validate，非 strict 模式
```

覆盖 20 项：两份**线上** `update.json` 实拉通过、破坏性形态被拒（预发布号 / http 明文 / 超长 notes / 空 `urls`）、`url` 与 `urls` 并存可过、无产物可过、未知枚举容忍、`manual` 缺 `verified_at` 被拒、涨价可表达、五产品真实注册表通过。

**为什么线上分叉只告警**：按第七节，提供方改形态是兼容性事件，不该砸掉站点发布。所以默认模式下 `update.json` 与 schema 分叉 → 告警继续构建；要它失败必须显式 `--strict`。网络不可达时回落到脚本内置的 2026-10-01 实测副本，**那份副本只是复跑用的，不当真值**。

改任何 `schema/*.v1.json` 后必须跑 `pnpm validate`。

## 九、明确不做

- 不做封闭枚举（与律 1 冲突）
- 不下发视觉字段
- 不要求存量 `update.json` 补 `schema` 字段（律 2）
- 不把 `url` 迁移成 `urls`（律 1，不可逆）
- 不建 CMS / 后台 / 数据库
- 不让发布脚本读写站点仓
- 同步与导出脚本**不得路径遍历 `Automation` 目录**——它不是 git 仓库、无 `.gitignore`，且含真实登录态与和加密库同目录的 fernet key

## 十、交接给其他项目时补什么

本契约冻结后，接入一个新产品需要对方提供三件：

1. `facts.v1.json` 与 `release-notes.v1.json` 的**首版内容**（或声明 `factsSource: manual` 由站点代填）
2. 跑一遍 `conformance/fixtures/` 六用例（正常 / 未知枚举 / 超长 / 缺可选 / 错 product / 高 schema 版本）—— **一致性靠夹具，不靠文档自觉**；跨语言无法共享 SDK
3. 在 `products.json` 登记一条（含 `budget` 实测值）

夹具目录尚未建立，是交接前的最后一块拼图。
