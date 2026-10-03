# 手机作为站点服务器：部署与运维交接

> 状态：代码与电脑验证完成；Android/Termux 实机、第二台设备局域网访问、锁屏与重启恢复 **未验证**（本环境没有手机）。
> 数据主源不变：站点仓内容源是用户可见文案主源，发布仓是版本事实与内容包分发面，SQLite 只保存提案/审计/发布任务。

## 一、技术栈与边界

```text
电脑/CI：内容校验 → vitepress build → tsc 编译 API → deploy/package.mjs 出包
                                          ↓ 传输 hub-<version>.tar.gz
Android / Termux：Node.js + Hono 单进程
  /            已构建的 VitePress 静态文件
  /health      运行健康检查
  /v1/...      提案与内容分发 API
  SQLite       提案、审计、发布任务（Termux 私有目录）
```

- 手机不构建内容、不跑 VitePress dev/preview、不依赖 Docker/systemd。
- 提案路由失败不影响静态页面；停掉进程后浏览器就打不开站点，不宣称"离线可访问"。
- 客户端仍从 Gitee 发布仓读取内容包，既有 URL 不变；手机不可用不阻断客户端。
- 手机不写 Git、不移动 `latest`；批准的提案由电脑侧受控变更进入站点仓后再生成内容包。

## 二、执行顺序（电脑侧）

```bash
pnpm install                # 本机依赖
pnpm api:build              # tsc 编译 server/ → .server-dist/
node scripts/export-openapi.mjs
pnpm build                  # 契约校验 + 内容生成 + vitepress build
node deploy/package.mjs --version 1.7.0-rc1
# 产物：deploy/out/hub-1.7.0-rc1.tar.gz 与 .sha256
```

`deploy/package.mjs` 会拒绝出包的情形：缺 `.server-dist`、缺 `.vitepress/dist`、缺 `api/openapi.v1.json`、内容包自校验不过。包里不含数据库、token、登录态、`node_modules`、`proposals/` 与 `Automation`。

## 三、传到手机并安装

```bash
# 电脑 → 手机（同网，用 scp/adb push/下载均可；adb 属可选传输通道，不是运行依赖）
scp deploy/out/hub-1.7.0-rc1.tar.gz* u0_a1:/data/data/com.termux/files/home/downloads/
```

Termux 内：

```bash
pkg update
pkg install nodejs make clang python3 binutils   # make/clang/python3 供原生模块现场编译
node -v                                          # 需要 >= 22.5

export HUB_HOME=$HOME/hub
export HUB_DATA_DIR=$HUB_HOME/data               # Termux 私有目录，禁止 /sdcard
export HOST=127.0.0.1 PORT=8787

bash hub-1.7.0-rc1/scripts/sqlite-compat-check.mjs   # 驱动兼容性试验，先跑这个
bash hub-1.7.0-rc1/scripts/hubctl install ~/downloads/hub-1.7.0-rc1.tar.gz
bash hub-1.7.0-rc1/scripts/hubctl start
bash hub-1.7.0-rc1/scripts/hubctl status
```

`install` 的固定节律：校验 tar 与逐文件 SHA-256 → 设备侧 `npm ci --omit=dev`（依赖在设备上编译）→ 驱动试验 → **迁移前先备份** → 临时端口预演迁移与健康检查 → 通过才切换 `current`。任一步失败都保留原版本并打印日志尾部；不会静默改用其它数据库。

## 四、运维命令

| 命令 | 行为 |
|---|---|
| `hubctl start` / `stop` | nohup 启动（pid 文件防重复启动）/ SIGTERM 优雅停止并 checkpoint WAL |
| `hubctl status` | 版本、监听、进程、健康、数据库统计、最近备份 |
| `hubctl logs -n 200` | 查看日志（超 2MB 自动轮转，保留 5 份） |
| `hubctl backup` | SQLite 在线一致性备份 + `.sha256` + 统计元数据 |
| `hubctl restore --from <备份>` | 先校验（完整性、SHA、迁移兼容）再替换；替换前的现场保留在 `data/db/replaced-<时间>/` |
| `hubctl rollback [版本]` | 回退上一部署包；迁移数少于当前库时拒绝并要求先恢复数据库 |
| `hubctl doctor` / `env` | 设备/依赖/存储自检；打印生效配置（只显示 token 文件路径，不显示值） |

配置优先级：显式导出的环境变量 > `$HUB_HOME/hub.env` > 内置默认值。默认监听 `127.0.0.1:8787`（仅手机本机）。

| 变量 | 默认 | 说明 |
|---|---|---|
| `HOST` / `PORT` | `127.0.0.1` / `8787` | 局域网访问需显式 `HOST=0.0.0.0` |
| `HUB_DATA_DIR` | `$HUB_HOME/data` | 绝对路径，必须在 Termux 私有文件系统 |
| `HUB_ALLOWED_ORIGINS` | 空（同源） | 跨源写操作白名单 |
| `HUB_RATE_LIMIT_PER_MIN` | `30` | 按 IP+方法+路径的固定窗口 |
| `HUB_MAX_BODY_BYTES` | `16384` | 请求体上限 |
| `HUB_REVIEWER_TOKEN_FILE` / `HUB_SUBMITTER_TOKEN_FILE` | 未配置 | 只读文件路径，权限 600 |

## 五、局域网、认证与休眠边界

- `HOST=0.0.0.0` 只代表进程绑到所有网卡，不等于其他设备一定能连：路由器隔离、AP 隔离、手机防火墙都会拦。**必须从第二台设备实际请求验证**。
- IP 会变，访问入口用主机名或DHCP 固定地址；本文档不写死某个 IP。
- 认证：`X-Hub-Reviewer-Token`（裁决与提案列表）与 `X-Hub-Submitter-Token`（提交信任级别）都是部署侧配置的共享口令。客户端内置的 token 不算安全凭证；未配置审核身份时裁决端点返回 503，提案只进不可信待处理区。
- 只有 `127.0.0.1` 调试可用明文 HTTP；跨设备带凭证的请求要经 HTTPS 或受信任加密通道（本仓不含公网域名、TLS 或隧道配置）。
- Android 休眠/电池优化会冻结进程。可行做法：保持供电、关闭该应用电池优化、`termux-wake-lock`，或按需配 Termux 开机启动脚本。这些都只改善在线率，**不构成全天在线保证**；"6 小时检查"是客户端在正常运行且联网时的目标，不是手机在线 SLA。

## 六、验证矩阵（已做 / 待做）

| 项 | 状态 |
|---|---|
| HTTP 服务、静态面、clean URL、404、目录穿越拒绝 | 电脑已验证 |
| 提案接收/幂等/字段级冲突/限流/请求体上限/认证边界/审计 | 电脑已验证（`pnpm test:api`） |
| SQLite 迁移、事务、重启保留、WAL checkpoint | 电脑已验证（含 SIGKILL 后重启） |
| 备份 → 破坏库 → 恢复 → 业务键一致 | 电脑已验证 |
| 部署包安装、迁移预演、版本回滚 | 电脑已验证 |
| `HOST=0.0.0.0` 本机第二地址可达 | 电脑已验证 |
| Android/Termux 实机运行 | **未验证**（无设备） |
| 第二台设备局域网访问 | **未验证** |
| 锁屏、Wi-Fi 切换、重启后恢复行为 | **未验证** |
| 真实断外网下手机仍服务 | **未验证**（电脑侧仅证明运行期零出站请求 + 静态资源全同源） |

在手机上按第三、四节顺序执行即产生上面待做项的证据；`sqlite-compat-check.mjs` 若失败，停止并回报失败项，不要改库或换驱动。
