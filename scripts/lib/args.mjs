/**
 * 同时支持 `--product table-flow` 与 `--product=table-flow`（PHONE-RUNTIME/CONTENT-PIPELINE
 * 文档里两种写法都出现过，CLI 不能只认一种）。
 */
export function parseArgs(argv = process.argv.slice(2)) {
  const flags = {}
  const positional = []

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const eq = arg.indexOf('=')
    if (eq > 1) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1)
      continue
    }
    const key = arg.slice(2)
    const next = argv[index + 1]
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next
      index += 1
    } else {
      flags[key] = true
    }
  }

  return { flags, positional }
}

/** 取值：布尔 flag（`--dry-run`）视为未提供值，避免 `if (flags.x)` 与字符串混淆。 */
export function flagValue(flags, key) {
  const value = flags[key]
  return typeof value === 'string' && value.length ? value : undefined
}
