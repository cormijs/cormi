import '@fontsource-variable/recursive/full.css'
import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import CordDiagram from './components/CordDiagram.vue'
import HomeCatalog from './components/HomeCatalog.vue'
import HomeHero from './components/HomeHero.vue'
import HomeSides from './components/HomeSides.vue'
import './style.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('CordDiagram', CordDiagram)
    app.component('HomeHero', HomeHero)
    app.component('HomeSides', HomeSides)
    app.component('HomeCatalog', HomeCatalog)
  },
} satisfies Theme
