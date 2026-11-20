# TableFlow 门户源码同步验证（2026-11-20）

任务依据：`table-flow/_bmad-output/initiative-table-stats-computation/plan-portal-current-source-sync.md`。
门户基线：`a181b53f8fdd3976bc9aa14e1c49f29fb87f2b64`。在任务开始时已有修改上增量实施，保留原有内容。

## 完成范围

更新 10 个产品页面、结构化短文案、站点日志、镜像登记、TableFlow 生成包和相关一致性夹具。核对了模式交接、任务恢复与清理、开始扣费及不退款、订阅页购买、后台续费和赠额审批、付费离线激活、Debug 手动启用与能力边界。

内容 revision：`content-9f58f3a7375c`；SHA-256：`9f58f3a7375c6ed1b1251085f5a51e58a9de78223d27bb8c907c2f2ccdc16da4`。
下载事实继续来自原有 `.vitepress/releases.json`，TableFlow 版本为 `2.0.3`，未将当前源码版本冒充已发布安装包。原快照、既存 history 和 `demo.py` 字节未变；未修改其他产品内容，未修改 TableFlow/LicenseHub 业务源码，未提交、推送或部署。

## 验证命令与实际结果

- `node scripts/content-validate.mjs`：5 个已登记产品源校验通过。
- `node scripts/content-build.mjs --product=table-flow`：生成当前 TableFlow revision。
- `node scripts/conformance-fixtures.mjs`：按真实内容包生成 13 个夹具，仅相关 TableFlow 夹具有字节变化。
- `node scripts/content-drift.mjs`：5 个产品通过，三份本机镜像均与源文件逐字节一致。
- `node scripts/content-lint.mjs`：通过；31 个事实占位符、注册表与页面对应和 3 份镜像哈希有效。
- `node scripts/conformance-fixtures.mjs --check`：13 个夹具一致。
- `node scripts/test-conformance.mjs`：13/13 通过。
- `node scripts/test-content.mjs`：52/52 通过，未删除断言或跳过测试。
- `node scripts/changelog-guard.mjs`：通过。
- `HUB_UPDATE_MANIFEST_BASE='file:///offline-cache-only/update.json' pnpm build`：通过。前置契约校验 20/20（两个实际线上清单校验成功）；内容校验、生成、lint 和 VitePress 客户端/服务端打包、页面渲染及 sitemap 均通过。VitePress 清单同步明确回退现有快照，不运行 `pnpm sync`。
- 独立无头 Playwright 浏览器读取本地构建产物：产品 13 页均能渲染，无页面异常和失败 HTTP 响应；核对模式/清理入口、后台审批、付费离线说明，以及安装页下载按钮仍指向 `2.0.3`。390px 移动视口文档宽度为 390px，模式切换步骤正常排版。
- 最终重新逐字复制三份镜像，再进行字节、双向 SHA-256、日期核对；重跑 drift、fixture check 和 `git diff --check`，均通过。

本轮没有运行 TableFlow 构建或测试，也不将门户校验视为原始扩展包、真实网站或生产环境验收。

## 最终镜像

三份登记日期均为 `2026-11-20`。已按独立审查后的稳定源文件重新逐字复制使用指南、隐私政策和设备披露，最终哈希如下。

| 官网文件 | 源与镜像共同 SHA-256 |
| --- | --- |
| `products/table-flow/usage-guide.md` | `2181c5b430ff4f3fbd70e5024565e4137f9e855dac66e060857169649516a99e` |
| `products/table-flow/privacy.md` | `b5d51447ce93d9d8dea01a6d5abc24777d584ee7d2d80b54fb368a96a334e704` |
| `products/table-flow/device-fingerprint.md` | `ad84d5286f11c2d2e7c35c2d116a68d6b1f5430f468e80b3910733203daa9776` |

## 源文档后续修正与最终同步（已完成）

主代理已在 TableFlow 源仓修正前轮核对出的旧称；本次读取并确认以下修正后，重新逐字复制三份镜像并更新双向 SHA-256：

- `table-flow/docs/USAGE_GUIDE.md:155` 的账户提示现为「免费额度申请」。
- `table-flow/docs/USAGE_GUIDE.md:513` 的任务内状态栏现为「翻页模式」；`:515` 的自动翻页输入现为「接下来自动翻几页？」。
- `table-flow/docs/USAGE_GUIDE.md:636` 的旧任务横幅清理入口现为「清理此任务数据…」；内嵌 `guideEntries.ts` 对应说明也已同步修正。

前轮记录的源文档差异已解决并同步至门户，本项没有遗留待处理结论。门户本次仅复制镜像和维护登记、验证记录，未修改源仓。

结构化事实未变化，继续使用 `content-9f58f3a7375c`，不生成新内容 revision 或夹具。最终站点构建使用现有发布快照。

后续验证结果：

- `node scripts/content-drift.mjs`、`node scripts/content-lint.mjs` 均通过，三份镜像字节及登记哈希一致。
- `HUB_UPDATE_MANIFEST_BASE='file:///offline-cache-only/update.json' ./node_modules/.bin/vitepress build` 通过，客户端/服务端打包、页面渲染和 sitemap 生成成功。只重建站点，未重新生成内容包。
- 最终再次核对源文件与三份镜像、双向 SHA-256 及日期；构建后的使用指南 HTML 已包含四处新入口称谓。
- 逐文件 SHA-256 确认结构化源、所有生成内容包与 history、全部 conformance 夹具、下载快照及 `demo.py` 均与本次后续开始时相同；内容 revision 保持不变。
- `git diff --check` 通过。此前已完成的内容/夹具测试不重复扩大，本次未运行 TableFlow 测试，未提交、推送或部署。

已核对 LicenseHub 的 `DEVICE_LEGACY_COMPAT_ENABLED=true` 手动兼容开关，源码不再要求截止日期。运维配置不加入消费者教程。

## 独立审查三项修正与最终同步（已完成）

本次合并处理以下三项真实问题，源文档由主代理修正，门户未写回源仓：

1. **导出不自动定稿**：使用指南「第四步：导出」已明确新开始扣费任务输出只暂停并保存，导出后可继续原任务；重复输出不重扣。升级前旧预留任务的首次交付确认与定稿另段说明，避免混用新旧规则。
2. **赠额复核披露与实际入口一致**：隐私政策现为「免费额度申请 → 申请赠额」，请求提交固定 `REQUEST_NOTE`，没有用户补充文字输入；设备披露同步「账户 → 免费额度申请」入口。三份文档均原样复制，双向 SHA-256 登记已更新。
3. **移除与空值跳过冲突的截图**：删除 `products/table-flow/troubleshoot.md` 中引用 `web-fill-settings.png` 的 figure，以及本轮新增的 `public/assets/table-flow/troubleshoot/web-fill-settings.png`。保留准确操作步骤和三项设置表；保留 `settings-navigation.png`、`privacy-diagnostics.png` 两张截图。已读取源 `SettingsView.vue` 确认提示为「空白单元格会跳过；取消勾选请填写明确值」，未修改填充逻辑，也未重建扩展截图。

本次只同步三份镜像、更新登记和本记录、删除错误 figure 与对应 PNG；不变更结构化事实、内容 revision、夹具或下载快照，不运行 TableFlow 测试，不提交、推送或部署。

本次最终验证：

- `node scripts/content-drift.mjs`：通过，三份镜像均与当前源文件逐字节一致，登记双向 SHA-256 一致。
- `node scripts/content-lint.mjs`：通过，镜像登记、事实占位符与页面注册校验正常。
- `HUB_UPDATE_MANIFEST_BASE='file:///offline-cache-only/update.json' ./node_modules/.bin/vitepress build`：通过，客户端/服务端打包、页面渲染和 sitemap 生成成功，使用既有发布快照。
- 文件核对确认错误 PNG 在 `public/` 与最终站点产物中均不存在，排查文档不再引用该图，准确操作和设置表仍保留；另外两张截图的 SHA-256 未变。
- 核对结构化源、所有生成内容包/history、conformance 夹具和下载快照均未变，revision 保持 `content-9f58f3a7375c`。本次修改文件的 `git diff --check` 通过；未扩大运行其他测试。

## 本轮新增差异路径

以下相对于任务开始时的文件快照列出；此前已存在的其他修改未重写。三份镜像实际复制路径见上表。

- `CHANGELOG.md`
- `conformance/fixtures/facts-channel-variant.json`
- `conformance/fixtures/higher-schema-version.json`
- `conformance/fixtures/html-in-copy.json`
- `conformance/fixtures/network-failure.json`
- `conformance/fixtures/normal-table-flow.json`
- `conformance/fixtures/over-budget-summary.json`
- `conformance/fixtures/same-revision-no-refetch.json`
- `conformance/fixtures/sha-mismatch.json`
- `conformance/fixtures/unknown-enum-fallback.json`
- `conformance/fixtures/wrong-product.json`
- `data/generated/table-flow/content-latest.v1.json`
- `data/generated/table-flow/content.v1.json`
- `data/generated/table-flow/history/content-9f58f3a7375c.json`
- `data/mirrors.json`
- `products/table-flow/changelog.md`
- `products/table-flow/content.v1.source.json`
- `products/table-flow/faq.md`
- `products/table-flow/features.md`
- `products/table-flow/install.md`
- `products/table-flow/overview.md`
- `products/table-flow/pricing.md`
- `products/table-flow/quickstart.md`
- `products/table-flow/scope.md`
- `products/table-flow/troubleshoot.md`
- `products/table-flow/update.md`
- `products/table-flow/privacy.md`
- `products/table-flow/device-fingerprint.md`
- `products/table-flow/usage-guide.md`
- `docs/verification/table-flow-current-source-sync-2026-11-20.md`（本记录）
- `public/assets/table-flow/troubleshoot/web-fill-settings.png`（删除错误截图）
