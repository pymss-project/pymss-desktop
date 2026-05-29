<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'
import {
  CheckmarkCircleOutline,
  AlertCircleOutline,
  CloseCircleOutline,
  HourglassOutline,
  FolderOpenOutline,
  RefreshOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import { useTaskStore, type SeparationTask } from '@/stores/task'

const { t } = useI18n()
const message = useMessage()
const task = useTaskStore()

function formatTime(value: number) {
  return new Date(value).toLocaleString()
}

function openOutput(item: SeparationTask) {
  task.revealPath(item.outputs[0]?.path || item.output)
}

async function handleCancel(id: string) {
  const ok = await task.cancelTask(id)
  if (ok) message.success('Cancelled')
}

async function handleRetry(id: string) {
  try {
    await task.retryTask(id)
    message.success(t('toast.taskRetried'))
  } catch (err) {
    message.error(err instanceof Error ? err.message : String(err))
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'done': return CheckmarkCircleOutline
    case 'failed': return AlertCircleOutline
    case 'cancelled': return CloseCircleOutline
    default: return HourglassOutline
  }
}

function statusType(status: string) {
  switch (status) {
    case 'done': return 'success' as const
    case 'failed': return 'error' as const
    case 'cancelled': return 'default' as const
    default: return 'info' as const
  }
}
</script>

<template>
  <div class="page">
    <div class="page-header-compact">
      <div>
        <h1>{{ t('tasks.title') }}</h1>
        <p>{{ t('tasks.subtitle') }}</p>
      </div>
      <n-button v-if="task.tasks.length" secondary @click="task.clearHistory()">
        <template #icon><n-icon :component="TrashOutline" /></template>
        {{ t('tasks.clearHistory') }}
      </n-button>
    </div>

    <!-- Empty State -->
    <n-card v-if="!task.tasks.length" :bordered="true">
      <div style="text-align:center;padding:32px 0">
        <n-icon :component="HourglassOutline" size="48" color="var(--on-surface-muted)" />
        <p class="text-muted mt-md">{{ t('tasks.empty') }}</p>
      </div>
    </n-card>

    <!-- Task List -->
    <div v-else style="display:grid;gap:12px">
      <n-card
        v-for="item in task.tasks"
        :key="item.id"
        :bordered="true"
        :segmented="{ content: true }"
        size="small"
      >
        <template #header>
          <div class="flex-between" style="flex:1">
            <div>
              <strong style="font-size:14px">{{ item.input.split(/[/\\]/).pop() || item.input }}</strong>
              <span class="text-muted" style="font-size:12px;margin-left:8px">{{ item.model }}</span>
            </div>
            <n-tag :type="statusType(item.status)" :bordered="false" size="small">
              <template #icon><n-icon :component="statusIcon(item.status)" /></template>
              {{ item.status }}
            </n-tag>
          </div>
        </template>

        <p class="text-muted text-sm" style="margin:0">{{ item.message }}</p>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          <n-button
            v-if="!['done','failed','cancelled'].includes(item.status)"
            size="tiny"
            secondary
            @click="handleCancel(item.id)"
          >
            {{ t('common.cancel') }}
          </n-button>
          <n-button
            v-if="['failed','cancelled'].includes(item.status)"
            size="tiny"
            secondary
            @click="handleRetry(item.id)"
          >
            <template #icon><n-icon :component="RefreshOutline" /></template>
            {{ t('tasks.retry') }}
          </n-button>
          <n-button size="tiny" secondary :disabled="!item.output" @click="task.revealPath(item.output)">
            <template #icon><n-icon :component="FolderOpenOutline" /></template>
            {{ t('tasks.openOutput') }}
          </n-button>
          <n-button size="tiny" secondary :disabled="!item.outputs.length" @click="openOutput(item)">
            {{ t('tasks.openFirstOutput') }}
          </n-button>
          <n-button size="tiny" quaternary @click="task.removeTask(item.id)">
            {{ t('tasks.remove') }}
          </n-button>
        </div>

        <!-- Outputs -->
        <div v-if="item.outputs.length" class="mt-md">
          <strong class="text-sm">{{ t('tasks.outputs') }}</strong>
          <div class="mt-sm" style="display:grid;gap:6px">
            <div v-for="output in item.outputs" :key="output.path" class="task-output-row">
              <n-tag size="tiny" :bordered="false">{{ output.stem }}</n-tag>
              <code>{{ output.path }}</code>
              <n-button size="tiny" quaternary @click="task.revealPath(output.path)">{{ t('common.open') }}</n-button>
            </div>
          </div>
        </div>

        <!-- Logs -->
        <n-collapse v-if="item.logs.length" class="mt-md">
          <n-collapse-item :title="`${t('tasks.logs')} (${item.logs.length})`" name="logs">
            <pre style="font-size:12px;max-height:200px;overflow:auto;color:var(--on-surface-muted)">{{ item.logs.join('\n') }}</pre>
          </n-collapse-item>
        </n-collapse>

        <template #footer>
          <span class="text-muted" style="font-size:12px">{{ formatTime(item.createdAt) }}</span>
        </template>
      </n-card>
    </div>
  </div>
</template>
