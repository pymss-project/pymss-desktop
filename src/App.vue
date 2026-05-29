<script setup lang="ts">
import { computed, h } from 'vue'
import { darkTheme } from 'naive-ui'
import type { GlobalThemeOverrides } from 'naive-ui'
import TitleBar from '@/components/TitleBar.vue'
import SideNav from '@/components/SideNav.vue'
import { useSettingsStore } from '@/stores/settings'
import { resolvedIsDark } from '@/utils/theme'

const settings = useSettingsStore()

const isDark = computed(() => resolvedIsDark(settings.themeMode))

// Naive UI's seemly/rgba() requires actual CSS color values (not var() references)
const themeOverrides = computed<GlobalThemeOverrides>(() => {
  const dark = isDark.value
  return {
    common: {
      bodyColor: dark ? '#111318' : '#f7f8fb',
      cardColor: dark ? '#181b21' : '#ffffff',
      modalColor: dark ? '#181b21' : '#ffffff',
      popoverColor: dark ? '#181b21' : '#ffffff',
      tableColor: dark ? '#181b21' : '#ffffff',
      inputColor: dark ? '#20242b' : '#eef1f6',
      actionColor: dark ? '#20242b' : '#eef1f6',
      hoverColor: dark ? '#20242b' : '#eef1f6',
      dividerColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(17,24,39,0.10)',
      borderColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(17,24,39,0.10)',
      textColor1: dark ? '#eef1f6' : '#171a1f',
      textColor2: dark ? '#a8b0bd' : '#667085',
      textColor3: dark ? '#a8b0bd' : '#667085',
      primaryColor: dark ? '#7aa2ff' : '#315fbd',
      primaryColorHover: dark ? '#9bb8ff' : '#234a95',
      primaryColorPressed: dark ? '#9bb8ff' : '#234a95',
      primaryColorSuppl: dark ? '#7aa2ff' : '#315fbd',
      successColor: dark ? '#4caf7d' : '#2e7d58',
      warningColor: dark ? '#d6a33a' : '#9a6b00',
      errorColor: dark ? '#dc6675' : '#b4233a',
      placeholderColor: dark ? '#a8b0bd' : '#667085',
      tableHeaderColor: dark ? '#20242b' : '#eef1f6',
    },
    Card: {
      paddingMedium: '20px',
      borderRadius: '16px',
      titleTextColor: dark ? '#eef1f6' : '#171a1f',
      color: dark ? '#181b21' : '#ffffff',
      borderColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(17,24,39,0.10)',
    },
    Button: {
      borderRadius: '10px',
      textColor: dark ? '#eef1f6' : '#171a1f',
      color: dark ? '#20242b' : '#eef1f6',
      borderColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(17,24,39,0.10)',
      colorHover: dark ? '#292e37' : '#e5e9f0',
      textColorHover: dark ? '#eef1f6' : '#171a1f',
    },
    Input: {
      borderRadius: '10px',
      color: dark ? '#20242b' : '#eef1f6',
      textColor: dark ? '#eef1f6' : '#171a1f',
      border: dark ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(17,24,39,0.10)',
      borderHover: dark ? '1px solid #7aa2ff' : '1px solid #315fbd',
      borderFocus: dark ? '1px solid #7aa2ff' : '1px solid #315fbd',
    },
    Select: {
      borderRadius: '10px',
      menuColor: dark ? '#181b21' : '#ffffff',
    },
    Tag: {
      borderRadius: '8px',
    },
    Progress: {
      railColor: dark ? '#292e37' : '#e5e9f0',
    },
    Menu: {
      itemColorActive: dark ? 'rgba(122,162,255,0.14)' : 'rgba(49,95,189,0.10)',
      itemTextColorActive: dark ? '#9bb8ff' : '#234a95',
      itemTextColor: dark ? '#a8b0bd' : '#667085',
      itemColorHover: dark ? '#20242b' : '#eef1f6',
      itemTextColorHover: dark ? '#eef1f6' : '#171a1f',
      borderRadius: '10px',
    },
    Steps: {
      stepHeaderFontSizeSmall: '14px',
      stepIndicatorTextColorFinished: dark ? '#7aa2ff' : '#315fbd',
      stepHeaderTextColorFinished: dark ? '#eef1f6' : '#171a1f',
      stepIndicatorBorderColorFinished: dark ? '#7aa2ff' : '#315fbd',
      connectorColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(17,24,39,0.10)',
    },
    Collapse: {
      titleTextColor: dark ? '#eef1f6' : '#171a1f',
      titleTextColorDisabled: dark ? '#a8b0bd' : '#667085',
      dividerColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(17,24,39,0.10)',
      borderRadius: '12px',
    },
    DataTable: {
      tdColor: dark ? '#181b21' : '#ffffff',
      thColor: dark ? '#20242b' : '#eef1f6',
      borderColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(17,24,39,0.10)',
    },
    Slider: {
      railColor: dark ? '#292e37' : '#e5e9f0',
    },
    Switch: {
      railColor: dark ? '#292e37' : '#e5e9f0',
      railColorActive: dark ? '#7aa2ff' : '#315fbd',
    },
  }
})
</script>

<template>
  <n-config-provider :theme="isDark ? darkTheme : null" :theme-overrides="themeOverrides">
    <n-notification-provider>
      <n-message-provider>
        <n-dialog-provider>
        <div class="app-shell">
          <div class="app-backdrop" />
          <TitleBar />
          <div class="app-body">
            <SideNav />
            <main class="app-content">
              <router-view v-slot="{ Component, route }">
                <transition name="page" mode="out-in">
                  <component :is="Component" :key="route.path" />
                </transition>
              </router-view>
            </main>
          </div>
        </div>
        </n-dialog-provider>
      </n-message-provider>
    </n-notification-provider>
  </n-config-provider>
</template>
