// 编辑器时间格式化工具。统一各组件的时间码显示，避免重复实现。

/**
 * 将秒数格式化为 mm:ss.t（分:秒.十分之一秒）。
 * 用于传输条、检查器、资产列表等处的时间显示。
 */
export function formatTime(value: number): string {
  const safe = Number.isFinite(value) && value > 0 ? value : 0
  const minutes = Math.floor(safe / 60)
  const seconds = Math.floor(safe % 60)
  const tenths = Math.floor((safe % 1) * 10)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`
}

/**
 * 将秒数格式化为 mm:ss（整秒），用于标尺刻度等不需要小数的场景。
 */
export function formatTimecode(value: number): string {
  const safe = Number.isFinite(value) && value > 0 ? value : 0
  const minutes = Math.floor(safe / 60)
  const seconds = Math.floor(safe % 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
