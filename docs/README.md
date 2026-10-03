# 软件发布中心

> 本仓库为发布产物分发站（**不含源码**），统一管理名下软件的更新与下载。
> 下载地址：Gitee Releases（国内快速）；各产品通过应用内更新检测读取**本仓库对应产品分支**根目录的 `update.json`。

## 仓库结构（分支管理）

```
my-software-releases/
├── main 分支                  ← README 产品矩阵（本页）
├── table-flow 分支            ← TableFlow 的 update.json（分支根目录）
├── wps-enhancer 分支          ← WPS 增强工具的 update.json（未来）
└── Releases                   ← tag 与附件（table-flow-v1.4.3 / table-flow-v1.4.3.zip）
```

> 每个软件一个分支分别管理，发布互不影响；`update.json` 位于各产品分支根目录
> （URL：`https://gitee.com/pikachuprogrammer01/my-software-releases/raw/<产品分支>/update.json`）。

## 产品列表

### TableFlow

**简介**：Chrome 浏览器扩展，从网页表格中提取、预览、去重并导出数据（Excel / CSV / JSON / 剪贴板）。支持浮动操作面板、自动翻页采集、断线续采、模板系统、自定义识别规则、嵌套/跨域 iframe 表格采集。

| 项目 | 说明 |
|------|------|
| 最新版本 | 见 [table-flow 分支 update.json](https://gitee.com/pikachuprogrammer01/my-software-releases/raw/table-flow/update.json) |
| 支持浏览器 | Chrome / Edge（Chromium 系） |
| 安装方式 | 下载 zip → 解压 → `chrome://extensions/` 开启开发者模式 → 「加载已解压的扩展程序」选择解压目录 |
| 更新机制 | 打开浮动面板自动检测新版本（也可在设置 → 更新中手动检查）；Edge 商店用户由浏览器自动更新 |

**版本历史**：见 [Gitee Releases 页](https://gitee.com/pikachuprogrammer01/my-software-releases/releases)（由发布脚本自动维护，本 README 不再手动更新表格）

---

### 其他软件（占位）

<!--
新软件发布时：
1. 在 Gitee 仓库创建产品分支（如 wps-enhancer），分支根目录放初始 update.json
2. README 复制此节替换内容
3. 发布时 --product <产品>（脚本自动切到产品同名分支）
-->

**WPS 增强工具**：_待发布（Windows / Mac 双端）_

---

## 发布说明

- **一键发布**：在本仓库工作副本任意分支执行 `GITEE_TOKEN=xxx bash scripts/release.sh --zip <zip路径> [--notes "说明"]`（分支自动复用/创建 → 创建 Release → 上传附件 → 更新分支根 update.json → 推送 → 自动验证），详见 [docs/发布说明.md](./docs/发布说明.md)
- **命名约定**：Release tag 与附件统一为 `<产品>-v<版本>`（如 `table-flow-v1.4.3` / `table-flow-v1.4.3.zip`）
- **分支约定**：每个产品一个分支（分支名 = 产品名），update.json 在分支根目录
- **更新频率**：用户端自动检查有 6 小时冷却；发布后即时生效
