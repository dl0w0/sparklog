/** 连线的编辑动作：类型、颜色、粗细、长度、删除、建立关联（D49–D51）。 */

import type { EdgeEndpointKind } from '@shared/types/document'
import { newId } from '@renderer/logic/ids'
import { makeRadiusResolver } from '@renderer/logic/nodeVisual'
import { entityGeometry, findLink, type ViewEdge } from '@renderer/logic/links'
import { removeParentLink } from '@renderer/logic/graph'
import { insertDisplayPos } from '@renderer/actions/insertActions'
import { useDocStore } from '@renderer/store/docStore'
import { useSelectionStore } from '@renderer/store/selectionStore'

function geometryFor(id: string) {
  const doc = useDocStore.getState().doc
  const radiusOf = makeRadiusResolver(doc.nodes, doc.viewMode)
  return entityGeometry(id, doc.nodes, doc.inserts, radiusOf, (ins) =>
    insertDisplayPos(ins, doc.nodes, doc.viewMode)
  )
}

function withEdgeStyle(
  edge: ViewEdge,
  patch: { dashed?: boolean; color?: string; width?: number; label?: string }
): void {
  const store = useDocStore.getState()
  store.commit('修改连线样式', (d) => {
    if (edge.linkId) {
      const link = d.links.find((l) => l.id === edge.linkId)
      if (!link) return
      link.style = { ...(link.style ?? {}), ...patch }
      return
    }
    d.edgeStyles = {
      ...(d.edgeStyles ?? {}),
      [edge.id]: { ...(d.edgeStyles?.[edge.id] ?? {}), ...patch }
    }
  })
}

export function setEdgeDashed(edge: ViewEdge, dashed: boolean): void {
  withEdgeStyle(edge, { dashed })
}

export function setEdgeColor(edge: ViewEdge, color: string | undefined): void {
  withEdgeStyle(edge, { color })
}

export function setEdgeWidth(edge: ViewEdge, width: number): void {
  withEdgeStyle(edge, { width })
}

export function setEdgeLabel(edge: ViewEdge, label: string): void {
  if (edge.linkId) {
    useDocStore.getState().commit('编辑连线标签', (d) => {
      const link = d.links.find((l) => l.id === edge.linkId)
      if (link) link.label = label
    })
    return
  }
  withEdgeStyle(edge, { label })
}

/** 读取一条连线的完整样式（拷贝样式用） */
export function readEdgeStyle(edge: ViewEdge): {
  dashed?: boolean
  color?: string
  width?: number
  label?: string
} {
  const doc = useDocStore.getState().doc
  if (edge.linkId) {
    const link = doc.links.find((l) => l.id === edge.linkId)
    return { ...(link?.style ?? {}), label: link?.label }
  }
  return { ...(doc.edgeStyles?.[edge.id] ?? {}) }
}

/** 把样式套用到另一条连线（粘贴样式用） */
export function applyEdgeStyle(
  edge: ViewEdge,
  style: { dashed?: boolean; color?: string; width?: number; label?: string }
): void {
  const store = useDocStore.getState()
  store.commit('粘贴连线样式', (d) => {
    if (edge.linkId) {
      const link = d.links.find((l) => l.id === edge.linkId)
      if (!link) return
      link.style = { ...(link.style ?? {}), dashed: style.dashed, color: style.color, width: style.width }
      if (style.label !== undefined) link.label = style.label
      return
    }
    d.edgeStyles = { ...(d.edgeStyles ?? {}), [edge.id]: { ...style } }
  })
}

/** 设定长度：移动可移动端并写入持久长度（D48 / D49） */
export function setEdgeLength(edge: ViewEdge, length: number, toward?: { x: number; y: number }): void {
  const doc = useDocStore.getState().doc
  const fixed = geometryFor(edge.from)
  const movable = geometryFor(edge.to)
  if (!fixed || !movable) return

  const target = toward ?? movable.center
  const distance = Math.hypot(target.x - fixed.center.x, target.y - fixed.center.y) || 1
  const ux = (target.x - fixed.center.x) / distance
  const uy = (target.y - fixed.center.y) / distance
  const nextLength = Math.max(fixed.radius + movable.radius + 1, length)
  const newPos = { x: fixed.center.x + ux * nextLength, y: fixed.center.y + uy * nextLength }

  useDocStore.getState().commit('设置连线长度', (d) => {
    if (edge.linkId) {
      const link = d.links.find((l) => l.id === edge.linkId)
      if (link) link.length = nextLength
    } else {
      const child = d.nodes.find((n) => n.id === edge.to)
      if (child) child.linkLength = nextLength
    }
    const node = d.nodes.find((n) => n.id === edge.to)
    if (node) {
      node.bubblePos = newPos
      node.updatedAt = new Date().toISOString()
    }
    const insert = d.inserts.find((i) => i.id === edge.to)
    if (insert) {
      insert.pos = newPos
      insert.updatedAt = new Date().toISOString()
    }
  })
  void doc
}

/** 删除连线：父子连线 = 断开父子关系；关联线 = 移除关联 */
export function deleteEdge(edge: ViewEdge): void {
  useDocStore.getState().commit('删除连线', (d) => {
    if (edge.linkId) {
      d.links = d.links.filter((l) => l.id !== edge.linkId)
      return
    }
    d.nodes = removeParentLink(d.nodes, edge.to, edge.from)
  })
  useSelectionStore.getState().selectEdge(null)
}

/** 建立关联连线（气泡↔气泡 或 气泡↔插入对象） */
export function createAssocLink(
  from: string,
  fromKind: EdgeEndpointKind,
  to: string,
  toKind: EdgeEndpointKind
): string | null {
  if (from === to) return null
  const store = useDocStore.getState()
  const doc = store.doc
  const exists = (doc.links ?? []).some(
    (l) => (l.from === from && l.to === to) || (l.from === to && l.to === from)
  )
  if (exists) return null
  const a = geometryFor(from)
  const b = geometryFor(to)
  if (!a || !b) return null
  const id = newId('e')
  const length = Math.hypot(b.center.x - a.center.x, b.center.y - a.center.y)
  store.commit('建立关联线', (d) => {
    d.links = [
      ...(d.links ?? []),
      { id, from, to, fromKind, toKind, length: Math.max(1, length) }
    ]
  })
  return id
}

export function edgeStyleSnapshot(doc: ReturnType<typeof useDocStore.getState>['doc'], edge: ViewEdge) {
  if (edge.linkId) return findLink(doc, edge.linkId)?.style ?? {}
  return doc.edgeStyles?.[edge.id] ?? {}
}
