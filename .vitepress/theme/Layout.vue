<script setup>
// VitePress 自带页脚在带侧栏的页面会被隐藏，联系方式改走 layout-bottom 才能每页都在。
import DefaultTheme from 'vitepress/theme'
import SiteContact from './components/SiteContact.vue'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #layout-bottom>
      <SiteContact />
    </template>
  </Layout>
</template>
