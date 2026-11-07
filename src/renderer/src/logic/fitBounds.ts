/**
 * 当前层级「适应画布」的包围盒（D56）：
 * 气泡 + 插入对象（含钉住与附着）+ 专区卡片（其矩形已覆盖内部内容）。
 */

import type { BubbleNode, InsertObject, Rect, Vec2, Zone } from '@shared/types/document'
import { insertDisplayPos } from '@renderer/actions/insertActions'

export interface FitCircle {
  pos: Vec2
  radius: number
}

/** 插入对象的近似屏幕占位半径（世界坐标下按 1:1 估算） */
export function insertRadius(insert: InsertObject): number {
  if (insert.kind === 'note') return 120
  if (insert.kind === 'task') return 110
  if (insert.kind === 'image') return 100
  return 90
}

export interface LevelBoundsInput {
  nodes: readonly BubbleNode[]
  inserts: readonly InsertObject[]
  zones: readonly Zone[]
  levelZoneId: string | null
  radiusOf: (node: BubbleNode) => number
  mode?: 'bubble' | 'mindmap'
}

/** 收集当前层级所有可参与「适应画布」的内容外接圆 */
export function collectLevelItems(input: LevelBoundsInput): FitCircle[] {
  const items: FitCircle[] = []
  for (const node of input.nodes) {
    if (node.zoneId !== input.levelZoneId) continue
    items.push({ pos: node.bubblePos, radius: input.radiusOf(node) })
  }
  for (const insert of input.inserts) {
    if (insert.zoneId !== input.levelZoneId) continue
    items.push({
      pos: insertDisplayPos(insert, input.nodes, input.mode ?? 'bubble'),
      radius: insertRadius(insert)
    })
  }
  for (const zone of input.zones) {
    if (zone.parentZoneId !== input.levelZoneId) continue
    items.push({
      pos: { x: zone.pos.x + zone.size.w / 2, y: zone.pos.y + zone.size.h / 2 },
      radius: Math.hypot(zone.size.w, zone.size.h) / 2
    })
  }
  return items
}

/** 由外接圆列表得到整体外接矩形 */
export function boundsOfItems(items: readonly FitCircle[], padding = 0): Rect | null {
  if (items.length === 0) return null
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const item of items) {
    minX = Math.min(minX, item.pos.x - item.radius - padding)
    minY = Math.min(minY, item.pos.y - item.radius - padding)
    maxX = Math.max(maxX, item.pos.x + item.radius + padding)
    maxY = Math.max(maxY, item.pos.y + item.radius + padding)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function computeLevelBounds(input: LevelBoundsInput, padding = 0): Rect | null {
  return boundsOfItems(collectLevelItems(input), padding)
}
