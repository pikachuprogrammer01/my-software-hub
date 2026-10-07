---
order: 20
title: "安装与首次打开"
shortTitle: "安装与首次打开"
description: "系统要求、下载渠道、macOS 首次被 Gatekeeper 拦住的解决办法、Windows SmartScreen 提示。"
---

# 安装与首次打开

## 系统要求

| 平台 | 要求 | 说明 |
|---|---|---|
| macOS | <Fact product="wps-enhancer" id="platform.macosMin" suffix=" 及以上" /> | <Fact product="wps-enhancer" id="platform.macosArch" />；Intel Mac 暂无可用安装包 |
| Windows | 64 位（x86_64） | 本站提供免安装 ZIP，解压后运行 |
| WPS Office | **不需要** | 它只读写表格文件，不依赖 WPS 进程，也不需要登录 WPS |

## 下载

两个来源提供同一批发版产物，下面按平台列出直链按钮。按钮全部下载 ZIP 压缩包，网络不通时可切换另一个来源。

<WpsDownloadButtons />

## macOS：首次打开

解压后得到的应用包名是 `wps-enhancer-go.app`，在访达与 Dock 里显示的名字是「WPS 增强工具」——同一个程序的两个名字，不是两个版本。

这个包**用 ad-hoc 签名、未做 Apple 公证**，所以首次打开一定会被 Gatekeeper 拦住。按下面顺序做：

1. 把 `wps-enhancer-go.app` 拖进「应用程序」文件夹。
2. 双击它 → 会弹出「无法打开，因为无法验证开发者」。先点完成，**这一步的作用是把应用登记到系统设置的拦截列表里**。
3. 打开 **系统设置 → 隐私与安全性**，向下滚动到「安全性」区域，会看到一条关于「WPS 增强工具」已被阻止的提示，点右侧的 **「仍要打开」**，按提示输入登录密码。
4. 回到启动台再双击一次，这次会正常启动，之后不再询问。

> macOS 15 起，苹果移除了「右键 → 打开」这条绕过路径，老教程里的做法在新系统上不管用，只能走上面第 3 步。

如果你更习惯用命令行，也可以直接去掉隔离属性（等价于第 2–4 步）：

```bash
xattr -dr com.apple.quarantine /Applications/wps-enhancer-go.app
```

## Windows：首次打开

ZIP 内的程序**没有代码签名证书**。解压后首次运行可能会看到蓝色的 SmartScreen 提示：

1. 点提示页上的 **「更多信息」**，再点 **「仍要运行」**。
2. 如果浏览器或 Windows 对 ZIP 提示拦截，改用 PowerShell 拉取并解除隔离：

```powershell
$url = "<对应平台 ZIP 按钮中的地址>"
$out = "$env:USERPROFILE\Downloads\WPSEnhancer-windows-x86_64.zip"
Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
Unblock-File $out
```

## 验证装好了

启动后首页只有一个功能卡片「批量导入通讯录」，以及一个提示「功能待加入」的 Word 标签——看到这两个就说明版本正确。

## 卸载

应用内置卸载向导：**设置 → 关于 → 卸载**。模板与设置等用户数据默认保留，需要自己勾选才会删除。
