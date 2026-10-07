<script setup>
import { computed } from 'vue'
import { useProductContent } from '../composables/useContent.js'

const content = useProductContent('wps-enhancer')
const version = computed(() => content.value?.facts?.['version.current']?.value ?? null)

const platforms = [
  {
    id: 'macos-arm64',
    title: 'macOS Apple Silicon',
    file: 'WPSEnhancer-macos-arm64.zip'
  },
  {
    id: 'windows-x86_64',
    title: 'Windows 64 位（x86_64）',
    file: 'WPSEnhancer-windows-x86_64.zip'
  }
]

const sources = computed(() => {
  if (!version.value) return []
  return [
    {
      id: 'gitee',
      name: 'Gitee',
      benefit: '国内访问通常更快，应用内更新器也使用这个来源。',
      base: `https://gitee.com/pikachuprogrammer01/my-software-releases/releases/download/wps-enhancer-v${version.value}`
    },
    {
      id: 'github',
      name: 'GitHub',
      benefit: '海外网络通常更稳定，作为备用下载来源。',
      base: `https://github.com/pikachuprogrammer01/wps-enhancer-go/releases/download/v${version.value}`
    }
  ]
})

function url(source, platform) {
  return `${source.base}/${platform.file}`
}
</script>

<template>
  <section v-if="version && sources.length" class="download-panel" aria-labelledby="wps-download-title">
    <div class="heading">
      <h3 id="wps-download-title">下载 v{{ version }}</h3>
      <p>下面的按钮全部下载 ZIP 压缩包，按你的网络情况选择来源；页面不提供 EXE 直链。</p>
    </div>

    <div v-for="platform in platforms" :key="platform.id" class="platform">
      <h4>{{ platform.title }}</h4>
      <div class="source-grid">
        <div v-for="source in sources" :key="source.id" class="source">
          <a
            class="download-button"
            :href="url(source, platform)"
            :aria-label="`${platform.title}：从 ${source.name} 下载 ZIP`"
            download
          >
            从 {{ source.name }} 下载 ZIP
          </a>
          <p>{{ source.benefit }}</p>
        </div>
      </div>
      <code class="filename">{{ platform.file }}</code>
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
.platform + .platform {
  margin-top: 22px;
  padding-top: 20px;
  border-top: 1px solid var(--vp-c-divider);
}
.platform h4 {
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
