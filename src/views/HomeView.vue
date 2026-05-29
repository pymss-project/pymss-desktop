<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import {
  MusicalNotesOutline,
  CubeOutline,
  ListOutline,
  SpeedometerOutline,
  CheckmarkCircleOutline,
  AlertCircleOutline,
  HelpCircleOutline,
} from '@vicons/ionicons5'
import DropZone from '@/components/DropZone.vue'
import { useAppStore } from '@/stores/app'
import { useModelStore } from '@/stores/model'
import { useTaskStore } from '@/stores/task'

const { t } = useI18n()
const router = useRouter()
const message = useMessage()
const app = useAppStore()
const models = useModelStore()
const tasks = useTaskStore()

async function checkEnv() {
  try {
    await app.checkEnv()
    message.success(t('toast.envChecked'))
  } catch {
    message.error(t('toast.envFailed'))
  }
}
</script>

<template>
  <div class="page">
    <!-- Header -->
    <div class="page-header-compact">
      <div>
        <h1>{{ t('home.title') }}</h1>
        <p>{{ t('home.subtitle') }}</p>
      </div>
      <n-button type="primary" size="large" @click="router.push('/separate')">
        <template #icon><n-icon :component="MusicalNotesOutline" /></template>
        {{ t('home.primaryAction') }}
      </n-button>
    </div>

    <n-grid :cols="2" :x-gap="16" :y-gap="16">
      <!-- Quick Actions -->
      <n-grid-item :span="1" :span-980="2">
        <n-card size="medium" :bordered="true" style="min-height: 340px">
          <template #header><n-icon :component="SpeedometerOutline" /> {{ t('home.quickStart') }}</template>
          <p class="text-muted text-sm">{{ t('home.quickStartDesc') }}</p>
          <div class="mt-lg" style="display:grid;gap:12px">
            <n-button block strong @click="router.push('/separate')">
              <template #icon><n-icon :component="MusicalNotesOutline" /></template>
              {{ t('home.actionSeparate') }}
            </n-button>
            <n-button block secondary strong @click="router.push('/models')">
              <template #icon><n-icon :component="CubeOutline" /></template>
              {{ t('home.actionModels') }}
            </n-button>
            <n-button block secondary strong @click="router.push('/tasks')">
              <template #icon><n-icon :component="ListOutline" /></template>
              {{ t('home.actionTasks') }}
            </n-button>
          </div>
        </n-card>
      </n-grid-item>

      <n-grid-item :span="1" :span-980="2">
        <n-grid :cols="1" :x-gap="16" :y-gap="16">
          <!-- Environment -->
          <n-grid-item>
            <n-card size="small" :bordered="true">
              <template #header>
                <div class="flex-between">
                  <span><n-icon :component="app.envReady ? CheckmarkCircleOutline : HelpCircleOutline" /> {{ t('home.envTitle') }}</span>
                  <n-tag v-if="app.envReady" :bordered="false" size="small" type="success">{{ t('settings.envReady') }}</n-tag>
                  <n-tag v-else-if="app.envInfo" :bordered="false" size="small" type="warning">{{ t('settings.envNeedsAttention') }}</n-tag>
                  <n-tag v-else :bordered="false" size="small" type="info">{{ t('settings.envNotChecked') }}</n-tag>
                </div>
              </template>
              <div style="display:grid;gap:8px">
                <div class="flex-between text-sm"><span class="text-muted">{{ t('env.python') }}</span><span>{{ app.envInfo?.pythonVersion || t('common.unknown') }}</span></div>
                <div class="flex-between text-sm"><span class="text-muted">{{ t('env.pymss') }}</span><span>{{ app.envInfo?.pymssAvailable ? t('common.ready') : t('common.unknown') }}</span></div>
                <div class="flex-between text-sm"><span class="text-muted">{{ t('env.torch') }}</span><span>{{ app.envInfo?.torchVersion || t('common.unknown') }}</span></div>
              </div>
              <template #footer>
                <n-button block secondary :loading="app.envLoading" @click="checkEnv">
                  {{ app.envLoading ? t('settings.checkingEnv') : t('settings.checkEnv') }}
                </n-button>
              </template>
            </n-card>
          </n-grid-item>

          <!-- Models Summary -->
          <n-grid-item>
            <n-card size="small" :bordered="true">
              <template #header><n-icon :component="CubeOutline" /> {{ t('home.modelTitle') }}</template>
              <div class="flex-between">
                <span class="text-muted text-sm">{{ models.downloadedModels.length }} {{ t('models.downloaded') }}</span>
                <n-button text type="primary" @click="router.push('/models')">{{ t('nav.models') }}</n-button>
              </div>
            </n-card>
          </n-grid-item>

          <!-- Tasks Summary -->
          <n-grid-item>
            <n-card size="small" :bordered="true">
              <template #header><n-icon :component="ListOutline" /> {{ t('home.recentTitle') }}</template>
              <div class="flex-between">
                <span class="text-muted text-sm">
                  {{ tasks.runningTasks.length ? `${tasks.runningTasks.length} ${t('tasks.title')}` : t('tasks.empty') }}
                </span>
                <n-button text type="primary" @click="router.push('/tasks')">{{ t('nav.tasks') }}</n-button>
              </div>
            </n-card>
          </n-grid-item>
        </n-grid>
      </n-grid-item>
    </n-grid>
  </div>
</template>
