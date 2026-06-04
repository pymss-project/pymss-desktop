import { ref } from 'vue'
import type { MessageApiInjection } from 'naive-ui/es/message/src/MessageProvider'
import type { ComposerTranslation } from 'vue-i18n'
import type { EditorExportFormat } from '@/types/editor'
import type { useEditorStore } from '@/stores/editor'
import type { useSettingsStore } from '@/stores/settings'

type EditorStore = ReturnType<typeof useEditorStore>
type SettingsStore = ReturnType<typeof useSettingsStore>

type UseEditorExportOptions = {
  editor: EditorStore
  settings: SettingsStore
  message: MessageApiInjection
  t: ComposerTranslation
}

export function useEditorExport(options: UseEditorExportOptions) {
  const { editor, settings, message, t } = options

  const showExportDialog = ref(false)
  const exportFormatDraft = ref<EditorExportFormat>('wav')
  const exportWavBitDepthDraft = ref('PCM_24')
  const exportFlacBitDepthDraft = ref('PCM_24')

  function openExportDialog() {
    exportFormatDraft.value = editor.exportFormat
    exportWavBitDepthDraft.value = settings.wavBitDepth
    exportFlacBitDepthDraft.value = settings.flacBitDepth
    showExportDialog.value = true
  }

  function closeExportDialog() {
    showExportDialog.value = false
  }

  function setExportDialogVisible(value: boolean) {
    if (!value) closeExportDialog()
  }

  function setExportFormat(value: EditorExportFormat) {
    exportFormatDraft.value = value
  }

  function setExportWavBitDepth(value: string) {
    exportWavBitDepthDraft.value = value
  }

  function setExportFlacBitDepth(value: string) {
    exportFlacBitDepthDraft.value = value
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

  return {
    showExportDialog,
    exportFormatDraft,
    exportWavBitDepthDraft,
    exportFlacBitDepthDraft,
    openExportDialog,
    closeExportDialog,
    setExportDialogVisible,
    setExportFormat,
    setExportWavBitDepth,
    setExportFlacBitDepth,
    exportMix,
  }
}
