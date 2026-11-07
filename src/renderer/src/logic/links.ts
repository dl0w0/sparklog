/** 连线视图模型：把父子关系与关联线统一成可选、可编辑的边（D49 / D50 / D51）。 */

import type {
  BubbleNode,
  EdgeStyle,
  InsertObject,
  Link,
  SparklogFile,
  Vec2
} from '@shared/types/document'
import { deriveEdges } from './graph'

export type EdgeKind = 'parent' | 'assoc'

export interface ViewEdge {
  id: string
  from: string
  to: string
  kind: EdgeKind
  /** 网状结构的次要父连接 */
  backEdge: boolean
  dashed: boolean
  color?: string
  width?: number
  /** 连线标签（D52） */
  label?: string
  /** 关联线在文档中的 id（父子连线为 null） */
  linkId: string | null
}

export interface EntityGeometry {
  center: Vec2
  radius: number
  shape: BubbleNode['shape']
}

export function edgeId(parentId: string, childId: string): string {
  return `${parentId}->${childId}`
}

export function buildViewEdges(doc: SparklogFile): ViewEdge[] {
  const edges: ViewEdge[] = []
  for (const e of deriveEdges(doc.nodes)) {
    const style = doc.edgeStyles?.[e.id] ?? {}
    edges.push({
      id: e.id,
      from: e.from,
      to: e.to,
      kind: 'parent',
      backEdge: e.backEdge,
      dashed: style.dashed ?? e.backEdge,
      color: style.color,
      width: style.width,
      label: style.label,
      linkId: null
    })
  }
  for (const link of doc.links ?? []) {
    edges.push({
      id: link.id,
      from: link.from,
      to: link.to,
      kind: 'assoc',
      backEdge: false,
      dashed: link.style?.dashed ?? true,
      color: link.style?.color,
      width: link.style?.width,
      label: link.label ?? link.style?.label,
      linkId: link.id
    })
  }
  return edges
}

/** 线的两端几何：气泡用当前半径，插入对象用固定半径 */
export function entityGeometry(
  id: string,
  nodes: readonly BubbleNode[],
  inserts: readonly InsertObject[],
  radiusOfBubble: (node: BubbleNode) => number,
  insertPos: (insert: InsertObject) => Vec2,
  insertRadius = 34
): EntityGeometry | null {
  const node = nodes.find((n) => n.id === id)
  if (node) {
    return {
      center: node.bubblePos,
      radius: radiusOfBubble(node),
      shape: node.style?.shape ?? node.shape
    }
  }
  const insert = inserts.find((i) => i.id === id)
  if (insert) {
    return { center: insertPos(insert), radius: insertRadius, shape: 'roundedRect' }
  }
  return null
}

/** 找到某条边对应的文档结构 */
export function findLink(doc: SparklogFile, edgeIdValue: string): Link | null {
  return (doc.links ?? []).find((l) => l.id === edgeIdValue) ?? null
}

export function isParentEdgeId(doc: SparklogFile, edgeIdValue: string): boolean {
  return (doc.links ?? []).every((l) => l.id !== edgeIdValue)
}

export function styleOf(doc: SparklogFile, edge: ViewEdge): EdgeStyle {
  if (edge.linkId) {
    const link = findLink(doc, edge.linkId)
    return link?.style ?? {}
  }
  return doc.edgeStyles?.[edge.id] ?? {}
}

export interface LengthChange {
  /** 需要移动的实体（子气泡或插入对象） */
  moveId: string
  newPos: Vec2
  /** 写回的固定长度 */
  length: number
}

/**
 * 拖动手柄 / 菜单改长度：把「可移动端」放到固定端延申 length 的位置。
 * 父子连线移动子气泡并写 BubbleNode.linkLength；关联线移动非锚点并写 Link.length。
 */
export function computeLengthChange(
  doc: SparklogFile,
  edge: ViewEdge,
  fixed: EntityGeometry,
  movable: EntityGeometry,
  nextLength: number
): LengthChange | null {
  const dx = movable.center.x - fixed.center.x
  const dy = movable.center.y - fixed.center.y
  const dist = Math.hypot(dx, dy) || 1
  const ux = dx / dist
  const uy = dy / dist
  const length = Math.max(fixed.radius + movable.radius + 1, nextLength)
  return {
    moveId: edge.to,
    newPos: { x: fixed.center.x + ux * length, y: fixed.center.y + uy * length },
    length
  }
}
