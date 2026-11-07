/** 气泡的视觉几何：把节点数据换算成渲染用的中心/半径/形状（含层级半径缩放 D46）。 */

import type { BubbleGeometry } from '@renderer/logic/geometry'
import { BUBBLE_TEXT_PADDING, IMPORTANCE_MIN, DEPTH_SCALE, MIN_DEPTH_SCALE } from '@shared/constants'
import { importanceToMindmapRadius, importanceToRadius, shapeMetrics } from './bubbleMetrics'
import type { BubbleNode, ViewMode, BubbleShape } from '@shared/types/document'

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

/** 层级默认字号：主气泡最大，每下一级降一档，全局下限 11（D65） */
export const DEPTH_FONT_BASE = 20
export const DEPTH_FONT_STEP = 1.6
export const DEPTH_FONT_MIN = 11

export function depthFontSize(depth: number): number {
  return Math.max(DEPTH_FONT_MIN, DEPTH_FONT_BASE - Math.max(0, depth) * DEPTH_FONT_STEP)
}

/**
 * 气泡字号只由「层级默认字号 + 用户 style 覆盖」决定（D74）：
 * 不随 importance / 半径 / 画布缩放变化。
 */
export function fontSizeOf(node: BubbleNode, _mode?: ViewMode, depth = 0): number {
  return node.style?.fontSize ?? depthFontSize(depth)
}

/**
 * 文字可用区域：按气泡真实形状取内接矩形（D75）。
 * 圆形/椭圆用 1/√2 系数，保证矩形四角都落在弧线内；圆角矩形按内缩。
 */
export function textBoxOf(
  shape: BubbleShape,
  metrics: { rx: number; ry: number },
  padding: number
): { w: number; h: number } {
  const p = Math.max(0, padding)
  if (shape === 'roundedRect') {
    return { w: Math.max(1, metrics.rx * 2 - p * 2), h: Math.max(1, metrics.ry * 2 - p * 2) }
  }
  // 椭圆/圆：内接矩形半宽半高 = (r - padding) / √2
  const k = Math.SQRT1_2
  return {
    w: Math.max(1, (metrics.rx - p) * 2 * k),
    h: Math.max(1, (metrics.ry - p) * 2 * k)
  }
}

/** 文字在给定盒子内是否会被截断 */
export function textOverflowsInBox(text: string, boxW: number, boxH: number, fontSize: number): boolean {
  const content = text.trim()
  if (!content) return false
  const charsPerLine = Math.max(1, Math.floor(boxW / (fontSize * 0.62)))
  const lineHeight = fontSize * 1.3
  const maxLines = Math.max(1, Math.floor(boxH / lineHeight))
  let lines = 0
  let current = 0
  for (const char of content) {
    if (char === '\n') {
      lines += 1
      current = 0
      continue
    }
    const width = /[\u4e00-\u9fa5]/.test(char) ? 1 : 0.6
    if (current + width > charsPerLine) {
      lines += 1
      current = width
      if (lines >= maxLines) return true
    } else {
      current += width
    }
  }
  return lines + 1 > maxLines
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


/** 气泡排版共享参数：展示层与编辑层必须完全一致（D76） */
export const BUBBLE_LINE_HEIGHT = 1.25

export function bubbleTextStyle(node: BubbleNode, depth: number): Record<string, string | number> {
  const fontSize = node.style?.fontSize ?? fontSizeOf(node, 'bubble', depth)
  return {
    fontSize,
    lineHeight: BUBBLE_LINE_HEIGHT,
    fontFamily: node.style?.fontFamily ?? 'inherit',
    fontWeight: node.style?.bold ? 700 : 400,
    fontStyle: node.style?.italic ? 'italic' : 'normal',
    textDecoration: node.style?.underline ? 'underline' : 'none',
    color: node.style?.textColor ?? 'inherit',
    textAlign: 'center',
    wordBreak: 'break-word'
  }
}

/** 估算在给定盒子里排几行（编辑层垂直居中用） */
export function countLinesInBox(text: string, boxW: number, fontSize: number): number {
  const content = text.trim()
  if (!content) return 1
  const charsPerLine = Math.max(1, Math.floor(boxW / (fontSize * 0.62)))
  let lines = 1
  let current = 0
  for (const char of content) {
    if (char === '\n') {
      lines += 1
      current = 0
      continue
    }
    const width = /[\u4e00-\u9fa5]/.test(char) ? 1 : 0.6
    if (current + width > charsPerLine) {
      lines += 1
      current = width
    } else {
      current += width
    }
  }
  return lines
}


/** 该气泡的文字是否真的会被省略号截断（D83：全文文本框的前置条件） */
export function isBubbleTextTruncated(node: BubbleNode, radius: number, depth: number): boolean {
  const shape = shapeOf(node)
  const metrics = shapeMetrics(shape, radius)
  const box = textBoxOf(shape, metrics, BUBBLE_TEXT_PADDING)
  const fontSize = node.style?.fontSize ?? depthFontSize(depth)
  return textOverflowsInBox(node.text, box.w, box.h, fontSize)
}
