import DefaultTheme from 'vitepress/theme'
import Layout from './Layout.vue'
import AutoClickerDownloadButtons from './components/AutoClickerDownloadButtons.vue'
import Fact from './components/Fact.vue'
import ProductDirectory from './components/ProductDirectory.vue'
import ProductOverview from './components/ProductOverview.vue'
import ReleaseInfo from './components/ReleaseInfo.vue'
import SiteHero from './components/SiteHero.vue'
import WpsDownloadButtons from './components/WpsDownloadButtons.vue'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    // markdown 里写 <ReleaseInfo /> / <ProductOverview /> / <Fact> 即可拿到线上版本、
    // 内容包文案与承重事实，页面不写代码也不抄数字。
    app.component('Fact', Fact)
    app.component('AutoClickerDownloadButtons', AutoClickerDownloadButtons)
    app.component('ProductDirectory', ProductDirectory)
    app.component('ProductOverview', ProductOverview)
    app.component('ReleaseInfo', ReleaseInfo)
    app.component('SiteHero', SiteHero)
    app.component('WpsDownloadButtons', WpsDownloadButtons)
  }
}
