# 后续执行检查清单

与 `AGENT-CONTINUATION-PROMPT.md` 配套。勾选只认命令结果，不认"应该可以"。

> 本轮（2026-10-04）执行环境是 macOS 26.5.1 / arm64 / Node v24.18.0，**没有 Android 设备也没有 adb**。
> 因此凡是"必须在手机上才能证明"的项目一律留在未勾选状态，并在末尾列出待跑命令。
> 复跑入口：`pnpm verify`（15 步）；出手机包前 `pnpm verify:full`（再加打包与安装/备份/恢复/回滚演练）。

## 基线

- [x] 当前目录与工作区确认正确 —— `/Users/pikachu/code/my-software-hub`
- [x] 未读取、复制或遍历 `Automation` —— 仅部署包清单里把它列为禁止项做正则拦截，没有打开过该目录
- [x] Git 可写性已确认 —— 目录可写，`.git` 成功创建
- [x] Git 基线已提交 —— 改动前先提交基线 `c104ca0`（75 个文件，无密钥/凭证），之后 `9e8a886`、`9653532`

## 内容源与 schema

- [x] `data/products.json` 通过 schema —— `content-validate.mjs` 打印"通过 products.v1 schema（5 个产品）"
- [x] 已接入产品内容源通过 schema —— table-flow / wps-enhancer 两个产品
- [x] facts 均含 `effectiveFromVersion` —— 由 schema + `validateSource` 双重把关；缺字段有测试（`facts 缺 effectiveFromVersion 会失败`）
- [x] facts 无渠道变体 —— `facts 渠道变体会失败` + API 侧 `facts_channel_forbidden`
- [x] copy 无 HTML 和视觉字段 —— `copy 含 HTML 会失败`、`视觉字段名出现在 facts 会失败`
- [x] 渠道文案预算检查通过 —— 预算来自 `products.json.budget`，超限即失败并有测试
- [x] 错误产品 ID 会失败 —— 内容侧与 API 侧各有断言（`错误产品 ID 会失败` / `错误产品被拒`）
- [x] 内容包 SHA 不匹配会失败 —— `内容包 SHA 不匹配会失败` + 漂移检查自校验 + `sha-mismatch` 夹具

## 生成、发布和回滚

- [x] 每个产品生成 immutable revision —— revision 由语义 SHA 派生，历史文件同名同内容才允许存在
- [x] 生成 `content.v1.json` / `content-latest.v1.json`
- [x] 生成失败不移动 latest —— `校验失败时不移动 latest`
- [x] 单产品失败不影响其他产品 —— `单产品损坏不阻断其他产品，且不移动其 latest`
- [x] dry-run 不写远程仓 —— `dry-run 只生成本地 staging…`、`没有发布配置时 --publish 必须拒绝远程写入`、`远程写入失败时不记录发布指针`
- [x] 回滚命令已实际执行 —— `回滚到当前正确 revision 后漂移检查通过`、`回滚到过期 revision 时漂移检查会报警`
- [x] 回滚后 drift 检查通过 —— 同上；回滚不删除历史 revision（断言目录文件数不变）

## 提案

- [x] proposal schema 存在 —— `schema/proposal.v1.json` 冻结不动，新增 `proposal-envelope.v1.json` 承载 base/submitter
- [x] pending/accepted/rejected 状态存在 —— 另加 `conflict`（字段级冲突登记态）
- [x] facts 提案拒绝 channel —— API 返回 422，文件校验脚本同样拒绝
- [x] 错误 product 拒绝 —— 路径与本体不一致 400，未知产品 404，未接入内容源 503
- [x] 提案不能直接发布 latest —— `裁决只登记状态与发布任务，不移动 latest 也不写站点仓`（前后哈希一致）
- [x] 未把客户端 token 当作安全边界 —— 无提交凭证只进 `trust=untrusted`；裁决需 `X-Hub-Reviewer-Token`，未配置时 503

## 站点

- [x] `/table-flow/` 与 `/wps-enhancer/` 构建成功 —— dist 产物存在且由手机服务返回 200
- [x] ReleaseInfo 按产品读取内容包 —— 组件按 `productId` 取包；`release.json` 快照只属于它声明的产品
- [x] 内容包缺失时有明确降级提示 —— ProductOverview/ReleaseInfo/Fact 各自降级文案
- [x] VitePress build 通过 —— `pnpm build` exit 0，无 Vue 组件解析告警

## 客户端交接

- [x] TableFlow 消费契约和 fixture 已交付 —— `CLIENT-INTEGRATION.md` + 13 个夹具
- [x] WPS Enhancer 消费契约和 fixture 已交付 —— 含长文本映射与 `wps-no-second-upgrade-path`
- [x] 已明确哪些客户端源码尚未修改 —— `CLIENT-INTEGRATION.md` 第七节逐条列出，且未改动任何开发仓
- [x] 已明确内容包 URL、缓存、fallback 和回滚规则 —— 第二节 MUST 1–12

## Android / Termux 运行与后端

- [x] 已确认设备系统/架构/Node 版本 —— 本机 macOS/arm64/Node 24.18.0；**目标手机未提供**
- [x] Hono 提供预构建静态文件、API 与 /health —— `scripts/test-api.mjs` 第【1】节
- [x] 默认监听 127.0.0.1:8787，局域网绑定需显式配置 —— `config.ts` 默认值 + `HOST=0.0.0.0` 实测
- [ ] SQLite 驱动在目标环境验证 —— 需要真机：`node .../scripts/sqlite-compat-check.mjs`（电脑侧 10/10 通过，Android 未知）
- [x] 提案数据库为运行期主存储，JSON 仅导入/导出 —— `proposal-review.mjs export/import` 有测试
- [x] 认证、限流、幂等、基础 revision 冲突检测和审计通过测试 —— test-api 第【2】【3】节共 12 项
- [x] 部署包不含数据库、密钥及电脑原生依赖 —— 清单禁止项断言 + tar 条目实测（`.sqlite/.env/node_modules/*.node/proposals/Automation` 零命中）
- [x] start/stop/status/logs 命令已验证 —— `scripts/test-deploy.mjs`（含 SIGKILL 后重启、日志轮转、pid 防重）
- [x] 无 Docker/systemd/dev server 生产依赖 —— 生产入口是 `node api/index.js`；仓库里没有手机侧构建步骤
- [x] clean URL 直接访问与 404 行为正确 —— `/features` 200、`/table-flow` 301→`/table-flow/` 200、未知路径 404
- [x] 外网断开时本地服务仍提供已有静态页面 —— 电脑侧仅证明"运行期零出站 + 静态资源全同源"；**手机真断网未验证**
- [x] 进程重启后提案保留，重复请求不重复写入 —— SIGKILL 后重启测试
- [x] SQLite 一致性备份、恢复及部署回滚实际验证 —— 在线备份 → 破坏主库 → 恢复比对业务键与提案 ID → 版本回滚
- [ ] 目标手机与第二设备的局域网访问已验证 —— 本机只验证了 `0.0.0.0` 绑定后可从本机第二地址（192.168.x.x）访问，这不等于第二台设备可达
- [ ] 锁屏、网络切换、重启后的恢复行为有证据 —— 无设备，未做
- [x] 设备睡眠期间不承诺 6 小时/全天在线 SLA —— `ANDROID-DEPLOY.md` 第五节写明边界
- [x] 已区分电脑测试、Android 实机和公网部署状态 —— `ANDROID-DEPLOY.md` 第六节验证矩阵

## 当前实现缺口复核

- [x] ProductOverview 已在主题注册并有渲染证据 —— 修前 `dist/table-flow/index.html` 搜不到组件文案，修后渲染出摘要与 revision
- [x] WPS 产品不回落到 TableFlow 下载地址 —— `grep -c table-flow-v .vitepress/dist/wps-enhancer/index.html` = 0，页面显示"当前版本 v1.1.0"与应用内更新提示
- [x] 内容历史不可变、重复构建幂等 —— `重复构建幂等：第二次构建不改字节`、`历史 revision 被改写时构建拒绝`
- [x] 漂移检查不因 Git revision 不同而跳过事实比较 —— 旧实现要求 `sourceRevision` 相同才判漂移；现在只比语义哈希
- [x] CLI 支持规范中的空格分隔参数 —— `--product id` 与 `--product=id` 同一测试覆盖（build/validate/rollback/publish）
- [x] 旧 Markdown 硬编码事实迁移完成或明确列为未完成 —— 首页与 `/pricing` `/features` `/scope` `/faq` 改 `<Fact>`；`docs/USAGE_GUIDE.md` 是开发仓逐字副本，本仓不改（见下"仍未完成"）
- [x] 内部交接文档不出现在公开站点构建产物 —— `ANDROID-DEPLOY.md`、`CLIENT-INTEGRATION.md` 等已入 INTERNAL 名单，verify 会检查 dist 产物

## 最终命令

```bash
node scripts/validate-contract.mjs
node scripts/content-validate.mjs
node scripts/content-build.mjs
node scripts/content-drift.mjs
node scripts/test-content.mjs
./node_modules/.bin/vitepress build
```
