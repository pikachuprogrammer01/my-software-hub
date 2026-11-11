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
- Manifest V3 扩展，manifest 下限为 Chrome 103；Chrome 103 / 109 与 Edge 109 是兼容目标。其他浏览器须核对实际 Chromium 内核与扩展 API。
- 真实 Win7 环境尚未完成验收；构建目标兼容不等于已经通过真机验证。
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

访问本地 HTML 文件时，还需打开浏览器的 TableFlow 扩展详情，手动允许「访问文件网址」；文件主机权限不会替你打开这个开关。

## 更新与重载

- **压缩包用户**：下载新 zip → 覆盖解压到同一目录 → 回 `chrome://extensions/` 点击 TableFlow 卡片上的刷新图标（⟳）
- 若扩展刚升级而页面未刷新，面板会明确提示并支持一键刷新页面

## 关于权限

扩展使用的权限：`storage`、`scripting`、`activeTab`、`tabs`、`identity`、`identity.email`，主机权限 `<all_urls>` 与 `file:///*`，以及授权服务器域名（license.pikachu01.me）的定点主机权限。

- `identity` / `identity.email` 只用于**注册及需要刷新设备风险观察时读取**当前已登录的浏览器账号标识（Chrome 账号，或 Edge 的 Microsoft 账户 / 云端 Entra ID），在**本地**计算 SHA-256 后作为可选字段随注册请求发送，用于反滥用风险观察，不能恢复、合并或认领旧额度账本；优先用账号 id（改邮箱也不变），id 为空才用邮箱。原始 id / 邮箱不出网、不落盘、不进日志，服务端只保存加盐二次哈希；未登录或未授权时自动降级、不影响其他能力。
- 扩展**不申请** `cookies` 权限，不读取或修改 Cookie；授权服务器在自己域下签发强恢复 Cookie，由浏览器随授权请求自动携带。恢复旧额度还可使用扩展保存的有效访问令牌或恢复凭据；账号和指纹不能替代它们。

每项权限的用途说明见[隐私政策](/table-flow/privacy) §5。

> 提醒：主机权限为 `<all_urls>` 时，商店审核对"单一用途"表述很敏感，站点与商店文案保持一致，不要写成"任意网页增强工具"。

## Chrome 提示不受信任

若扩展管理页显示「增强型安全浏览功能不信任此扩展程序」，表示 Google 当前未将扩展列入该功能的信任名单；商店审核通过与这份名单是两项判断。版本更新本身不能证明导致提示的原因，扩展也没有可自行移除提示的配置。可核对官方商店来源、扩展 ID 和权限，再按浏览器提示决定是否启用。详见[常见问题](/table-flow/faq#chrome-信任提示)与 [Chrome 官方说明](https://support.google.com/chrome?p=cws_enhanced_safe_browsing)。
