<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useDialog, useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useEditorStore } from '@/stores/editor'
import type { EditorExportFormat, EditorSource } from '@/types/editor'
import { useTaskStore } from '@/stores/task'
import { useSettingsStore } from '@/stores/settings'
import EditorAssetPanel from '@/components/editor/EditorAssetPanel.vue'
import EditorInspectorPanel from '@/components/editor/EditorInspectorPanel.vue'
import EditorMixer from '@/components/editor/EditorMixer.vue'
import EditorTransportBar from '@/components/editor/EditorTransportBar.vue'
import { useEditorPlayback } from '@/composables/useEditorPlayback'
import { useEditorShortcuts } from '@/composables/useEditorShortcuts'

const route = useRoute()
const message = useMessage()
const dialog = useDialog()
const { t } = useI18n()
const editor = useEditorStore()
const task = useTaskStore()
const settings = useSettingsStore()

const MIXER_HEAD_WIDTH = 184
const ASSET_RAIL_WIDTH = 34
const RESIZER_WIDTH = 10
const MIN_ASSET_WIDTH = 180
const MAX_ASSET_WIDTH = 320
const MIN_CENTER_WIDTH = 520
const MIN_INSPECTOR_WIDTH = 240
const MAX_INSPECTOR_WIDTH = 420
const ASSET_COLLAPSED_STORAGE_KEY = 'pymss:editor:asset-collapsed'
const ASSET_PANEL_WIDTH_STORAGE_KEY = 'pymss:editor:asset-width'
const INSPECTOR_WIDTH_STORAGE_KEY = 'pymss:editor:inspector-width'
const ASSET_PANEL_WIDTH = 218
const hasTauriApis = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const shellEl = ref<HTMLElement | null>(null)
const mixerScrollEl = ref<HTMLElement | null>(null)
const assetPanelEl = ref<HTMLElement | null>(null)
const mixerRef = ref<InstanceType<typeof EditorMixer> | null>(null)
const isDraggingExternal = ref(false)
const draggingSourceId = ref<string | null>(null)
const draggingSourceName = ref<string | null>(null)
const draggingGhost = ref<{ x: number; y: number } | null>(null)
const inspectorPanelWidth = ref(288)
const assetPanelWidth = ref(ASSET_PANEL_WIDTH)
const isAssetCollapsed = ref(false)
const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1440)
const showExportDialog = ref(false)
const exportFormatDraft = ref<EditorExportFormat>('wav')
const exportWavBitDepthDraft = ref('PCM_24')
const exportFlacBitDepthDraft = ref('PCM_24')

type ResizeSide = 'assets' | 'inspector'

type ResizeState = {
  side: ResizeSide
  startX: number
  startAssetWidth: number
  startInspectorWidth: number
}

const activeResize = ref<ResizeState | null>(null)

let unlistenDrop: UnlistenFn | null = null
let unlistenOpenProject: UnlistenFn | null = null
let assetDragMoveHandler: ((event: MouseEvent) => void) | null = null
let assetDragUpHandler: ((event: MouseEvent) => void) | null = null

const session = computed(() => editor.session)
const sessionName = computed(() => session.value?.name || t('editor.fallbackTitle'))
const sessionHint = computed(() => session.value?.sourceResultDir || t('editor.brandHint'))
const librarySources = computed(() => session.value?.sources || [])
const inspectorVisible = computed(() => isInspectorVisible())
const assetPanelVisible = computed(() => !isAssetCollapsed.value && isAssetVisible())
const assetResizerVisible = computed(() => assetPanelVisible.value)
const exportFormatOptions = computed(() => [
  { label: 'WAV', value: 'wav' as EditorExportFormat },
  { label: 'FLAC', value: 'flac' as EditorExportFormat },
])
const wavBitDepthOptions = computed(() => [
  { label: 'PCM_16', value: 'PCM_16' },
  { label: 'PCM_24', value: 'PCM_24' },
  { label: 'FLOAT', value: 'FLOAT' },
])
const flacBitDepthOptions = computed(() => [
  { label: 'PCM_16', value: 'PCM_16' },
  { label: 'PCM_24', value: 'PCM_24' },
])
const exportSummaryRows = computed(() => [
  { label: t('editor.totalDuration'), value: editor.duration ? `${Math.round(editor.duration * 10) / 10}s` : '0s' },
  { label: t('editor.tracks'), value: String(session.value?.tracks.length || 0) },
  { label: t('editor.exportSampleRateStrategy'), value: t('editor.exportSampleRateStrategyValue') },
])
const shellStyle = computed(() => ({
  '--asset-rail-width': `${ASSET_RAIL_WIDTH}px`,
  '--asset-panel-width': assetPanelVisible.value ? `${assetPanelWidth.value}px` : '0px',
  '--asset-resizer-width': assetResizerVisible.value ? `${RESIZER_WIDTH}px` : '0px',
  '--inspector-resizer-width': inspectorVisible.value ? `${RESIZER_WIDTH}px` : '0px',
  '--inspector-width': inspectorVisible.value ? `${inspectorPanelWidth.value}px` : '0px',
}))
const playback = useEditorPlayback({ editor, scrollEl: mixerScrollEl, trackHeaderWidth: MIXER_HEAD_WIDTH })
const {
  transportVisualState,
  transportPendingAction,
  transportCanToggle,
  isBusy: playbackIsBusy,
  shouldFollowPlayhead,
  currentTime: playbackCurrentTime,
  loop: playbackLoop,
  playbackError,
  stop: playbackStop,
  toggleTransport,
  seek: playbackSeek,
} = playback

async function loadProject(projectId: string) {
  if (!projectId) return
  await editor.loadProject(projectId)
}

async function togglePlayback() {
  const ok = await toggleTransport()
  if (!ok && playbackError.value) message.error(playbackError.value)
}

function handleTransportToggleRequest() {
  void togglePlayback()
}

function isInspectorVisible() {
  return viewportWidth.value > 1320
}

function isAssetVisible() {
  return viewportWidth.value > 920
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getShellWidth() {
  return shellEl.value?.clientWidth || window.innerWidth || 0
}

function getVisibleHandleWidth() {
  return inspectorVisible.value ? RESIZER_WIDTH : 0
}

function getVisibleAssetHandleWidth() {
  return assetResizerVisible.value ? RESIZER_WIDTH : 0
}

function getAvailableSidebarWidth() {
  const shellWidth = getShellWidth()
  const otherWidth = 0
  return Math.max(0, shellWidth - MIN_CENTER_WIDTH - otherWidth - getVisibleHandleWidth())
}

function getAvailableAssetWidth() {
  const shellWidth = getShellWidth()
  const inspectorWidth = inspectorVisible.value ? inspectorPanelWidth.value : 0
  return Math.max(
    0,
    shellWidth
      - ASSET_RAIL_WIDTH
      - MIN_CENTER_WIDTH
      - inspectorWidth
      - getVisibleHandleWidth()
      - getVisibleAssetHandleWidth(),
  )
}

function clampInspectorWidth(width: number) {
  const responsiveMax = getAvailableSidebarWidth()
  return clamp(width, MIN_INSPECTOR_WIDTH, Math.max(MIN_INSPECTOR_WIDTH, Math.min(MAX_INSPECTOR_WIDTH, responsiveMax)))
}

function clampAssetWidth(width: number) {
  const responsiveMax = getAvailableAssetWidth()
  return clamp(width, MIN_ASSET_WIDTH, Math.max(MIN_ASSET_WIDTH, Math.min(MAX_ASSET_WIDTH, responsiveMax)))
}

function savePanelWidths() {
  try {
    localStorage.setItem(ASSET_COLLAPSED_STORAGE_KEY, isAssetCollapsed.value ? '1' : '0')
    localStorage.setItem(ASSET_PANEL_WIDTH_STORAGE_KEY, String(assetPanelWidth.value))
    localStorage.setItem(INSPECTOR_WIDTH_STORAGE_KEY, String(inspectorPanelWidth.value))
  } catch {
    // ignore storage errors
  }
}

function stopResize() {
  if (!activeResize.value) return
  activeResize.value = null
  window.removeEventListener('mousemove', handleResizeMove)
  window.removeEventListener('mouseup', stopResize)
  savePanelWidths()
}

function handleResizeMove(event: MouseEvent) {
  const state = activeResize.value
  if (!state) return
  if (state.side === 'assets') {
    assetPanelWidth.value = clampAssetWidth(state.startAssetWidth + (event.clientX - state.startX))
    return
  }
  inspectorPanelWidth.value = clampInspectorWidth(state.startInspectorWidth - (event.clientX - state.startX))
}

function startResize(side: ResizeSide, event: MouseEvent) {
  if (event.button !== 0) return
  if (side === 'assets' && !assetResizerVisible.value) return
  if (side === 'inspector' && !inspectorVisible.value) return
  event.preventDefault()
  activeResize.value = {
    side,
    startX: event.clientX,
    startAssetWidth: assetPanelWidth.value,
    startInspectorWidth: inspectorPanelWidth.value,
  }
  window.addEventListener('mousemove', handleResizeMove)
  window.addEventListener('mouseup', stopResize)
}

function restorePanelWidths() {
  try {
    isAssetCollapsed.value = localStorage.getItem(ASSET_COLLAPSED_STORAGE_KEY) === '1'
    const storedAssetWidth = Number(localStorage.getItem(ASSET_PANEL_WIDTH_STORAGE_KEY) || assetPanelWidth.value)
    const storedInspectorWidth = Number(localStorage.getItem(INSPECTOR_WIDTH_STORAGE_KEY) || inspectorPanelWidth.value)
    assetPanelWidth.value = clampAssetWidth(storedAssetWidth)
    inspectorPanelWidth.value = clampInspectorWidth(storedInspectorWidth)
  } catch {
    assetPanelWidth.value = clampAssetWidth(assetPanelWidth.value)
    inspectorPanelWidth.value = clampInspectorWidth(inspectorPanelWidth.value)
  }
}

function syncPanelWidthsToViewport() {
  viewportWidth.value = window.innerWidth
  assetPanelWidth.value = clampAssetWidth(assetPanelWidth.value)
  inspectorPanelWidth.value = clampInspectorWidth(inspectorPanelWidth.value)
}

function toggleAssetPanel(force?: boolean) {
  const next = typeof force === 'boolean' ? force : !isAssetCollapsed.value
  if (isAssetCollapsed.value === next) return
  isAssetCollapsed.value = next
  savePanelWidths()
}

function resetPlayhead() {
  playbackSeek(0)
}

function seekBy(delta: number) {
  playbackSeek(Math.max(0, playbackCurrentTime.value + delta))
}

function setTrackVolume(trackId: string, value: number) {
  editor.setTrackVolume(trackId, value)
}

function toggleTrackFlag(trackId: string, flag: 'muted' | 'solo') {
  editor.toggleTrackFlag(trackId, flag)
}

function setTrackFades(trackId: string, patch: { fadeIn?: number; fadeOut?: number }) {
  editor.setTrackFades(trackId, patch)
}

async function addSourceAsReference(source: EditorSource) {
  try {
    editor.addTrackFromSourceId(source.id)
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

function addTrackFromAsset(sourceId: string) {
  try {
    editor.addTrackFromSourceId(sourceId)
    clearAssetPointerDrag()
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

function revealSource(source: EditorSource) {
  void task.revealPath(source.path)
}

function removeSource(source: EditorSource) {
  if (source.role === 'stem') {
    message.warning(t('editor.assetLocalProtected'))
    return
  }
  const linkedTrackCount = editor.session?.tracks.filter((track) => track.sourceId === source.id).length || 0
  const commitRemoval = () => {
    const result = editor.removeSource(source.id)
    if (!result.removedSource) return

    if (result.removedTracks > 0) {
      message.success(t('editor.assetRemovedWithTracks', { count: result.removedTracks }))
      return
    }

    message.success(t('editor.assetRemoved'))
  }

  if (linkedTrackCount > 0) {
    dialog.warning({
      title: t('editor.removeAssetConfirmTitle'),
      content: t('editor.removeAssetConfirmContent', { count: linkedTrackCount }),
      positiveText: t('common.confirm'),
      negativeText: t('common.cancel'),
      onPositiveClick: commitRemoval,
    })
    return
  }

  commitRemoval()
}

function setMixerDropTarget(trackId: string | null) {
  mixerRef.value?.setDropTargetTrackId(trackId)
}

function clearAssetPointerDrag() {
  draggingSourceId.value = null
  draggingSourceName.value = null
  draggingGhost.value = null
  mixerRef.value?.setDraggingAssetSourceId(null)
  setMixerDropTarget(null)
  if (assetDragMoveHandler) {
    window.removeEventListener('mousemove', assetDragMoveHandler)
    assetDragMoveHandler = null
  }
  if (assetDragUpHandler) {
    window.removeEventListener('mouseup', assetDragUpHandler)
    assetDragUpHandler = null
  }
}

function handleAssetPointerGrab(payload: { source: EditorSource; x: number; y: number }) {
  clearAssetPointerDrag()
  draggingSourceId.value = payload.source.id
  draggingSourceName.value = payload.source.name
  draggingGhost.value = { x: payload.x, y: payload.y }
  mixerRef.value?.setDraggingAssetSourceId(payload.source.id)

  assetDragMoveHandler = (event: MouseEvent) => {
    draggingGhost.value = { x: event.clientX, y: event.clientY }
    const mixer = mixerRef.value
    if (!mixer || !draggingSourceId.value) return

    if (!mixer.containsPoint(event.clientX, event.clientY)) {
      setMixerDropTarget(null)
      return
    }

    const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
    const trackRow = target?.closest('.track-row') as HTMLElement | null
    const emptyState = target?.closest('.empty-state') as HTMLElement | null

    if (trackRow?.dataset.trackId) {
      setMixerDropTarget(trackRow.dataset.trackId)
    } else if (emptyState) {
      setMixerDropTarget('__empty__')
    } else {
      setMixerDropTarget('__mixer__')
    }
  }

  assetDragUpHandler = (event: MouseEvent) => {
    const mixer = mixerRef.value
    const canDrop = Boolean(draggingSourceId.value && mixer?.containsPoint(event.clientX, event.clientY))
    if (canDrop) mixer?.commitAssetDrop()
    clearAssetPointerDrag()
  }

  window.addEventListener('mousemove', assetDragMoveHandler)
  window.addEventListener('mouseup', assetDragUpHandler)
}

async function save() {
  await editor.saveProject()
  message.success(t('editor.saved'))
}

function openExportDialog() {
  exportFormatDraft.value = editor.exportFormat
  exportWavBitDepthDraft.value = settings.wavBitDepth
  exportFlacBitDepthDraft.value = settings.flacBitDepth
  showExportDialog.value = true
}

function closeExportDialog() {
  showExportDialog.value = false
}

async function exportMix() {
  try {
    editor.exportFormat = exportFormatDraft.value
    settings.wavBitDepth = exportWavBitDepthDraft.value
    settings.flacBitDepth = exportFlacBitDepthDraft.value
    const result = await editor.exportMix({
      format: exportFormatDraft.value,
      audioParams: {
        wavBitDepth: exportWavBitDepthDraft.value,
        flacBitDepth: exportFlacBitDepthDraft.value,
      },
    })
    message.success(t('editor.exported', { path: result.path }))
    closeExportDialog()
  } catch {
    message.error(editor.lastError || t('editor.exportFailed'))
  }
}

function openExportDir() {
  const path = editor.lastExport?.path || session.value?.sourceResultDir
  if (path) void task.revealPath(path)
}

function zoomFit() {
  const viewportWidth = mixerScrollEl.value?.clientWidth || 0
  if (!viewportWidth || editor.duration <= 0) return
  editor.setZoom((viewportWidth - MIXER_HEAD_WIDTH - 24) / Math.max(editor.duration, 0.01))
}

function zoomAt(payload: { direction: 'in' | 'out'; anchorRatio: number }) {
  const element = mixerScrollEl.value
  if (!element) {
    if (payload.direction === 'in') editor.zoomIn()
    else editor.zoomOut()
    return
  }
  const anchorX = element.scrollLeft + element.clientWidth * payload.anchorRatio - MIXER_HEAD_WIDTH
  const anchorTime = Math.max(0, anchorX / Math.max(1, editor.pixelsPerSecond))
  const nextZoom = editor.pixelsPerSecond + (payload.direction === 'in' ? 18 : -18)
  editor.setZoom(nextZoom)
  requestAnimationFrame(() => {
    element.scrollLeft = Math.max(0, MIXER_HEAD_WIDTH + anchorTime * editor.pixelsPerSecond - element.clientWidth * payload.anchorRatio)
  })
}

function updatePlaybackLoop(value: boolean) {
  playbackLoop.value = value
}

function handleMixerScrollReady(element: HTMLElement) {
  mixerScrollEl.value = element
}

function isPointInAssetPanel(position: { x: number; y: number } | null | undefined) {
  const element = assetPanelEl.value
  if (!element || !position) return false

  const rect = element.getBoundingClientRect()
  const scale = window.devicePixelRatio || 1
  const x = position.x / scale
  const y = position.y / scale

  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

useEditorShortcuts({
  togglePlay: togglePlayback,
  stop: () => playbackStop(false),
  undo: editor.undo,
  redo: editor.redo,
  zoomIn: editor.zoomIn,
  zoomOut: editor.zoomOut,
  save,
  toHome: resetPlayhead,
  seek: seekBy,
  toggleMute: () => { if (editor.selectedTrackId) editor.toggleTrackFlag(editor.selectedTrackId, 'muted') },
  toggleSolo: () => { if (editor.selectedTrackId) editor.toggleTrackFlag(editor.selectedTrackId, 'solo') },
  removeTrack: () => { if (editor.selectedTrackId) editor.removeTrack(editor.selectedTrackId) },
})

onMounted(async () => {
  restorePanelWidths()
  window.addEventListener('resize', syncPanelWidthsToViewport)

  const projectId = String(route.query.projectId || '')
  if (projectId && hasTauriApis) {
    try {
      await loadProject(projectId)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      message.error(t('editor.loadFailed', { detail }))
    }
  }

  if (hasTauriApis) {
    try {
      unlistenDrop = await getCurrentWebview().onDragDropEvent(async (event) => {
        const type = event.payload.type
        if (type === 'over' || type === 'enter') {
          isDraggingExternal.value = isPointInAssetPanel(event.payload.position)
        } else if (type === 'drop') {
          const isDropInAssetPanel = isPointInAssetPanel(event.payload.position)
          isDraggingExternal.value = false
          if (!isDropInAssetPanel) return
          try {
            const paths = (event.payload as { paths?: string[] }).paths || []
            const result = await editor.scanAssets(paths)
            if (result.files.length) message.success(t('editor.importSuccess', { count: result.files.length }))
            else message.warning(t('editor.importEmpty'))
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error)
            message.error(detail || t('editor.importEmpty'))
          }
        } else {
          isDraggingExternal.value = false
        }
      })
    } catch {
      // browser preview fallback
    }

    unlistenOpenProject = await listen<{ projectId: string }>('pymss://editor-open-project', (event) => {
      void (async () => {
        try {
          await loadProject(event.payload.projectId)
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          message.error(t('editor.loadFailed', { detail }))
        }
      })()
    })
  }
})

onBeforeUnmount(() => {
  stopResize()
  window.removeEventListener('resize', syncPanelWidthsToViewport)
  clearAssetPointerDrag()
  unlistenDrop?.()
  unlistenOpenProject?.()
})

watch(() => editor.session?.id, () => {
  playbackStop(true)
})
</script>

<template>
  <div class="editor-view">
    <div
      ref="shellEl"
      class="editor-shell"
      :class="{
        'editor-shell--resizing': Boolean(activeResize),
        'editor-shell--playback-following': shouldFollowPlayhead,
      }"
      :style="shellStyle"
      @contextmenu.prevent
    >
      <EditorTransportBar
        :session-name="sessionName"
        :session-hint="sessionHint"
        :track-count="session?.tracks.length || 0"
        :current-time="playbackCurrentTime"
        :duration="editor.duration"
        :transport-visual-state="transportVisualState"
        :transport-pending-action="transportPendingAction"
        :transport-can-toggle="transportCanToggle"
        :loop="playbackLoop"
        :master-volume="editor.masterVolume"
        :saving="editor.saving"
        :exporting="editor.exporting"
        :can-undo="editor.canUndo"
        :can-redo="editor.canRedo"
        :disabled="!session"
        @reset="resetPlayhead"
        @toggle-transport="handleTransportToggleRequest"
        @update:loop="updatePlaybackLoop"
        @update:master-volume="editor.setMasterVolume"
        @begin-master-volume="editor.beginInteraction"
        @commit-master-volume="editor.commitInteraction"
        @undo="editor.undo"
        @redo="editor.redo"
        @save="save"
        @export="openExportDialog"
      />

      <div v-if="editor.loading" class="editor-state">{{ t('editor.loading') }}</div>
      <div v-else-if="!session" class="editor-state">{{ t('editor.notFound') }}</div>
      <template v-else>
        <aside
          class="editor-shell__assets"
          :class="{ 'editor-shell__assets--collapsed': !assetPanelVisible }"
        >
          <div class="editor-shell__asset-rail">
            <button
              type="button"
              class="editor-shell__asset-toggle"
              :aria-pressed="assetPanelVisible"
              :aria-label="assetPanelVisible ? t('common.collapse') : t('editor.assetLibrary')"
              @click="toggleAssetPanel()"
            >
              <span class="editor-shell__asset-toggle-icon">
                <span />
              </span>
              <em>{{ t('editor.assetLibrary') }}</em>
            </button>
          </div>

          <div ref="assetPanelEl" class="editor-shell__asset-panel">
            <EditorAssetPanel
              :sources="librarySources"
              :tree="editor.assetTree"
              :external-dragging="isDraggingExternal"
              @source-add="addSourceAsReference"
              @source-pointer-grab="handleAssetPointerGrab"
              @source-reveal="revealSource"
              @source-remove="removeSource"
            />
          </div>
        </aside>

        <div
          class="editor-shell__resizer editor-shell__resizer--left"
          :class="{ 'editor-shell__resizer--hidden': !assetResizerVisible }"
          @mousedown="startResize('assets', $event)"
        >
          <span />
        </div>

        <div class="editor-shell__center">
          <EditorMixer
            ref="mixerRef"
            :tracks="session.tracks"
            :source-map="editor.sourceMap"
            :selected-track-id="editor.selectedTrackId"
            :current-time="playbackCurrentTime"
            :duration="editor.duration"
            :pixels-per-second="editor.pixelsPerSecond"
            @scroll-ready="handleMixerScrollReady"
            @select-track="editor.selectTrack"
            @toggle-mute="(id) => editor.toggleTrackFlag(id, 'muted')"
            @toggle-solo="(id) => editor.toggleTrackFlag(id, 'solo')"
            @context-mute="(id) => editor.toggleTrackFlag(id, 'muted')"
            @context-solo="(id) => editor.toggleTrackFlag(id, 'solo')"
            @seek="playbackSeek"
            @remove-track="editor.removeTrack"
            @reveal-track="(id) => { const currentSession = session; const track = currentSession?.tracks.find((item) => item.id === id); const source = track ? editor.sourceMap.get(track.sourceId) : null; if (source) revealSource(source) }"
            @zoom-in="editor.zoomIn"
            @zoom-out="editor.zoomOut"
            @zoom-fit="zoomFit"
            @zoom-at="zoomAt"
            @add-track-from-asset="addTrackFromAsset"
          />
        </div>

        <div class="editor-shell__resizer editor-shell__resizer--right" @mousedown="startResize('inspector', $event)">
          <span />
        </div>

        <EditorInspectorPanel
          class="editor-shell__inspector"
          :session="session"
          :selected-track-id="editor.selectedTrackId"
          :selected-source="editor.selectedSource"
          :duration="editor.duration"
          :last-export-path="editor.lastExport?.path || null"
          @rename-track="editor.renameTrack"
          @toggle-track-flag="toggleTrackFlag"
          @set-track-volume="setTrackVolume"
          @begin-track-volume="editor.beginInteraction"
          @commit-track-volume="editor.commitInteraction"
          @set-track-fades="setTrackFades"
          @open-location="openExportDir"
        />
      </template>
    </div>
    <div
      v-if="draggingSourceName && draggingGhost"
      class="editor-drag-ghost"
      :style="{ left: `${draggingGhost.x + 18}px`, top: `${draggingGhost.y + 18}px` }"
    >
      {{ draggingSourceName }}
    </div>

    <n-modal
      :show="showExportDialog"
      preset="card"
      class="editor-export-modal"
      :title="t('editor.exportDialogTitle')"
      :bordered="false"
      size="small"
      style="width: min(560px, calc(100vw - 32px));"
      @update:show="(value: boolean) => { if (!value) closeExportDialog() }"
    >
      <div class="export-dialog">
        <div class="export-dialog__intro">
          <strong>{{ sessionName }}</strong>
          <span>{{ t('editor.exportDialogHint') }}</span>
        </div>

        <div class="export-dialog__form">
          <label class="export-dialog__field">
            <span>{{ t('editor.exportFormat') }}</span>
            <n-select
              v-model:value="exportFormatDraft"
              :options="exportFormatOptions"
              size="small"
            />
          </label>

          <label class="export-dialog__field" v-if="exportFormatDraft === 'wav'">
            <span>{{ t('audio.wavBitDepth') }}</span>
            <n-select
              v-model:value="exportWavBitDepthDraft"
              :options="wavBitDepthOptions"
              size="small"
            />
          </label>

          <label class="export-dialog__field" v-if="exportFormatDraft === 'flac'">
            <span>{{ t('audio.flacBitDepth') }}</span>
            <n-select
              v-model:value="exportFlacBitDepthDraft"
              :options="flacBitDepthOptions"
              size="small"
            />
          </label>
        </div>

        <div class="export-dialog__section export-dialog__section--compact">
          <div class="export-dialog__section-title">{{ t('editor.exportRenderSummary') }}</div>
          <div class="export-summary">
            <div v-for="row in exportSummaryRows" :key="row.label" class="export-summary__item">
              <span>{{ row.label }}</span>
              <strong>{{ row.value }}</strong>
            </div>
            <div class="export-summary__item export-summary__item--wide">
              <span>{{ t('editor.exportProcessing') }}</span>
              <strong>{{ t('editor.exportProcessingValue') }}</strong>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="export-dialog__footer">
          <n-button secondary @click="closeExportDialog">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" :loading="editor.exporting" @click="exportMix">{{ t('editor.export') }}</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.editor-view {
  position: relative;
}

.editor-shell {
  --asset-rail-width: 34px;
  --asset-panel-width: 218px;
  --asset-resizer-width: 10px;
  --inspector-resizer-width: 10px;
  --inspector-width: 320px;
  position: relative;
  height: calc(100vh - 40px);
  display: grid;
  grid-template-columns:
    calc(var(--asset-rail-width) + var(--asset-panel-width))
    var(--asset-resizer-width)
    minmax(0, 1fr)
    var(--inspector-resizer-width)
    var(--inspector-width);
  grid-template-rows: auto minmax(0, 1fr);
  background:
    radial-gradient(circle at 12% 6%, rgba(255,123,84,0.08), transparent 28%),
    radial-gradient(circle at 86% 18%, rgba(242,180,90,0.06), transparent 30%),
    var(--surface);
  color: var(--on-surface);
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
  transition: grid-template-columns 220ms ease;
}

.editor-shell :deep(input),
.editor-shell :deep(textarea),
.editor-shell :deep([contenteditable='true']),
.editor-shell :deep(.n-input__input-el),
.editor-shell :deep(.n-base-selection-input) {
  user-select: text;
  -webkit-user-select: text;
}

.editor-shell :deep(.editor-transport) {
  grid-column: 1 / -1;
}

.editor-shell__assets {
  grid-column: 1;
  grid-row: 2;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: var(--asset-rail-width) minmax(0, var(--asset-panel-width));
  border-right: 1px solid color-mix(in srgb, var(--outline) 78%, transparent);
  background: color-mix(in srgb, var(--surface) 96%, transparent);
  transition: grid-template-columns 220ms ease, border-color 180ms ease;
}

.editor-shell__assets--collapsed {
  border-right-color: color-mix(in srgb, var(--outline) 46%, transparent);
}

.editor-shell__asset-rail {
  min-height: 0;
  padding: 8px 4px;
  border-right: 1px solid color-mix(in srgb, var(--outline) 68%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-2) 88%, transparent), color-mix(in srgb, var(--surface-1) 96%, transparent));
}

.editor-shell__asset-toggle {
  width: 100%;
  display: grid;
  justify-items: center;
  gap: 0;
  padding: 6px 0;
  border: 0;
  border-radius: 12px;
  color: var(--on-surface-muted);
  background: transparent;
  cursor: pointer;
  transition: color 180ms ease, background 180ms ease, transform 180ms ease;
}

.editor-shell__asset-toggle:hover {
  color: var(--on-surface);
  background: color-mix(in srgb, var(--primary-soft) 68%, var(--surface-2));
  transform: translateY(-1px);
}

.editor-shell__asset-toggle-icon {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface-2) 86%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--outline) 68%, transparent);
}

.editor-shell__asset-toggle-icon span {
  width: 12px;
  height: 10px;
  position: relative;
  display: block;
}

.editor-shell__asset-toggle-icon span::before,
.editor-shell__asset-toggle-icon span::after,
.editor-shell__asset-toggle-icon span {
  border-radius: 999px;
  background: currentColor;
}

.editor-shell__asset-toggle-icon span::before,
.editor-shell__asset-toggle-icon span::after {
  content: '';
  position: absolute;
  left: 0;
  width: 12px;
  height: 2px;
}

.editor-shell__asset-toggle-icon span {
  height: 2px;
}

.editor-shell__asset-toggle-icon span::before {
  top: -5px;
}

.editor-shell__asset-toggle-icon span::after {
  top: 5px;
}

.editor-shell__asset-toggle em {
  display: none;
}

.editor-shell__asset-panel {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.editor-shell__center {
  grid-column: 3;
  grid-row: 2;
  min-width: 0;
  min-height: 0;
  display: grid;
  overflow: auto;
}

.editor-shell__inspector {
  grid-column: 5;
  grid-row: 2;
  min-width: 0;
}

.editor-shell__resizer {
  position: relative;
  grid-row: 2;
  width: 10px;
  cursor: col-resize;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.02)),
    color-mix(in srgb, var(--surface-2) 86%, transparent);
  user-select: none;
}

.editor-shell__resizer--left {
  grid-column: 2;
  background: transparent;
  border-left: 1px solid transparent;
  border-right: 1px solid transparent;
}

.editor-shell__resizer--right {
  grid-column: 4;
  background: transparent;
  border-left: 1px solid transparent;
  border-right: 1px solid transparent;
}

.editor-shell__resizer--right::before {
  background: linear-gradient(
    180deg,
    rgba(255,123,84,0),
    rgba(255,123,84,0.05),
    rgba(255,123,84,0)
  );
}

.editor-shell__resizer--right span {
  width: 2px;
  height: 38px;
  opacity: 0;
  background: color-mix(in srgb, var(--on-surface-muted) 14%, transparent);
}

.editor-shell__resizer--right:hover {
  background: linear-gradient(
    180deg,
    transparent,
    color-mix(in srgb, var(--surface-2) 42%, transparent),
    transparent
  );
  border-left-color: color-mix(in srgb, var(--outline) 40%, transparent);
  border-right-color: color-mix(in srgb, var(--outline) 40%, transparent);
}

.editor-shell__resizer--right:hover span,
.editor-shell--resizing .editor-shell__resizer--right span {
  opacity: 1;
  height: 56px;
  background: color-mix(in srgb, #ff7b54 52%, var(--on-surface-muted));
}

.editor-shell__resizer--left::before {
  background: linear-gradient(
    180deg,
    rgba(255,123,84,0),
    rgba(255,123,84,0.05),
    rgba(255,123,84,0)
  );
}

.editor-shell__resizer--left span {
  width: 2px;
  height: 38px;
  opacity: 0;
  background: color-mix(in srgb, var(--on-surface-muted) 14%, transparent);
}

.editor-shell__resizer--left:hover {
  background: linear-gradient(
    180deg,
    transparent,
    color-mix(in srgb, var(--surface-2) 42%, transparent),
    transparent
  );
  border-left-color: color-mix(in srgb, var(--outline) 40%, transparent);
  border-right-color: color-mix(in srgb, var(--outline) 40%, transparent);
}

.editor-shell__resizer--left:hover span,
.editor-shell--resizing .editor-shell__resizer--left span {
  opacity: 1;
  height: 56px;
  background: color-mix(in srgb, #ff7b54 52%, var(--on-surface-muted));
}

.editor-shell__resizer--hidden {
  pointer-events: none;
}

.editor-shell__resizer--hidden span,
.editor-shell__resizer--hidden::before {
  opacity: 0;
}

.editor-shell__resizer::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(255,123,84,0), rgba(255,123,84,0.08), rgba(255,123,84,0));
  opacity: 0;
  transition: opacity 140ms ease;
}

.editor-shell__resizer span {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 3px;
  height: 48px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--on-surface-muted) 32%, transparent);
  transform: translate(-50%, -50%);
  transition: background 140ms ease, height 140ms ease;
}

.editor-shell__resizer:hover::before,
.editor-shell--resizing .editor-shell__resizer::before {
  opacity: 1;
}

.editor-shell__resizer:hover span,
.editor-shell--resizing .editor-shell__resizer span {
  height: 72px;
  background: color-mix(in srgb, #ff7b54 66%, var(--on-surface-muted));
}

.editor-state {
  grid-column: 1 / -1;
  grid-row: 2;
  display: grid;
  place-items: center;
  color: var(--on-surface-muted);
}

.editor-shell--resizing {
  cursor: col-resize;
}

.editor-shell--playback-following .editor-shell__center {
  overflow: hidden;
}

.editor-drag-ghost {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  max-width: 260px;
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--primary) 28%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-2) 94%, rgba(255, 123, 84, 0.16));
  color: var(--on-surface);
  font-size: 12px;
  line-height: 1.2;
  box-shadow: 0 14px 28px rgba(12, 18, 28, 0.2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.editor-export-modal :deep(.n-card) {
  width: min(560px, calc(100vw - 32px)) !important;
  max-width: min(560px, calc(100vw - 32px)) !important;
  background:
    radial-gradient(circle at top right, rgba(255, 123, 84, 0.12), transparent 34%),
    linear-gradient(180deg, color-mix(in srgb, var(--surface-1) 96%, transparent), var(--surface));
}

.export-dialog {
  display: grid;
  gap: 10px;
  width: 100%;
}

.export-dialog__intro {
  display: grid;
  gap: 4px;
  padding: 2px 2px 0;
}

.export-dialog__intro strong {
  font-size: 13px;
  line-height: 1.1;
}

.export-dialog__intro span {
  color: var(--on-surface-muted);
  font-size: 11px;
  line-height: 1.45;
}

.export-dialog__form {
  display: grid;
  gap: 10px;
}

.export-dialog__field {
  display: grid;
  gap: 6px;
}

.export-dialog__field span {
  color: var(--on-surface-muted);
  font-size: 11px;
  line-height: 1.2;
}

.export-dialog__section {
  display: grid;
  gap: 8px;
  padding: 9px 10px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-2) 82%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--outline) 74%, transparent);
}

.export-dialog__section--compact {
  padding: 10px;
}

.export-dialog__notice {
  display: grid;
  gap: 6px;
  padding: 9px 10px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-2) 68%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--outline) 54%, transparent);
}

.export-dialog__notice span {
  color: var(--on-surface-muted);
  font-size: 11px;
  line-height: 1.5;
}

.export-dialog__section-title {
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.export-summary {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
}

.export-summary__item {
  display: grid;
  gap: 3px;
  padding: 8px 10px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-1) 80%, transparent);
}

.export-summary__item--wide {
  grid-column: auto;
}

.export-summary__item span {
  color: var(--on-surface-muted);
  font-size: 10px;
  line-height: 1.2;
}

.export-summary__item strong {
  font-size: 12px;
  line-height: 1.3;
}

.export-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.editor-export-modal :deep(.n-base-selection) {
  --n-color: color-mix(in srgb, var(--surface-1) 92%, transparent) !important;
  --n-border: 1px solid color-mix(in srgb, var(--outline) 60%, transparent) !important;
  --n-border-hover: 1px solid color-mix(in srgb, var(--outline) 78%, transparent) !important;
  --n-border-focus: 1px solid color-mix(in srgb, var(--primary) 50%, transparent) !important;
  --n-box-shadow-focus: 0 0 0 2px color-mix(in srgb, var(--primary-soft) 30%, transparent) !important;
}

@media (max-width: 920px) {
  .editor-shell__assets {
    grid-template-columns: var(--asset-rail-width);
  }

  .editor-shell__asset-panel {
    display: none;
  }

  .export-summary {
    grid-template-columns: 1fr;
  }
}
</style>
