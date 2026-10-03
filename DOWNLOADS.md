# 下载与版本事实

> 站点上一切"最新版本 / 立即下载"都必须来自本页，**且只从线上 `update.json` 取号**——不写进组件、不手抄 `package.json`。

## 站点口径（已定）

1. **只提供最新版压缩包**：站点不提供历史版本下载入口，不列旧包直链。
2. **版本号不手写**：站点构建时拉取线上 `update.json` 的 `version` / `url` / `notes` 注入页面与下载按钮。你发新版 → 改 `update.json` → 站点下次构建自动跟随，无需改代码。
3. **更新日志仍需手写**：`CHANGELOG.md` 的版本条目由你（或我）按 Release notes 补，构建时只把"最新版号"与 CHANGELOG 顶部条目做一致性校验，对不上就报警。

## 单一事实源

| 项 | 值 |
|----|----|
| 更新清单（扩展与站点共用同一份） | `https://gitee.com/pikachuprogrammer01/my-software-releases/raw/table-flow/update.json` |
| Releases 总入口（tag 列表，站点不逐条链接） | `https://gitee.com/pikachuprogrammer01/my-software-releases/releases` |
| 最新版直链规律 | `.../releases/download/table-flow-v<版本>/table-flow-v<版本>.zip`（**由 update.json 的 `url` 字段给出，不自行拼接**） |
| 命名约定 | Release tag / 附件名 / `update.json.url` 三处完全一致，格式 `table-flow-v<版本>` |

## 线上实况（2026-10-01 匿名实测）

```json
{
  "version": "1.6.1",
  "url": "https://gitee.com/pikachuprogrammer01/my-software-releases/releases/download/table-flow-v1.6.1/table-flow-v1.6.1.zip",
  "notes": "v1.6.1：修复在线激活码提示『未登记/激活码无效』"
}
```

| 校验项 | 结果 |
|--------|------|
| Releases latest tag | `table-flow-v1.6.1`（`prerelease: false`） |
| 发布日 | 2026-09-26 17:17 (+08:00) |
| 附件直链 | 302 → 200，`Content-Length: 4650167`（约 4.65 MB） |
| 开发仓 `package.json` / `dist-chrome/manifest.json` | 1.6.1 —— 与线上一致 ✅ |

> 我此前"可下载最新为 1.4.4"的判断来自开发仓里那份**签入的过期快照** `table-flow/release-repo/`，它不是发布仓的真实状态，已作废。

## 页面文案模板

- Hero 主按钮：`免费下载 v{{version}}`（`{{version}}` 来自 update.json）
- 次按钮 / 说明：`Edge 用户可从 Edge 加载项商店安装，浏览器自动更新`
- 下载页一句话：`当前版本 v{{version}}（{{published_at}} 发布）。下载后解压，按安装页步骤加载。`
- 更新提示横幅文案与本页 `notes` 同源，站点不再另写一遍。

## 仍缺的两项（只能你补）

1. **Edge Add-ons 商店详情页 URL** 与商店当前上线版本号 —— 任何文档里都没记录，商店用户与压缩包用户可能不同步，需分别标注。
2. 站点是否需要 **`file://` 本地页面采集**这类能力声明入口（manifest 有 `file:///*`，但需要在 chrome://extensions 手动勾选"允许访问文件网址"）；文档目前没写这条用户操作，要补就补在 `content/install.md`。

## 附：公开发布记录（Gitee Releases 实测，仅作校对，站点不逐条给下载）

| tag | 发布日 |
|-----|--------|
| table-flow-v1.6.1 | 2026-09-26 |
| table-flow-v1.6.0 | 2026-09-26 |
| table-flow-v1.5.0 | 2026-09-18 |
| table-flow-v1.4.3 | 2026-09-05 |
| table-flow-v1.4.2 | 2026-08-29 |
| table-flow-v1.4.1 | 2026-08-19 |
| table-flow-v1.4.0 | 2026-08-15 |

> **v1.4.4 未出现在 Releases 列表里**，但开发仓 `RELEASE_CHECKLIST.md` 有「实例记录：v1.4.4（已发布）」、过期快照的 `update.json` 也指向它。站点 `CHANGELOG.md` 保留该版本条目（用户确实拿到过），只是**无法核对它的公开状态**——若你确认曾下架，我把条目改成"仅内部发布"。
