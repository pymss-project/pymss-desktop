<script setup lang="ts">
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'
import {
  DocumentTextOutline,
  CubeOutline,
  FolderOpenOutline,
  HardwareChipOutline,
  SettingsOutline,
  PlayOutline,
  CheckmarkCircleOutline,
  MusicalNotesOutline,
  FolderOutline,
} from '@vicons/ionicons5'
import { useModelStore } from '@/stores/model'
import { useTaskStore } from '@/stores/task'
import { useSettingsStore } from '@/stores/settings'

const { t } = useI18n()
const message = useMessage()
const task = useTaskStore()
const model = useModelStore()
const settings = useSettingsStore()

const { inputPath, useTta, debug, batchSize, overlapSize, chunkSize, normalize, maskMode, useAmp, cudaAttentionBackend, fuseConvBn, useChannelsLast, shifts, split, overlap } = storeToRefs(task)
const { selectedModel, downloadedModels, isLoading } = storeToRefs(model)
const { deviceIds } = storeToRefs(settings)

const currentStep = ref(0)

const steps = computed(() => [
  { title: t('separate.input'), description: inputPath.value ? inputPath.value.split(/[/\\]/).pop() || '' : '' },
  { title: t('separate.model'), description: selectedModel.value || '' },
  { title: t('separate.output'), description: settings.outputDir || t('separate.outputDefault') },
  { title: t('separate.advanced'), description: `${settings.defaultDevice} · ${settings.defaultFormat}` },
])

async function start() {
  try {
    await task.startSeparation()
    message.success(t('toast.taskStarted'))
  } catch (err) {
    message.error(err instanceof Error ? err.message : t('toast.taskFailed'))
  }
}

function handleFileSelected() {
  task.pickFiles().catch(() => {})
  currentStep.value = 0
}

function nextStep() {
  if (currentStep.value === 0 && !inputPath.value) {
    message.warning(t('separate.inputPlaceholder'))
    return
  }
  currentStep.value = Math.min(currentStep.value + 1, 3)
}
function prevStep() {
  currentStep.value = Math.max(currentStep.value - 1, 0)
}
</script>

<template>
  <div class="page">
    <div class="page-header-compact">
      <div>
        <h1>{{ t('separate.title') }}</h1>
        <p>{{ t('separate.subtitle') }}</p>
      </div>
      <n-button type="primary" size="large" :disabled="!inputPath || !selectedModel" @click="start">
        <template #icon><n-icon :component="PlayOutline" /></template>
        {{ t('separate.startTask') }}
      </n-button>
    </div>

    <!-- Steps -->
    <n-steps :current="currentStep" :status="currentStep === 3 && !inputPath ? 'error' : 'process'" size="small">
      <n-step :title="t('separate.input')" :description="inputPath ? inputPath.split(/[/\\]/).pop() : ''" />
      <n-step :title="t('separate.model')" :description="selectedModel || ''" />
      <n-step :title="t('separate.output')" :description="settings.outputDir || t('separate.outputDefault')" />
      <n-step :title="t('separate.advanced')" :description="`${settings.defaultDevice} · ${settings.defaultFormat}`" />
    </n-steps>

    <!-- Step Content -->
    <div class="steps-content">
      <!-- Step 0: Input -->
      <div v-if="currentStep === 0">
        <n-card :bordered="true" size="small">
          <template #header>
            <div class="flex-center gap-sm" style="justify-content:flex-start">
              <n-icon :component="DocumentTextOutline" size="20" />
              <span>{{ t('separate.input') }}</span>
            </div>
          </template>
          <n-input v-model:value="inputPath" :placeholder="t('separate.inputPlaceholder')" clearable />
          <div class="mt-md" style="display:flex;gap:10px">
            <n-button secondary @click="task.pickFiles()">
              <template #icon><n-icon :component="MusicalNotesOutline" /></template>
              {{ t('separate.chooseFiles') }}
            </n-button>
            <n-button secondary @click="task.pickInputFolder()">
              <template #icon><n-icon :component="FolderOutline" /></template>
              {{ t('separate.chooseFolder') }}
            </n-button>
          </div>
        </n-card>
      </div>

      <!-- Step 1: Model -->
      <div v-if="currentStep === 1">
        <n-card :bordered="true" size="small">
          <template #header>
            <div class="flex-center gap-sm" style="justify-content:flex-start">
              <n-icon :component="CubeOutline" size="20" />
              <span>{{ t('separate.model') }}</span>
            </div>
          </template>
          <n-select
            v-model:value="selectedModel"
            :placeholder="t('separate.noDownloadedModels')"
            :options="downloadedModels.map(m => ({ label: m.name, value: m.name }))"
            filterable
            clearable
          />
          <div class="mt-md">
            <n-button v-if="!downloadedModels.length" block secondary :loading="isLoading" @click="model.loadModels()">
              {{ t('models.load') }}
            </n-button>
            <n-button block secondary style="margin-top:8px" @click="$router.push('/models')">
              {{ t('separate.manageModels') }}
            </n-button>
          </div>
        </n-card>
      </div>

      <!-- Step 2: Output -->
      <div v-if="currentStep === 2">
        <n-card :bordered="true" size="small">
          <template #header>
            <div class="flex-center gap-sm" style="justify-content:flex-start">
              <n-icon :component="FolderOpenOutline" size="20" />
              <span>{{ t('separate.output') }}</span>
            </div>
          </template>
          <n-input v-model:value="settings.outputDir" :placeholder="t('separate.outputDefault')" clearable />
          <div class="mt-md" style="display:flex;gap:10px">
            <n-button secondary @click="task.revealPath(settings.outputDir || 'results')">
              {{ t('separate.openOutput') }}
            </n-button>
            <n-button secondary @click="$router.push('/settings')">
              {{ t('separate.changeOutputInSettings') }}
            </n-button>
          </div>
        </n-card>
      </div>

      <!-- Step 3: Advanced -->
      <div v-if="currentStep === 3">
        <n-card :bordered="true" size="small">
          <template #header>
            <div class="flex-center gap-sm" style="justify-content:flex-start">
              <n-icon :component="SettingsOutline" size="20" />
              <span>{{ t('separate.advanced') }}</span>
            </div>
          </template>
          <n-grid :cols="2" :x-gap="16" :y-gap="16">
            <n-grid-item>
              <label class="text-muted text-sm">{{ t('settings.defaultDevice') }}</label>
              <n-select
                v-model:value="settings.defaultDevice"
                :options="[
                  { label: 'Auto', value: 'auto' },
                  { label: 'CPU', value: 'cpu' },
                  { label: 'CUDA', value: 'cuda' },
                  { label: 'MPS', value: 'mps' },
                  { label: 'MLX', value: 'mlx' },
                ]"
              />
            </n-grid-item>
            <n-grid-item>
              <label class="text-muted text-sm">{{ t('inference.deviceIds') }}</label>
              <n-input v-model:value="deviceIds" :placeholder="t('inference.deviceIdsPlaceholder')" clearable />
            </n-grid-item>
            <n-grid-item>
              <label class="text-muted text-sm">{{ t('settings.defaultFormat') }}</label>
              <n-select
                v-model:value="settings.defaultFormat"
                :options="[
                  { label: 'WAV', value: 'wav' },
                  { label: 'FLAC', value: 'flac' },
                  { label: 'MP3', value: 'mp3' },
                  { label: 'M4A', value: 'm4a' },
                ]"
              />
            </n-grid-item>
          </n-grid>
          <div class="mt-md" style="display:flex;gap:16px">
            <n-checkbox v-model:checked="useTta">{{ t('separate.tta') }}</n-checkbox>
            <n-checkbox v-model:checked="debug">{{ t('separate.debug') }}</n-checkbox>
          </div>

          <!-- Collapsible Inference Params -->
          <n-collapse class="mt-md" :default-expanded="false">
            <n-collapse-item :title="t('inference.advancedParams')" name="inference">
              <n-grid :cols="2" :x-gap="16" :y-gap="16">
                <n-grid-item>
                  <label class="text-muted text-sm">{{ t('inference.batchSize') }}</label>
                  <n-input-number v-model:value="batchSize" :min="1" :max="32" style="width:100%" />
                </n-grid-item>
                <n-grid-item>
                  <label class="text-muted text-sm">{{ t('inference.overlapSize') }}</label>
                  <n-input-number v-model:value="overlapSize" :min="0" :max="128" style="width:100%" />
                </n-grid-item>
                <n-grid-item>
                  <label class="text-muted text-sm">{{ t('inference.chunkSize') }}</label>
                  <n-input-number v-model:value="chunkSize" :min="0" :max="1048576" :step="1024" style="width:100%" />
                </n-grid-item>
                <n-grid-item>
                  <label class="text-muted text-sm">{{ t('inference.shifts') }}</label>
                  <n-input-number v-model:value="shifts" :min="0" :max="16" style="width:100%" />
                </n-grid-item>
                <n-grid-item>
                  <label class="text-muted text-sm">{{ t('inference.overlap') }}</label>
                  <n-input-number v-model:value="overlap" :min="0" :max="1" :step="0.05" style="width:100%" />
                </n-grid-item>
                <n-grid-item>
                  <label class="text-muted text-sm">{{ t('inference.maskMode') }}</label>
                  <n-select
                    v-model:value="maskMode"
                    :placeholder="t('common.default')"
                    clearable
                    :options="[
                      { label: t('inference.maskNone'), value: 'none' },
                      { label: t('inference.maskClamp'), value: 'clamp' },
                      { label: t('inference.maskGauss'), value: 'gauss' },
                      { label: t('inference.maskSoft'), value: 'soft' },
                    ]"
                  />
                </n-grid-item>
                <n-grid-item>
                  <label class="text-muted text-sm">{{ t('inference.cudaAttention') }}</label>
                  <n-select
                    v-model:value="cudaAttentionBackend"
                    clearable
                    :placeholder="t('common.default')"
                    :options="[
                      { label: 'Flash Attention', value: 'flash_attn' },
                      { label: 'SDPA', value: 'sdpa' },
                      { label: 'xFormers', value: 'xformers' },
                      { label: 'Math', value: 'math' },
                    ]"
                  />
                </n-grid-item>
                <n-grid-item>
                  <div class="mt-md" style="display:flex;flex-direction:column;gap:12px">
                    <n-checkbox v-model:checked="normalize">{{ t('inference.normalize') }}</n-checkbox>
                    <n-checkbox v-model:checked="useAmp">{{ t('inference.useAmp') }}</n-checkbox>
                    <n-checkbox v-model:checked="fuseConvBn">{{ t('inference.fuseConvBn') }}</n-checkbox>
                    <n-checkbox v-model:checked="useChannelsLast">{{ t('inference.useChannelsLast') }}</n-checkbox>
                    <n-checkbox v-model:checked="split">{{ t('inference.split') }}</n-checkbox>
                  </div>
                </n-grid-item>
              </n-grid>
            </n-collapse-item>
          </n-collapse>
        </n-card>
      </div>
    </div>

    <!-- Step Navigation -->
    <div class="step-actions">
      <n-button @click="prevStep" :disabled="currentStep === 0">
        {{ t('common.back') }}
      </n-button>
      <n-button v-if="currentStep < 3" type="primary" @click="nextStep">
        {{ t('common.next') }}
      </n-button>
      <n-button v-else type="primary" :disabled="!inputPath || !selectedModel" @click="start">
        <template #icon><n-icon :component="PlayOutline" /></template>
        {{ t('separate.startTask') }}
      </n-button>
    </div>
  </div>
</template>
