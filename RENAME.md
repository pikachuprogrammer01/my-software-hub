# 改名执行手册（table-flow-site → my-software-hub）

> ⚠️ **这份文件要你在关闭本会话之后手工执行。** 我不会代做，原因见第三节。
> 仓内文档与 `package.json` 的名称已改完，本文件只处理**文件系统与远端**两件事。

## 一、先做这一步：归档本对话

`~/.qoder/projects/-Users-pikachu-code-table-flow-site/` 里**不止有记忆**，实测还包含：

```
memory/                     ← 项目记忆（3 个文件 + MEMORY.md 索引）
82d5975f-….jsonl            ← 本次对话的完整记录
82d5975f-…/                 ← 子代理记录、state.json、compression-v2
```

也就是说**改这个目录名会同时改变本对话的归属路径**。既然你准备归档这次对话，**先归档、后改名**，顺序反了可能找不到历史记录。

## 二、执行顺序（每步可回退）

```bash
# 0) 停掉 dev server（它占着旧路径）
lsof -ti:5173 | xargs kill 2>/dev/null

# 1) 备份记忆——用【复制】不用移动，出问题可直接回退
cp -R ~/.qoder/projects/-Users-pikachu-code-table-flow-site/memory \
      /tmp/hub-memory-backup-$(date +%Y%m%d)

# 2) 预先建好新记忆目录并放入旧内容（旧目录原样保留，验证通过再删）
mkdir -p ~/.qoder/projects/-Users-pikachu-code-my-software-hub
cp -R ~/.qoder/projects/-Users-pikachu-code-table-flow-site/memory \
      ~/.qoder/projects/-Users-pikachu-code-my-software-hub/memory

# 3) 改代码目录名
mv /Users/pikachu/code/table-flow-site /Users/pikachu/code/my-software-hub

# 4) 清掉含绝对路径的构建缓存，重装依赖
cd /Users/pikachu/code/my-software-hub
rm -rf .vitepress/cache node_modules/.vitepress
pnpm install

# 5) 验证
pnpm validate && pnpm build
```

然后**重启 Qoder、以新路径打开项目**，确认：

- 项目记忆自动加载（问它"我们的多产品路线定到哪了"，应能答出冻结契约与 M0–M4）；
- 旧对话历史是否仍可见。

## 三、为什么我不代做

1. `/Users/pikachu/code/table-flow-site` 是**本会话的工作目录**，改名会把我自己脚下的地抽掉，后续工具调用的路径解析全部失效。
2. `pnpm dev` 正在该目录运行（你浏览器停在 5173）。
3. 第 2 步涉及**会话记录归属**，属于难以完全回退、且影响超出我能观察范围的操作——这类事必须先经你确认。

## 四、Gitee 远端（可选，随时做，不影响本地）

```bash
cd /Users/pikachu/code/my-software-hub
git init && git add -A && git commit -m "chore: 初始提交（原 table-flow-site，改名 my-software-hub）"
git remote add origin <你在 Gitee/GitHub 新建的 my-software-hub 仓地址>
git push -u origin main
```

> `REQUIREMENTS.md` 的 **FR-23（纳入 git）是 P0**，因为整套设计的基线假设是「Git 即 CMS」——而现在这个仓**根本没有 `.git`**，改错一份 `products.json` 无法回滚。这一步的优先级高于任何功能开发。

## 五、明确不要改的东西

| 项 | 为什么不能改 |
|---|---|
| 发布仓 `my-software-releases` 的名字与 raw URL | 已硬编码进分发包（`table-flow/src/constants/update.ts:23`），改一次就等于全体老用户失去更新检测 |
| 站点里 `schema/*.v1.json` 的 `$id` | 它是契约标识，与将来发布仓里的 schema 路径对应 |
| `~/.qoder/memory/`（用户级记忆） | 与项目路径无关，不需要动 |
| `-Users-pikachu-code-table-flow`（**开发仓**的记忆目录） | 那是另一个项目，名字本来就该保持 `table-flow` |

## 六、改完之后

旧目录 `~/.qoder/projects/-Users-pikachu-code-table-flow-site/`（含本次对话记录）建议**保留至少一段时间**再删——它是这次归档的原件。确认新路径的记忆与内容都正常之后，再决定是否清理。
