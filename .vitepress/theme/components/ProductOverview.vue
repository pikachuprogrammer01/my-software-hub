<script setup>
import registry from '../../../data/products.json'
import site from '../../../data/site.json'
import { useProductContent } from '../composables/useContent.js'
import { ref } from 'vue'

const props = defineProps({ productId: { type: String, required: true } })
const product = registry.products.find((entry) => entry.id === props.productId)
const content = useProductContent(props.productId)
const imageFailed = ref(false)

const visibleSections = (product?.sections ?? [])
  .filter((section) => site.sectionLabels?.[section])
  .sort((a, b) => (site.sectionOrder?.indexOf(a) ?? -1) - (site.sectionOrder?.indexOf(b) ?? -1))
const importantSections = visibleSections.filter((section) => ['overview', 'features', 'quickstart', 'install', 'config', 'faq'].includes(section))
const additionalSections = visibleSections.filter((section) => !importantSections.includes(section))
const primarySection = ['install', 'quickstart', 'config'].find((section) => product?.sections?.includes(section))
const secondarySection = ['features', 'overview', 'scope'].find((section) => product?.sections?.includes(section))
function sectionHref(section) { return '/' + props.productId + '/' + section }
function monogram(name) { return [...(name || '')].find((ch) => /[A-Za-z]/.test(ch))?.toUpperCase() ?? '?' }
</script>

<template>
  <div class="landing">
    <nav class="landing-breadcrumb" :aria-label="site.home.breadcrumb">
      <a href="/">{{ site.directory.title }}</a>
      <span aria-hidden="true">/</span>
      <span>{{ product?.name }}</span>
    </nav>

    <header class="landing-hero">
      <div class="landing-main">
        <div class="landing-identity">
          <img v-if="product?.brand?.logo && !imageFailed"
            :src="product.brand.logo" :alt="product.name + ' 图标'" class="landing-logo"
            @error="imageFailed = true" />
          <div v-else class="landing-logo landing-fallback">{{ monogram(product?.name) }}</div>
          <div>
            <p v-if="content?.copy?.['overview.title']?.default" class="landing-eyebrow">{{ content.copy['overview.title'].default }}</p>
            <h1>{{ product?.name }}</h1>
          </div>
        </div>
        <p class="landing-summary">{{ content?.copy?.['overview.summary']?.default || site.home.noDescription }}</p>
        <div class="landing-badges">
          <span v-if="content?.facts?.['form.factor']?.value">{{ site.kindLabels?.[product?.kind] || content.facts['form.factor'].value }}</span>
          <span v-if="content?.facts?.['version.current']?.value">v{{ content.facts['version.current'].value }}</span>
        </div>
        <div class="landing-actions">
          <a v-if="primarySection" class="landing-button landing-button--primary" :href="sectionHref(primarySection)">
            {{ site.home.getStarted }} <span aria-hidden="true">→</span>
          </a>
          <a v-if="secondarySection" class="landing-button landing-button--secondary" :href="sectionHref(secondarySection)">
            {{ site.home.viewFeatures }} <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>

      <aside class="landing-facts" :aria-label="site.home.productFactsTitle">
        <h2>{{ site.home.productFactsTitle }}</h2>
        <dl>
          <div v-if="content?.facts?.['form.factor']?.value">
            <dt>{{ site.home.factorLabel }}</dt>
            <dd>{{ content.facts['form.factor'].value }}</dd>
          </div>
          <div v-if="content?.facts?.['form.scope']?.value">
            <dt>{{ site.home.scopeLabel }}</dt>
            <dd>{{ content.facts['form.scope'].value }}</dd>
          </div>
          <div v-if="product?.status === 'dormant'">
            <dt>{{ site.home.statusLabel }}</dt>
            <dd>{{ site.home.dormantLabel }}</dd>
          </div>
        </dl>
      </aside>
    </header>

    <section v-if="$slots.default" class="landing-release" :aria-label="site.home.releaseLabel"><slot /></section>
    <section v-if="visibleSections.length" class="landing-resources" :aria-labelledby="'resources-' + props.productId">
      <div class="landing-section-head">
        <h2 :id="'resources-' + props.productId">{{ site.home.productDocsTitle }}</h2>
        <p v-if="site.home.productDocsNote">{{ site.home.productDocsNote }}</p>
      </div>
      <div class="landing-resource-grid">
        <a v-for="section in importantSections" :key="section" :href="sectionHref(section)" class="landing-resource">
          <span>{{ site.sectionLabels[section] }}</span>
          <span class="landing-resource-arrow" aria-hidden="true">↗</span>
        </a>
      </div>
      <nav v-if="additionalSections.length" class="landing-additional" :aria-label="site.home.extraDocsTitle">
        <span>{{ site.home.extraDocsTitle }}</span>
        <a v-for="section in additionalSections" :key="section" :href="sectionHref(section)">
          {{ site.sectionLabels[section] }} <span aria-hidden="true">↗</span>
        </a>
      </nav>
    </section>
  </div>
</template>

<style scoped>
.landing { width: 100%; margin: 0 auto; }
.landing-breadcrumb { display: flex; gap: 12px; align-items: center; color: var(--vp-c-text-3); font-size: 13px; margin: 0 0 47px; }
.landing-breadcrumb a { color: var(--vp-c-text-2); text-decoration: none; }
.landing-breadcrumb a:hover { color: var(--vp-c-brand-1); }
.landing-hero { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(250px, .75fr); gap: 60px; padding-bottom: 66px; border-bottom: 1px solid var(--vp-c-divider); }
.landing-identity { display: flex; gap: 20px; align-items: center; }
.landing-logo { width: 92px; height: 92px; flex-shrink: 0; border-radius: 18px; object-fit: contain; }
.landing-fallback { display: grid; place-items: center; background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); font-size: 40px; font-weight: 700; }
.landing-eyebrow { font-size: 13px; line-height: 1.6; font-weight: 600; color: var(--vp-c-brand-1); margin: 0 0 4px; }
.landing-identity h1 { margin: 0; border: 0; padding: 0; font-size: clamp(36px, 4.5vw, 54px); letter-spacing: -.05em; line-height: 1.12; font-weight: 760; color: var(--vp-c-text-1); }
.landing-summary { margin: 28px 0 0; font-size: 18px; line-height: 1.8; color: var(--vp-c-text-2); max-width: 630px; }
.landing-badges { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
.landing-badges span { border: 1px solid var(--vp-c-divider); border-radius: 6px; color: var(--vp-c-text-2); font-size: 12px; padding: 5px 10px; line-height: 1.55; }
.landing-actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 28px; }
.landing-button { display: inline-flex; gap: 15px; justify-content: center; align-items: center; min-height: 45px; padding: 0 17px; font-size: 14px; font-weight: 650; border-radius: 8px; text-decoration: none; }
.landing-button:hover { text-decoration: none; }
.landing-button--primary { color: #fff; background: var(--vp-c-brand-1); }
.landing-button--primary:hover { color: #fff; background: var(--vp-c-brand-2); }
.landing-button--secondary { color: var(--vp-c-text-1); border: 1px solid var(--vp-c-divider); }
.landing-button--secondary:hover { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }
.landing-facts { border: 1px solid var(--vp-c-divider); border-radius: 13px; padding: 25px 25px 12px; align-self: start; background: var(--vp-c-bg); }
.landing-facts h2 { margin: 0; font-size: 15px; font-weight: 700; padding: 0 0 12px; border: 0; line-height: 1.5; }
.landing-facts dl { margin: 0; }
.landing-facts dl > div { padding: 12px 0; border-top: 1px solid var(--vp-c-divider); }
.landing-facts dt { margin: 0; color: var(--vp-c-text-3); font-size: 12px; font-weight: 500; }
.landing-facts dd { margin: 6px 0 0; color: var(--vp-c-text-1); font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
.landing-release { margin: 32px 0 4px; max-width: 860px; }
.landing-resources { padding: 44px 0 15px; }
.landing-section-head { margin-bottom: 18px; }
.landing-section-head h2 { margin: 0; padding: 0; border: none; font-size: 24px; line-height: 1.4; letter-spacing: -.02em; color: var(--vp-c-text-1); }
.landing-section-head p { color: var(--vp-c-text-2); font-size: 13px; margin: 6px 0 0; }
.landing-resource-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 11px; }
.landing-resource { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 18px; min-height: 65px; border: 1px solid var(--vp-c-divider); border-radius: 10px; text-decoration: none; background: var(--vp-c-bg); color: var(--vp-c-text-1); font-size: 14px; font-weight: 620; }
.landing-resource:hover { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); text-decoration: none; }
.landing-resource-arrow { font-size: 15px; color: var(--vp-c-brand-1); }
.landing-additional { margin-top: 19px; padding-top: 20px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 22px; border-top: 1px solid var(--vp-c-divider); }
.landing-additional > span { color: var(--vp-c-text-3); font-size: 12px; }
.landing-additional a { color: var(--vp-c-text-2); font-size: 13px; text-decoration: none; }
.landing-additional a:hover { color: var(--vp-c-brand-1); text-decoration: none; }
@media (max-width: 830px) {
  .landing-hero { grid-template-columns: 1fr; gap: 27px; padding-bottom: 42px; }
  .landing-facts { padding: 22px; }
  .landing-resource-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .landing-breadcrumb { margin-bottom: 30px; }
  .landing-logo { width: 68px; height: 68px; border-radius: 15px; }
  .landing-identity { gap: 14px; }
  .landing-identity h1 { font-size: clamp(30px, 8vw, 38px); }
  .landing-summary { font-size: 15px; margin-top: 22px; }
  .landing-resources { padding-top: 37px; }
  .landing-section-head h2 { font-size: 22px; }
  .landing-resource-grid { grid-template-columns: 1fr; gap: 9px; }
  .landing-resource { min-height: 56px; }
}
</style>
