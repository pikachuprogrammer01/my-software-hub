# 客户端接入内容包与提案通道

> 交接物：消费规则 + 面板映射 + 可执行夹具。本仓**不含**客户端源码，也没有修改任何产品开发仓 —— 下表"需改位置"来自 `CONTRACT.md` 与 `PRODUCTS.md` 的实测台账，客户端团队落地前请自行复核。

## 一、要读的两个文件

| 用途 | 地址形态 | 说明 |
|---|---|---|
| 版本与下载（存量，勿改） | `https://gitee.com/pikachuprogrammer01/my-software-releases/raw/<releaseBranch>/update.json` | 已硬编码进分发包，URL 不可变更 |
| 内容包（新增消费面） | `https://gitee.com/pikachuprogrammer01/my-software-releases/raw/<releaseBranch>/content-latest.v1.json` | 取 `products.json` 里的 `contentEndpoint`；发布仓分支 = 产品 `releaseBranch` |

`data/products.json` 是产品与分支的唯一登记处。当前只有 `table-flow`、`wps-enhancer` 有内容包，其余产品 `contentSource: null`，客户端**不要**为它们请求内容包。

## 二、消费规则（MUST）

1. **必需字段只认 `schema` + `product`**；其余缺失一律回落，不得抛异常、不得整块不渲染。
2. `product` 不等于自身 ID → 丢弃并回退内置快照（防 URL 配错串产品）。
3. `schema` 高于已知版本 → 按已知版本尽力渲染 + 告警。
4. 未知 `status` / `channel` / `kind` → 回落通用样式。
5. `facts.*` 只取共享值；若上游违约带了 `variants`，忽略变体，不因此不渲染。
6. **不渲染 HTML**，只渲染纯文本与受控标记。
7. **不截断**：文案超出 `products.json.budget` 时该层留空（截半句比不显示更糟），并告警。
8. SHA-256 校验：对 `{schema, product, facts, copy, update}` 的规范 JSON 序列化求哈希，与包内 `sha256` 不符 → 丢弃。`contentRevision` 必须等于 `content-<sha 前 12 位>`。
9. 缓存 key = `version`；同一版本内的文案修订靠 `contentRevision` 失效（`If-None-Match: "<contentRevision>"` → 304）。
10. 内置一份 fallback 快照；拉取失败时使用它，并显示"离线副本（最后同步 X）"。
11. **失败必须可观测**，至少区分三态：`network`（请求/解析失败）、`format`（不认识或校验不过）、`latest`（无更新）。禁止把所有异常路径统一 `return null`。
12. 检查节律：客户端在正常运行且联网时 6 小时内至少检查一次；这不是手机服务全天在线的承诺。

## 三、TableFlow 面板映射

| 内容包字段 | 面板位置 | 预算 | 超预算处理 |
|---|---|---|---|
| `update.badge` | 横幅左侧徽章 | 12 字 | 不显示徽章 |
| `update.summary` | 横幅单行（`white-space:nowrap` + `ellipsis`，默认宽 420px） | 26 字 | 整层留空并回落离线快照 |
| `update.text` | 展开后的更新说明 | 120 字 | 整层留空 |
| `update.detail` | 仅站点长文 | — | 面板忽略 |
| `facts.version.current` | 版本号显示 | — | 只取 `value` |
| `facts.pricing.*` / `features.*` | 不进面板 UI | — | 站点侧用 `<Fact>` 渲染 |

## 四、WPS Enhancer 设置页映射

| 内容包字段 | 设置页位置 | 预算 | 说明 |
|---|---|---|---|
| `update.badge` | 更新卡片标签 | 12 字 | 单行 |
| `update.summary` | 启动通知/卡片副标题 | 60 字 | 启动通知为单行容器 |
| `update.text` | 设置页"本次更新"区块（内容区约 852px，可换段） | 300 字 | 允许较长文本，仍不渲染 HTML |
| `update.detail` | 折叠区内长说明 | — | 可缺省 |

`updateMechanism: built-in-updater` 的产品**不得再显示第二条升级路径**：即使 `update.json` 或内容包里有 `url`/`urls`，设置页也不给下载按钮，只提示"新版本由应用内更新器检查"。给用户两条路径会让其覆盖回旧安装包。

## 五、提案怎么交

没有后端了：提案是**离线 JSON 文件**。客户端或你自己按 `schema/proposal.v1.json` 写一份，跑
`node scripts/proposal-validate.mjs <文件>` 校验（会拒未知产品、未知字段形态与 `facts.*` 带渠道变体），
再人工按受控变更进入站点仓。客户端仍然不得携带 Git 写入凭证，也不得直接移动 `latest`。

## 六、一致性夹具

```bash
node scripts/conformance-fixtures.mjs        # 从真实内容包重新生成期望表
node scripts/conformance-fixtures.mjs --check # 校验夹具是否与内容包同步（verify 会跑）
node scripts/test-conformance.mjs             # 跑 13 个夹具，验证规则与期望一致
```

夹具位于 `conformance/fixtures/`，覆盖：正常、同 revision、错 product、SHA 不符、网络失败、缺可选字段、未知枚举、超预算、含 HTML、高 schema 版本、facts 渠道变体、WPS 长文本、WPS 单一升级路径。每个文件都带 `expect`，客户端团队可用同一张表跑自己的实现（跨语言不共享 SDK，一致性靠夹具）。

## 七、需要客户端仓配合的事（本仓未执行）

| 产品 | 位置（来自 CONTRACT.md 台账，需客户端团队复核） | 要改什么 |
|---|---|---|
| table-flow | `src/services/updateService.ts` | 所有异常路径统一 `return null` 违反 MUST 11，需区分 network / format / latest 三态 |
| table-flow | `src/constants/update.ts` | 保留现有 `update.json` URL 常量不动，另加内容包 URL 常量 |
| table-flow | `src/components/update/UpdateBanner.vue` | 按第三节映射改读 `update.badge/summary/text`，取消前端截断 |
| table-flow | 打包流程 | 内置一份 fallback 内容包快照（MUST 10） |
| wps-enhancer | `internal/settings/settings.go` + `frontend/src/` | 后端已取到 `notes` 但前端零消费；改为渲染内容包 `update.*` |
| wps-enhancer | 发布 CI（`release.yml`） | 停止把 `notes` 固定覆盖成 `"WPS Enhancer v<version>"`，让人写的说明进得去 |
| 两者 | 下载物完整性 | `update.json` 目前无 `sha256`，客户端对下载物零校验；发布仓补字段后再启用校验 |

上述改动都在客户端仓，本仓只交付规则、映射与夹具。
