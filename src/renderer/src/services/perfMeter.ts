/** 开发/测试用的帧耗时记录器：只记录显式开启时的拖拽帧。 */

export interface PerfStats {
  count: number
  p50: number
  p95: number
  max: number
  frames: number[]
}

interface PerfWindow extends Window {
  __slPerfEnabled?: boolean
  __slPerfFrames?: number[]
}

function win(): PerfWindow | null {
  return typeof window === 'undefined' ? null : (window as PerfWindow)
}

export function enablePerfRecording(): void {
  const w = win()
  if (!w) return
  w.__slPerfEnabled = true
  w.__slPerfFrames = []
}

export function recordFrame(ms: number): void {
  const w = win()
  if (!w?.__slPerfEnabled) return
  w.__slPerfFrames?.push(ms)
}

export function readPerfStats(): PerfStats {
  const w = win()
  const frames = [...(w?.__slPerfFrames ?? [])]
  if (frames.length === 0) return { count: 0, p50: 0, p95: 0, max: 0, frames }
  const sorted = [...frames].sort((a, b) => a - b)
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
  return {
    count: sorted.length,
    p50: at(0.5),
    p95: at(0.95),
    max: sorted[sorted.length - 1],
    frames
  }
}

export function resetPerfRecording(): void {
  const w = win()
  if (w?.__slPerfFrames) w.__slPerfFrames = []
}
