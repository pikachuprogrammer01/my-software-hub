# 内容一致性与软件内分发流水线

这是本仓库的执行说明。内容主源在 `products/<id>/content.v1.source.json`，生成包在 `data/generated/<id>/`。当前仓库只负责生成、校验和站点消费；真实发布仓写入仍需由发布 CI 适配器执行。

## 后续运行环境（v2）

站点计划由 Android 手机上的 Termux 实际托管 HTTP 服务，而非仅供手机浏览。完整规范见 [PHONE-RUNTIME.md](./PHONE-RUNTIME.md)，执行提示词与验收清单同步采用该规范。设备系统尚未确认；不能将 Android 方案当作 iPhone 已可运行。

构建在电脑/CI 完成；手机运行 Node.js + Hono 提供静态产物、提案 API 和 SQLite/Drizzle 状态存储。手机部署不依赖 Docker、VitePress dev/preview 或常规启动时构建。SQLite 只保存提案/审计，产品内容仍经站点仓和发布仓流转。JSON 提案目录在新增后端后仅用于导入/导出。

当前仓库尚未实现上述服务、迁移及手机部署脚本；不能将此说明当作完成记录。公共内容包继续由发布仓分发，手机不可用不应阻断已有客户端读取。6 小时检查目标仅适用于正常运行且联网的客户端。

## 日常修改

1. 修改对应产品的结构化内容源。
2. 运行 `node scripts/content-validate.mjs`。
3. 运行 `node scripts/content-build.mjs`。
4. 运行 `node scripts/content-drift.mjs`。
5. 运行 `./node_modules/.bin/vitepress build`。
6. 检查生成的 `data/generated/<id>/content-latest.v1.json`。

`pnpm content:validate`、`pnpm content:build` 和 `pnpm content:drift` 是相同操作的快捷入口。若本机 pnpm store 不可用，直接使用上面的 Node/VitePress 命令。

## 内容规则

- `facts` 只有共享事实；每个事实必须有 `effectiveFromVersion`。
- `copy` 是用户可见文案；渠道变体只能出现在 `copy.*.variants`。
- 不写 HTML、颜色、图标或布局字段。
- 不把价格、版本、功能状态复制到 Markdown、组件或客户端代码中。
- 内容包使用 `contentRevision` 和 SHA-256；时间变化不会造成语义漂移。

## 生成与回滚

`content-build.mjs` 为每个已接入产品生成不可变 history revision、`content.v1.json` 和 `content-latest.v1.json`。默认的 `content:publish` 只做 dry-run，不会写外部发布仓。

回滚已生成的 revision：

```bash
node scripts/content-rollback.mjs \
  --product=table-flow \
  --revision=content-3ddedc454921
```

回滚只移动本地 `latest` 文件，不删除历史 revision。

## 软件端提案

提案格式见 `schema/proposal.v1.json`。当前只实现文件校验：

```bash
node scripts/proposal-validate.mjs path/to/proposal.json
```

软件端 API、身份认证和发布仓写入必须在独立服务/CI 适配器中实现。客户端不得携带 Git 写入凭证，也不得直接移动 `latest`。

## 验证

```bash
node scripts/test-content.mjs
node scripts/validate-contract.mjs
node scripts/content-validate.mjs
node scripts/content-build.mjs
node scripts/content-drift.mjs
./node_modules/.bin/vitepress build
```

单产品内容损坏不得阻断其他产品；当前尚无结构化源的 manual 产品会被明确跳过，不能被当作已接入。
