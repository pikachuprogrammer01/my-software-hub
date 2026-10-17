---
order: 20
title: "安装与加载"
shortTitle: "安装与加载"
description: "Edge 商店、Chrome 商店与压缩包三条安装通道、环境要求、验证安装与权限说明。"
---

# 安装与加载

> 来源：`table-flow/docs/USAGE_GUIDE.md` 安装与加载 + `README.md` 加载插件 + `docs/BROWSER_BUILD_RELEASE_MATRIX.md` §1.1。
> 本页已把主源里的"clone 源码 + 自行构建"改写为面向普通用户的下载安装路径。

<ReleaseInfo />

## 三条获取通道

| 通道 | 适用 | 更新方式 |
|------|------|----------|
| **Chrome 应用商店** | Chrome 用户（首选） | 浏览器自动更新，无需任何操作 · [商店页面](https://chromewebstore.google.com/detail/tableflow/cgliggkiiecdmideilajldhdmhpaiepj) |
| **Edge Add-ons 商店** | Edge 用户 | 浏览器自动更新，无需任何操作 · [商店页面](https://microsoftedge.microsoft.com/addons/detail/tableflow/iedocnmbkmhoeccfdoilabeffkncbhmn) |
| **压缩包（免费）** | 其他 Chromium 内核浏览器（360 极速等） | 应用内检测新版本 + 手动解压覆盖（[详见 update.md](./update.md)） |

> 商店版与压缩包版功能一致；360 极速等其余 Chromium 内核浏览器暂未上架，走压缩包通道。

## 环境要求

- Chromium 内核浏览器：Chrome / Edge / 360 极速等
- Manifest V3 扩展；MV3 隐含下限约 Chrome/Edge 88+（本项目 manifest 未声明 `minimum_chrome_version`）
- 商店版点击「获取 / 添加至 Chrome」即完成安装；只有**压缩包版**需要开启「开发者模式」加载

## 安装步骤（压缩包版）

1. 下载最新版压缩包 `table-flow-v<版本>.zip`（站点只提供最新版；上方按钮与扩展内「查看更新」指向同一地址）
2. **解压到一个固定目录**（后续更新也在这个目录覆盖，不要临时放桌面再删）
3. 地址栏输入 `chrome://extensions/` 回车
4. 开启右上角「开发者模式」
5. 点击「加载已解压的扩展程序」，选择第 2 步的解压目录

## 验证安装

- 浏览器工具栏出现 TableFlow 图标
- 打开任意包含表格的网页，点击图标弹出浮动操作面板
- 面板中显示该页面的表格列表

## 更新与重载

- **压缩包用户**：下载新 zip → 覆盖解压到同一目录 → 回 `chrome://extensions/` 点击 TableFlow 卡片上的刷新图标（⟳）
- 若扩展刚升级而页面未刷新，面板会明确提示并支持一键刷新页面

## 关于权限

扩展使用的权限：`storage`、`scripting`、`activeTab`、`tabs`、`identity`、`identity.email`，主机权限 `<all_urls>` 与 `file:///*`，以及授权服务器域名（license.pikachu01.me）的定点主机权限。

- `identity` / `identity.email` 只用于读取当前 Chrome 账号邮箱并在**本地**计算哈希，让同一账号下的免费额度跨卸载重装保持连续；原始邮箱不出网、不落盘、不进日志，未登录 Chrome 时自动降级、不影响其他能力。
- 扩展**不申请** `cookies` 权限，不读取、不解析、也不修改任何 Cookie 的内容。

每项权限的用途说明见[隐私政策](/table-flow/privacy) §5。

> 提醒：主机权限为 `<all_urls>` 时，商店审核对"单一用途"表述很敏感，站点与商店文案保持一致，不要写成"任意网页增强工具"。
