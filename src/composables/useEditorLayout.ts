import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

type ResizeSide = 'assets' | 'inspector'

type ResizeState = {
  side: ResizeSide
  startX: number
  startAssetWidth: number
  startInspectorWidth: number
}

type UseEditorLayoutOptions = {
  shellEl: Ref<HTMLElement | null>
  assetRailWidth: number
  resizerWidth: number
  minAssetWidth: number
  maxAssetWidth: number
  minCenterWidth: number
  minInspectorWidth: number
  maxInspectorWidth: number
  initialAssetWidth: number
  initialInspectorWidth?: number
  assetCollapsedStorageKey?: string
  assetPanelWidthStorageKey?: string
  inspectorWidthStorageKey?: string
}

const DEFAULT_ASSET_COLLAPSED_STORAGE_KEY = 'pymss:editor:asset-collapsed'
const DEFAULT_ASSET_PANEL_WIDTH_STORAGE_KEY = 'pymss:editor:asset-width'
const DEFAULT_INSPECTOR_WIDTH_STORAGE_KEY = 'pymss:editor:inspector-width'

export function useEditorLayout(options: UseEditorLayoutOptions) {
  const {
    shellEl,
    assetRailWidth,
    resizerWidth,
    minAssetWidth,
    maxAssetWidth,
    minCenterWidth,
    minInspectorWidth,
    maxInspectorWidth,
    initialAssetWidth,
    initialInspectorWidth = 288,
    assetCollapsedStorageKey = DEFAULT_ASSET_COLLAPSED_STORAGE_KEY,
    assetPanelWidthStorageKey = DEFAULT_ASSET_PANEL_WIDTH_STORAGE_KEY,
    inspectorWidthStorageKey = DEFAULT_INSPECTOR_WIDTH_STORAGE_KEY,
  } = options

  const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1440)
  const inspectorPanelWidth = ref(initialInspectorWidth)
  const assetPanelWidth = ref(initialAssetWidth)
  const isAssetCollapsed = ref(false)
  const activeResize = ref<ResizeState | null>(null)

  const inspectorVisible = computed(() => viewportWidth.value > 1320)
  const assetPanelVisible = computed(() => !isAssetCollapsed.value && viewportWidth.value > 920)
  const assetResizerVisible = computed(() => assetPanelVisible.value)

  const shellStyle = computed(() => ({
    '--asset-rail-width': `${assetRailWidth}px`,
    '--asset-panel-width': assetPanelVisible.value ? `${assetPanelWidth.value}px` : '0px',
    '--asset-resizer-width': assetResizerVisible.value ? `${resizerWidth}px` : '0px',
    '--inspector-resizer-width': inspectorVisible.value ? `${resizerWidth}px` : '0px',
    '--inspector-width': inspectorVisible.value ? `${inspectorPanelWidth.value}px` : '0px',
  }))

  function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max)
  }

  function getShellWidth() {
    return shellEl.value?.clientWidth || window.innerWidth || 0
  }

  function getVisibleHandleWidth() {
    return inspectorVisible.value ? resizerWidth : 0
  }

  function getVisibleAssetHandleWidth() {
    return assetResizerVisible.value ? resizerWidth : 0
  }

  function getAvailableSidebarWidth() {
    const shellWidth = getShellWidth()
    return Math.max(0, shellWidth - minCenterWidth - getVisibleHandleWidth())
  }

  function getAvailableAssetWidth() {
    const shellWidth = getShellWidth()
    const inspectorWidth = inspectorVisible.value ? inspectorPanelWidth.value : 0
    return Math.max(
      0,
      shellWidth
        - assetRailWidth
        - minCenterWidth
        - inspectorWidth
        - getVisibleHandleWidth()
        - getVisibleAssetHandleWidth(),
    )
  }

  function clampInspectorWidth(width: number) {
    const responsiveMax = getAvailableSidebarWidth()
    return clamp(width, minInspectorWidth, Math.max(minInspectorWidth, Math.min(maxInspectorWidth, responsiveMax)))
  }

  function clampAssetWidth(width: number) {
    const responsiveMax = getAvailableAssetWidth()
    return clamp(width, minAssetWidth, Math.max(minAssetWidth, Math.min(maxAssetWidth, responsiveMax)))
  }

  function savePanelWidths() {
    try {
      localStorage.setItem(assetCollapsedStorageKey, isAssetCollapsed.value ? '1' : '0')
      localStorage.setItem(assetPanelWidthStorageKey, String(assetPanelWidth.value))
      localStorage.setItem(inspectorWidthStorageKey, String(inspectorPanelWidth.value))
    } catch {
      // ignore storage errors
    }
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

  function stopResize() {
    if (!activeResize.value) return
    activeResize.value = null
    window.removeEventListener('mousemove', handleResizeMove)
    window.removeEventListener('mouseup', stopResize)
    savePanelWidths()
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
      isAssetCollapsed.value = localStorage.getItem(assetCollapsedStorageKey) === '1'
      const storedAssetWidth = Number(localStorage.getItem(assetPanelWidthStorageKey) || assetPanelWidth.value)
      const storedInspectorWidth = Number(localStorage.getItem(inspectorWidthStorageKey) || inspectorPanelWidth.value)
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

  onMounted(() => {
    restorePanelWidths()
    window.addEventListener('resize', syncPanelWidthsToViewport)
  })

  onBeforeUnmount(() => {
    stopResize()
    window.removeEventListener('resize', syncPanelWidthsToViewport)
  })

  return {
    viewportWidth,
    inspectorPanelWidth,
    assetPanelWidth,
    isAssetCollapsed,
    activeResize,
    inspectorVisible,
    assetPanelVisible,
    assetResizerVisible,
    shellStyle,
    startResize,
    stopResize,
    toggleAssetPanel,
  }
}
