---
order: 20
title: "快速上手"
shortTitle: "快速上手"
description: "零依赖起服务、用内置演示站点练一遍录制链路、在沙箱里试而不动本机数据。"
---

# 快速上手

前置：<Fact product="automation" id="platform.os" /> + Node.js <Fact product="automation" id="platform.node" /> 及以上 + 系统 Chrome（登录与录制用的是系统浏览器，不额外下载浏览器内核）。

## 1. 只想起服务、看界面（零 npm 依赖）

```bash
mkdir -p var
cp manager/registry.example.json var/registry.json   # 首次：生成空的任务登记表
npm start                                            # 等价于 node manager/server.mjs
```

打开 `http://127.0.0.1:4765`。登记表是空的，界面会给"还没有任务 / 新建自动化"的引导。

本机已经有一个管理器占着这个端口时，换端口避免撞车：

```bash
AUTOMATION_MANAGER_PORT=4788 npm start
```

## 2. 先拿内置演示站点练一遍（不联网，不含任何真实站点）

`http://127.0.0.1:4765/demo/` 是随构建产物一起入库的本地假站点，带「立即签到 / 今日已签到」和「立即抽奖 / 已参与」，状态存在你自己浏览器的 localStorage，页面上有重置按钮。

界面右上「新建自动化」→ 网址填 `http://127.0.0.1:4765/demo/` → 依次走四步：

| 步骤 | 做什么 |
|---|---|
| ① 准备登录 | 需要登录的站点先在这个专属 Profile 里登一次 |
| ② 开始录制 | 用系统 Chrome 录一遍操作，生成 Playwright 脚本 |
| ③ 打开代码 | 可选：看生成出来的 `recorded.spec.js`，改判定标记 |
| ④ 可视化测试 | 跑一次，浏览器可见，确认脚本真的能重复 |

录制链路要装一次依赖：

```bash
cd manager && npm install
```

不装的话任务会以退出码 3 失败，日志里写 `playwright_cli_missing`——这是设计好的显式失败，不是静默跳过。

## 3. 想试改而不动本机数据：一个变量就够

`AUTOMATION_HOME` 指到哪，任务脚本、浏览器 Profile、日志和登记表 `registry.json` 就全都在哪——**同一个根**，不存在"设了一个漏了另一个，结果改到正在跑的生产登记表"这种坑。

```bash
mkdir -p /tmp/automation-trial/var
cp manager/registry.example.json /tmp/automation-trial/var/registry.json
AUTOMATION_HOME=/tmp/automation-trial/var AUTOMATION_MANAGER_PORT=4799 node manager/server.mjs
```

服务启动会把 `base=` 和 `registry=` 两行打进 stdout，**起完先看一眼**：两行都该落在你的沙箱里。

想连 LaunchAgent 和凭据都不碰到，再加一个假 `HOME`：

```bash
HOME=/tmp/automation-trial-home AUTOMATION_HOME=/tmp/automation-trial/var npm start
```

plist 路径、Chrome Profile 等都从 `$HOME` 推导，生产会话的 launchd 域不会被写入。

## 4. 要开机自启和崩溃自拉起

```bash
manager/install-launchagent --dry-run   # 先看要写什么，不落盘、不碰 launchd
manager/install-launchagent             # 生成并加载 ~/Library/LaunchAgents/…-manager.plist
```

日常入口是 `manager/open-manager`：健康就直接复用现有服务并打开页面，不健康才拉起。它以这个 plist 为配置真源，所以改端口、改标签都不用碰代码。

`--uninstall` 只注销并删掉 plist，**不动任务脚本、凭据和日志**。

至于每个任务自己的定时 plist，是在管理器界面里生成的（启用 / 修改时间 / 移除定时），不在安装器里。

## 5. 查运行历史与故障

每次运行都会往 `var/logs/runs/<日期>.jsonl` 落一条结构化记录，失败时同时把截图和页面文本留在 `var/logs/diagnostics/`。查它们不用翻日志：

```bash
manager/automation-log.mjs                       # 最近 20 次
manager/automation-log.mjs --failed --days 7     # 这周哪些失败了、为什么
manager/automation-log.mjs --task demo-a         # 单个任务历史（判断是不是偶发）
manager/automation-log.mjs --run <runId> --open  # 摊开一次运行并打开它的截图
manager/automation-log.mjs --stale               # 已启用但超时没有成功记录的任务
```

定时运行（launchd 触发）失败会弹 macOS 通知；**同一任务同一原因当天只提醒一次**。界面点击和终端手跑不弹通知，因为当场就能看到结果。
