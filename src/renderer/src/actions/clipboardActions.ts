/** 复制 / 剪切 / 粘贴 / 样式拷贝粘贴（D17）。 */

import type { BubbleStyle } from '@shared/types/document'
import { copyPayload, cutPayload, pastePayload } from '@renderer/logic/clipboard'
import { getCanvasController } from '@renderer/actions/commands'
import { newId } from '@renderer/logic/ids'
import { useClipboardStore } from '@renderer/store/clipboardStore'
import { useDocStore } from '@renderer/store/docStore'
import { useSelectionStore } from '@renderer/store/selectionStore'
import { ROOT_LEVEL, useViewportStore } from '@renderer/store/viewportStore'

function currentZoneId(): string | null {
  const levelId = useViewportStore.getState().levelId
  return levelId === ROOT_LEVEL ? null : levelId
}

export function copySelection(): boolean {
  const { doc } = useDocStore.getState()
  const ids = useSelectionStore.getState().selectedIds
  const payload = copyPayload(doc.nodes, ids, currentZoneId())
  if (!payload) return false
  useClipboardStore.getState().setBubbles(payload)
  return true
}

export function cutSelection(): boolean {
  const store = useDocStore.getState()
  const ids = useSelectionStore.getState().selectedIds
  const res = cutPayload(store.doc.nodes, ids, currentZoneId())
  if (!res) return false
  useClipboardStore.getState().setBubbles(res.payload)
  store.commit('剪切气泡', (d) => {
    d.nodes = res.nodes
    d.inserts = d.inserts.filter((i) => !res.removedIds.includes(i.ownerBubbleId ?? ''))
  })
  useSelectionStore.getState().clear()
  return true
}

/** 粘贴到指定气泡（作为子节点）；targetId 为空则落在画布中央 */
export function pasteBubbles(targetId: string | null = null): boolean {
  const payload = useClipboardStore.getState().bubbles
  if (!payload) return false
  const store = useDocStore.getState()
  const zoneId = currentZoneId()
  const center = getCanvasController()?.worldCenter() ?? { x: 0, y: 0 }
  const count = store.doc.nodes.length
  const offset = targetId ? { x: 0, y: 0 } : { x: (count % 5) * 24, y: (count % 5) * 24 }

  const res = pastePayload(store.doc.nodes, payload, {
    targetParentId: targetId,
    zoneId,
    offset: targetId ? { x: 0, y: 0 } : { x: center.x, y: center.y },
    makeId: () => newId('b')
  })

  store.commit('粘贴气泡', (d) => {
    d.nodes = res.nodes
  })
  useSelectionStore.getState().selectMany(res.newRootIds)
  // 粘贴后若剪贴板来自剪切，则清空（避免重复粘贴产生副本）
  if (payload.cut) useClipboardStore.getState().setBubbles(null)
  return true
}

export function copyStyle(): boolean {
  const id = useSelectionStore.getState().primaryId()
  if (!id) return false
  const node = useDocStore.getState().doc.nodes.find((n) => n.id === id)
  if (!node) return false
  const style: BubbleStyle = {
    shape: node.style?.shape ?? node.shape,
    colorKey: node.style?.colorKey ?? node.colorKey,
    fontSize: node.style?.fontSize,
    strokeWidth: node.style?.strokeWidth
  }
  useClipboardStore.getState().setStyle(style)
  return true
}

export function pasteStyle(): boolean {
  const style = useClipboardStore.getState().style
  if (!style) return false
  const ids = useSelectionStore.getState().selectedIds
  if (ids.length === 0) return false
  useDocStore.getState().commit('粘贴样式', (d) => {
    for (const node of d.nodes) {
      if (!ids.includes(node.id)) continue
      node.style = { ...(node.style ?? {}), ...style }
      if (style.shape) node.shape = style.shape
      if (style.colorKey) node.colorKey = style.colorKey
    }
  })
  return true
}

export function selectAllInLevel(): void {
  const { doc } = useDocStore.getState()
  const zoneId = currentZoneId()
  const ids = doc.nodes.filter((n) => n.zoneId === zoneId).map((n) => n.id)
  useSelectionStore.getState().selectMany(ids)
}
