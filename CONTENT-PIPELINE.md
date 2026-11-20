# 内容一致性与软件内分发流水线

本仓是产品门户与对外文案源。产品正文位于 `products/<id>/*.md`，结构化事实和客户端短文案位于 `products/<id>/content.v1.source.json`；`data/generated/<id>/` 是生成结果。网站为 VitePress 纯静态站点，内容包由发布仓分发，提案以文件或 Issue 交接。

## 改动入口

| 要修改的内容 | 编辑位置 | 随后同步 |
|---|---|---|
| 产品介绍、快速上手、功能、价格、FAQ、排查 | `products/<id>/*.md` | 相应结构化文案与站点更新日志 |
| 价格、功能状态、兼容范围、短文案 | `products/<id>/content.v1.source.json` | 生成内容包和一致性夹具 |
| 产品目录、页面清单、图标、文案预算 | `data/products.json` | 页面与 `sections` 一一对应 |
| 品牌、站名、联系方式 | `data/site.json` | 页面使用组件读取 |
| 最新下载版本和地址 | 发布仓 `update.json` | 正式版本同步更新 `.vitepress/releases.json`；内容编辑不手填版本 |
| TableFlow 完整使用指南、隐私政策、设备披露 | TableFlow 开发仓对应 `docs/` 源文件 | 逐字复制到登记的三份镜像，再更新登记哈希 |

产品页面按功能行为直接撰写，使用当前界面入口、完整步骤与预期结果。功能说明与下载清单各有来源：内容编辑不需要给教程加临时发布状态，也不修改历史版本或生产部署记录。

## TableFlow 镜像同步

`data/mirrors.json` 登记三份逐字镜像：

| 官网文件 | 开发仓源文件 |
|---|---|
| `products/table-flow/usage-guide.md` | `table-flow/docs/USAGE_GUIDE.md` |
| `products/table-flow/privacy.md` | `table-flow/docs/PRIVACY_POLICY.md` |
| `products/table-flow/device-fingerprint.md` | `table-flow/docs/DEVICE_FINGERPRINT_DISCLOSURE.md` |

1. 在开发仓编辑源文件，核对现有 UI、功能与数据说明。
2. 待源文件稳定后，原样复制到对应官网文件；保留全部字节，不添加 front-matter 或 `<Fact>`。
3. 分别计算 SHA-256，在 `data/mirrors.json` 更新 `siteSha256`、`sourceSha256` 和实际 `syncedAt`。同一次同步的两个哈希应相等；`verificationNote` 记录核对范围，历史证据保留在原日志中。
4. 运行 drift 与 lint。drift 对源仓不同只告警，**最终整合仍应确认三份镜像逐字节一致**；单看命令退出码不能代替这项确认。

跨仓协作时，主源编辑者负责最后复制与哈希，官网编辑者修改改写版页面和内容源。先完成镜像再做最终网站验证，避免互相覆盖。

## 生成与验证顺序

在镜像同步和内容源编辑完成后，依次执行：

```bash
node scripts/content-validate.mjs
node scripts/content-build.mjs --product=table-flow
node scripts/conformance-fixtures.mjs
node scripts/content-drift.mjs
node scripts/content-lint.mjs
node scripts/conformance-fixtures.mjs --check
node scripts/test-conformance.mjs
node scripts/test-content.mjs
node scripts/changelog-guard.mjs
```

`conformance-fixtures.mjs` 从真实内容包更新期望表，应在生成包后运行。`--check` 只核对夹具，一旦内容 revision 改变就需要先生成夹具。单产品修改可给 `content:build` 指定产品，避免产生无关产品的新 revision。

契约自检与静态构建：

```bash
node scripts/validate-contract.mjs
./node_modules/.bin/vitepress build
```

VitePress 会在启动构建时尝试同步下载清单，写入 `.vitepress/releases.json`。常规构建完成后，若快照发生变化，需重新生成内容包和夹具，再跑上述检查，最后再次构建；内容包中的版本与下载地址才会跟快照一致。`pnpm validate` 汇总契约、内容生成、漂移、lint 和测试，但不会替你重新生成夹具；`pnpm build` 前置契约、内容校验、生成与 lint，并执行 VitePress 构建。

### 使用现有版本快照做本地文档验证

需要固定现有下载清单时，用现有 `HUB_UPDATE_MANIFEST_BASE` 覆盖到不提供网络清单的 `file:` 地址，触发明确的缓存回退：

```bash
HUB_UPDATE_MANIFEST_BASE='file:///offline-cache-only/update.json' \
  ./node_modules/.bin/vitepress build
```

Node 的 fetch 不读取这个 `file:` 清单，日志会声明沿用各产品本地缓存；不调用 `pnpm sync`，不改写生产版本事实。确认 `.vitepress/releases.json` 已有有效快照，并在构建前后比较文件哈希。此构建包含 VitePress 页面和链接检查；契约与内容检查仍按前面的命令单独执行。

纯离线的契约结构演练可显式触发脚本内置缓存：

```bash
node --input-type=module -e '
  globalThis.fetch = async () => { throw new Error("本地文档验证，使用内置离线样本") }
  await import("./scripts/validate-contract.mjs")
'
```

这一步验证 schema 与脚本样本，不代替正式发布时对实际下载清单的核对。验证记录应注明使用了离线样本与现有版本快照。

## 内容规则

- 共享事实放 `facts`，每项包含有依据的 `effectiveFromVersion`。生效版本与实际发布日期分开记录。
- 文案放 `copy`；渠道变体只出现在 `copy.*.variants`，`update.badge/summary/text` 遵守注册表预算。
- 内容源不写 HTML、颜色、图标或布局；价格与已登记上限在正文用 `<Fact>` 读取。
- `version.current` 与带版本的下载地址由 `.vitepress/releases.json` 注入，源内下载模板使用 `{version}`。
- `contentRevision` 和 SHA-256 由生成器依据语义产生。已存在的 history revision 不改写，新增内容生成新的 revision。
- 当前功能文档、站点改动日志与历史发布证据分开维护；产品历史 release 日期从发布记录核对。

TableFlow统一口径：新翻页采集确认开始扣1次，开始后不退，同任务继续/切换/输出不重扣；自动段与自然末页立即暂停，留在预览。网页填充仍按批次开始扣费；旧预留任务仅作兼容。

## 回滚与提案

回滚本地生成包时，将 latest 移至已有 revision，不删除历史文件：

```bash
node scripts/content-rollback.mjs --product=table-flow --revision=content-3ddedc454921
```

提案格式在 `schema/proposal.v1.json`：

```bash
node scripts/proposal-validate.mjs path/to/proposal.json
```

批准后修改内容源，按生成与验证顺序处理。`content-publish.mjs` 默认 dry-run；真实写入发布仓由发布流程单独执行，客户端不持有 Git 写入凭据，也不自行移动 latest。手机服务撤回等历史实现从 Git 历史追溯，当前维护入口为本文与[部署说明](./DEPLOY.md)。
