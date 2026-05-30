import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { applyTheme, getThemeMode, type ThemeMode } from '@/utils/theme'
import { detectLocale, setLocale, type SupportedLocale } from '@/i18n'
import type { EnvInfo } from '@/stores/app'

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

function defaultOutputDir() {
  return 'results'
}

export type AudioParams = {
  wavBitDepth: string
  flacBitDepth: string
  mp3BitRate: string
  m4aBitRate: string
  m4aCodec: string
}

export type RuntimeDeviceConfig = {
  device: 'auto' | 'cpu' | 'cuda' | 'mps' | 'mlx'
  deviceIds: number[]
}

export type DeviceOption = {
  label: string
  value: string
  type: RuntimeDeviceConfig['device']
  deviceIds?: number[]
}

export const useSettingsStore = defineStore('settings', () => {
  const themeMode = ref<ThemeMode>(getThemeMode())
  const locale = ref<SupportedLocale>(detectLocale())
  const modelDir = ref(loadSetting('model_dir', ''))
  const outputDir = ref(loadSetting('output_dir', defaultOutputDir()))
  const separateTaskOutputDir = ref(loadSetting('separate_task_output_dir', true))
  const defaultDevice = ref(loadSetting('default_device', 'auto'))
  const defaultFormat = ref(loadSetting('default_format', 'wav'))
  const downloadSource = ref(loadSetting('download_source', 'modelscope'))
  const wavBitDepth = ref(loadSetting('wav_bit_depth', 'FLOAT'))
  const flacBitDepth = ref(loadSetting('flac_bit_depth', 'PCM_24'))
  const mp3BitRate = ref(loadSetting('mp3_bit_rate', '320k'))
  const m4aBitRate = ref(loadSetting('m4a_bit_rate', '192k'))
  const m4aCodec = ref(loadSetting('m4a_codec', 'aac_at'))

  watch(themeMode, (value) => applyTheme(value), { immediate: true })
  watch(locale, (value) => setLocale(value), { immediate: true })

  const persisted = {
    model_dir: modelDir, output_dir: outputDir,
    separate_task_output_dir: separateTaskOutputDir,
    default_device: defaultDevice, default_format: defaultFormat,
    download_source: downloadSource,
    wav_bit_depth: wavBitDepth, flac_bit_depth: flacBitDepth,
    mp3_bit_rate: mp3BitRate, m4a_bit_rate: m4aBitRate,
    m4a_codec: m4aCodec,
  }
  Object.entries(persisted).forEach(([key, value]) => {
    watch(value, (next) => saveSetting(key, next), { deep: true })
  })

  function deviceOptions(env?: EnvInfo | null): DeviceOption[] {
    const options: DeviceOption[] = [
      { label: 'Auto (优先使用可用显卡)', value: 'auto', type: 'auto' },
      { label: 'CPU', value: 'cpu', type: 'cpu', deviceIds: [0] },
    ]
    for (const gpu of env?.cudaDevices || []) {
      const memory = gpu.totalMemoryBytes
        ? ` · ${(gpu.totalMemoryBytes / 1024 / 1024 / 1024).toFixed(1)} GB`
        : ''
      options.push({
        label: `CUDA ${gpu.id}: ${gpu.name}${memory}`,
        value: `cuda:${gpu.id}`,
        type: 'cuda',
        deviceIds: [gpu.id],
      })
    }
    if (env?.cudaAvailable && !(env.cudaDevices || []).length) {
      const count = Math.max(1, env.cudaDeviceCount || 1)
      for (let id = 0; id < count; id += 1) {
        options.push({ label: `CUDA ${id}`, value: `cuda:${id}`, type: 'cuda', deviceIds: [id] })
      }
    }
    if (env?.mpsAvailable) options.push({ label: 'Apple MPS', value: 'mps', type: 'mps', deviceIds: [0] })
    if (env?.mlxAvailable || env?.mpsAvailable) options.push({ label: 'Apple MLX', value: 'mlx', type: 'mlx', deviceIds: [0] })
    return options
  }

  function getRuntimeDeviceConfig(): RuntimeDeviceConfig {
    const selected = defaultDevice.value
    if (selected.startsWith('cuda:')) {
      const id = parseInt(selected.slice('cuda:'.length), 10)
      return { device: 'cuda', deviceIds: Number.isFinite(id) ? [id] : [0] }
    }
    if (selected === 'cuda') return { device: 'cuda', deviceIds: [0] }
    if (selected === 'cpu' || selected === 'mps' || selected === 'mlx' || selected === 'auto') {
      return { device: selected, deviceIds: [0] }
    }
    return { device: 'auto', deviceIds: [0] }
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
    themeMode, locale, modelDir, outputDir, separateTaskOutputDir,
    defaultDevice, defaultFormat, downloadSource,
    wavBitDepth, flacBitDepth, mp3BitRate, m4aBitRate, m4aCodec,
    pickModelDir, pickOutputDir,
    deviceOptions, getRuntimeDeviceConfig, getAudioParams,
  }
})
