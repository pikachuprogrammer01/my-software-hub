# 部署：Cloudflare Pages + `hub.pikachu01.me`

> 纯静态产物，托管只需要"能发 html + 能绑域名"。本文记录已定的方案与执行清单。
> 没有后端、没有数据库、没有密钥：Pages 项目里不需要配任何 Secret。

## 已定结论

- 托管 Cloudflare Pages，**Git 集成**：push 到 `main` 自动构建发布，其它分支自动出预览域名。
- 门户挂子域 **`hub.pikachu01.me`**，DNS 留在阿里云解析，不做 nameserver 迁移。
- `base` 保持默认 `/`，`cleanUrls: true` 保留。Pages 对 `features.html` 同时服务 `/features`，
  并把 `/features.html` 301 到 `/features`；GitHub Pages 没有这层重写，`/features` 会直接 404 —— 这是不选它托管的技术原因。
- 已随之补上 `sitemap: { hostname: ... }`（不填 VitePress 不产出 `sitemap.xml`）与 `public/robots.txt`。
  **换域名只改这两处。**

## 部署执行顺序

【你】= 需要你的 Cloudflare / 阿里云账号登录态；【我】= 我可以代跑的部分。

1. 【我】把本轮改动提交并 push 到 `main`（`DEPLOY.md`、`public/robots.txt`、config 的 `sitemap` 与不发布名单、
   README 一行、`pnpm-workspace.yaml` 的 `packages:`）。没 push 之前 Pages 构建不到这些内容。
2. 【你】Cloudflare 控制台 → Workers & Pages（新版可能写作 Compute）→ Create application → 选 **Pages** → **Connect to Git**，
   首次会要求安装 Cloudflare 的 GitHub App，仓库范围选 **Only select repositories** 里的 `my-software-hub`。
   项目名会决定 `<项目名>.pages.dev`，建议就叫 `my-software-hub`。
3. 【你】构建参数照抄：

   | 项 | 值 |
   |---|---|
   | Production branch | `main` |
   | Root directory | 留空 |
   | Framework preset | **None**（选 VitePress 预设会自动填成裸 `vitepress build`，绕开前置校验） |
   | Install command | `pnpm install --frozen-lockfile` |
   | Building command | `pnpm build` |
   | Output directory | `.vitepress/dist` |
   | Environment variables | 不需要。首跑日志实测构建机给的是 `nodejs@24.18.0`，与本机一致 |

   构建机解析工作区配置用的是 pnpm 9 那一套语义，`pnpm-workspace.yaml` 少了 `packages:` 就会
   `packages field missing or empty` 退出（首跑即死在这）；字段为什么不能删，写在那个文件的注释里。
   已实测 pnpm 9.15.9 / 10.11.1 / 11.25.0 三个大版本 install + build 全绿。
   pnpm 10 会打 "Ignored build scripts: esbuild" 警告，无害——那样装出来的 `node_modules` 实测构建成功，
   本仓依赖（vitepress + ajv）不需要原生编译，不要为此加东西。`packageManager` 字段同样不必钉。
4. 【你】Save and Deploy，等构建结束。**构建红了就不要去改命令绕过**，把日志给我，那是契约自检或死链校验在拦。
5. 【我】先验 `https://my-software-hub.pages.dev`：按文末「验证清单」逐条跑一遍，把域名换成 pages.dev。
6. 【你】项目 → Custom domains → 加 `hub.pikachu01.me`。因为解析不在 Cloudflare，CF 会给出一条**域名归属验证 TXT**，
   形如主机记录 `_cf-custom-hostname.hub`（有的面板写成 `_cf-custom-hostname.hub.pikachu01.me`）、值为 CF 给的串。
   若面板同时提供"把域名加入 Cloudflare / 迁移 nameserver"，**不要选**，我们要把解析留在阿里云。
7. 【你】阿里云控制台 → 域名 → 云解析 `pikachu01.me` → 添加记录，两条，都不动根域：

   | 记录类型 | 主机记录 | 记录值 | TTL |
   |---|---|---|---|
   | TXT | `_cf-custom-hostname.hub` | CF 给的校验串 | 默认 |
   | CNAME | `hub` | `my-software-hub.pages.dev` | 10 分钟 |

   根域那条指向 Vercel 的 A 记录**一个字都不要碰**，那是你的 profile 站。
8. 【我】用 DoH 确认解析真的生效（本机 `dig` 走 fake-IP 代理，结果不可信）：
   `curl -s -H 'accept: application/dns-json' "https://cloudflare-dns.com/dns-query?name=hub.pikachu01.me&type=CNAME"`。
9. 【你+我】回到 CF 的 Custom domains 等状态从 Pending 变 Active（CF 自动签发 Universal SSL 证书），
   然后我按「验证清单」用真实域名再跑一遍。
10. 【我】查一次强制 HTTPS：`curl -I http://hub.pikachu01.me/features`。若返回 200 而不是 301，
    说明这条路径上没有 zone 级的 Always Use HTTPS 开关可用（解析不在 CF 时很常见），再决定用 Cloudflare Rules 补跳转。
    不要凭面板默认值假设跳转已经生效。
11. 【你】关 Wi-Fi 用国内蜂窝网络打开一次站点。这一步只能你做，我这边出口在美国。
12. 【可选】搜索引擎后台提交 `https://hub.pikachu01.me/sitemap.xml`。

之后日常：改 md → push `main` 自动上线；其它分支自动出预览域名；回滚在 Deployments 里选历史部署。

## 为什么门户不占根域

`pikachu01.me` 的 A 记录当前指向 Vercel，根域上是你在跑的 profile 站；域名上没有 MX/TXT，所以没有邮箱依赖。
门户因此走子域，不碰根域记录。

## 发布路线的代价（已经付掉的）

- **Pages 项目类型不可逆**：以 Git 集成建好的项目不能改成 Direct Upload。
- `REQUIREMENTS.md` 的非目标里写着「自动部署/CI」，与 Git 集成正面冲突。要么把那一条收窄成
  「不建部署平台、不做多环境流水线与发布编排」，要么改回手动上传。这条改文档需要你点头，未获同意前我不动它。
- 换来的是：`pnpm build` 前置契约自检与产物死链校验，任一项不过就构建失败、发布不出去。
  线不会出一个坏链接页，也不会出现"仓库比线上新"。别在 Pages 后台把它换成裸 `vitepress build` 绕过守卫。

## 版本事实的残留风险

首页版本号与下载直链在**构建时**从发布仓 `update.json` 拉取，写回 `.vitepress/release.json`（快照已提交进仓库）。
Pages 构建机在境外，拉 gitee raw 正常；万一拉不到，既有逻辑是明确告警并沿用仓库快照，
于是首页可能显示上一次提交的版本而不是最新发布版本。

两条守卫：发布后 curl 首页比对版本号；日常验证用 `pnpm validate --strict`（线上真值分叉即失败），
不要把它塞进发布流程做第二轮判断。

## 验证清单（上线后逐条实跑）

- `curl -I https://hub.pikachu01.me/features` → 200，证明无扩展名路由成立
- `curl -I https://hub.pikachu01.me/assets/icon.png` → 200，证明资源根与 `base` 对得上
- `curl -s https://hub.pikachu01.me/sitemap.xml` → 存在且每条 loc 都是 `https://hub.pikachu01.me/...`
- 首页版本号 == 发布仓线上 `update.json` 的版本
- 遍历 sitemap 全部链接，无 404
- 内部文档不外泄：`/DEPLOY.html`、`/README.html` 必须 404
- 国内可达性：**本机测不准**。这台 Mac 出口在美国（fake-IP 代理，`dig` 拿到的地址是假的），
  必须从国内蜂窝网络实测，或用多省多运营商拨测平台过一遍。

## 回滚

Pages 项目 Deployments 里选历史部署回滚，或把 production 别名指回上一份产物。
本仓是文案唯一来源，回滚语义就是回到上一版 md，不需要额外准备回滚脚本。
