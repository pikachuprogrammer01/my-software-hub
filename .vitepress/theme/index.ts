import DefaultTheme from 'vitepress/theme'
import ReleaseInfo from './components/ReleaseInfo.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    // markdown 里直接写 <ReleaseInfo /> 即可拿到线上版本号与下载直链，页面不需要写代码
    app.component('ReleaseInfo', ReleaseInfo)
  }
}
