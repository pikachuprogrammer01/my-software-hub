---
order: 20
title: "安装与辅助功能授权"
shortTitle: "安装与授权"
description: "选对芯片的压缩包、校验下载、绕过未公证提示、授予辅助功能权限，以及更新要怎么拿。"
---

# 安装与辅助功能授权

## 1. 选对压缩包

判断方法：**苹果菜单** → 关于本机 → 芯片。

| 机型 | 下载 |
|---|---|
| Apple Silicon（M 系列） | `Auto-Clicker-*-arm64.zip` |
| Intel | `Auto-Clicker-*-intel.zip` |

两个包分别构建，**不是 universal 包**，装错芯片的那一个不会报错，但可能被 Rosetta 拖慢或行为异常。

下载地址：下面的 Gitee 镜像与 GitHub ZIP 按钮。Gitee 镜像使用已同步到当前版本 tag 的同一安装包，避免 Gitee Raw 下载时跳转登录；GitHub 作为备用来源。

<AutoClickerDownloadButtons />

## 2. 校验下载（可选但建议）

每个压缩包旁边都放了一个同名 `.sha256` 文件。注意里面记录的是**打包时的路径**（`dist/...`），不是你下载到的文件名，所以直接 `shasum -a 256 -c` 会报"找不到文件"。正确做法是比对哈希值本身：

```bash
shasum -a 256 ~/Downloads/Auto-Clicker-*-arm64.zip
```

把输出前 64 位与 `.sha256` 文件里的那串对上即可。

## 3. 首次打开：会被拦，这是预期行为

这个包**用 ad-hoc 签名、未做 Apple 公证**，macOS 一定会拦你一次。

1. 解压，把 `Auto Clicker.app` 拖进「应用程序」。
2. 双击 → 提示无法验证开发者 / 已损坏。先点完成，让系统把这次拦截登记进设置。
3. 打开 **系统设置 → 隐私与安全性**，向下到「安全性」区域，会看到关于 Auto Clicker 的阻止提示，点 **「仍要打开」**，输入登录密码。
4. 再双击一次就正常启动了，之后不再询问。

> macOS 15 起苹果移除了「右键 → 打开」这条绕过路径，网上老教程里的做法在新系统上不管用。

命令行等价做法：

```bash
xattr -dr com.apple.quarantine "/Applications/Auto Clicker.app"
```

## 4. 授予辅助功能权限

连点器必须拿到辅助功能权限，否则它发不出鼠标事件。

1. 打开 **系统设置 → 隐私与安全性 → 辅助功能**。
2. 列表里找到 Auto Clicker，把开关打开。列表里没有的话，点下方的 ➕ 手动添加 `/Applications/Auto Clicker.app`。
3. 回到应用面板，权限状态会在 1 秒内变成「权限已开启」，开始按钮随之可用。

如果之前授权过、后来失效（常见于覆盖安装新版本后）：把列表里那条 Auto Clicker **关掉再打开**，仍无效就选中它点「−」删除，再重新添加一次。

## 5. 更新要怎么拿

应用**没有任何网络层，不会检查更新，也不会提示你新版本**。要升级就回到本页上方的下载按钮，重新下载对应芯片的压缩包，覆盖 `/Applications` 里的旧版本，然后**重新确认一次辅助功能权限**（覆盖安装会让授权失效）。

## 6. 最低系统

macOS <Fact product="auto-clicker-mac" id="platform.minOs" suffix=" 及以上" />。
