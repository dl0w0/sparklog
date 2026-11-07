/** 重要程度 <-> 半径 <-> 字号 的映射。纯函数，无副作用。 */

import {
  FONT_BASE,
  FONT_MAX,
  FONT_MIN,
  IMPORTANCE_MAX,
  IMPORTANCE_MIN,
  MINDMAP_RADIUS_MAX,
  MINDMAP_RADIUS_MIN,
  RADIUS_BASE,
  RADIUS_EXP,
  RADIUS_MAX,
  RADIUS_MIN,
  RADIUS_SPAN,
  ROOT_RADIUS_FACTOR,
  ELLIPSE_RX,
  ELLIPSE_RY,
  CORNER_RATIO
} from '@shared/constants'
import type { BubbleShape } from '@shared/types/document'

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return value < min ? min : value > max ? max : value
}

export function clampImportance(value: number): number {
  return clamp(value, IMPORTANCE_MIN, IMPORTANCE_MAX)
}

/** 重要程度 → 基础半径（含主气泡加成与硬夹紧） */
export function importanceToRadius(importance: number, isRoot = false): number {
  const t = (clampImportance(importance) - IMPORTANCE_MIN) / (IMPORTANCE_MAX - IMPORTANCE_MIN)
  const base = RADIUS_BASE + RADIUS_SPAN * Math.pow(t, RADIUS_EXP)
  const withRoot = isRoot ? base * ROOT_RADIUS_FACTOR : base
  return clamp(withRoot, RADIUS_MIN, RADIUS_MAX)
}

/** 思维导图视图下的半径：保留映射但限制上限，避免破坏布局 */
export function importanceToMindmapRadius(importance: number, isRoot = false): number {
  return clamp(importanceToRadius(importance, isRoot), MINDMAP_RADIUS_MIN, MINDMAP_RADIUS_MAX)
}

/** 半径 → 字号（线性映射并夹紧） */
export function radiusToFontSize(radius: number): number {
  const t = (clamp(radius, RADIUS_MIN, RADIUS_MAX) - RADIUS_MIN) / (RADIUS_MAX - RADIUS_MIN)
  return Math.round(clamp(FONT_BASE + t * (FONT_MAX - FONT_BASE), FONT_MIN, FONT_MAX))
}

export interface ShapeMetrics {
  /** 水平半轴 */
  rx: number
  /** 垂直半轴 */
  ry: number
  /** 圆角矩形圆角半径（圆形/椭圆为 0） */
  cornerRadius: number
}

export function shapeMetrics(shape: BubbleShape, radius: number): ShapeMetrics {
  switch (shape) {
    case 'ellipse':
      return { rx: radius * ELLIPSE_RX, ry: radius * ELLIPSE_RY, cornerRadius: 0 }
    case 'roundedRect':
      return { rx: radius, ry: radius, cornerRadius: radius * CORNER_RATIO }
    case 'circle':
    default:
      return { rx: radius, ry: radius, cornerRadius: 0 }
  }
}

/** 半径 → 占用半径（用于碰撞/裁剪的保守外接半径） */
export function boundingRadius(shape: BubbleShape, radius: number): number {
  const m = shapeMetrics(shape, radius)
  return Math.max(m.rx, m.ry)
}
