import { onBeforeUnmount, ref, type Ref } from 'vue'
import type { EditorSource } from '@/types/editor'

type MixerDragApi = {
  setDraggingAssetSourceId: (sourceId: string | null) => void
  setDropTargetTrackId: (trackId: string | null) => void
  containsPoint: (x: number, y: number) => boolean
  commitAssetDrop: () => void
}

type UseEditorAssetDragOptions = {
  mixerRef: Ref<MixerDragApi | null>
}

export function useEditorAssetDrag(options: UseEditorAssetDragOptions) {
  const { mixerRef } = options

  const draggingSourceId = ref<string | null>(null)
  const draggingSourceName = ref<string | null>(null)
  const draggingGhost = ref<{ x: number; y: number } | null>(null)

  let assetDragMoveHandler: ((event: MouseEvent) => void) | null = null
  let assetDragUpHandler: ((event: MouseEvent) => void) | null = null

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

  onBeforeUnmount(() => {
    clearAssetPointerDrag()
  })

  return {
    draggingSourceName,
    draggingGhost,
    clearAssetPointerDrag,
    handleAssetPointerGrab,
  }
}
