import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useSettingsStore } from '@/stores/settings'
import { useModelStore } from '@/stores/model'

export type TaskStatus = 'queued' | 'preparing' | 'validating_input' | 'downloading_model' | 'ensuring_model' | 'loading_model' | 'separating' | 'writing_output' | 'done' | 'failed' | 'cancelled'

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
  progress: number
  stageLabel: string
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
    const parsed = JSON.parse(raw) as Partial<SeparationTask>[]
    return parsed.map((task) => normalizeTask(task))
  } catch {
    return []
  }
}

const TERMINAL_STATUSES: TaskStatus[] = ['done', 'failed', 'cancelled']

const STAGE_META: Record<TaskStatus, { progress: number; label: string }> = {
  queued: { progress: 2, label: 'Queued' },
  preparing: { progress: 8, label: 'Preparing' },
  validating_input: { progress: 12, label: 'Validating input' },
  downloading_model: { progress: 22, label: 'Checking model files' },
  ensuring_model: { progress: 22, label: 'Checking model files' },
  loading_model: { progress: 35, label: 'Loading model' },
  separating: { progress: 68, label: 'Separating audio' },
  writing_output: { progress: 92, label: 'Collecting outputs' },
  done: { progress: 100, label: 'Done' },
  failed: { progress: 100, label: 'Failed' },
  cancelled: { progress: 100, label: 'Cancelled' },
}

function normalizeStatus(status: unknown): TaskStatus {
  if (typeof status !== 'string') return 'queued'
  if (status in STAGE_META) return status as TaskStatus
  return 'preparing'
}

function normalizeOutputPath(value?: string | null) {
  return value && value.trim() ? value : 'results'
}

function joinOutputPath(base: string, child: string) {
  const separator = base.includes('\\') ? '\\' : '/'
  return `${base.replace(/[\\/]$/, '')}${separator}${child}`
}

function resolveTaskOutputPath(base: string, taskId: string, separateTaskOutputDir: boolean) {
  const outputDir = normalizeOutputPath(base)
  return separateTaskOutputDir ? joinOutputPath(outputDir, taskId) : outputDir
}

function outputsFromFiles(outputDir: string, files: string[], outputFormat = 'wav'): StemOutput[] {
  if (!files?.length) return []
  const separator = outputDir.includes('\\') ? '\\' : '/'
  const base = outputDir.replace(/[\\/]$/, '')
  return files.map((file) => {
    const stemName = file.replace(/\.[^/.\\]+$/, '')
    return {
      stem: stemName,
      path: `${base}${separator}${stemName}.${outputFormat}`,
    }
  })
}

function normalizeTask(task: Partial<SeparationTask>): SeparationTask {
  const status = normalizeStatus(task.status)
  const meta = STAGE_META[status]
  const progress = typeof task.progress === 'number'
    ? Math.max(meta.progress, Math.min(100, task.progress))
    : meta.progress
  return {
    id: task.id || `task_${Date.now()}`,
    model: task.model || '',
    input: task.input || '',
    output: normalizeOutputPath(task.output),
    status,
    message: task.message || meta.label,
    createdAt: task.createdAt || Date.now(),
    updatedAt: task.updatedAt || task.createdAt || Date.now(),
    progress: TERMINAL_STATUSES.includes(status) ? 100 : progress,
    stageLabel: task.stageLabel || meta.label,
    files: task.files || [],
    outputs: task.outputs || [],
    logs: task.logs || [],
    error: task.error,
  }
}

export const useTaskStore = defineStore('task', () => {
  const tasks = ref<SeparationTask[]>(loadHistory())
  const activeTaskId = ref<string | null>(tasks.value[0]?.id || null)
  const focusedResultTaskId = ref<string | null>(null)
  const focusedTaskId = ref<string | null>(null)
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
  const runningTasks = computed(() => tasks.value.filter((task) => !TERMINAL_STATUSES.includes(task.status)))
  const resultTasks = computed(() => completedTasks.value.filter((task) => task.outputs.length || task.files.length))
  const queuedTasks = computed(() => tasks.value.filter((task) => task.status === 'queued'))
  const failedTasks = computed(() => tasks.value.filter((task) => task.status === 'failed'))
  const spotlightTasks = computed(() => tasks.value.filter((task) => !TERMINAL_STATUSES.includes(task.status) || task.status === 'failed'))
  const historyTasks = computed(() => tasks.value.filter((task) => !spotlightTasks.value.some((candidate) => candidate.id === task.id)))

  watch(tasks, (value) => {
    const persistable = value.slice(0, 80).map((task) => ({ ...task, logs: task.logs.slice(-120) }))
    localStorage.setItem(HISTORY_KEY, JSON.stringify(persistable))
  }, { deep: true })

  function touch(task: SeparationTask) {
    task.updatedAt = Date.now()
  }

  function setTaskStatus(id: string, status: TaskStatus, message?: string, progress?: number) {
    const task = tasks.value.find((item) => item.id === id)
    if (!task) return
    if (TERMINAL_STATUSES.includes(task.status) && !TERMINAL_STATUSES.includes(status)) return
    const meta = STAGE_META[status]
    task.status = status
    task.stageLabel = meta.label
    task.message = message || meta.label
    const nextProgress = progress ?? meta.progress
    task.progress = status === 'done' || status === 'failed' || status === 'cancelled'
      ? 100
      : Math.max(task.progress || 0, Math.min(99, nextProgress))
    task.logs.push(`${new Date().toLocaleTimeString()} ${task.message}`)
    task.logs = task.logs.slice(-300)
    touch(task)
  }

  function handleWorkerEvent(event: any) {
    const taskId = event?.taskId
    if (!taskId) return
    const task = tasks.value.find((item) => item.id === taskId)
    if (!task) return
    if (event.type === 'task_started') {
      setTaskStatus(taskId, 'preparing', 'Task started', 6)
    } else if (event.type === 'task_stage') {
      const stage = normalizeStatus(event.payload?.stage)
      setTaskStatus(taskId, stage, event.payload?.message || STAGE_META[stage].label, event.payload?.progress)
    } else if (event.type === 'task_log') {
      task.logs.push(`${event.payload?.level || 'info'}: ${event.payload?.message || ''}`)
      task.logs = task.logs.slice(-300)
      touch(task)
    } else if (event.type === 'error') {
      task.status = 'failed'
      task.error = event.payload?.message || 'Unknown error'
      task.message = task.error || 'Unknown error'
      task.stageLabel = STAGE_META.failed.label
      task.progress = 100
      touch(task)
    } else if (event.type === 'task_done') {
      task.status = 'done'
      task.message = 'Done'
      task.stageLabel = STAGE_META.done.label
      task.progress = 100
      task.files = event.payload?.files || []
      if (event.payload?.outputDir) task.output = event.payload.outputDir
      task.outputs = event.payload?.outputs?.length
        ? event.payload.outputs
        : outputsFromFiles(task.output, task.files, event.payload?.outputFormat || 'wav')
      task.error = undefined
      touch(task)
    } else if (event.type === 'task_cancelled') {
      task.status = 'cancelled'
      task.message = event.payload?.message || 'Cancelled'
      task.stageLabel = STAGE_META.cancelled.label
      task.progress = 100
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

  function primaryRevealPath(task: SeparationTask) {
    return task.output
  }

  function getTaskById(id: string) {
    return tasks.value.find((task) => task.id === id) || null
  }

  function focusResultTask(id: string | null) {
    focusedResultTaskId.value = id
  }

  function focusTask(id: string | null) {
    focusedTaskId.value = id
  }

  function removeTask(id: string) {
    tasks.value = tasks.value.filter((task) => task.id !== id)
    if (activeTaskId.value === id) activeTaskId.value = tasks.value[0]?.id || null
    if (focusedResultTaskId.value === id) focusedResultTaskId.value = null
    if (focusedTaskId.value === id) focusedTaskId.value = null
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
      task.stageLabel = STAGE_META.cancelled.label
      task.progress = 100
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
      output: resolveTaskOutputPath(settings.outputDir, id, settings.separateTaskOutputDir),
      status: 'queued',
      message: 'Queued',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      progress: STAGE_META.queued.progress,
      stageLabel: STAGE_META.queued.label,
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
    const runtimeDevice = settings.getRuntimeDeviceConfig()

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
          device: runtimeDevice.device,
          deviceIds: runtimeDevice.deviceIds,
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
      task.stageLabel = STAGE_META.failed.label
      task.progress = 100
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
      output: resolveTaskOutputPath(settings.outputDir, id, settings.separateTaskOutputDir),
      status: 'queued',
      message: 'Queued',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      progress: STAGE_META.queued.progress,
      stageLabel: STAGE_META.queued.label,
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
      const runtimeDevice = settings.getRuntimeDeviceConfig()
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
          device: runtimeDevice.device,
          deviceIds: runtimeDevice.deviceIds,
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
      task.stageLabel = STAGE_META.failed.label
      task.progress = 100
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
    resultTasks,
    queuedTasks,
    failedTasks,
    spotlightTasks,
    historyTasks,
    focusedResultTaskId,
    focusedTaskId,
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
    primaryRevealPath,
    getTaskById,
    focusResultTask,
    focusTask,
    removeTask,
    clearHistory,
    cancelTask,
    startSeparation,
    retryTask,
  }
})
