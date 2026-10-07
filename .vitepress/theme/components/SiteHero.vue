<script setup>
// 首页 hero 的文案全部来自 data/site.json：改品牌只动一个文件，md 里不抄品牌名。
import site from '../../../data/site.json'
</script>

<template>
  <div class="site-hero">
    <h1 class="name">{{ site.name }}</h1>
    <p class="text">{{ site.tagline }}</p>
    <p class="tagline">{{ site.description }}</p>
    <p v-if="site.actions?.length" class="actions">
      <a v-for="action in site.actions" :key="action.href" class="action" :href="action.href">
        {{ action.text }}
      </a>
    </p>
  </div>
</template>

<style scoped>
.site-hero {
  max-width: 680px;
  margin: 0 auto;
  text-align: left;
}
.name {
  font-size: 48px;
  line-height: 1.15;
  letter-spacing: -0.5px;
  font-weight: 700;
  color: var(--vp-c-brand-1);
}
.text {
  margin-top: 12px;
  font-size: 32px;
  line-height: 1.25;
  font-weight: 700;
  color: var(--vp-c-text-1);
}
.tagline {
  padding-top: 20px;
  max-width: 560px;
  margin: 0;
  font-size: 17px;
  line-height: 26px;
  color: var(--vp-c-text-2);
}
.actions {
  display: flex;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 12px;
  margin: 28px 0 0;
}
.action {
  display: inline-block;
  padding: 9px 20px;
  border-radius: 8px;
  background: var(--vp-c-brand-1);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
}
.action:hover {
  opacity: 0.92;
  text-decoration: none;
}
@media (max-width: 768px) {
  .name {
    font-size: 34px;
  }
  .text {
    font-size: 24px;
  }
  .tagline {
    font-size: 15px;
  }
}
</style>
