/** 选区文本样式（D93）：把富文本区间切成可直接渲染的片段。 */

import type { TextRun, TextRunStyle } from '@shared/types/document'

export interface StyledSegment {
  text: string
  style: TextRunStyle
}

/** 把文字按 runs 切段；未覆盖的部分用空样式 */
export function splitRuns(text: string, runs: TextRun[] | undefined): StyledSegment[] {
  if (!runs || runs.length === 0 || text.length === 0) return [{ text, style: {} }]
  const sorted = runs
    .filter((run) => run.end > run.start)
    .map((run) => ({
      start: Math.max(0, Math.min(text.length, run.start)),
      end: Math.max(0, Math.min(text.length, run.end)),
      style: run.style
    }))
    .sort((a, b) => a.start - b.start)

  const segments: StyledSegment[] = []
  let cursor = 0
  for (const run of sorted) {
    if (run.start > cursor) {
      segments.push({ text: text.slice(cursor, run.start), style: {} })
    }
    if (run.end > Math.max(cursor, run.start)) {
      segments.push({ text: text.slice(Math.max(cursor, run.start), run.end), style: run.style })
      cursor = run.end
    }
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), style: {} })
  return segments.length > 0 ? segments : [{ text, style: {} }]
}

/**
 * 对 [start, end) 应用样式：与已有区间求并后重排，
 * 同一段样式合并，保证不重叠（D93）。
 */
export function applyRunStyle(
  runs: TextRun[] | undefined,
  start: number,
  end: number,
  patch: TextRunStyle
): TextRun[] {
  const a = Math.min(start, end)
  const b = Math.max(start, end)
  if (b <= a) return runs ?? []

  const result: TextRun[] = []
  // 完全在选区之外的保持不变
  for (const run of runs ?? []) {
    if (run.end <= a || run.start >= b) result.push(run)
  }
  // 与选区相交的部分拆分：保留左右非重叠片段
  for (const run of runs ?? []) {
    if (run.end <= a || run.start >= b) continue
    if (run.start < a) result.push({ start: run.start, end: a, style: run.style })
    if (run.end > b) result.push({ start: b, end: run.end, style: run.style })
  }

  // 计算选区内的基础样式（取覆盖起点的已有样式，保证叠加）
  let base: TextRunStyle = {}
  for (const run of runs ?? []) {
    if (run.start <= a && run.end > a) base = { ...base, ...run.style }
  }
  result.push({ start: a, end: b, style: { ...base, ...patch } })

  return result.sort((x, y) => x.start - y.start)
}
