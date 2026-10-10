<script setup>
import { onMounted, ref } from 'vue'
import registry from '../../../data/products.json'
import site from '../../../data/site.json'
import { useProductContent } from '../composables/useContent.js'

const STATUS_LABEL = { dormant: '低频更新', maintenance: '维护中', unreleased: '尚未发布' }
const products = registry.products
  .filter((product) => product.visibility !== 'internal')
  .map((product) => {
    const content = useProductContent(product.id).value
    return {
      ...product,
      tagline: content?.copy?.['overview.title']?.default ?? '',
      summary: content?.copy?.['overview.summary']?.default ?? '',
      factor: content?.facts?.['form.factor']?.value ?? '',
      scope: content?.facts?.['form.scope']?.value ?? '',
      version: content?.facts?.['version.current']?.value ?? '',
      statusLabel: STATUS_LABEL[product.status] ?? ''
    }
  })
const featured = products.find((product) => product.visibility === 'featured')
const others = products.filter((product) => product.id !== featured?.id)

const brokenLogo = ref({})
const logoEls = {}
function trackLogo(id, el) { if (el) logoEls[id] = el }
onMounted(() => {
  for (const [id, el] of Object.entries(logoEls)) {
    if (el.complete && !el.naturalWidth) brokenLogo.value[id] = true
  }
})
function monogram(name) {
  return [...name].find((ch) => /[A-Za-z]/.test(ch))?.toUpperCase() ?? name.slice(0, 1)
}
function productHref(product) { return '/' + product.id + '/' }
</script>

<template>
  <div class="studio-directory" id="products">
    <section v-if="featured" id="featured" class="studio-featured" aria-labelledby="featured-heading">
      <header class="studio-section-head">
        <div>
          <h2 id="featured-heading">{{ site.home.featuredTitle }}</h2>
          <p v-if="site.home.featuredNote">{{ site.home.featuredNote }}</p>
        </div>
      </header>
      <div class="featured-surface">
        <div class="featured-main">
          <div class="featured-identity">
            <img v-if="featured.brand?.logo && !brokenLogo[featured.id]"
              :ref="(el) => trackLogo(featured.id, el)" :src="featured.brand.logo"
              :alt="featured.name + ' 图标'" class="featured-logo" @error="brokenLogo[featured.id] = true"/>
            <span v-else class="featured-logo featured-fallback">{{ monogram(featured.name) }}</span>
            <div>
              <p class="featured-eyebrow">{{ featured.tagline }}</p>
              <h3>{{ featured.name }}</h3>
            </div>
          </div>
          <p class="featured-summary">{{ featured.summary || site.home.noDescription }}</p>
          <div class="featured-tags">
            <span v-if="featured.factor">{{ site.kindLabels?.[featured.kind] || featured.factor }}</span>
            <span v-if="featured.version">v{{ featured.version }}</span>
          </div>
          <div class="featured-actions">
            <a class="featured-primary" :href="productHref(featured)">{{ site.home.viewProduct }} <span aria-hidden="true">→</span></a>
            <a v-if="featured.sections.includes('install')" :href="productHref(featured) + 'install'" class="featured-secondary">
              {{ site.home.getStarted }} <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
        <div v-if="site.home.featuredSteps?.length" class="featured-steps">
          <h4>{{ site.home.featuredStepsTitle }}</h4>
          <div v-for="(step, index) in site.home.featuredSteps" :key="index" class="featured-step">
            <span class="featured-step-number">{{ String(index + 1).padStart(2, '0') }}</span>
            <div>
              <strong>{{ step.title }}</strong>
              <p>{{ step.description }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="studio-others" aria-labelledby="others-heading">
      <header class="studio-section-head">
        <div>
          <h2 id="others-heading">{{ site.home.othersTitle }}</h2>
          <p>{{ site.home.directoryNote }}</p>
        </div>
        <span class="studio-count">{{ others.length }} {{ site.home.productUnit }}</span>
      </header>

      <div class="studio-products-grid">
        <a v-for="product in others" :key="product.id" class="studio-product"
          :href="productHref(product)">
          <div class="studio-product-top">
            <img v-if="product.brand?.logo && !brokenLogo[product.id]"
              :ref="(el) => trackLogo(product.id, el)" class="studio-product-logo"
              :src="product.brand.logo" :alt="product.name + ' 图标'"
              loading="lazy" @error="brokenLogo[product.id] = true"/>
            <span v-else class="studio-product-logo studio-product-fallback">{{ monogram(product.name) }}</span>
            <div class="studio-product-identity">
              <p>{{ product.tagline || product.factor }}</p>
              <h3>{{ product.name }}</h3>
            </div>
          </div>
          <p class="studio-product-summary">{{ product.summary || site.home.noDescription }}</p>
          <div class="studio-product-bottom">
            <span v-if="product.statusLabel" class="studio-product-status">{{ product.statusLabel }}</span>
            <span v-else-if="product.version" class="studio-product-status">v{{ product.version }}</span>
            <span v-else class="studio-product-status">{{ site.kindLabels?.[product.kind] || product.factor }}</span>
            <span class="studio-product-link">{{ site.home.viewProduct }} <span aria-hidden="true">↗</span></span>
          </div>
        </a>
      </div>
    </section>
  </div>
</template>

<style scoped>
.studio-directory { max-width: 1184px; margin: 0 auto; padding: 0 28px 112px; }
.studio-featured { scroll-margin-top: 90px; }
.studio-section-head { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin: 0 0 20px; }
.studio-section-head h2 { font-size: 25px; letter-spacing: -.035em; line-height: 1.35; font-weight: 720; color: var(--vp-c-text-1); margin: 0; }
.studio-section-head p { color: var(--vp-c-text-2); font-size: 14px; line-height: 1.65; margin: 6px 0 0; }
.featured-surface {
  display: grid; grid-template-columns: minmax(0, 1.12fr) minmax(300px, .88fr);
  border: 1px solid var(--vp-c-divider); border-radius: 17px;
  background: var(--vp-c-bg); overflow: hidden;
  box-shadow: 0 12px 32px rgba(23, 41, 71, .035);
}
.featured-main { padding: 38px 40px; display: flex; flex-direction: column; align-items: flex-start; }
.featured-identity { display: flex; align-items: center; gap: 19px; }
.featured-logo { width: 76px; height: 76px; object-fit: contain; flex-shrink: 0; border-radius: 17px; }
.featured-fallback, .studio-product-fallback { display: grid; place-items: center; color: var(--vp-c-brand-1); font-weight: 700; background: var(--vp-c-brand-soft); }
.featured-identity h3 { font-size: 32px; line-height: 1.22; letter-spacing: -.04em; margin: 3px 0 0; font-weight: 740; color: var(--vp-c-text-1); }
.featured-eyebrow { font-size: 13px; margin: 0; color: var(--vp-c-text-2); }
.featured-summary { font-size: 16px; line-height: 1.8; color: var(--vp-c-text-2); margin: 25px 0 0; max-width: 490px; }
.featured-tags { display: flex; flex-wrap: wrap; gap: 8px; margin: 19px 0 0; }
.featured-tags span { font-size: 12px; line-height: 1.6; border: 1px solid var(--vp-c-divider); padding: 5px 10px; border-radius: 6px; color: var(--vp-c-text-2); }
.featured-actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: auto; padding-top: 27px; }
.featured-actions a { text-decoration: none; display: inline-flex; align-items: center; gap: 15px; border-radius: 8px; padding: 11px 16px; font-size: 14px; font-weight: 620; transition: transform .2s, border-color .2s; }
.featured-actions a:hover { text-decoration: none; transform: translateY(-1px); }
.featured-primary { color: #fff; background: var(--vp-c-brand-1); }
.featured-primary:hover { color: #fff; }
.featured-secondary { color: var(--vp-c-text-1); border: 1px solid var(--vp-c-divider); }
.featured-secondary:hover { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }
.featured-steps { margin: 32px 0; padding: 9px 36px; border-left: 1px solid var(--vp-c-divider); }
.featured-steps h4 { font-size: 13px; font-weight: 630; color: var(--vp-c-text-2); margin: 0 0 5px; }
.featured-step { display: flex; align-items: start; gap: 16px; padding: 16px 0; border-bottom: 1px solid var(--vp-c-divider); }
.featured-step:last-child { border-bottom: 0; }
.featured-step-number { font-size: 13px; font-weight: 720; color: var(--vp-c-brand-1); letter-spacing: .03em; }
.featured-step strong { font-size: 14px; font-weight: 670; color: var(--vp-c-text-1); }
.featured-step p { font-size: 13px; color: var(--vp-c-text-2); line-height: 1.6; margin: 5px 0 0; }
.studio-others { margin-top: 65px; }
.studio-count { font-size: 13px; color: var(--vp-c-text-3); white-space: nowrap; padding-bottom: 5px; }
.studio-products-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.studio-product {
  display: flex; flex-direction: column; padding: 23px; border: 1px solid var(--vp-c-divider);
  border-radius: 13px; text-decoration: none; min-width: 0; background: var(--vp-c-bg);
  transition: transform .2s, border-color .2s, box-shadow .2s;
}
.studio-product:hover { text-decoration: none; transform: translateY(-3px); border-color: var(--vp-c-brand-2); box-shadow: 0 10px 24px rgba(23, 41, 71, .06); }
.studio-product-top { display: flex; gap: 13px; align-items: center; }
.studio-product-logo { flex-shrink: 0; width: 52px; height: 52px; border-radius: 12px; object-fit: contain; }
.studio-product-identity { min-width: 0; }
.studio-product-identity p { color: var(--vp-c-text-3); margin: 0 0 3px; font-size: 12px; line-height: 1.4; }
.studio-product-identity h3 { color: var(--vp-c-text-1); font-size: 18px; line-height: 1.3; font-weight: 700; letter-spacing: -.02em; margin: 0; }
.studio-product-summary { font-size: 14px; line-height: 1.75; color: var(--vp-c-text-2); margin: 18px 0 20px; flex: 1; }
.studio-product-bottom { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.studio-product-status { color: var(--vp-c-text-3); font-size: 12px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.studio-product-link { font-size: 13px; white-space: nowrap; font-weight: 660; color: var(--vp-c-brand-1); }
@media (min-width: 1100px) {
 .studio-products-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
 .studio-product { min-height: 236px; }
}
@media (max-width: 850px) {
  .featured-surface { grid-template-columns: 1fr; }
  .featured-main { padding: 29px; }
  .featured-steps { border-left: 0; border-top: 1px solid var(--vp-c-divider); margin: 0 29px 22px; padding: 20px 0 0; }
}
@media (max-width: 767px) {
  .studio-directory { padding: 0 20px 72px; }
  .studio-others { margin-top: 46px; }
  .studio-section-head h2 { font-size: 22px; }
  .featured-logo { width: 64px; height: 64px; }
  .featured-identity h3 { font-size: 27px; }
  .featured-main { padding: 23px; }
  .featured-summary { margin-top: 18px; font-size: 14px; }
  .featured-steps { margin: 0 23px 10px; }
  .studio-products-grid { grid-template-columns: 1fr; gap: 12px; }
  .studio-product { padding: 19px; }
}
</style>
