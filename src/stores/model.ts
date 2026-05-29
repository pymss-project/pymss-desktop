import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useSettingsStore } from '@/stores/settings'

export type ModelEntry = {
  name: string
  aliases: string[]
  modelType: string | null
  architecture: string
  supported: boolean
  unsupportedReason: string
  category: string
  categoryCn: string
  primaryCategory: string
  primaryCategoryCn: string
  secondaryCategory: string
  secondaryCategoryCn: string
  targetStem: string
  configInstruments: string
  configTargetInstrument: string
  classificationConfidence: string
  classificationBasis: string
  sizeBytes: number
  sha256: string
  downloaded: boolean
  missingPaths: string[]
  modelPath: string
  configPath: string | null
  auxiliaryPaths: string[]
}

type ModelsPayload = {
  models: ModelEntry[]
  categories: string[]
  categoriesCn: string[]
  count: number
  modelDir: string
}

type DownloadStatus = 'idle' | 'downloading' | 'done' | 'error'
type DownloadTask = {
  taskId: string
  model: string
  status: DownloadStatus | 'cancelled' | 'paused'
  progress: number
  message: string
  completedFiles: number
  totalFiles: number
  updatedAt: number
}

export const useModelStore = defineStore('model', () => {
  const models = ref<ModelEntry[]>([])
  const categories = ref<string[]>([])
  const categoriesCn = ref<string[]>([])
  const modelDir = ref('')
  const selectedModel = ref('bs_roformer_voc_hyperacev2')
  const selectedInfo = ref<ModelEntry | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const search = ref('')
  const supportedOnly = ref(true)
  const category = ref('')
  const downloadStates = ref<Record<string, DownloadStatus>>({})
  const downloadErrors = ref<Record<string, string>>({})
  const downloadTasks = ref<Record<string, DownloadTask>>({})
  const downloadTaskIndex = ref<Record<string, string>>({})

  const filteredModels = computed(() => {
    const q = search.value.trim().toLowerCase()
    return models.value.filter((model) => {
      const matchesQuery = !q
        || model.name.toLowerCase().includes(q)
        || model.architecture.toLowerCase().includes(q)
        || model.modelType?.toLowerCase().includes(q)
        || model.targetStem.toLowerCase().includes(q)
        || model.category.toLowerCase().includes(q)
        || model.categoryCn.toLowerCase().includes(q)
      const matchesCategory = !category.value || model.category === category.value
      return matchesQuery && matchesCategory
    })
  })
  const downloadedModels = computed(() => models.value.filter((model) => model.supported && model.downloaded))

  function upsertModel(modelInfo: ModelEntry) {
    const index = models.value.findIndex((item) => item.name === modelInfo.name)
    if (index >= 0) models.value[index] = modelInfo
    if (selectedModel.value === modelInfo.name) selectedInfo.value = modelInfo
  }

  async function loadModels() {
    const settings = useSettingsStore()
    isLoading.value = true
    error.value = null
    try {
      const result = await invoke<ModelsPayload>('list_models', {
        payload: {
          category: null,
          supportedOnly: supportedOnly.value,
          includeLocalState: true,
          modelDir: settings.modelDir || null,
        },
      })
      models.value = result.models
      categories.value = result.categories
      categoriesCn.value = result.categoriesCn
      modelDir.value = result.modelDir
      const firstDownloaded = models.value.find((model) => model.supported && model.downloaded)
      if (!models.value.some((model) => model.name === selectedModel.value && model.downloaded)) {
        selectedModel.value = firstDownloaded?.name || ''
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function selectModel(name: string) {
    const settings = useSettingsStore()
    selectedModel.value = name
    selectedInfo.value = await invoke<ModelEntry>('get_model_info', {
      payload: {
        model: name,
        modelDir: settings.modelDir || null,
      },
    })
  }

  function handleWorkerEvent(event: any) {
    const taskId = event?.taskId as string | undefined
    if (!taskId?.startsWith('download_')) return
    const payload = event.payload || {}
    const modelName = payload.model || downloadTaskIndex.value[taskId] || Object.values(downloadTasks.value).find((task) => task.taskId === taskId)?.model
    if (!modelName) return
    const previous = downloadTasks.value[modelName] || {
      taskId,
      model: modelName,
      status: 'downloading',
      progress: 0,
      message: '',
      completedFiles: 0,
      totalFiles: 1,
      updatedAt: Date.now(),
    }
    const next: DownloadTask = { ...previous, taskId, updatedAt: Date.now() }
    if (event.type === 'download_started') {
      next.status = 'downloading'
      next.progress = payload.progress ?? 0
      next.message = 'Started'
      next.totalFiles = payload.totalFiles || next.totalFiles
      downloadStates.value = { ...downloadStates.value, [modelName]: 'downloading' }
    } else if (event.type === 'download_stage') {
      next.status = 'downloading'
      next.progress = payload.progress ?? Math.max(next.progress, 5)
      next.message = payload.stage || 'Downloading'
    } else if (event.type === 'download_file') {
      next.status = 'downloading'
      next.progress = payload.progress ?? next.progress
      next.completedFiles = payload.completedFiles || next.completedFiles
      next.totalFiles = payload.totalFiles || next.totalFiles
      next.message = payload.status || 'Downloading'
    } else if (event.type === 'download_done') {
      next.status = 'done'
      next.progress = 100
      next.message = 'Done'
      if (payload.modelInfo) upsertModel(payload.modelInfo)
      if (payload.modelDir) modelDir.value = payload.modelDir
      downloadStates.value = { ...downloadStates.value, [modelName]: 'done' }
    } else if (event.type === 'task_cancelled') {
      next.status = 'cancelled'
      next.message = 'Cancelled'
      downloadStates.value = { ...downloadStates.value, [modelName]: 'idle' }
    } else if (event.type === 'error') {
      next.status = 'error'
      next.message = payload.message || 'Failed'
      downloadStates.value = { ...downloadStates.value, [modelName]: 'error' }
      downloadErrors.value = { ...downloadErrors.value, [modelName]: next.message }
    }
    downloadTasks.value = { ...downloadTasks.value, [modelName]: next }
  }

  async function downloadModel(name: string, force = false) {
    const settings = useSettingsStore()
    const taskId = `download_${Date.now()}`
    downloadStates.value = { ...downloadStates.value, [name]: 'downloading' }
    downloadErrors.value = { ...downloadErrors.value, [name]: '' }
    downloadTasks.value = {
      ...downloadTasks.value,
      [name]: {
        taskId,
        model: name,
        status: 'downloading',
        progress: 0,
        message: 'Queued',
        completedFiles: 0,
        totalFiles: 1,
        updatedAt: Date.now(),
      },
    }
    downloadTaskIndex.value = { ...downloadTaskIndex.value, [taskId]: name }
    try {
      await invoke<{ taskId: string; started: boolean }>('start_model_download', {
        payload: {
          taskId,
          model: name,
          modelDir: settings.modelDir || null,
          source: settings.downloadSource,
          endpoint: null,
          force,
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      downloadStates.value = { ...downloadStates.value, [name]: 'error' }
      downloadErrors.value = { ...downloadErrors.value, [name]: message }
      const previous = downloadTasks.value[name]
      if (previous) {
        downloadTasks.value = { ...downloadTasks.value, [name]: { ...previous, status: 'error', message, updatedAt: Date.now() } }
      }
      throw err
    }
  }

  async function cancelDownload(name: string, pause = false) {
    const task = downloadTasks.value[name]
    if (!task || task.status !== 'downloading') return false
    const cancelled = await invoke<boolean>('cancel_task', { taskId: task.taskId })
    if (cancelled) {
      downloadTasks.value = {
        ...downloadTasks.value,
        [name]: { ...task, status: pause ? 'paused' : 'cancelled', message: pause ? 'Paused' : 'Cancelled', updatedAt: Date.now() },
      }
      downloadStates.value = { ...downloadStates.value, [name]: 'idle' }
    }
    return cancelled
  }

  async function deleteModel(name: string) {
    const settings = useSettingsStore()
    const result = await invoke<{ payload: { model: string; deleted: string[]; errors: string[]; modelInfo: ModelEntry } }>('delete_model', {
      payload: {
        model: name,
        modelDir: settings.modelDir || null,
      },
    })
    // Update model in local state to reflect deleted status
    const modelInfo = (result as any)?.modelInfo || (result as any)?.payload?.modelInfo
    if (modelInfo) {
      upsertModel(modelInfo)
    } else {
      // Fallback: mark model as not downloaded locally
      const idx = models.value.findIndex((m) => m.name === name)
      if (idx >= 0) {
        models.value[idx] = { ...models.value[idx], downloaded: false, missingPaths: [models.value[idx].modelPath] }
      }
      if (selectedInfo.value?.name === name) {
        selectedInfo.value = { ...selectedInfo.value, downloaded: false }
      }
    }
    // Clean up download task if any
    if (downloadTasks.value[name]) {
      const { [name]: _, ...rest } = downloadTasks.value
      downloadTasks.value = rest
    }
  }

  return {
    models,
    categories,
    categoriesCn,
    modelDir,
    selectedModel,
    selectedInfo,
    isLoading,
    error,
    search,
    supportedOnly,
    category,
    downloadStates,
    downloadErrors,
    downloadTasks,
    filteredModels,
    downloadedModels,
    loadModels,
    selectModel,
    deleteModel,
    downloadModel,
    cancelDownload,
    handleWorkerEvent,
  }
})
