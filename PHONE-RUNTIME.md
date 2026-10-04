# 手机作为站点服务器：已废弃（决策记录）

> 状态：**已废弃，2026-10-04 由你决定撤回**。本仓库是纯静态站点，没有常驻后端。
> 保留这份文件只为记下"为什么走过这条路、又为什么收回来"，避免以后重新发明一遍。

## 当初要解决什么

让手机（Android + Termux）实际运行 HTTP 服务：提供已构建的 VitePress 页面、提案 API、
SQLite 存储的提案与审计，站点仓仍是文案主源、发布仓仍是版本事实与内容包分发面。

## 做到哪一步了

代码与电脑验证全部完成过：Hono 提供静态面 + `/health` + 提案 API（认证边界、限流、
幂等键、字段级冲突检测、审计同事务落库），Drizzle + SQLite 迁移与在线备份，
Termux 侧 `hubctl install/start/stop/status/logs/backup/restore/rollback`，
部署包带逐文件 SHA-256 清单。测试计数：API 28 项、部署演练 19 项、提案处理器 8 项。
**Android 实机始终未验证**（当时手上没有设备）。

## 为什么收回

1. 公众可用性被绑在一块电池上：手机在 CGNAT 后、会被系统冻结、没有固定公网地址。
2. 内容分发本来就不需要后端——客户端读发布仓，公开页面读静态托管，两者都已覆盖。
3. 真正需要常驻后端的只有"收提案"和"按身份签发私密内容"两件事；前者可以用文件队列/Issue 闭环，
   后者当时还没有确定要做。
4. 多一套自托管服务就多一份长期维护面，与"五个产品、一个人维护"的现实不匹配。

## 要恢复怎么办

```bash
git checkout pre-static-only -- server migrations deploy api schema/proposal-envelope.v1.json \
  scripts/test-api.mjs scripts/test-deploy.mjs scripts/test-proposal-review.mjs \
  scripts/proposal-review.mjs scripts/export-openapi.mjs ANDROID-DEPLOY.md
```

那份标签下还包含配套的依赖、`pnpm verify:full` 全链演练与客户端提案 API 契约章节。
