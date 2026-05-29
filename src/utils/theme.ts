export type ThemeMode = 'system' | 'dark' | 'light'

const KEY = 'pymss:theme_mode'
let currentMode: ThemeMode = 'system'

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'system' || value === 'dark' || value === 'light'
}

export function getThemeMode(): ThemeMode {
  const stored = localStorage.getItem(KEY)
  return isThemeMode(stored) ? stored : 'system'
}

export function resolvedIsDark(mode: ThemeMode = currentMode): boolean {
  return mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
}

function applyThemeClass(mode: ThemeMode) {
  currentMode = mode
  const dark = resolvedIsDark(mode)
  document.documentElement.classList.toggle('dark-theme', dark)
  document.documentElement.classList.toggle('light-theme', !dark)
}

export function applyTheme(mode: ThemeMode) {
  applyThemeClass(mode)
  localStorage.setItem(KEY, mode)
}

export function initTheme() {
  applyThemeClass(getThemeMode())
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getThemeMode() === 'system') applyThemeClass('system')
  })
}
