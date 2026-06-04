import type { Ref } from 'vue'
import type { useEditorStore } from '@/stores/editor'

type EditorStore = ReturnType<typeof useEditorStore>

type UseEditorMixerViewOptions = {
  editor: EditorStore
  trackHeaderWidth: number
  scrollEl: Ref<HTMLElement | null>
  playbackLoop: Ref<boolean>
}

export function useEditorMixerView(options: UseEditorMixerViewOptions) {
  const { editor, trackHeaderWidth, scrollEl, playbackLoop } = options

  function zoomFit() {
    const viewportWidth = scrollEl.value?.clientWidth || 0
    if (!viewportWidth || editor.duration <= 0) return
    editor.setZoom((viewportWidth - trackHeaderWidth - 24) / Math.max(editor.duration, 0.01))
  }

  function zoomAt(payload: { direction: 'in' | 'out'; anchorRatio: number }) {
    const element = scrollEl.value
    if (!element) {
      if (payload.direction === 'in') editor.zoomIn()
      else editor.zoomOut()
      return
    }

    const anchorX = element.scrollLeft + element.clientWidth * payload.anchorRatio - trackHeaderWidth
    const anchorTime = Math.max(0, anchorX / Math.max(1, editor.pixelsPerSecond))
    const nextZoom = editor.pixelsPerSecond + (payload.direction === 'in' ? 18 : -18)
    editor.setZoom(nextZoom)
    requestAnimationFrame(() => {
      element.scrollLeft = Math.max(
        0,
        trackHeaderWidth + anchorTime * editor.pixelsPerSecond - element.clientWidth * payload.anchorRatio,
      )
    })
  }

  function updatePlaybackLoop(value: boolean) {
    playbackLoop.value = value
  }

  function handleMixerScrollReady(element: HTMLElement) {
    scrollEl.value = element
  }

  return {
    zoomFit,
    zoomAt,
    updatePlaybackLoop,
    handleMixerScrollReady,
  }
}
