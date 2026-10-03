# 后续执行检查清单

此清单与 `AGENT-CONTINUATION-PROMPT.md` 配套使用。Agent 完成一项后再勾选，不得用“应该可以”替代命令结果。

> v2：增加手机作为服务器的正式运行环境，完整部署规则见 `PHONE-RUNTIME.md`。所有检查均待执行，不因旧记录通过而预勾选。

## 基线

- [ ] 当前目录与工作区确认正确
- [ ] 未读取、复制或遍历 `Automation`
- [ ] Git 可写性已确认
- [ ] Git 基线已提交，或阻塞原因已记录

## 内容源与 schema

- [ ] `data/products.json` 通过 schema
- [ ] 已接入产品内容源通过 schema
- [ ] facts 均含 `effectiveFromVersion`
- [ ] facts 无渠道变体
- [ ] copy 无 HTML 和视觉字段
- [ ] 渠道文案预算检查通过
- [ ] 错误产品 ID 会失败
- [ ] 内容包 SHA 不匹配会失败

## 生成、发布和回滚

- [ ] 每个产品生成 immutable revision
- [ ] 生成 `content.v1.json`
- [ ] 生成 `content-latest.v1.json`
- [ ] 生成失败不移动 latest
- [ ] 单产品失败不影响其他产品
- [ ] dry-run 不写远程仓
- [ ] 回滚命令已实际执行
- [ ] 回滚后 drift 检查通过

## 提案

- [ ] proposal schema 存在
- [ ] pending/accepted/rejected 状态存在
- [ ] facts 提案拒绝 channel
- [ ] 错误 product 拒绝
- [ ] 提案不能直接发布 latest
- [ ] 未把客户端 token 当作安全边界

## 站点

- [ ] `/table-flow/` 构建成功
- [ ] `/wps-enhancer/` 构建成功
- [ ] ReleaseInfo 按产品读取内容包
- [ ] 内容包缺失时有明确降级提示
- [ ] VitePress build 通过

## 客户端交接

- [ ] TableFlow 消费契约和 fixture 已交付
- [ ] WPS Enhancer 消费契约和 fixture 已交付
- [ ] 已明确哪些客户端源码尚未修改
- [ ] 已明确内容包 URL、缓存、fallback 和回滚规则

## Android / Termux 运行与后端

- [ ] 已确认设备系统/架构/Node 版本，或明确目标设备未提供
- [ ] Hono 提供预构建静态文件、API 与 /health
- [ ] 默认监听 127.0.0.1:8787，局域网绑定需显式配置
- [ ] SQLite 驱动在目标环境验证，数据库与部署目录分离
- [ ] 提案数据库为运行期主存储，JSON 仅导入/导出
- [ ] 认证、限流、幂等、基础 revision 冲突检测和审计通过测试
- [ ] 部署包不含数据库、密钥及电脑原生依赖
- [ ] start/stop/status/logs 命令已验证
- [ ] 无 Docker/systemd/dev server 生产依赖
- [ ] clean URL 直接访问与 404 行为正确
- [ ] 外网断开时本地服务仍提供已有静态页面
- [ ] 进程重启后提案保留，重复请求不重复写入
- [ ] SQLite 一致性备份、恢复及部署回滚实际验证
- [ ] 目标手机与第二设备的局域网访问已验证或明确未验证
- [ ] 锁屏、网络切换、重启后的恢复行为有证据
- [ ] 设备睡眠期间不承诺 6 小时/全天在线 SLA
- [ ] 已区分电脑测试、Android 实机和公网部署状态

## 当前实现缺口复核

- [ ] ProductOverview 已在主题注册并有渲染证据
- [ ] WPS 产品不回落到 TableFlow 下载地址
- [ ] 内容历史不可变、重复构建幂等
- [ ] 漂移检查不因 Git revision 不同而跳过事实比较
- [ ] CLI 支持规范中的空格分隔参数
- [ ] 旧 Markdown 硬编码事实迁移完成或明确列为未完成
- [ ] 内部交接文档不出现在公开站点构建产物

## 最终命令

```bash
node scripts/validate-contract.mjs
node scripts/content-validate.mjs
node scripts/content-build.mjs
node scripts/content-drift.mjs
node scripts/test-content.mjs
./node_modules/.bin/vitepress build
```
