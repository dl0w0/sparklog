/**
 * 气泡真实形状的几何判定（D79）：圆形 / 椭圆 / 圆角矩形，
 * 用于「梳理」时判断两个气泡的边界是否互不重叠。
 */

import type { BubbleShape } from '@shared/types/document'
import { shapeMetrics } from './bubbleMetrics'

export interface ShapeGeom {
  shape: BubbleShape
  center: { x: number; y: number }
  rx: number
  ry: number
  cornerRadius: number
}

export function geomOf(
  shape: BubbleShape,
  center: { x: number; y: number },
  radius: number
): ShapeGeom {
  const m = shapeMetrics(shape, radius)
  return { shape, center, rx: m.rx, ry: m.ry, cornerRadius: m.cornerRadius ?? 0 }
}

export function shapeContainsPoint(g: ShapeGeom, px: number, py: number): boolean {
  const dx = px - g.center.x
  const dy = py - g.center.y
  if (g.shape === 'circle' || g.shape === 'ellipse') {
    const nx = dx / g.rx
    const ny = dy / g.ry
    return nx * nx + ny * ny <= 1
  }
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax > g.rx || ay > g.ry) return false
  const r = Math.min(g.cornerRadius, Math.min(g.rx, g.ry))
  const ex = ax - (g.rx - r)
  const ey = ay - (g.ry - r)
  if (ex <= 0 || ey <= 0) return true
  return ex * ex + ey * ey <= r * r
}

function boundaryPoint(g: ShapeGeom, t: number): { x: number; y: number } {
  if (g.shape === 'circle' || g.shape === 'ellipse') {
    return { x: g.center.x + Math.cos(t) * g.rx, y: g.center.y + Math.sin(t) * g.ry }
  }
  // 圆角矩形：按矩形周界采样（略保守）
  const cos = Math.cos(t)
  const sin = Math.sin(t)
  const scale = 1 / Math.max(Math.abs(cos), Math.abs(sin))
  return { x: g.center.x + cos * g.rx * scale, y: g.center.y + sin * g.ry * scale }
}

/** 两个「圆角矩形」用内缩矩形 + 半径做精确判定 */
function roundedRectOverlap(a: ShapeGeom, b: ShapeGeom): boolean | null {
  if (a.shape !== 'roundedRect' || b.shape !== 'roundedRect') return null
  const ax = Math.max(0, a.rx - a.cornerRadius)
  const ay = Math.max(0, a.ry - a.cornerRadius)
  const bx = Math.max(0, b.rx - b.cornerRadius)
  const by = Math.max(0, b.ry - b.cornerRadius)
  const dx = Math.max(0, Math.abs(a.center.x - b.center.x) - (ax + bx))
  const dy = Math.max(0, Math.abs(a.center.y - b.center.y) - (ay + by))
  return Math.hypot(dx, dy) < a.cornerRadius + b.cornerRadius
}

/** 两个气泡的真实形状是否重叠 */
export function shapesOverlap(a: ShapeGeom, b: ShapeGeom): boolean {
  const rounded = roundedRectOverlap(a, b)
  if (rounded !== null) return rounded
  if (shapeContainsPoint(a, b.center.x, b.center.y)) return true
  if (shapeContainsPoint(b, a.center.x, a.center.y)) return true
  const SAMPLES = 48
  for (let i = 0; i < SAMPLES; i++) {
    const t = (i / SAMPLES) * Math.PI * 2
    const pa = boundaryPoint(a, t)
    if (shapeContainsPoint(b, pa.x, pa.y)) return true
    const pb = boundaryPoint(b, t)
    if (shapeContainsPoint(a, pb.x, pb.y)) return true
  }
  return false
}
