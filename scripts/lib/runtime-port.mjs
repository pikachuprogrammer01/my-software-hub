import fs from 'node:fs'
import path from 'node:path'

/**
 * 服务用 PORT=0 让内核挑端口，实际值由进程写进 <dataDir>/run/hubd.port。
 * 测试不要再"先探一个空闲端口再关掉去绑"——两步之间会被并发进程抢走，表现为整段演练崩掉。
 */
export function portFile(dataDir) {
  return path.join(dataDir, 'run', 'hubd.port')
}

export async function readBoundPort(dataDir, { timeoutMs = 25000, host = '127.0.0.1' } = {}) {
  const file = portFile(dataDir)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) {
      const value = Number(fs.readFileSync(file, 'utf8').trim())
      if (Number.isInteger(value) && value > 0) return { port: value, baseUrl: `http://${host}:${value}` }
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`没有等到 ${file}（服务未起来或端口文件被清理）`)
}
