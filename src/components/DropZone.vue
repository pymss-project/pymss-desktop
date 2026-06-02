<script setup lang="ts">
import { CloudUploadOutline } from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>

<template>
  <div class="drop-wrapper">
    <div class="drop-icon-wrap">
      <n-icon :component="CloudUploadOutline" :size="28" />
    </div>
    <h2>{{ t('home.dropTitle') }}</h2>
    <p>{{ t('home.dropHint') }}</p>
  </div>
</template>
