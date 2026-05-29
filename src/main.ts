import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import i18n from './i18n'
import { initTheme } from './utils/theme'
import { registerWorkerEvents } from './utils/events'
import { getCurrentWindow } from '@tauri-apps/api/window'
import './styles/global.scss'

initTheme()
registerWorkerEvents()

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(i18n)
app.mount('#app')

getCurrentWindow().show().catch(() => {})
