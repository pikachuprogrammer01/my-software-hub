---
order: 10
title: "它是什么、不是什么"
shortTitle: "它是什么"
description: "Qoder Proxy 的定位：本机回环地址上的协议适配层，以及它明确不是的东西。"
---

# 它是什么、不是什么

## 一句话

在本机的回环地址上起一个 HTTP 服务，把 **OpenAI / Anthropic / Responses 三种协议格式**的请求翻译成 Qoder CLI 调用，再把 CLI 的输出翻译回流式响应。这样那些"只认 OpenAI 兼容接口"的客户端就能直接用上 Qoder 的模型。

```text
支持自定义 base URL 的客户端  →  127.0.0.1:3100  →  Qoder CLI  →  qoder.com / qoder.com.cn
```

## 三套协议面

| 协议 | 端点 |
|---|---|
| OpenAI Chat Completions | `/v1/chat/completions` |
| OpenAI Responses（Codex 用的那套） | `/v1/responses` |
| Anthropic Messages | `/v1/messages`、`/v1/messages/count_tokens` |

base URL 拼错一层的情况有路径别名兜底，不会因为多写了一个 `/v1` 就全线 404。

## 能接哪些客户端

- 任何允许自定义 base URL 与模型名的 OpenAI 兼容客户端。
- Codex CLI / Codex IDE 插件（Responses 协议，控制台可直接复制模型目录）。
- Claude Code 及其他 Anthropic 协议客户端。
- OpenCode（仓库里带了现成的 `opencode.json`）。
- CC Switch：控制台提供一键导入与深链。

## 本地控制台

服务起起来后，浏览器打开 `http://127.0.0.1:3100/ui`，五个页签：

| 页签 | 能做什么 |
|---|---|
| Dashboard | 看接口面与接入方式 |
| Models | 看当前可用的模型标识 |
| Chat Test | 直接发一条消息看回包（**非流式**） |
| Config | 改 API Key、看配置片段 |
| Usage / Credits | 看本机累计的用量估算，可清零 |

界面支持中/英与明暗主题。

## 模型与推理强度

模型标识分两类：基础标识，以及带推理强度（reasoning effort）的别名。传一个它认不出来的模型名**不会报错**，会回落到默认路由——这对"接进来能不能用"友好，对"我到底用的是哪个模型"不友好，所以调试时请看 Models 页而不是猜。

## 它明确不是

| 不是 | 事实是 |
|---|---|
| 官方 API | 它是第三方适配层，模型能力与配额由 Qoder 侧决定 |
| 原生 function calling | 工具调用靠提示词注入 + 文本解析，模型输出不合规时会降级成纯文本 |
| 多用户 / 公网服务 | 设计目标是本机自用，控制台与接口都不该暴露到公网 |
| 配额查询工具 | 用量是**本机按字符长度估算**的，官方配额读数没有实现 |
| 更新过的隔离沙箱 | CLI 子进程读取的是你本机的登录态目录，不做 HOME 隔离 |

## 使用前提与责任

你需要**合法持有自己的 Qoder 账号或 Personal Access Token**，请求消耗记在你自己账上。请不要把它部署成公开服务或多人共享的网关。
