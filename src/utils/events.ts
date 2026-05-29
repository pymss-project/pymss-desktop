import { listen } from '@tauri-apps/api/event'
import { useAppStore } from '@/stores/app'
import { useTaskStore } from '@/stores/task'
import { useModelStore } from '@/stores/model'

let registered = false

export function registerWorkerEvents() {
  if (registered) return
  registered = true
  listen('pymss://worker-event', (event) => {
    const app = useAppStore()
    const tasks = useTaskStore()
    const models = useModelStore()
    app.pushWorkerEvent(event.payload)
    tasks.handleWorkerEvent(event.payload)
    models.handleWorkerEvent(event.payload)
  }).catch(() => {})
}
