<script setup>
import { computed } from 'vue'
import { useProductContent } from '../composables/useContent.js'

const content = useProductContent('auto-clicker-mac')
const version = computed(() => content.value?.facts?.['version.current']?.value ?? null)

const assets = [
  { id: 'arm64', title: 'Apple Silicon（M 系列）', file: 'Auto-Clicker-v{version}-arm64.zip' },
  { id: 'intel', title: 'Intel', file: 'Auto-Clicker-v{version}-intel.zip' }
]

const sources = computed(() =>
  [
    {
      id: 'gitee',
      name: 'Gitee 镜像',
      benefit: '使用已同步到 Gitee 产品分支与版本 tag 的同一 ZIP，直接下载不需要登录。',
      base: content.value?.facts?.['download.giteeZipBase']?.value ?? null
    },
    {
      id: 'github',
      name: 'GitHub',
      benefit: '海外网络通常更稳定，作为备用下载来源。',
      base: content.value?.facts?.['download.githubZipBase']?.value ?? null
    }
  ].filter((source) => source.base)
)

function fileName(asset) {
  return asset.file.replace('{version}', version.value)
}

function url(source, asset) {
  return `${source.base}/${fileName(asset)}`
}
</script>

<template>
  <section v-if="version && sources.length" class="download-panel" aria-labelledby="auto-clicker-download-title">
    <div class="heading">
      <h3 id="auto-clicker-download-title">下载 v{{ version }}</h3>
      <p>按芯片选择 ZIP 压缩包；两个来源的文件内容相同，网络不通时切换另一个来源。</p>
    </div>

    <div v-for="asset in assets" :key="asset.id" class="asset">
      <h4>{{ asset.title }}</h4>
      <div class="source-grid">
        <div v-for="source in sources" :key="source.id" class="source">
          <a
            class="download-button"
            :href="url(source, asset)"
            :aria-label="`${asset.title}：从 ${source.name} 下载 ZIP`"
            rel="noreferrer"
            referrerpolicy="no-referrer"
            download
          >
            从 {{ source.name }}下载 ZIP
          </a>
          <p>{{ source.benefit }}</p>
        </div>
      </div>
      <code class="filename">{{ fileName(asset) }}</code>
    </div>
  </section>
  <p v-else class="download-warning">当前版本信息暂不可用，暂时无法生成 ZIP 下载按钮。</p>
</template>

<style scoped>
.download-panel {
  margin: 18px 0 28px;
  padding: 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
}
.heading h3 {
  margin: 0;
  font-size: 20px;
  line-height: 28px;
}
.heading p {
  margin: 6px 0 0;
  color: var(--vp-c-text-2);
  line-height: 22px;
}
.asset + .asset {
  margin-top: 22px;
  padding-top: 20px;
  border-top: 1px solid var(--vp-c-divider);
}
.asset h4 {
  margin: 0 0 10px;
  font-size: 16px;
}
.source-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.source {
  min-width: 0;
}
.download-button {
  display: inline-block;
  padding: 8px 14px;
  border: 1px solid var(--vp-c-brand-1);
  border-radius: 8px;
  color: var(--vp-c-brand-1);
  font-weight: 600;
  text-decoration: none;
}
.download-button:hover {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  text-decoration: none;
}
.source p {
  margin: 7px 0 0;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 20px;
}
.filename {
  display: inline-block;
  margin-top: 12px;
  color: var(--vp-c-text-2);
  font-size: 12px;
}
.download-warning {
  color: var(--vp-c-warning-1);
}
@media (max-width: 640px) {
  .source-grid {
    grid-template-columns: 1fr;
  }
}
</style>
