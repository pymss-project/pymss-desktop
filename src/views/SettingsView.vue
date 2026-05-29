<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { SUPPORTED_LOCALES } from '@/i18n'
import { useSettingsStore } from '@/stores/settings'
import {
  ColorPaletteOutline,
  GlobeOutline,
  FolderOpenOutline,
  SettingsOutline,
} from '@vicons/ionicons5'

const { t } = useI18n()
const settings = useSettingsStore()
const { themeMode, locale, modelDir, outputDir, defaultDevice, defaultFormat, downloadSource, deviceIds, wavBitDepth, flacBitDepth, mp3BitRate, m4aBitRate, m4aCodec } = storeToRefs(settings)
</script>

<template>
  <div class="page">
    <div class="page-header-compact">
      <div>
        <h1>{{ t('settings.title') }}</h1>
        <p>{{ t('settings.subtitle') }}</p>
      </div>
    </div>

    <n-grid :cols="2" :x-gap="16" :y-gap="16" responsive="screen">
      <!-- Appearance -->
      <n-grid-item :span="1">
        <n-card :bordered="true" size="small">
          <template #header>
            <div class="flex-center gap-sm" style="justify-content:flex-start">
              <n-icon :component="ColorPaletteOutline" size="18" />
              <span>{{ t('settings.appearance') }}</span>
            </div>
          </template>

          <label class="text-muted text-sm">{{ t('settings.theme') }}</label>
          <div style="display:flex;gap:8px;margin:8px 0 16px">
            <n-button
              size="small"
              :type="themeMode === 'system' ? 'primary' : 'default'"
              @click="themeMode = 'system'"
            >
              {{ t('settings.themeSystem') }}
            </n-button>
            <n-button
              size="small"
              :type="themeMode === 'dark' ? 'primary' : 'default'"
              @click="themeMode = 'dark'"
            >
              {{ t('settings.themeDark') }}
            </n-button>
            <n-button
              size="small"
              :type="themeMode === 'light' ? 'primary' : 'default'"
              @click="themeMode = 'light'"
            >
              {{ t('settings.themeLight') }}
            </n-button>
          </div>

          <label class="text-muted text-sm">{{ t('settings.language') }}</label>
          <div style="display:flex;gap:8px;margin:8px 0 0">
            <n-button
              v-for="loc in SUPPORTED_LOCALES"
              :key="loc.code"
              size="small"
              :type="locale === loc.code ? 'primary' : 'default'"
              @click="locale = loc.code"
            >
              {{ loc.label }}
            </n-button>
          </div>
        </n-card>
      </n-grid-item>

      <!-- Paths -->
      <n-grid-item :span="1">
        <n-card :bordered="true" size="small">
          <template #header>
            <div class="flex-center gap-sm" style="justify-content:flex-start">
              <n-icon :component="FolderOpenOutline" size="18" />
              <span>{{ t('settings.paths') }}</span>
            </div>
          </template>

          <div style="display:grid;gap:12px">
            <div>
              <label class="text-muted text-sm">{{ t('settings.modelDir') }}</label>
              <div class="flex-center gap-sm mt-sm">
                <n-input v-model:value="modelDir" :placeholder="t('common.folder')" clearable />
                <n-button secondary size="small" @click="settings.pickModelDir()">
                  {{ t('common.browse') }}
                </n-button>
              </div>
            </div>
            <div>
              <label class="text-muted text-sm">{{ t('settings.outputDir') }}</label>
              <div class="flex-center gap-sm mt-sm">
                <n-input v-model:value="outputDir" :placeholder="t('common.folder')" clearable />
                <n-button secondary size="small" @click="settings.pickOutputDir()">
                  {{ t('common.browse') }}
                </n-button>
              </div>
            </div>
          </div>
        </n-card>
      </n-grid-item>

      <!-- Defaults -->
      <n-grid-item :span="2">
        <n-card :bordered="true" size="small">
          <template #header>
            <div class="flex-center gap-sm" style="justify-content:flex-start">
              <n-icon :component="SettingsOutline" size="18" />
              <span>{{ t('settings.defaults') }}</span>
            </div>
          </template>

          <n-grid :cols="3" :x-gap="16" :y-gap="16">
            <n-grid-item>
              <label class="text-muted text-sm">{{ t('settings.defaultDevice') }}</label>
              <n-select
                v-model:value="defaultDevice"
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
              <label class="text-muted text-sm">{{ t('settings.defaultFormat') }}</label>
              <n-select
                v-model:value="defaultFormat"
                :options="[
                  { label: 'WAV', value: 'wav' },
                  { label: 'FLAC', value: 'flac' },
                  { label: 'MP3', value: 'mp3' },
                  { label: 'M4A', value: 'm4a' },
                ]"
              />
            </n-grid-item>
            <n-grid-item>
              <label class="text-muted text-sm">{{ t('inference.deviceIds') }}</label>
              <n-input v-model:value="deviceIds" :placeholder="t('inference.deviceIdsPlaceholder')" clearable />
            </n-grid-item>
            <n-grid-item>
              <label class="text-muted text-sm">{{ t('settings.downloadSource') }}</label>
              <n-select
                v-model:value="downloadSource"
                :options="[
                  { label: 'ModelScope', value: 'modelscope' },
                  { label: 'Hugging Face', value: 'huggingface' },
                  { label: 'HF Mirror', value: 'hf-mirror' },
                ]"
              />
            </n-grid-item>
          </n-grid>
        </n-card>
      </n-grid-item>

      <!-- Audio Quality -->
      <n-grid-item :span="2">
        <n-card :bordered="true" size="small">
          <template #header>
            <div class="flex-center gap-sm" style="justify-content:flex-start">
              <n-icon :component="SettingsOutline" size="18" />
              <span>{{ t('audio.title') }}</span>
            </div>
          </template>

          <n-grid :cols="4" :x-gap="16" :y-gap="16">
            <n-grid-item>
              <label class="text-muted text-sm">{{ t('audio.wavBitDepth') }}</label>
              <n-select
                v-model:value="wavBitDepth"
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
                v-model:value="flacBitDepth"
                :options="[
                  { label: t('audio.pcm16'), value: 'PCM_16' },
                  { label: t('audio.pcm24'), value: 'PCM_24' },
                ]"
              />
            </n-grid-item>
            <n-grid-item>
              <label class="text-muted text-sm">{{ t('audio.mp3BitRate') }}</label>
              <n-select
                v-model:value="mp3BitRate"
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
                v-model:value="m4aBitRate"
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
                v-model:value="m4aCodec"
                :options="[
                  { label: t('audio.codecAacAt'), value: 'aac_at' },
                  { label: t('audio.codecAac'), value: 'aac' },
                  { label: t('audio.codecAlac'), value: 'alac' },
                ]"
              />
            </n-grid-item>
          </n-grid>
        </n-card>
      </n-grid-item>
    </n-grid>
  </div>
</template>
