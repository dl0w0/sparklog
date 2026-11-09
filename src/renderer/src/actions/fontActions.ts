/** 字号快捷键与批量改字号的统一入口（D92）。 */

import { clampFontSize, FONT_SIZE_STEP, type AppSettings } from '@shared/types/settings'
import type { BubbleNode, InsertObject } from '@shared/types/document'
import { useDocStore } from '@renderer/store/docStore'
import { useSelectionStore } from '@renderer/store/selectionStore'
import { depthFontSize } from '@renderer/logic/nodeVisual'
import { getTypographySettings } from '@renderer/logic/runtimeSettings'
import { applyRunStyle } from '@renderer/logic/richText'

/** 某个气泡当前生效的字号 */
export function currentBubbleFontSize(node: BubbleNode, depth: number): number {
  return clampFontSize(node.style?.fontSize ?? depthFontSize(depth))
}

/** 某个插入项当前生效的字号 */
export function currentInsertFontSize(
  insert: InsertObject,
  settings?: AppSettings['typography']
): number {
  const typo = settings ?? getTypographySettings()
  return clampFontSize(insert.textStyle?.fontSize ?? typo[insert.kind].fontSize ?? 14)
}

/**
 * 对选中对象逐个调整字号：每个对象在**各自当前字号**基础上 ±step，
 * 而不是统一设成同一个值（D92）。
 */
/** 内联编辑中选中的文字：只改该区间的字号（D93） */
function changeSelectedRunFontSize(
  nodeId: string,
  range: { start: number; end: number },
  delta: number,
  step: number
): boolean {
  const store = useDocStore.getState()
  const node = store.doc.nodes.find((item) => item.id === nodeId)
  if (!node) return false
  const covered = (node.runs ?? []).find((run) => run.start <= range.start && run.end >= range.end)
  const current = covered?.style.fontSize ?? node.style?.fontSize ?? depthFontSize(0)
  const next = clampFontSize(current + delta * step)
  store.commit('调整选区字号', (draft) => {
    const target = draft.nodes.find((item) => item.id === nodeId)
    if (!target) return
    target.runs = applyRunStyle(target.runs, range.start, range.end, { fontSize: next })
  })
  return true
}

export function changeFontSize(delta: number, step: number = FONT_SIZE_STEP): void {
  const store = useDocStore.getState()
  const selection = useSelectionStore.getState()
  // 编辑态且有选区：只作用于选区（D93）
  if (selection.editingId && selection.editingRange) {
    if (
      changeSelectedRunFontSize(
        selection.editingId,
        selection.editingRange,
        delta,
        step
      )
    ) {
      return
    }
  }

  const targets = new Set(selection.selectedIds)
  // 内联编辑中选中的文字：作用于该气泡
  if (selection.editingId) targets.add(selection.editingId)
  if (targets.size === 0) return

  const depthOf = new Map<string, number>()
  const nodes = store.doc.nodes
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const ancestors = new Map<string, string | null>()
  for (const node of nodes) ancestors.set(node.id, node.parentIds[0] ?? null)
  const depth = (id: string): number => {
    let value = 0
    let current = ancestors.get(id) ?? null
    const seen = new Set<string>()
    while (current && !seen.has(current)) {
      seen.add(current)
      value += 1
      current = ancestors.get(current) ?? null
    }
    return value
  }

  const bubbleUpdates: { id: string; fontSize: number }[] = []
  const insertUpdates: { id: string; fontSize: number }[] = []

  for (const id of targets) {
    const node = byId.get(id)
    if (node) {
      if (!depthOf.has(id)) depthOf.set(id, depth(id))
      const next = clampFontSize(currentBubbleFontSize(node, depthOf.get(id) ?? 0) + delta * step)
      bubbleUpdates.push({ id, fontSize: next })
      continue
    }
    const insert = store.doc.inserts.find((item) => item.id === id)
    if (insert) {
      insertUpdates.push({ id, fontSize: clampFontSize(currentInsertFontSize(insert) + delta * step) })
    }
  }

  if (bubbleUpdates.length === 0 && insertUpdates.length === 0) return

  store.commit('调整字号', (draft) => {
    for (const update of bubbleUpdates) {
      const node = draft.nodes.find((item) => item.id === update.id)
      if (!node) continue
      node.style = { ...(node.style ?? {}), fontSize: update.fontSize }
    }
    for (const update of insertUpdates) {
      const insert = draft.inserts.find((item) => item.id === update.id)
      if (!insert) continue
      insert.textStyle = { ...(insert.textStyle ?? {}), fontSize: update.fontSize }
    }
  })
}
