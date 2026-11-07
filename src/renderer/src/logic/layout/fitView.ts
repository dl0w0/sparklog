/** 视口：内容包围盒、适应画布、世界坐标与屏幕坐标互转。 */

import { SCALE_MAX, SCALE_MIN } from '@shared/constants'
import type { Rect, Size, Vec2, Viewport } from '@shared/types/document'

export interface CircleItem {
  pos: Vec2
  radius: number
}

export function contentBounds(items: readonly CircleItem[], pad = 0): Rect | null {
  if (items.length === 0) return null
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const it of items) {
    minX = Math.min(minX, it.pos.x - it.radius - pad)
    minY = Math.min(minY, it.pos.y - it.radius - pad)
    maxX = Math.max(maxX, it.pos.x + it.radius + pad)
    maxY = Math.max(maxY, it.pos.y + it.radius + pad)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale))
}

/** 适应画布：让 bounds 完整落在视口内并居中 */
export function fitViewport(bounds: Rect, viewSize: Size, padding = 48): Viewport {
  const availW = Math.max(1, viewSize.w - padding * 2)
  const availH = Math.max(1, viewSize.h - padding * 2)
  const w = Math.max(1, bounds.w)
  const h = Math.max(1, bounds.h)
  const scale = clampScale(Math.min(availW / w, availH / h))
  const cx = bounds.x + bounds.w / 2
  const cy = bounds.y + bounds.h / 2
  return {
    scale,
    offsetX: viewSize.w / 2 - cx * scale,
    offsetY: viewSize.h / 2 - cy * scale
  }
}

export function worldToScreen(p: Vec2, vp: Viewport): Vec2 {
  return { x: p.x * vp.scale + vp.offsetX, y: p.y * vp.scale + vp.offsetY }
}

export function screenToWorld(p: Vec2, vp: Viewport): Vec2 {
  return { x: (p.x - vp.offsetX) / vp.scale, y: (p.y - vp.offsetY) / vp.scale }
}

/** 以某个屏幕点为锚点缩放，保证锚点下的世界坐标不动 */
export function zoomAt(vp: Viewport, anchor: Vec2, nextScaleRaw: number): Viewport {
  const nextScale = clampScale(nextScaleRaw)
  const world = screenToWorld(anchor, vp)
  return {
    scale: nextScale,
    offsetX: anchor.x - world.x * nextScale,
    offsetY: anchor.y - world.y * nextScale
  }
}

/** 当前视口对应的世界矩形 */
export function viewportWorldRect(vp: Viewport, viewSize: Size): Rect {
  return {
    x: -vp.offsetX / vp.scale,
    y: -vp.offsetY / vp.scale,
    w: viewSize.w / vp.scale,
    h: viewSize.h / vp.scale
  }
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y)
}
