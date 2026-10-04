# 内容一致性与软件内分发流水线

这是本仓库的执行说明。内容主源在 `products/<id>/content.v1.source.json`，生成包在 `data/generated/<id>/`。当前仓库只负责生成、校验和站点消费；真实发布仓写入仍需由发布 CI 适配器执行。

## 站点形态（2026-10-04 定）

纯静态站点，无常驻后端。公开页面由构建产物对外托管；客户端读发布仓的内容包；提案与审核走文件队列
（`node scripts/proposal-validate.mjs <文件>`）或 Issue。曾实现过的手机服务（Hono + SQLite + Termux
部署链）已整体撤回，决策与恢复方式见 [PHONE-RUNTIME.md](./PHONE-RUNTIME.md)。

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

提案格式见 `schema/proposal.v1.json`。没有后端之后，提案就是**离线文件交接**：客户端或你自己写一个 JSON，先校验，再人工按受控变更进入站点仓。

```bash
node scripts/proposal-validate.mjs path/to/proposal.json   # 校 schema、产品已知、facts 禁渠道变体
```

批准后改 `products/<id>/content.v1.source.json`，再依次跑 `content:validate` → `content:build` → `content:drift`。
发布仓写入由电脑侧适配器 `scripts/content-publish.mjs` 承担，**默认 dry-run**。客户端不得携带 Git 写入凭证，也不得直接移动 `latest`。

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
