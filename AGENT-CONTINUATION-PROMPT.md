# 后续执行 Agent 提示词

> **当前形态（2026-10-04 定）：纯静态站点，无常驻后端。** 本文件第 4 节（提案 API/SQLite）与第 7 节（Android/Termux 运行交付）**已作废，不要重建**；决策与恢复方式见 `PHONE-RUNTIME.md`（标签 `pre-static-only`）。下面保留的历史条目只作追溯，其中"必须完成"的后端部分不再成立。
## 已完成，不要重复实现

以下内容已经存在并通过基础验证：

- `data/products.json`：五产品注册表；
- `products/table-flow/content.v1.source.json`；
- `products/wps-enhancer/content.v1.source.json`；
- `schema/content.v1.json`、`schema/proposal.v1.json`；
- `scripts/content-validate.mjs`；
- `scripts/content-build.mjs`；
- `scripts/content-drift.mjs`；
- `scripts/content-rollback.mjs`；
- `scripts/proposal-validate.mjs`；
- `scripts/test-content.mjs`；
- `data/generated/*/content-latest.v1.json`；
- `/table-flow/` 与 `/wps-enhancer/` 页面；
- `CONTENT-PIPELINE.md`。

上述验证来自上一次实施记录，必须重新执行；“文件存在/构建通过”不等于功能完成。当前代码仍需修复：主题注册 ProductOverview、ReleaseInfo 对非 TableFlow 产品不能回落到 TableFlow 下载地址、内容历史不能被每次构建覆盖、漂移检查不能因 Git revision 变化跳过事实比较、CLI 同时支持规范中的 `--product id` 与现有 `--product=id`。既有首页和 Markdown 仍有硬编码事实，必须完成迁移并实际验证后才能称为共享事实零漂移。新增内部交接文档须加入 VitePress 排除名单。

## 本次必须完成的剩余工作

按顺序执行，不能只写设计文档：

### 1. Git 基线

- 检查当前目录是否可写入 `.git`；
- 如果可写，初始化 Git、配置本地提交身份、提交当前完整基线；
- 如果不可写，不要反复尝试权限升级，在最终报告中明确阻塞原因和需要人工执行的命令；
- 不要删除或覆盖现有文件。

### 2. 内容流水线增强

- 将 `content:validate`、`content:build`、`content:drift`、`test:content` 纳入统一验证入口；
- 验证 `data/products.json` 与 `schema/products.v1.json`；
- 增加失败场景测试：错误产品 ID、事实渠道变体、HTML、缺少 `effectiveFromVersion`、文案超长、内容包 SHA 不匹配；
- 确保单产品失败不会阻断其他产品内容生成；
- 确保 `latest` 只在生成和校验成功后更新。

### 3. 远程发布适配器

实现一个安全的发布适配器，默认 dry-run：

- 输入：产品 ID、生成后的 immutable revision；
- 输出：待写入发布仓的文件清单、revision、SHA-256 和变更摘要；
- 默认只生成本地发布 staging 目录；
- 只有显式 `--publish` 且存在明确的发布配置时，才允许远程写入；
- 不读取或遍历 `Automation`；
- 不把任何仓库凭证写入生成包、客户端或日志；
- 远程写入失败时不能移动本地或远程 `latest`；
- 增加发布适配器的 dry-run 测试。

不要假设当前环境拥有 Gitee token 或其他远程仓权限。没有凭证时必须完成 staging、校验和报告，而不是伪造发布成功。

### 4. 提案接收契约（已作废）

后端已撤回，提案改为离线 JSON 交接：`node scripts/proposal-validate.mjs <文件>` 校验后人工进站点仓。
不要新增 API、数据库或审核接口；历史实现见标签 `pre-static-only` 与 `PHONE-RUNTIME.md`。

### 5. TableFlow 客户端接入准备

本仓不包含 TableFlow 客户端源码时，不要伪造客户端已接入。请完成可交接的接入物：

- `release-notes`/内容包消费说明；
- 请求 URL、缓存 key、ETag/revision 规则；
- 产品 ID 校验、SHA 校验、未知字段回落、离线副本规则；
- TableFlow 面板的 `badge/summary/text` 映射；
- 客户端 conformance fixture 和预期结果；
- 明确需要在客户端仓修改的文件和接口。

如果能安全访问客户端仓，才实际修改客户端；否则只提交契约和 fixture，并在最终报告中列明未改动原因。

### 6. WPS Enhancer 接入准备

- 为桌面设置页定义较长文本消费映射；
- 明确 `built-in-updater` 产品不显示错误的第二条升级路径；
- 提供对应 fixture、fallback 和版本兼容规则；
- 同样不得在没有客户端源码时声称已经接入。

### 7. Android 手机运行交付（已作废）

站点是纯静态产物，交给静态托管即可；不再有手机侧 HTTP 服务、SQLite 驱动试验或 `hubctl` 运维面。

### 8. 最终验收

必须实际执行：

```bash
node scripts/validate-contract.mjs
node scripts/content-validate.mjs
node scripts/content-build.mjs
node scripts/content-drift.mjs
node scripts/test-content.mjs
./node_modules/.bin/vitepress build
```

如果 `pnpm` 可用，再执行：

```bash
pnpm validate
pnpm build
```

还必须验证：

- `/table-flow/` 和 `/wps-enhancer/` 构建成功；
- 一个产品内容损坏时其他产品仍可生成；
- 回滚到历史 revision 后 `latest` 指向正确内容；
- dry-run 发布不会写远程仓；
- 提案校验拒绝错误产品和事实渠道变体；
- 生成包中没有 HTML、视觉字段、密钥或 Automation 内容。

## 不得改变的架构规则

- 站点仓是用户可见文案主源；
- 发布仓是版本事实和生成内容包分发面；
- `facts` 不允许渠道变体；
- 渠道变体只能存在于 `copy`；
- 不用最后修改时间解决冲突；
- 不删除历史 revision；
- 不直接覆盖 `latest` 绕过校验；
- 不把五个产品合成一个客户端内容包；
- 不接入公众号、知乎、小红书、B 站等外部宣传平台；
- 不遍历 `Automation` 目录；
- 不修改产品开发仓；
- 不把客户端仓库写入凭证放入客户端。

## 最终报告格式

最终只报告以下内容：

1. 已完成的文件和行为；
2. 实际执行的命令及结果；
3. Git、远程发布、客户端接入是否完成；
   同时报告手机 HTTP 服务、API/数据库、部署包、实机验收各自状态；
4. 未完成项及确切阻塞原因；
5. 后续人工只需要执行的最少命令。

不要只写“已实现”；必须给出验证证据。
