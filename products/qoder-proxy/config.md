---
order: 30
title: "配置项"
shortTitle: "配置项"
description: ".env 全部可配置项、默认值、安全边界，以及控制台里能改什么。"
---

# 配置项

配置读的是**项目根目录的 `.env`**（可用 `PROXY_ENV_FILE` 指向别处）。改完要重启服务生效。

## 监听与鉴权

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | <Fact product="qoder-proxy" id="config.port" /> | 代理与控制台共用同一个端口 |
| `HOST` | <Fact product="qoder-proxy" id="config.host" /> | 只监听回环地址是推荐值。设成 `0.0.0.0` 会让局域网内其他机器也能用你的代理，此时**必须**同时设 `PROXY_API_KEY` |
| `PROXY_API_KEY` | 空 | 空值等于**不鉴权**：本机任意进程都能通过它消耗你的 Qoder 配额。强烈建议设置 |
| `PROXY_ENV_FILE` | `.env` | 指定配置文件路径 |

鉴权方式是把 key 放在 `Authorization: Bearer <key>` 或 `x-api-key: <key>` 里，作用于 `/v1/*` 与 `/usage/*`。

## CLI 后端

| 变量 | 默认 | 说明 |
|---|---|---|
| `CLI_BACKEND` | `cn` | `cn` 走 qoderclicn，`global` 走 qodercli |
| `CLI_COMMAND` / `QODERCN_CLI_PATH` | 自动探测 | 探测不到或装了多份时才需要手填 |
| `QODERCN_PERSONAL_ACCESS_TOKEN` | — | 国内版令牌；用 `qodercli login` 的交互登录时不需要 |
| `QODER_PAT` | — | 国际版令牌；官方登录会把会话写在 `~/.qoder`，走登录流程就留空 |

## 生成参数

| 变量 | 说明 |
|---|---|
| `QODERCN_REASONING_EFFORT` | 推理强度；也可以直接用带强度后缀的模型别名 |
| `QODERCN_CONTEXT_WINDOW` | 上下文窗口 |
| `QODERCN_MAX_OUTPUT_TOKENS` | 单次输出上限 |
| `QODERCN_TIMEOUT_MS` | 单个请求的超时。示例文件给的是 600000，不写这项时代码默认 300000。重活（带工具描述的 agent 提示）几分钟很正常，别调太小 |
| `QODERCN_CLI_TOOLS` | 置 `1` 保留 CLI 自带的工具。默认关闭，否则一条普通聊天可能在代理自己的目录里跑文件与 shell 循环 |

## 跨域与主机头

浏览器发起的请求默认只接受**回环来源的 origin** 与**回环 Host**。

| 变量 | 用途 |
|---|---|
| `ALLOWED_ORIGINS` | 放行另一个本机端口的网页应用，如 `http://localhost:5173` |
| `ALLOWED_HOSTS` | 只有你刻意用别的主机名访问时才需要。**留空正是防 DNS rebinding 的那道闸** |

## 服务端工具执行（默认全关）

打开后，模型发出的工具调用会**在你这台机器上执行**，而提示词是客户端传来的——把它当成实验特性。

| 变量 | 说明 |
|---|---|
| `SERVER_TOOL_EXECUTION` | `1` 才开启。关闭时工具调用原样返回给客户端，由 OpenCode / Cline / Trae 这类 agent 客户端在自己的工作区执行 |
| `SERVER_TOOL_WORKSPACE` | Read/Write/Edit/Glob/Grep/Bash 被限制在哪个目录，默认代理的工作目录，目录外的路径直接拒绝 |
| `SERVER_TOOL_ALLOW_BASH` | Bash 工具的额外开关，需与下面的白名单同时设置 |
| `SERVER_TOOL_BASH_ALLOWLIST` | 允许执行的可执行程序名（逗号分隔），留空表示一个都不许跑。不经 shell，因此管道、命令链、重定向、变量替换都会被拒 |

## 控制台里能改的东西

- **Config 页**可以直接改 `PROXY_API_KEY`（写回 `.env`）。
- 这一页**不受 `PROXY_API_KEY` 保护**，并且会把当前 key 以明文回显——设计上的理由是"否则改错 key 会把 UI 自己锁死"。
- 由此推论：**不要把这台机器的 3100 端口暴露到任何不可信网络**，也不要给本机控制台开远程端口转发。
- Usage 页的清零按钮会重置本机累计估算值，不可撤销。
