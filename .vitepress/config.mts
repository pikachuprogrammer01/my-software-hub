import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vitepress'
import { SITE_ROOT, syncRelease } from '../scripts/sync-release.mjs'

const site = JSON.parse(fs.readFileSync(path.join(SITE_ROOT, 'data/site.json'), 'utf8'))
const registry = JSON.parse(fs.readFileSync(path.join(SITE_ROOT, 'data/products.json'), 'utf8'))

/** 只有 products/<id>/** 与根 index.md 会发布；其余 md（内部笔记）一律自动排除。 */
const PUBLISH_DIRS = ['products']

/** 路由：products/<id>/<base>.md → /<id>/<base>；产品首页 → /<id>/。 */
function routeOf(rel) {
  const [root, product, ...rest] = rel.split('/')
  if (root !== 'products' || !product) return null
  const base = (rest.join('/') || 'index').replace(/\.md$/, '')
  return base === 'index' ? `${product}/index.md` : `${product}/${base}.md`
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

function walkMarkdown(dir, prefix = '') {
  const out = []
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name)
    const rel = prefix ? `${prefix}/${name}` : name
    if (fs.statSync(abs).isDirectory()) out.push(...walkMarkdown(abs, rel))
    else if (name.endsWith('.md')) out.push(rel)
  }
  return out
}

/** 扫目录生成页面清单：新增一篇 md 就自动多一个页面，不改本文件。 */
function scanPages() {
  const pages = []
  for (const dir of PUBLISH_DIRS) {
    const absDir = path.join(SITE_ROOT, dir)
    if (!fs.existsSync(absDir)) continue
    for (const rel of walkMarkdown(absDir, dir)) {
      const route = routeOf(rel)
      if (!route) continue
      pages.push({ rel, route, ...readFrontMatter(path.join(SITE_ROOT, rel)) })
    }
  }
  return pages.filter((p) => !p.draft)
}

const pages = scanPages()
const products = registry.products.filter((p) => p.visibility !== 'internal')

/** 产品内页面排序：产品首页永远第一，其余按 frontmatter order。 */
function pagesOf(productId) {
  return pages
    .filter((p) => p.rel.startsWith(`products/${productId}/`))
    .sort((a, b) => {
      const aIndex = a.rel.endsWith('/index.md') ? -1 : 0
      const bIndex = b.rel.endsWith('/index.md') ? -1 : 0
      return aIndex - bIndex || a.order - b.order || a.rel.localeCompare(b.rel)
    })
}

const href = (p) => `/${p.route.replace(/\.md$/, '')}`

/** 未发布 md 的排除清单由目录实际内容算出，不靠人维护名单。 */
function excludedMarkdown() {
  const published = new Set(['index.md', ...pages.map((p) => p.rel)])
  const out = []
  const walk = (dir, prefix = '') => {
    for (const name of fs.readdirSync(dir)) {
      if (name === 'node_modules' || name === '.git' || name === '.vitepress') continue
      const abs = path.join(dir, name)
      const rel = prefix ? `${prefix}/${name}` : name
      if (fs.statSync(abs).isDirectory()) walk(abs, rel)
      else if (name.endsWith('.md') && !published.has(rel)) out.push(rel)
    }
  }
  walk(SITE_ROOT)
  return out
}

/** 每个产品自己的图标与标题后缀：品牌事实只在 data/ 里写一次，md 不抄。 */
function productOfPath(filePath) {
  const rel = (filePath ?? '').replace(/\\/g, '/')
  const matched = /^products\/([^/]+)\//.exec(rel) || /^([^/]+)\//.exec(rel)
  return matched ? products.find((p) => p.id === matched[1]) ?? null : null
}

/** 只有文件真的在 public/ 下才注入 favicon，否则每个页面都发一次 404 请求。 */
function availableLogo(product) {
  const logo = product?.brand?.logo
  return logo && fs.existsSync(path.join(SITE_ROOT, 'public', logo)) ? logo : null
}

export default defineConfig(async () => {
  // 构建期同步线上更新清单快照到 .vitepress/release.json，<ReleaseInfo/> 只读它。
  await syncRelease()

  return {
    root: SITE_ROOT,
    lang: 'zh-CN',
    title: site.name,
    titleTemplate: `:title · ${site.name}`,
    description: site.description,
    head: [
      ['link', { rel: 'icon', type: 'image/svg+xml', href: site.favicon }],
      ['link', { rel: 'apple-touch-icon', href: site.appleTouchIcon }],
      ['meta', { property: 'og:site_name', content: site.name }],
      ['meta', { property: 'og:type', content: 'website' }],
      ['meta', { property: 'og:url', content: `${site.siteUrl}/` }],
      ['meta', { property: 'og:image', content: `${site.siteUrl}${site.ogImage}` }],
      ['meta', { name: 'twitter:card', content: 'summary' }]
    ],
    cleanUrls: true,
    lastUpdated: true,
    sitemap: { hostname: site.siteUrl },
    srcExclude: excludedMarkdown(),
    rewrites: Object.fromEntries(pages.map((p) => [p.rel, p.route])),
    markdown: { theme: { light: 'github-light', dark: 'github-dark' } },

    transformPageData(pageData) {
      const product = productOfPath(pageData.filePath)
      if (!product) return { titleTemplate: false }
      const logo = availableLogo(product)
      // 产品首页的标题本身就是产品名，再拼一次后缀就成了「TableFlow · TableFlow」。
      const isProductHome = /\/index\.md$/.test(pageData.relativePath ?? '')
      return {
        titleTemplate: isProductHome ? false : `:title · ${product.name}`,
        frontmatter: {
          ...pageData.frontmatter,
          head: [
            ...(logo ? [['link', { rel: 'icon', type: 'image/png', href: logo }]] : []),
            ['meta', { property: 'og:title', content: `${product.name} · ${site.name}` }]
          ]
        }
      }
    },

    themeConfig: {
      logo: site.logo,
      siteTitle: site.name,
      nav: [
        { text: '所有作品', link: '/' },
        { text: '精选项目', link: '/#featured' },
        { text: '其他产品', items: products.filter((p) => p.visibility !== 'featured').map((p) => ({ text: p.name, link: '/' + p.id + '/' })) },
        { text: 'GitHub ↗', link: 'https://github.com/pikachuprogrammer01' }
      ],
      sidebar: Object.fromEntries(
        products.map((p) => [
          `/${p.id}/`,
          [
            {
              text: p.name,
              items: pagesOf(p.id).map((page) => ({
                text: page.rel.endsWith('/index.md') ? `${page.title} · 概览` : page.title,
                link: href(page)
              }))
            }
          ]
        ])
      ),
      outline: { level: [2, 3], label: '本页目录' },
      search: { provider: 'local', options: { translations: { button: { buttonText: '搜索' } } } },
      footer: { message: site.footer.message, copyright: site.footer.copyright }
    }
  }
})
