<script setup>
// 底部联系方式：文案与邮箱全部来自 data/site.json，组件不携带一句文案。
import { useSidebar } from 'vitepress/theme'
import site from '../../../data/site.json'

// 自带页脚只在没有侧栏的页面出现，所以这里的分隔线要跟着让位，避免首页出现两条。
const { hasSidebar } = useSidebar()
</script>

<template>
  <aside v-if="site.contact?.email" class="site-contact" :class="{ 'no-rule': !hasSidebar }">
    <p class="row">
      <span class="label">{{ site.contact.label }}</span>
      <a class="mail" :href="`mailto:${site.contact.email}`">{{ site.contact.email }}</a>
    </p>
    <p v-if="site.contact.note" class="note">{{ site.contact.note }}</p>
  </aside>
</template>

<style scoped>
.site-contact {
  border-top: 1px solid var(--vp-c-gutter);
  padding: 26px 24px 40px;
  background-color: var(--vp-c-bg);
}
.site-contact.no-rule {
  border-top: none;
  padding-top: 0;
}
.row {
  display: flex;
  justify-content: center;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  font-size: 14px;
  line-height: 24px;
  color: var(--vp-c-text-2);
}
.label {
  font-weight: 600;
}
.mail {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 6px 12px;
  border-radius: 6px;
  background: var(--vp-c-default-soft);
  color: var(--vp-c-brand-1);
  font-weight: 600;
  text-decoration: none;
}
.mail:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.note {
  margin: 8px auto 0;
  max-width: 560px;
  text-align: center;
  font-size: 13px;
  line-height: 21px;
  color: var(--vp-c-text-2);
}
@media (min-width: 768px) {
  .site-contact {
    padding: 26px 32px 40px;
  }
  .site-contact.no-rule {
    padding-top: 0;
  }
}
/* 有侧栏时正文列整体右移，居中不能按整屏算，否则窄桌面宽度下会被侧栏压住。 */
@media (min-width: 960px) {
  .site-contact:not(.no-rule) {
    padding-left: var(--vp-sidebar-width, 272px);
    padding-right: 32px;
  }
}
</style>
