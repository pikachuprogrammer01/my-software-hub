<script setup>
import site from '../../../data/site.json'
</script>

<template>
  <section class="studio-hero" aria-labelledby="studio-heading">
    <div class="studio-hero__content">
      <h1 id="studio-heading" class="studio-hero__heading">
        <span><span class="hero-desktop">{{ site.home.headline }}</span><span class="hero-mobile">{{ site.home.mobileHeadline }}</span></span>
        <span class="studio-hero__emphasis"><span class="hero-desktop">{{ site.home.highlight }}</span><span class="hero-mobile">{{ site.home.mobileHighlight }}</span></span>
      </h1>
      <p class="studio-hero__description">{{ site.home.intro }}</p>
      <div class="studio-hero__actions">
        <a
          v-for="(action, index) in site.actions"
          :key="action.href"
          :href="action.href"
          class="studio-button"
          :class="index === 0 ? 'studio-button--primary' : 'studio-button--secondary'"
        >
          {{ action.text }} <span aria-hidden="true">→</span>
        </a>
      </div>
    </div>
  </section>
</template>

<style scoped>
.studio-hero {
  max-width: 1184px;
  margin: 0 auto;
  padding: 94px 28px 68px;
}
.studio-hero__content { max-width: 845px; }
.hero-mobile { display: none; }
.studio-hero__heading {
  display: flex;
  flex-direction: column;
  margin: 0;
  font-size: clamp(39px, 5vw, 62px);
  font-weight: 760;
  line-height: 1.23;
  letter-spacing: -0.045em;
  color: var(--vp-c-text-1);
}
.studio-hero__heading span { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
.studio-hero__emphasis { color: var(--vp-c-brand-1); }
.studio-hero__description {
  margin: 25px 0 0;
  max-width: 690px;
  color: var(--vp-c-text-2);
  font-size: 16px;
  line-height: 1.9;
}
.studio-hero__actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 30px; }
.studio-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  min-height: 46px;
  padding: 0 20px;
  border: 1px solid transparent;
  border-radius: 9px;
  text-decoration: none;
  font-size: 14px;
  font-weight: 650;
  transition: background .2s, border-color .2s, transform .2s;
}
.studio-button:hover { text-decoration: none; transform: translateY(-1px); }
.studio-button--primary { background: var(--vp-c-brand-1); color: #fff; }
.studio-button--primary:hover { background: var(--vp-c-brand-2); color: #fff; }
.studio-button--secondary {
  border-color: var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}
.studio-button--secondary:hover { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }
@media (max-width: 767px) {
  .studio-hero { padding: 60px 20px 52px; }
  .studio-hero__heading { font-size: clamp(30px, 8vw, 38px); letter-spacing: -0.035em; line-height: 1.32; }
  .hero-desktop { display: none; }
  .hero-mobile { display: inline; }
  .studio-hero__description { font-size: 15px; margin-top: 20px; }
  .studio-hero__actions { margin-top: 25px; gap: 8px; }
  .studio-button { gap: 7px; padding: 0 12px; font-size: 13px; white-space: nowrap; }
}
@media (max-width: 390px) {
  .studio-button { flex: 1 0 auto; }
}
</style>
