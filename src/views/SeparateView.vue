<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import {
  DocumentTextOutline,
  CubeOutline,
  FolderOpenOutline,
  SettingsOutline,
  PlayOutline,
  MusicalNotesOutline,
  FolderOutline,
} from '@vicons/ionicons5'
import { useModelStore } from '@/stores/model'
import { useTaskStore } from '@/stores/task'
import { useSettingsStore } from '@/stores/settings'
import { useAppStore } from '@/stores/app'

const { t } = useI18n()
const message = useMessage()
const router = useRouter()
const task = useTaskStore()
const model = useModelStore()
const settings = useSettingsStore()
const app = useAppStore()

const { inputPath, useTta, debug, batchSize, overlapSize, chunkSize, normalize, maskMode, useAmp, cudaAttentionBackend, fuseConvBn, useChannelsLast, shifts, split, overlap } = storeToRefs(task)
const { selectedModel, downloadedModels, isLoading } = storeToRefs(model)

const currentStep = ref(0)
const deviceOptions = computed(() => settings.deviceOptions(app.envInfo))

onMounted(() => {
  if (!app.envInfo && !app.envLoading) {
    app.checkEnvInBackground().catch(() => {})
  }
})
const selectedDeviceLabel = computed(() => deviceOptions.value.find(item => item.value === settings.defaultDevice)?.label || settings.defaultDevice)

const steps = computed(() => [
  { title: t('separate.input'), description: inputPath.value ? inputPath.value.split(/[/\\]/).pop() || '' : '' },
  { title: t('separate.model'), description: selectedModel.value || '' },
  { title: t('separate.output'), description: settings.outputDir || t('separate.outputDefault') },
  { title: t('separate.advanced'), description: `${selectedDeviceLabel.value} · ${settings.defaultFormat}` },
])

async function start() {
  try {
    await task.startSeparation()
    message.success(t('toast.taskStarted'))
    router.push('/tasks')
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
          <div class="output-option mt-md">
            <div class="output-option__copy">
              <strong>{{ t('separate.separateTaskOutputDir') }}</strong>
              <span>{{ t('separate.separateTaskOutputDirHint') }}</span>
            </div>
            <n-switch v-model:value="settings.separateTaskOutputDir" />
          </div>
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
                :options="deviceOptions"
              />
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

          <div class="advanced-section mt-md">
            <div class="advanced-section__head">
              <strong>{{ t('audio.title') }}</strong>
              <span>{{ t('separate.audioQualityHint') }}</span>
            </div>
            <n-grid :cols="4" :x-gap="16" :y-gap="16" responsive="screen">
              <n-grid-item>
                <label class="text-muted text-sm">{{ t('audio.wavBitDepth') }}</label>
                <n-select
                  v-model:value="settings.wavBitDepth"
                  :options="[
                    { label: t('audio.pcm16'), value: 'PCM_16' },
                    { label: t('audio.pcm24'), value: 'PCM_24' },
                    { label: t('audio.float'), value: 'FLOAT' },
                  ]"
                />
              </n-grid-item>
              <n-grid-item>
                <label class="text-muted text-sm">{{ t('audio.flacBitDepth') }}</label>
                <n-select
                  v-model:value="settings.flacBitDepth"
                  :options="[
                    { label: t('audio.pcm16'), value: 'PCM_16' },
                    { label: t('audio.pcm24'), value: 'PCM_24' },
                  ]"
                />
              </n-grid-item>
              <n-grid-item>
                <label class="text-muted text-sm">{{ t('audio.mp3BitRate') }}</label>
                <n-select
                  v-model:value="settings.mp3BitRate"
                  :options="[
                    { label: t('audio.bitrate128'), value: '128k' },
                    { label: t('audio.bitrate192'), value: '192k' },
                    { label: t('audio.bitrate256'), value: '256k' },
                    { label: t('audio.bitrate320'), value: '320k' },
                  ]"
                />
              </n-grid-item>
              <n-grid-item>
                <label class="text-muted text-sm">{{ t('audio.m4aBitRate') }}</label>
                <n-select
                  v-model:value="settings.m4aBitRate"
                  :options="[
                    { label: t('audio.bitrate128'), value: '128k' },
                    { label: t('audio.bitrate192'), value: '192k' },
                    { label: t('audio.bitrate256'), value: '256k' },
                    { label: t('audio.bitrate320'), value: '320k' },
                  ]"
                />
              </n-grid-item>
              <n-grid-item>
                <label class="text-muted text-sm">{{ t('audio.m4aCodec') }}</label>
                <n-select
                  v-model:value="settings.m4aCodec"
                  :options="[
                    { label: t('audio.codecAacAt'), value: 'aac_at' },
                    { label: t('audio.codecAac'), value: 'aac' },
                    { label: t('audio.codecAlac'), value: 'alac' },
                  ]"
                />
              </n-grid-item>
            </n-grid>
          </div>

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
                      { label: 'Auto', value: 'auto' },
                      { label: 'Default', value: 'default' },
                      { label: 'Flash Attention', value: 'flash' },
                      { label: 'cuDNN', value: 'cudnn' },
                      { label: 'Memory Efficient', value: 'efficient' },
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

<style scoped>
.output-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border: 1px solid var(--outline);
  border-radius: 14px;
  background: color-mix(in srgb, var(--primary-soft) 34%, var(--surface-1));
}

.output-option__copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.output-option__copy strong {
  font-size: 14px;
}

.output-option__copy span {
  color: var(--on-surface-muted);
  font-size: 12px;
  line-height: 1.5;
}

.advanced-section {
  display: grid;
  gap: 14px;
  padding: 14px;
  border: 1px solid var(--outline);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface-2) 54%, transparent);
}

.advanced-section__head {
  display: grid;
  gap: 4px;
}

.advanced-section__head strong {
  font-size: 14px;
}

.advanced-section__head span {
  color: var(--on-surface-muted);
  font-size: 12px;
}

@media (max-width: 640px) {
  .output-option {
    align-items: flex-start;
  }
}
</style>
