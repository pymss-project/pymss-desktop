import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { applyTheme, getThemeMode, type ThemeMode } from '@/utils/theme'
import { detectLocale, setLocale, type SupportedLocale } from '@/i18n'

function loadSetting<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(`pymss:${key}`)
    return value === null ? fallback : JSON.parse(value)
  } catch {
    return fallback
  }
}

function saveSetting(key: string, value: unknown) {
  localStorage.setItem(`pymss:${key}`, JSON.stringify(value))
}

export type AudioParams = {
  wavBitDepth: string
  flacBitDepth: string
  mp3BitRate: string
  m4aBitRate: string
  m4aCodec: string
}

export const useSettingsStore = defineStore('settings', () => {
  const themeMode = ref<ThemeMode>(getThemeMode())
  const locale = ref<SupportedLocale>(detectLocale())
  const modelDir = ref(loadSetting('model_dir', ''))
  const outputDir = ref(loadSetting('output_dir', ''))
  const defaultDevice = ref(loadSetting('default_device', 'auto'))
  const defaultFormat = ref(loadSetting('default_format', 'wav'))
  const downloadSource = ref(loadSetting('download_source', 'modelscope'))
  const deviceIds = ref(loadSetting('device_ids', ''))
  const wavBitDepth = ref(loadSetting('wav_bit_depth', 'FLOAT'))
  const flacBitDepth = ref(loadSetting('flac_bit_depth', 'PCM_24'))
  const mp3BitRate = ref(loadSetting('mp3_bit_rate', '320k'))
  const m4aBitRate = ref(loadSetting('m4a_bit_rate', '192k'))
  const m4aCodec = ref(loadSetting('m4a_codec', 'aac_at'))

  watch(themeMode, (value) => applyTheme(value), { immediate: true })
  watch(locale, (value) => setLocale(value), { immediate: true })

  const persisted = {
    model_dir: modelDir, output_dir: outputDir,
    default_device: defaultDevice, default_format: defaultFormat,
    download_source: downloadSource, device_ids: deviceIds,
    wav_bit_depth: wavBitDepth, flac_bit_depth: flacBitDepth,
    mp3_bit_rate: mp3BitRate, m4a_bit_rate: m4aBitRate,
    m4a_codec: m4aCodec,
  }
  Object.entries(persisted).forEach(([key, value]) => {
    watch(value, (next) => saveSetting(key, next), { deep: true })
  })

  function getDeviceIds(): number[] {
    if (!deviceIds.value.trim()) return [0]
    return deviceIds.value.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
  }

  function getAudioParams(): Record<string, string | number> {
    return {
      wav_bit_depth: wavBitDepth.value,
      flac_bit_depth: flacBitDepth.value,
      mp3_bit_rate: mp3BitRate.value,
      m4a_bit_rate: m4aBitRate.value,
      m4a_codec: m4aCodec.value,
    }
  }

  async function pickModelDir() {
    const folder = await invoke<string | null>('pick_output_folder')
    if (folder) modelDir.value = folder
  }

  async function pickOutputDir() {
    const folder = await invoke<string | null>('pick_output_folder')
    if (folder) outputDir.value = folder
  }

  return {
    themeMode, locale, modelDir, outputDir,
    defaultDevice, defaultFormat, downloadSource,
    deviceIds, wavBitDepth, flacBitDepth, mp3BitRate, m4aBitRate, m4aCodec,
    pickModelDir, pickOutputDir,
    getDeviceIds, getAudioParams,
  }
})
