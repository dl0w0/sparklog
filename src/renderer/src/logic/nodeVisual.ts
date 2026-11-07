/** 气泡的视觉几何：把节点数据换算成渲染用的中心/半径/形状（含层级半径缩放 D46）。 */

import type { BubbleGeometry } from '@renderer/logic/geometry'
import { IMPORTANCE_MIN, DEPTH_SCALE, MIN_DEPTH_SCALE } from '@shared/constants'
import { importanceToMindmapRadius, importanceToRadius } from './bubbleMetrics'
import type { BubbleNode, ViewMode } from '@shared/types/document'

export function isRootNode(node: BubbleNode): boolean {
  return node.parentIds.length === 0
}

/** 每个节点到其根的距离（沿主父链，BFS） */
export function computeDepths(nodes: readonly BubbleNode[]): Map<string, number> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const childrenOf = new Map<string, string[]>()
  for (const n of nodes) {
    const pid = n.parentIds[0]
    if (!pid || !byId.has(pid)) continue
    const arr = childrenOf.get(pid)
    if (arr) arr.push(n.id)
    else childrenOf.set(pid, [n.id])
  }
  const depth = new Map<string, number>()
  const queue: string[] = []
  for (const n of nodes) {
    const pid = n.parentIds[0]
    if (!pid || !byId.has(pid)) {
      depth.set(n.id, 0)
      queue.push(n.id)
    }
  }
  while (queue.length > 0) {
    const id = queue.shift() as string
    const d = depth.get(id) ?? 0
    for (const child of childrenOf.get(id) ?? []) {
      if (depth.has(child)) continue
      depth.set(child, d + 1)
      queue.push(child)
    }
  }
  return depth
}

/** 层级半径系数：每下一级 ×0.88，最低 0.55（D46） */
export function depthScale(depth: number): number {
  return Math.max(MIN_DEPTH_SCALE, Math.pow(DEPTH_SCALE, Math.max(0, depth)))
}

export function radiusOf(node: BubbleNode, mode: ViewMode, depth = 0): number {
  const base =
    mode === 'mindmap'
      ? importanceToMindmapRadius(node.importance, isRootNode(node))
      : importanceToRadius(node.importance, isRootNode(node))
  // 用户手动调过重要程度 → 保留其调节结果，不再叠加层级缩放
  if (node.importanceOverride) return base
  const scaled = base * depthScale(depth)
  return Math.max(IMPORTANCE_MIN, scaled)
}

/** 一次性构造半径解析器（内部缓存深度表），供渲染/物理/导出共用 */
export function makeRadiusResolver(
  nodes: readonly BubbleNode[],
  mode: ViewMode
): (node: BubbleNode) => number {
  const depths = computeDepths(nodes)
  return (node) => radiusOf(node, mode, depths.get(node.id) ?? 0)
}

export function shapeOf(node: BubbleNode): BubbleNode['shape'] {
  return node.style?.shape ?? node.shape
}

export function fontSizeOf(node: BubbleNode, mode: ViewMode, depth = 0): number {
  return (
    node.style?.fontSize ??
    Math.max(11, Math.min(20, Math.round(13 + (radiusOf(node, mode, depth) - 22) / 9)))
  )
}

export function nodeGeometry(
  node: BubbleNode,
  mode: ViewMode,
  pos?: { x: number; y: number },
  depth = 0
): BubbleGeometry {
  return {
    center: pos ?? node.bubblePos,
    radius: radiusOf(node, mode, depth),
    shape: shapeOf(node)
  }
}

/**
 * 让文字尽量放进气泡：先按基础字号估算所需行数，
 * 放不下就等比缩小字号；缩到 11px 仍放不下则由 CSS 省略号截断。
 */
export function fittedFontSize(text: string, radius: number, base: number): number {
  const content = text.trim()
  if (!content) return base
  const availW = 2 * radius * 0.78
  const availH = 2 * radius * 0.74
  const charsPerLine = Math.max(1, Math.floor(availW / (base * 0.62)))
  const lines = Math.max(1, Math.ceil(content.length / charsPerLine))
  const needed = lines * base * 1.24
  if (needed <= availH) return base
  const scale = Math.sqrt(availH / needed)
  return Math.max(11, Math.min(base, Math.floor(base * scale)))
}

/** 文本是否可能被截断（用于决定是否加省略号类） */
export function textOverflows(text: string, radius: number, fontSize: number): boolean {
  const content = text.trim()
  if (!content) return false
  const charsPerLine = Math.max(1, Math.floor((2 * radius * 0.78) / (fontSize * 0.62)))
  const lines = Math.ceil(content.length / charsPerLine)
  return lines * fontSize * 1.24 > 2 * radius * 0.74
}
