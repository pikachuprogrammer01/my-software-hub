import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vitepress'
import { SITE_ROOT, syncRelease } from '../scripts/sync-release.mjs'

/** 站内不发布的仓库内部文档（留在仓库里，只是不生成页面）。 */
const INTERNAL = new Set([
  'README.md', 'DOWNLOADS.md', 'PRODUCTS.md', 'SITE-DESIGN.md', 'CONTRACT.md',
  'VISION.md', 'REQUIREMENTS.md', 'RENAME.md',
  'CONTENT-PIPELINE.md', 'PHONE-RUNTIME.md',
  'AGENT-CONTINUATION-PROMPT.md', 'AGENT-CONTINUATION-CHECKLIST.md',
  'ANDROID-DEPLOY.md', 'CLIENT-INTEGRATION.md',
  'docs/README.md', 'docs/EDGE_ADDONS_LISTING.md'
])

/** 路由：content/x.md → /x；docs/X_Y.md → /reference/x-y；CHANGELOG.md → /changelog。 */
function routeOf(rel) {
  const dir = path.dirname(rel)
  const base = path.basename(rel, '.md')
  if (dir === 'content') return `${base.toLowerCase()}.md`
  if (dir === 'docs') return `reference/${base.toLowerCase().replace(/_/g, '-')}.md`
  if (dir.startsWith('products/')) {
    const product = dir.split('/')[1]
    return base === 'index' ? `${product}/index.md` : `${product}/${base.toLowerCase()}.md`
  }
  if (dir === '.' && base === 'CHANGELOG') return 'changelog.md'
  return null
}

function readFrontMatter(abs) {
  const raw = fs.readFileSync(abs, 'utf8')
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)
  const fm = {}
  if (block) {
    for (const line of block[1].split(/\r?\n/)) {
      const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim())
      if (m) fm[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  const body = block ? raw.slice(block[0].length) : raw
  const h1 = /^#\s+(.+)$/m.exec(body)
  return {
    order: Number(fm.order ?? Number.POSITIVE_INFINITY),
    title: fm.title || h1?.[1]?.trim() || path.basename(abs, '.md'),
    draft: fm.draft === 'true'
  }
}

/** 扫目录生成页面清单：新增一篇 md 就自动多一个页面，不改本文件。 */
function scanPages() {
  const pages = []
  for (const dir of ['content', 'docs', 'products', '.']) {
    const absDir = path.join(SITE_ROOT, dir)
    if (!fs.existsSync(absDir)) continue
    const files = []
    const walk = (current, prefix = '') => {
      for (const name of fs.readdirSync(current)) {
        const abs = path.join(current, name)
        const relPrefix = prefix ? `${prefix}/${name}` : name
        if (fs.statSync(abs).isDirectory()) walk(abs, relPrefix)
        else if (name.endsWith('.md')) files.push(dir === '.' ? relPrefix : `${dir}/${relPrefix}`)
      }
    }
    walk(absDir)
    for (const rel of files) {
      const name = path.basename(rel)
      if (INTERNAL.has(rel) || rel === 'index.md') continue
      const route = routeOf(rel)
      if (!route) continue
      pages.push({ rel, route, ...readFrontMatter(path.join(SITE_ROOT, rel)) })
    }
  }
  return pages
    .filter((p) => !p.draft)
    .sort((a, b) => a.order - b.order || a.rel.localeCompare(b.rel))
}

const pages = scanPages()
const guide = pages.filter((p) => p.rel.startsWith('content/'))
const reference = pages.filter((p) => !p.rel.startsWith('content/'))
const link = (rel) => {
  const p = pages.find((x) => x.rel === rel)
  return p ? `/${p.route.replace(/\.md$/, '')}` : '/'
}

export default defineConfig(async () => {
  const release = await syncRelease()

  return {
    root: SITE_ROOT,
    lang: 'zh-CN',
    title: 'TableFlow',
    titleTemplate: ':title · TableFlow',
    description:
      'TableFlow 浏览器扩展：从网页表格中提取、预览、去重并导出数据，支持自动翻页采集、断线续采、模板系统与自定义识别规则。',
    head: [
      ['link', { rel: 'icon', type: 'image/png', href: '/assets/icon.png' }],
      ['meta', { property: 'og:title', content: 'TableFlow — 网页表格采集与导出' }],
      ['meta', { property: 'og:image', content: '/assets/icon.png' }]
    ],
    cleanUrls: true,
    lastUpdated: true,
    srcExclude: [...INTERNAL],
    rewrites: Object.fromEntries(pages.map((p) => [p.rel, p.route])),
    markdown: { theme: { light: 'github-light', dark: 'github-dark' } },

    themeConfig: {
      logo: '/assets/icon.png',
      siteTitle: 'TableFlow',
      nav: [
        { text: '产品', link: link('products/table-flow/index.md') },
        { text: '功能', link: link('content/features.md') },
        { text: '适用范围', link: link('content/scope.md') },
        { text: '安装', link: link('content/install.md') },
        { text: '价格', link: link('content/pricing.md') },
        {
          text: `v${release.version}`,
          items: [
            { text: '更新日志', link: link('CHANGELOG.md') },
            { text: '完整使用手册', link: link('docs/USAGE_GUIDE.md') },
            { text: '隐私政策', link: link('docs/PRIVACY_POLICY.md') }
          ]
        }
      ],
      sidebar: [
        {
          text: '产品目录',
          items: pages.filter((p) => p.rel.startsWith('products/') && p.rel.endsWith('/index.md')).map((p) => ({ text: p.title, link: `/${p.route.replace(/\.md$/, '')}` }))
        },
        { text: '开始使用', items: guide.map((p) => ({ text: p.title, link: `/${p.route.replace(/\.md$/, '')}` })) },
        {
          text: '完整参考',
          items: reference.map((p) => ({ text: p.title, link: `/${p.route.replace(/\.md$/, '')}` }))
        }
      ],
      outline: { level: [2, 3], label: '本页目录' },
      search: { provider: 'local', options: { translations: { button: { buttonText: '搜索' } } } },
      footer: {
        message: '采集、预览与导出在本地完成 · 匿名错误诊断可在设置中关闭',
        copyright: 'TableFlow'
      }
    }
  }
})
