---
order: 20
title: "快速上手"
shortTitle: "快速上手"
description: "从零跑起本机代理：装 Qoder CLI、拉源码、配 .env、起服务、接客户端、停止。"
---

# 快速上手

## 0. 前置

| 依赖 | 要求 |
|---|---|
| Node.js | 18 及以上 |
| 包管理 | pnpm（仓库 `package.json` 的 `packageManager` 字段锁了版本，按它装） |
| Qoder CLI | 必须，代理本身不含模型 |

装 Qoder CLI 并登录：

```bash
# 国内版
npm install -g @qodercn-ai/qoderclicn
# 或国际版
npm install -g @qoder-ai/qodercli

qodercli login
```

不想交互式登录也可以，改用 Personal Access Token（见[配置项](/qoder-proxy/config)）。

## 1. 取源码

```bash
git clone https://github.com/pikachuprogrammer01/qoder-proxy.git
cd qoder-proxy
pnpm install
```

## 2. 配一份 .env

```bash
cp .env.example .env
```

至少确认这两项：`CLI_BACKEND`（`cn` 或 `global`，决定调哪个 CLI）与 `PROXY_API_KEY`（客户端要带的那个 key）。全部可选项见[配置项](/qoder-proxy/config)。

## 3. 起服务

```bash
pnpm dev
```

默认监听 `127.0.0.1:3100`。控制台在 **<http://127.0.0.1:3100/ui>**。

Windows 下仓库带了 `start-proxy.cmd` / `start-ui.cmd`，会另开一个服务窗口；**关掉那个窗口就是停止服务**。

## 4. 接一个客户端

在客户端里填三项：

| 项 | 值 |
|---|---|
| Base URL | `http://127.0.0.1:3100/v1` |
| API Key | 你在 `.env` 里设的 `PROXY_API_KEY` |
| 模型 | 控制台 Models 页里列出的标识 |

Anthropic 协议的客户端（如 Claude Code）把 base URL 指到 `http://127.0.0.1:3100`，其余按各家文档。CC Switch 用户可以在控制台 Config 页用一键导入。

## 5. 验证通了

```bash
curl -s http://127.0.0.1:3100/health
```

再发一条真实消息：控制台的 Chat Test 页最直接（注意它是**非流式**的，看到一次性返回是正常的）。

## 6. 停止

前台运行按 Ctrl+C。没有后台守护进程，也没有开机自启——需要常驻就自己交给进程管理器。
