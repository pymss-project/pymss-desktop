import { defineStore } from 'pinia'
import { ref } from 'vue'

type ToastType = 'info' | 'success' | 'error'
export type Toast = { id: number; type: ToastType; message: string }

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([])
  let nextId = 1

  function show(message: string, type: ToastType = 'info') {
    const toast = { id: nextId++, type, message }
    toasts.value.push(toast)
    window.setTimeout(() => dismiss(toast.id), 3600)
  }

  function success(message: string) { show(message, 'success') }
  function error(message: string) { show(message, 'error') }
  function dismiss(id: number) { toasts.value = toasts.value.filter((toast) => toast.id !== id) }

  return { toasts, show, success, error, dismiss }
})
