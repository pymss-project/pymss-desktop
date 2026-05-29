<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useMessage, useDialog } from 'naive-ui'
import {
  SearchOutline,
  DownloadOutline,
  CheckmarkCircleOutline,
  CloudDownloadOutline,
  RefreshOutline,
  CubeOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import { useModelStore, type ModelEntry } from '@/stores/model'
import { useSettingsStore } from '@/stores/settings'
import { formatBytes } from '@/utils/format'

const { t, locale } = useI18n()
const message = useMessage()
const dialog = useDialog()
const modelStore = useModelStore()
const settings = useSettingsStore()
const {
  filteredModels,
  selectedInfo,
  selectedModel,
  search,
  supportedOnly,
  category,
  categories,
  categoriesCn,
  isLoading,
  modelDir,
  downloadTasks,
} = storeToRefs(modelStore)

const showDetail = computed({
  get: () => !!selectedInfo.value,
  set: (val: boolean) => {
    if (!val) {
      selectedModel.value = ''
      selectedInfo.value = null
    }
  },
})

const downloadedOnly = ref(false)

const categoryOptions = computed(() => {
  const all = [{ label: t('common.all'), value: '' }]
  const items = categories.value.map((cat, i) => ({
    label: locale.value === 'zh-CN' && categoriesCn.value[i] ? categoriesCn.value[i] : cat,
    value: cat,
  }))
  return [...all, ...items]
})

const sortedModels = computed(() => {
  const list = downloadedOnly.value
    ? filteredModels.value.filter((m) => m.downloaded)
    : filteredModels.value
  return [...list].sort((a, b) => {
    if (a.downloaded !== b.downloaded) return a.downloaded ? -1 : 1
    return 0
  })
})

function categoryLabel(model: ModelEntry) {
  return locale.value === 'zh-CN' ? (model.categoryCn || model.category) : model.category
}

async function loadModels() {
  try {
    await modelStore.loadModels()
  } catch {
    message.error(modelStore.error || 'Failed to load models')
  }
}

async function selectModel(model: ModelEntry) {
  try {
    await modelStore.selectModel(model.name)
  } catch (err) {
    message.error(err instanceof Error ? err.message : String(err))
  }
}

async function downloadModel(model: ModelEntry, event: MouseEvent) {
  event.stopPropagation()
  try {
    await modelStore.downloadModel(model.name)
    message.success(t('models.downloaded'))
  } catch (err) {
    message.error(err instanceof Error ? err.message : String(err))
  }
}

async function cancelDownloadModel(model: ModelEntry, event: MouseEvent) {
  event.stopPropagation()
  await modelStore.cancelDownload(model.name)
}

function confirmDeleteModel(model: ModelEntry, event?: MouseEvent) {
  event?.stopPropagation()
  dialog.warning({
    title: t('models.deleteConfirmTitle'),
    content: t('models.deleteConfirmContent'),
    positiveText: t('common.confirm'),
    negativeText: t('common.cancel'),
    onPositiveClick: () => {
      // 异步执行删除，不阻塞对话框关闭
      modelStore.deleteModel(model.name).then(() => {
        message.success(t('models.deleteSuccess'))
      }).catch((err) => {
        message.error(err instanceof Error ? err.message : String(err))
      })
    },
  })
}

onMounted(() => {
  if (!modelStore.models.length) void loadModels()
})
</script>

<template>
  <div class="page">
    <div class="page-header-compact">
      <div>
        <h1>{{ t('models.title') }}</h1>
        <p>{{ t('models.subtitle') }}</p>
      </div>
      <n-button secondary :loading="isLoading" @click="loadModels">
        <template #icon><n-icon :component="RefreshOutline" /></template>
        {{ t('models.load') }}
      </n-button>
    </div>

    <!-- Filter Toolbar -->
    <div class="toolbar">
      <div class="toolbar-row">
        <n-input
          v-model:value="search"
          :placeholder="t('models.search')"
          clearable
          class="search-input"
        >
          <template #prefix><n-icon :component="SearchOutline" /></template>
        </n-input>
        <n-select
          v-model:value="category"
          :options="categoryOptions"
          size="small"
          class="category-select"
          :consistent-menu-width="false"
        />
        <div class="toolbar-actions">
          <n-switch v-model:value="downloadedOnly" size="small" />
          <span class="text-sm text-muted">{{ t('models.downloadedOnly') }}</span>
          <n-divider vertical style="margin:0 4px" />
          <n-switch v-model:value="supportedOnly" size="small" @update:value="loadModels" />
          <span class="text-sm text-muted">{{ t('models.supportedOnly') }}</span>
          <n-tag size="small" :bordered="false" type="info" round>
            {{ sortedModels.length }}
          </n-tag>
        </div>
      </div>
      <div class="toolbar-row">
        <div class="dir-info">
          <span class="text-muted">{{ t('models.modelDir') }}:</span>
          <code class="dir-path">{{ modelDir || settings.modelDir || '—' }}</code>
        </div>
      </div>
    </div>

    <!-- Body: Model Grid + Detail Drawer -->
    <div class="models-body">
      <!-- Loading Skeleton -->
      <div v-if="isLoading" class="model-grid">
        <div v-for="i in 6" :key="i" class="skel-card">
          <n-skeleton text style="width:70%;height:18px;margin-bottom:12px" />
          <n-skeleton text style="width:40%;height:14px;margin-bottom:16px" />
          <n-skeleton text style="width:100%;height:12px;margin-bottom:6px" />
          <n-skeleton text style="width:80%;height:12px" />
        </div>
      </div>

      <!-- Empty State -->
      <div v-else-if="!filteredModels.length" class="empty-state">
        <n-icon :component="CubeOutline" size="48" color="var(--on-surface-muted)" />
        <p class="text-muted">{{ search ? t('models.searchEmpty') : t('models.empty') }}</p>
        <n-button v-if="!search && !modelStore.models.length" secondary @click="loadModels">
          {{ t('models.load') }}
        </n-button>
      </div>

      <!-- Model Grid -->
      <div v-else class="model-grid">
        <div
          v-for="model in sortedModels"
          :key="model.name"
          :class="['model-card', {
            'model-card--selected': selectedModel === model.name,
            'model-card--unsupported': !model.supported
          }]"
          @click="selectModel(model)"
        >
          <!-- Card Header -->
          <div class="mc-header">
            <span class="mc-name">{{ model.name }}</span>
            <n-tag
              :bordered="false"
              size="tiny"
              :type="model.downloaded ? 'success' : model.supported ? 'default' : 'warning'"
              round
            >
              {{ !model.supported ? t('models.unsupported') : model.downloaded ? t('models.downloaded') : t('models.notDownloaded') }}
            </n-tag>
          </div>

          <!-- Meta Tags -->
          <div class="mc-tags">
            <n-tag v-if="model.architecture" :bordered="false" size="tiny" type="info" round>
              {{ model.architecture }}
            </n-tag>
            <n-tag v-if="model.modelType" :bordered="false" size="tiny" round>
              {{ model.modelType }}
            </n-tag>
            <span class="mc-size">{{ formatBytes(model.sizeBytes) }}</span>
          </div>

          <!-- Key Info -->
          <div class="mc-meta">
            <div class="mc-meta-item">
              <span class="mc-label">{{ t('models.targetStem') }}</span>
              <span class="mc-value">{{ model.targetStem || '—' }}</span>
            </div>
            <div class="mc-meta-item">
              <span class="mc-label">{{ t('models.category') }}</span>
              <span class="mc-value">{{ categoryLabel(model) || '—' }}</span>
            </div>
          </div>

          <!-- Footer -->
          <div class="mc-footer">
            <!-- Download button -->
            <n-button
              v-if="model.supported && !model.downloaded && (!downloadTasks[model.name] || downloadTasks[model.name].status === 'done')"
              block
              secondary
              size="small"
              @click="downloadModel(model, $event)"
            >
              <template #icon><n-icon :component="DownloadOutline" /></template>
              {{ t('common.download') }}
            </n-button>

            <!-- Download progress -->
            <div v-else-if="downloadTasks[model.name] && downloadTasks[model.name].status !== 'done'" class="mc-dl">
              <div class="mc-dl-info">
                <div class="mc-dl-status">
                  <span :class="['mc-dl-dot', `mc-dl-dot--${downloadTasks[model.name].status}`]" />
                  <span class="mc-dl-msg">{{ downloadTasks[model.name].message || downloadTasks[model.name].status }}</span>
                </div>
                <span class="mc-dl-pct">{{ downloadTasks[model.name].progress }}%</span>
              </div>
              <n-progress
                :percentage="downloadTasks[model.name].progress"
                :show-indicator="false"
                :height="8"
                :border-radius="4"
                type="line"
                :color="downloadTasks[model.name].status === 'error' ? 'var(--danger)' : 'var(--primary)'"
                :rail-color="'var(--surface-3)'"
              />
              <div v-if="downloadTasks[model.name].totalFiles > 1" class="mc-dl-files">
                {{ downloadTasks[model.name].completedFiles }} / {{ downloadTasks[model.name].totalFiles }} files
              </div>
              <div class="mc-dl-actions">
                <n-button
                  v-if="downloadTasks[model.name].status === 'downloading'"
                  block
                  size="tiny"
                  secondary
                  @click="cancelDownloadModel(model, $event)"
                >
                  {{ t('common.cancel') }}
                </n-button>
                <template v-else-if="['paused','cancelled','error'].includes(downloadTasks[model.name].status)">
                  <n-button
                    size="tiny"
                    type="primary"
                    style="flex:1"
                    @click="downloadModel(model, $event)"
                  >
                    {{ t('common.resume') }}
                  </n-button>
                  <n-button
                    size="tiny"
                    type="error"
                    secondary
                    @click="confirmDeleteModel(model, $event)"
                  >
                    <template #icon><n-icon :component="TrashOutline" /></template>
                  </n-button>
                </template>
              </div>
            </div>

            <!-- Already downloaded -->
            <div v-else-if="model.downloaded" class="mc-done-row">
              <div class="mc-done">
                <n-icon :component="CheckmarkCircleOutline" color="var(--success)" size="16" />
                <span>{{ t('models.downloaded') }}</span>
              </div>
              <n-button
                size="tiny"
                quaternary
                type="error"
                @click="confirmDeleteModel(model, $event)"
              >
                <template #icon><n-icon :component="TrashOutline" /></template>
              </n-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Detail Drawer -->
    <n-drawer v-model:show="showDetail" :width="380" placement="right">
      <n-drawer-content :title="t('models.detail')" closable>
        <template v-if="selectedInfo">
          <div class="detail-content">
            <strong class="detail-name">{{ selectedInfo.name }}</strong>

            <div class="detail-badges">
              <n-tag v-if="selectedInfo.architecture" :bordered="false" size="small" type="info" round>
                {{ selectedInfo.architecture }}
              </n-tag>
              <n-tag
                :bordered="false"
                size="small"
                :type="selectedInfo.downloaded ? 'success' : selectedInfo.supported ? 'default' : 'warning'"
                round
              >
                {{ !selectedInfo.supported ? t('models.unsupported') : selectedInfo.downloaded ? t('models.downloaded') : t('models.notDownloaded') }}
              </n-tag>
            </div>

            <n-divider style="margin:16px 0" />

            <div class="detail-grid">
              <div class="detail-row">
                <span class="detail-label">{{ t('models.type') }}</span>
                <span class="detail-val">{{ selectedInfo.modelType || '—' }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">{{ t('models.targetStem') }}</span>
                <span class="detail-val">{{ selectedInfo.targetStem || '—' }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">{{ t('models.size') }}</span>
                <span class="detail-val">{{ formatBytes(selectedInfo.sizeBytes) }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">{{ t('models.category') }}</span>
                <span class="detail-val">{{ categoryLabel(selectedInfo) || '—' }}</span>
              </div>
              <div v-if="selectedInfo.aliases?.length" class="detail-row">
                <span class="detail-label">Aliases</span>
                <span class="detail-val">{{ selectedInfo.aliases.join(', ') }}</span>
              </div>
            </div>

            <n-divider style="margin:16px 0" />

            <div class="text-sm">
              <div class="detail-label" style="margin-bottom:6px">{{ t('models.path') }}</div>
              <code class="detail-path">{{ selectedInfo.modelPath }}</code>
            </div>
          </div>
        </template>

        <template #footer>
          <div class="drawer-footer" v-if="selectedInfo">
            <!-- Not downloaded, no active task: show download -->
            <n-button
              v-if="selectedInfo.supported && !selectedInfo.downloaded && (!downloadTasks[selectedInfo.name] || downloadTasks[selectedInfo.name]?.status === 'done')"
              block
              type="primary"
              @click="downloadModel(selectedInfo!, $event)"
            >
              <template #icon><n-icon :component="CloudDownloadOutline" /></template>
              {{ t('common.download') }}
            </n-button>
            <!-- Downloading: show cancel -->
            <n-button
              v-if="downloadTasks[selectedInfo.name]?.status === 'downloading'"
              block
              secondary
              @click="cancelDownloadModel(selectedInfo!, $event)"
            >
              {{ t('common.cancel') }}
            </n-button>
            <!-- Paused/Cancelled/Error: show resume + delete -->
            <template v-if="downloadTasks[selectedInfo.name] && ['paused','cancelled','error'].includes(downloadTasks[selectedInfo.name]!.status)">
              <n-button
                block
                type="primary"
                @click="downloadModel(selectedInfo!, $event)"
              >
                {{ t('common.resume') }}
              </n-button>
              <n-button
                block
                type="error"
                secondary
                @click="confirmDeleteModel(selectedInfo!)"
              >
                <template #icon><n-icon :component="TrashOutline" /></template>
                {{ t('models.delete') }}
              </n-button>
            </template>
            <!-- Downloaded: show status + delete -->
            <template v-if="selectedInfo.downloaded && (!downloadTasks[selectedInfo.name] || downloadTasks[selectedInfo.name]?.status === 'done')">
              <n-button
                block
                secondary
                disabled
              >
                <template #icon><n-icon :component="CheckmarkCircleOutline" /></template>
                {{ t('models.downloaded') }}
              </n-button>
              <n-button
                block
                type="error"
                secondary
                @click="confirmDeleteModel(selectedInfo!)"
              >
                <template #icon><n-icon :component="TrashOutline" /></template>
                {{ t('models.delete') }}
              </n-button>
            </template>
          </div>
        </template>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<style scoped>
/* ===== Toolbar ===== */
.toolbar {
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toolbar-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.search-input {
  max-width: 380px;
  flex: 1;
  min-width: 200px;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.dir-info {
  font-size: 12px;
}

.dir-path {
  font-size: 11px;
  margin-left: 4px;
  color: var(--on-surface-muted);
}

/* ===== Category Select ===== */
.category-select {
  width: 160px;
  flex-shrink: 0;
}

/* ===== Layout ===== */
.models-body {
  display: flex;
  flex-direction: column;
}

.model-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
  min-height: 200px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 64px 0;
  color: var(--on-surface-muted);
}

/* ===== Model Card ===== */
.model-card {
  cursor: pointer;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid var(--outline);
  background: var(--surface-1);
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.model-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  border-color: var(--surface-3);
}

.model-card--selected {
  border-color: var(--primary) !important;
  background: color-mix(in srgb, var(--primary-soft) 30%, var(--surface-1));
}

.model-card--unsupported {
  opacity: 0.55;
}

/* Card header */
.mc-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.mc-name {
  font-size: 13px;
  font-weight: 600;
  word-break: break-word;
  flex: 1;
  min-width: 0;
  line-height: 1.4;
}

/* Tags row */
.mc-tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.mc-size {
  font-size: 11px;
  color: var(--on-surface-muted);
  margin-left: auto;
}

/* Meta info */
.mc-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
}

.mc-meta-item {
  display: flex;
  gap: 6px;
  min-width: 0;
}

.mc-label {
  color: var(--on-surface-muted);
  flex-shrink: 0;
}

.mc-value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Footer */
.mc-footer {
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid var(--outline);
}

/* Download progress */
.mc-dl {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mc-dl-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mc-dl-status {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.mc-dl-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--primary);
  animation: pulse 1.5s infinite;
}

.mc-dl-dot--downloading {
  background: var(--primary);
}

.mc-dl-dot--error {
  background: var(--danger);
  animation: none;
}

.mc-dl-dot--paused,
.mc-dl-dot--cancelled {
  background: var(--warning);
  animation: none;
}

.mc-dl-dot--done {
  background: var(--success);
  animation: none;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.mc-dl-msg {
  font-size: 11px;
  color: var(--on-surface-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mc-dl-pct {
  font-size: 13px;
  font-weight: 600;
  color: var(--on-surface);
  flex-shrink: 0;
  margin-left: 8px;
}

.mc-dl-files {
  font-size: 11px;
  color: var(--on-surface-muted);
}

.mc-dl-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.mc-done {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  color: var(--success);
  padding: 4px 0;
}

.mc-done-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* ===== Drawer Footer ===== */
.drawer-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ===== Skeleton ===== */
.skel-card {
  padding: 16px;
  border-radius: 12px;
  border: 1px solid var(--outline);
  background: var(--surface-1);
}

/* ===== Detail Drawer ===== */
.detail-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-name {
  font-size: 16px;
  font-weight: 600;
  word-break: break-word;
  line-height: 1.4;
}

.detail-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.detail-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  gap: 12px;
}

.detail-label {
  color: var(--on-surface-muted);
  flex-shrink: 0;
}

.detail-val {
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-path {
  font-size: 11px;
  word-break: break-all;
  color: var(--on-surface-muted);
  background: var(--surface-2);
  padding: 8px 10px;
  border-radius: 8px;
  display: block;
}

/* ===== Responsive ===== */
@media (max-width: 900px) {
  .search-input {
    max-width: 100%;
  }

  .model-grid {
    grid-template-columns: 1fr;
  }
}
</style>
