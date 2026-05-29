import { createI18n } from 'vue-i18n'
import zhCN from './zh-CN.json'
import en from './en.json'

export const SUPPORTED_LOCALES = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en', label: 'English' },
] as const

export type SupportedLocale = typeof SUPPORTED_LOCALES[number]['code']

export function detectLocale(): SupportedLocale {
  const stored = localStorage.getItem('pymss:locale')
  if (stored === 'zh-CN' || stored === 'en') return stored
  const nav = navigator.language || 'zh-CN'
  return nav.startsWith('zh') ? 'zh-CN' : 'en'
}

const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    en,
  },
})

export function setLocale(locale: SupportedLocale) {
  ;(i18n.global.locale as any).value = locale
  localStorage.setItem('pymss:locale', locale)
  document.documentElement.lang = locale
}

export default i18n
