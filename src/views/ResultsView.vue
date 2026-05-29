<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import {
  FolderOpenOutline,
  CheckmarkCircleOutline,
  FolderOutline,
} from '@vicons/ionicons5'
import { useTaskStore } from '@/stores/task'

const { t } = useI18n()
const task = useTaskStore()
</script>

<template>
  <div class="page">
    <div class="page-header-compact">
      <div>
        <h1>{{ t('results.title') }}</h1>
        <p>{{ t('results.subtitle') }}</p>
      </div>
    </div>

    <!-- Empty State -->
    <n-card v-if="!task.completedTasks.length" :bordered="true">
      <div style="text-align:center;padding:32px 0">
        <n-icon :component="FolderOutline" size="48" color="var(--on-surface-muted)" />
        <p class="text-muted mt-md">{{ t('results.empty') }}</p>
      </div>
    </n-card>

    <!-- Results List -->
    <div v-else style="display:grid;gap:12px">
      <n-card
        v-for="item in task.completedTasks"
        :key="item.id"
        :bordered="true"
        size="small"
      >
        <template #header>
          <div class="flex-between" style="flex:1">
            <div>
              <strong style="font-size:14px">{{ item.input.split(/[/\\]/).pop() || item.input }}</strong>
              <span class="text-muted" style="font-size:12px;margin-left:8px">{{ item.model }}</span>
            </div>
            <n-button size="tiny" secondary @click="task.revealPath(item.output)">
              <template #icon><n-icon :component="FolderOpenOutline" /></template>
              {{ t('tasks.openOutput') }}
            </n-button>
          </div>
        </template>

        <!-- Output stems -->
        <div style="display:grid;gap:6px">
          <div v-for="output in item.outputs" :key="output.path" class="task-output-row">
            <n-tag size="tiny" type="success" :bordered="false">
              <template #icon><n-icon :component="CheckmarkCircleOutline" /></template>
              {{ output.stem }}
            </n-tag>
            <code>{{ output.path }}</code>
            <n-button size="tiny" quaternary @click="task.revealPath(output.path)">{{ t('common.open') }}</n-button>
          </div>
        </div>
      </n-card>
    </div>
  </div>
</template>
