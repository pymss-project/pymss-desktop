<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getCurrentWindow } from '@tauri-apps/api/window'

const route = useRoute()
const { t } = useI18n()
const appWindow = getCurrentWindow()
const isMaximized = ref(false)

const pageTitle = computed(() => t(`nav.${String(route.name || 'home')}`))

async function refreshMaximized() {
  try { isMaximized.value = await appWindow.isMaximized() } catch { isMaximized.value = false }
}
function minimize() { appWindow.minimize().catch(() => {}) }
function toggleMaximize() { appWindow.toggleMaximize().then(refreshMaximized).catch(() => {}) }
function close() { appWindow.close().catch(() => {}) }
function startDrag(event: MouseEvent) {
  if (event.detail > 1) { toggleMaximize(); return }
  appWindow.startDragging().catch(() => {})
}

let unlisten: (() => void) | undefined
onMounted(async () => {
  await refreshMaximized()
  try { unlisten = await appWindow.onResized(refreshMaximized) } catch {}
})
onUnmounted(() => unlisten?.())
</script>

<template>
  <header class="title-bar">
    <div class="title-brand" @mousedown.left="startDrag">
      <div class="brand-mark">P</div>
      <div class="brand-copy">
        <strong>{{ t('app.name') }}</strong>
        <span>{{ pageTitle }}</span>
      </div>
    </div>
    <div class="title-drag-space" @mousedown.left="startDrag" />
    <div class="window-actions" @mousedown.stop>
      <button type="button" aria-label="Minimize" @click="minimize">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
      <button type="button" aria-label="Maximize" @click="toggleMaximize">
        <svg v-if="isMaximized" width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1.5" y="3.5" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M3.5 3.5V2a.5.5 0 01.5-.5h6a.5.5 0 01.5.5v6a.5.5 0 01-.5.5h-1.5" stroke="currentColor" stroke-width="1.2"/></svg>
        <svg v-else width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="2" y="2" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.2"/></svg>
      </button>
      <button type="button" aria-label="Close" class="danger" @click="close">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    </div>
  </header>
</template>
