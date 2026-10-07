---
order: 30
title: "配置项"
shortTitle: "配置项"
description: "环境变量的作用与默认值、数据根与隔离、launchd 标签，以及前端构建产物的同步要求。"
---

# 配置项

全部通过环境变量配置，没有配置文件形式的开关（登记表 `registry.json` 是数据，不是配置）。

## 环境变量

| 变量 | 默认值 | 作用 |
|---|---|---|
| `AUTOMATION_MANAGER_PORT` | <Fact product="automation" id="config.port" /> | 监听端口，**只绑回环地址** |
| `AUTOMATION_HOME` | 仓根的 `var/` | 数据根：`tasks/`、`logs/`、`browser-data/`、`registry.json` 全在这里 |
| `AUTOMATION_MANAGER_REGISTRY` | `$AUTOMATION_HOME/registry.json` | 单独指定登记表位置。默认跟着 `AUTOMATION_HOME` 走，隔离时不必设 |
| `AUTOMATION_LAUNCH_LABEL_PREFIX` | `com.pikachu.automation` | 新建任务的 launchd 标签前缀。**只影响新建**，已登记任务沿用各自存下的 `launchLabel` |
| `NODE_BIN` | 自动探测 | 子脚本用哪个 node（管理器会自动传入自己这个） |
| `PW_HEADLESS` | 非 `0` 即无头 | 「可视化测试」时设 `0` 让浏览器可见 |
| `AUTOMATION_OSASCRIPT` | `/usr/bin/osascript` | 提醒走的命令。测试里指向垫片即可避免弹真实通知，日常不用设 |
| `AUTOMATION_LAUNCHCTL` | `/bin/launchctl` | 同上，测试用垫片挡住真实 launchd 域 |
| `AUTOMATION_PLUTIL` | `/usr/bin/plutil` | 同上，plist 语法校验用的命令 |

后三个是**注入点**：它们存在的意义就是让测试不必真的碰 launchd、真的弹通知、真的改系统配置。

## 数据落在哪里

| 路径 | 作用 | 敏感吗 |
|---|---|---|
| `var/registry.json` | 任务登记表：站点 URL、账号别名、排期、launchd 标签 | 含站点与别名，不入库 |
| `var/tasks/<任务 ID>/` | 每个录制任务的 `recorded.spec.js` / `playwright.config.mjs` / `auth.json` | `auth.json` 是登录态，权限 0600 |
| `var/logs/runs/<日期>.jsonl` | 每次运行一条结构化记录 | 否 |
| `var/logs/diagnostics/` | 失败取证的截图与页面文本 | 截图可能拍到页面内容，自己按需清理 |
| `var/browser-data/` | Chrome Profile，含 Cookies 与 Local Storage | 是，等同登录态 |

`private/`（你自己的站点适配层）与 `var/` 都由**入库的** `.gitignore` 整棵排除，克隆下来是空的。

## 前端构建产物

`manager/public/` 是构建产物且**已入库**，好处是克隆下来直接能跑、起服务零依赖。代价是：改了 `manager/web/src/` 之后必须重新构建——

```bash
npm install --prefix manager/web    # 首次
npm run build                       # 产出到 manager/public/
npm run dev                         # 或者本地开发：另一个端口，带 /api 代理
```

忘了构建不会报错，只会让界面与后端**静默失同步**，所以 `npm run check` 里专门有一项 `check:artifact` 用 `git diff` 盯这件事。

## 测试与门禁

```bash
npm run check         # 交付前跑这一个：门禁 + 构建产物一致性
npm test              # 全部用例，不装任何依赖
npm run test:coverage # 带每文件覆盖率报告
```

测试分四层：纯逻辑（状态与原因词表、可移植路径、plist 生成与转义、记录读写）、API 契约（入参校验矩阵、错误码、409 并发、403 跨站、413/422/503）、生命周期（建→定时→运行→暂停→启用→移除→删除全链路）、故障注入（强杀后锁接管、连接被拒、500、挂站超时、DNS 失败、只读目录）。

两点口径值得知道：覆盖率门禁**只统计纯逻辑层**，不把 `server.mjs` 和压缩后的前端 bundle 算进分母——副作用层由契约层与生命周期层从外部压行为；网络异常与强杀接管两类用例需要 `cd manager && npm install`，否则自动 skip。
