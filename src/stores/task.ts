import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useSettingsStore } from '@/stores/settings'
import { useModelStore } from '@/stores/model'

export type TaskStatus = 'queued' | 'preparing' | 'downloading_model' | 'loading_model' | 'separating' | 'writing_output' | 'done' | 'failed' | 'cancelled'

export type StemOutput = { stem: string; path: string }
export type SeparationTask = {
  id: string
  model: string
  input: string
  output: string
  status: TaskStatus
  message: string
  createdAt: number
  updatedAt: number
  files: string[]
  outputs: StemOutput[]
  logs: string[]
  error?: string
}

const HISTORY_KEY = 'pymss:tasks'

function loadHistory(): SeparationTask[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export const useTaskStore = defineStore('task', () => {
  const tasks = ref<SeparationTask[]>(loadHistory())
  const activeTaskId = ref<string | null>(tasks.value[0]?.id || null)
  const inputPath = ref('')
  const useTta = ref(false)
  const debug = ref(false)
  // Inference params
  const batchSize = ref(1)
  const overlapSize = ref(0)
  const chunkSize = ref(0)
  const normalize = ref(true)
  const maskMode = ref('')
  const useAmp = ref(false)
  const cudaAttentionBackend = ref('')
  const fuseConvBn = ref(false)
  const useChannelsLast = ref(false)
  const shifts = ref(0)
  const split = ref(true)
  const overlap = ref(0.25)

  const activeTask = computed(() => tasks.value.find((task) => task.id === activeTaskId.value) || null)
  const completedTasks = computed(() => tasks.value.filter((task) => task.status === 'done'))
  const runningTasks = computed(() => tasks.value.filter((task) => !['done', 'failed', 'cancelled'].includes(task.status)))

  watch(tasks, (value) => {
    const persistable = value.slice(0, 80).map((task) => ({ ...task, logs: task.logs.slice(-120) }))
    localStorage.setItem(HISTORY_KEY, JSON.stringify(persistable))
  }, { deep: true })

  function touch(task: SeparationTask) {
    task.updatedAt = Date.now()
  }

  function setTaskStatus(id: string, status: TaskStatus, message: string) {
    const task = tasks.value.find((item) => item.id === id)
    if (!task) return
    task.status = status
    task.message = message
    task.logs.push(`${new Date().toLocaleTimeString()} ${message}`)
    task.logs = task.logs.slice(-300)
    touch(task)
  }

  function handleWorkerEvent(event: any) {
    const taskId = event?.taskId
    if (!taskId) return
    const task = tasks.value.find((item) => item.id === taskId)
    if (!task) return
    if (event.type === 'task_stage') {
      const stage = event.payload?.stage as TaskStatus
      setTaskStatus(taskId, stage, event.payload?.message || stage)
    } else if (event.type === 'task_log') {
      task.logs.push(`${event.payload?.level || 'info'}: ${event.payload?.message || ''}`)
      task.logs = task.logs.slice(-300)
      touch(task)
    } else if (event.type === 'error') {
      task.status = 'failed'
      task.error = event.payload?.message || 'Unknown error'
      task.message = task.error || 'Unknown error'
      touch(task)
    } else if (event.type === 'task_done') {
      task.status = 'done'
      task.message = 'Done'
      task.files = event.payload?.files || []
      task.outputs = event.payload?.outputs || []
      touch(task)
    } else if (event.type === 'task_cancelled') {
      task.status = 'cancelled'
      task.message = event.payload?.message || 'Cancelled'
      touch(task)
    }
  }

  async function pickFiles() {
    const files = await invoke<string[]>('pick_audio_files')
    if (files?.[0]) inputPath.value = files[0]
  }

  async function pickInputFolder() {
    const folder = await invoke<string | null>('pick_input_folder')
    if (folder) inputPath.value = folder
  }

  async function revealPath(path: string) {
    await invoke('reveal_path', { path })
  }

  function removeTask(id: string) {
    tasks.value = tasks.value.filter((task) => task.id !== id)
    if (activeTaskId.value === id) activeTaskId.value = tasks.value[0]?.id || null
  }

  function clearHistory() {
    tasks.value = tasks.value.filter((task) => runningTasks.value.includes(task))
  }

  async function cancelTask(id: string) {
    const cancelled = await invoke<boolean>('cancel_task', { taskId: id })
    const task = tasks.value.find((item) => item.id === id)
    if (task && cancelled) {
      task.status = 'cancelled'
      task.message = 'Cancelled'
      touch(task)
    }
    return cancelled
  }

  async function startSeparation() {
    const settings = useSettingsStore()
    const modelStore = useModelStore()
    if (!inputPath.value.trim()) {
      throw new Error('Input path is required')
    }
    if (!modelStore.selectedModel.trim()) {
      throw new Error('Model is required')
    }
    const id = `sep_${Date.now()}`
    const task: SeparationTask = {
      id,
      model: modelStore.selectedModel,
      input: inputPath.value,
      output: settings.outputDir || 'results',
      status: 'queued',
      message: 'Queued',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      files: [],
      outputs: [],
      logs: [],
    }
    tasks.value.unshift(task)
    activeTaskId.value = id
    setTaskStatus(id, 'preparing', 'Preparing task')

    // Build inference params (only set non-default values)
    const inferenceParams: Record<string, unknown> = {}
    if (batchSize.value > 1) inferenceParams.batch_size = batchSize.value
    if (overlapSize.value > 0) inferenceParams.overlap_size = overlapSize.value
    if (chunkSize.value > 0) inferenceParams.chunk_size = chunkSize.value
    if (!normalize.value) inferenceParams.normalize = false
    if (maskMode.value) inferenceParams.mask_mode = maskMode.value
    if (useAmp.value) inferenceParams.use_amp = true
    if (cudaAttentionBackend.value) inferenceParams.cuda_attention_backend = cudaAttentionBackend.value
    if (fuseConvBn.value) inferenceParams.fuse_conv_bn = true
    if (useChannelsLast.value) inferenceParams.use_channels_last = true
    if (shifts.value > 0) inferenceParams.shifts = shifts.value
    if (!split.value) inferenceParams.split = false
    if (overlap.value !== 0.25) inferenceParams.overlap = overlap.value

    try {
      await invoke<{ taskId: string; started: boolean }>('start_separation', {
        payload: {
          taskId: id,
          model: task.model,
          input: task.input,
          output: task.output,
          modelDir: settings.modelDir || null,
          download: true,
          source: settings.downloadSource,
          endpoint: null,
          device: settings.defaultDevice,
          deviceIds: settings.getDeviceIds(),
          outputFormat: settings.defaultFormat,
          useTta: useTta.value,
          debug: debug.value,
          audioParams: settings.getAudioParams(),
          inferenceParams,
        },
      })
      return task
    } catch (err) {
      task.status = 'failed'
      task.error = err instanceof Error ? err.message : String(err)
      task.message = task.error
      touch(task)
      throw err
    }
  }

  async function retryTask(taskId: string) {
    const existing = tasks.value.find(t => t.id === taskId)
    if (!existing) return
    const id = `sep_${Date.now()}`
    const settings = useSettingsStore()
    const modelStore = useModelStore()
    const task: SeparationTask = {
      id,
      model: existing.model,
      input: existing.input,
      output: settings.outputDir || 'results',
      status: 'queued',
      message: 'Queued',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      files: [],
      outputs: [],
      logs: [],
    }
    tasks.value.unshift(task)
    activeTaskId.value = id
    setTaskStatus(id, 'preparing', 'Preparing task')
    try {
      modelStore.selectedModel = existing.model
      inputPath.value = existing.input
      await invoke<{ taskId: string; started: boolean }>('start_separation', {
        payload: {
          taskId: id,
          model: task.model,
          input: task.input,
          output: task.output,
          modelDir: settings.modelDir || null,
          download: true,
          source: settings.downloadSource,
          endpoint: null,
          device: settings.defaultDevice,
          deviceIds: settings.getDeviceIds(),
          outputFormat: settings.defaultFormat,
          useTta: useTta.value,
          debug: debug.value,
          audioParams: settings.getAudioParams(),
          inferenceParams: {},
        },
      })
      return task
    } catch (err) {
      task.status = 'failed'
      task.error = err instanceof Error ? err.message : String(err)
      task.message = task.error
      touch(task)
      throw err
    }
  }

  return {
    tasks,
    activeTaskId,
    activeTask,
    completedTasks,
    runningTasks,
    inputPath,
    useTta,
    debug,
    batchSize,
    overlapSize,
    chunkSize,
    normalize,
    maskMode,
    useAmp,
    cudaAttentionBackend,
    fuseConvBn,
    useChannelsLast,
    shifts,
    split,
    overlap,
    handleWorkerEvent,
    pickFiles,
    pickInputFolder,
    revealPath,
    removeTask,
    clearHistory,
    cancelTask,
    startSeparation,
    retryTask,
  }
})
