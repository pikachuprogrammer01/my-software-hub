import DefaultTheme from 'vitepress/theme'
import Fact from './components/Fact.vue'
import ProductOverview from './components/ProductOverview.vue'
import ReleaseInfo from './components/ReleaseInfo.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    // markdown 里写 <ReleaseInfo /> / <ProductOverview /> / <Fact> 即可拿到线上版本、
    // 内容包文案与承重事实，页面不写代码也不抄数字。
    app.component('Fact', Fact)
    app.component('ProductOverview', ProductOverview)
    app.component('ReleaseInfo', ReleaseInfo)
  }
}
