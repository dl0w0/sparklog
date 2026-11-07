/** 连线几何：气泡边界交点、贝塞尔控制点、SVG path 生成。纯函数。 */

import { EDGE_CURVATURE, EDGE_MINDMAP_TANGENT } from '@shared/constants'
import type { BubbleShape, Vec2 } from '@shared/types/document'
import { shapeMetrics } from './bubbleMetrics'

export interface BubbleGeometry {
  center: Vec2
  radius: number
  shape: BubbleShape
}

export interface BezierCurve {
  p0: Vec2
  c1: Vec2
  c2: Vec2
  p1: Vec2
}

function len(x: number, y: number): number {
  return Math.hypot(x, y)
}

/** 从气泡中心朝 target 方向，求气泡边界上的交点 */
export function pointOnShape(shape: BubbleShape, radius: number, center: Vec2, target: Vec2): Vec2 {
  let dx = target.x - center.x
  let dy = target.y - center.y
  const d = len(dx, dy)
  if (d < 1e-6) return { x: center.x + radius, y: center.y }
  dx /= d
  dy /= d

  const m = shapeMetrics(shape, radius)

  if (m.cornerRadius <= 0) {
    // 圆 / 椭圆：s 满足 ((s*dx)/rx)^2 + ((s*dy)/ry)^2 = 1
    const inv = Math.sqrt((dx / m.rx) ** 2 + (dy / m.ry) ** 2)
    const s = inv < 1e-6 ? radius : 1 / inv
    return { x: center.x + dx * s, y: center.y + dy * s }
  }

  // 圆角矩形：优先命中直边，否则与角落圆弧求交
  const a = m.rx
  const c = m.cornerRadius
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  const sx = dx >= 0 ? 1 : -1
  const sy = dy >= 0 ? 1 : -1

  // 竖直边 x = ±a
  if (ax > 1e-9) {
    const s = a / ax
    const py = ay * s
    if (py <= a - c + 1e-9) {
      return { x: center.x + sx * a, y: center.y + sy * py }
    }
  }
  // 水平边 y = ±a
  if (ay > 1e-9) {
    const s = a / ay
    const px = ax * s
    if (px <= a - c + 1e-9) {
      return { x: center.x + sx * px, y: center.y + sy * a }
    }
  }
  // 角落圆弧：圆心 (±(a-c), ±(a-c))，半径 c
  const ccx = sx * (a - c)
  const ccy = sy * (a - c)
  const b = dx * ccx + dy * ccy
  const ccVal = ccx * ccx + ccy * ccy - c * c
  const disc = Math.max(0, b * b - ccVal)
  const s = b + Math.sqrt(disc)
  return { x: center.x + dx * s, y: center.y + dy * s }
}

/** 直线（气泡视图，D23）：控制点共线，视觉上是一条直线，随两端距离伸缩 */
export function lineCurve(p0: Vec2, p1: Vec2): BezierCurve {
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  return {
    p0,
    c1: { x: p0.x + dx / 3, y: p0.y + dy / 3 },
    c2: { x: p0.x + (dx * 2) / 3, y: p0.y + (dy * 2) / 3 },
    p1
  }
}

/** 自由曲线（保留给旧样式/导出兼容） */
export function freeCurve(p0: Vec2, p1: Vec2, curvature = EDGE_CURVATURE): BezierCurve {
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  const d = len(dx, dy)
  if (d < 1e-6) {
    return { p0, c1: p0, c2: p1, p1 }
  }
  const nx = -dy / d
  const ny = dx / d
  const off = d * curvature
  const c1 = { x: p0.x + dx * 0.35 + nx * off, y: p0.y + dy * 0.35 + ny * off }
  const c2 = { x: p1.x - dx * 0.35 + nx * off, y: p1.y - dy * 0.35 + ny * off }
  return { p0, c1, c2, p1 }
}

/** 导图曲线：水平切线，从父右侧平滑汇入子左侧 */
export function mindmapCurve(p0: Vec2, p1: Vec2, tangent = EDGE_MINDMAP_TANGENT): BezierCurve {
  const dx = p1.x - p0.x
  return {
    p0,
    c1: { x: p0.x + dx * tangent, y: p0.y },
    c2: { x: p1.x - dx * tangent, y: p1.y },
    p1
  }
}

export function bezierToPath(c: BezierCurve): string {
  return `M ${round(c.p0.x)} ${round(c.p0.y)} C ${round(c.c1.x)} ${round(c.c1.y)} ${round(c.c2.x)} ${round(c.c2.y)} ${round(c.p1.x)} ${round(c.p1.y)}`
}

export function round(n: number): number {
  return Math.round(n * 100) / 100
}

/** 贝塞尔曲线在 t 处的点（导出/命中测试用） */
export function bezierPoint(c: BezierCurve, t: number): Vec2 {
  const mt = 1 - t
  const a = mt * mt * mt
  const b = 3 * mt * mt * t
  const cc = 3 * mt * t * t
  const d = t * t * t
  return {
    x: a * c.p0.x + b * c.c1.x + cc * c.c2.x + d * c.p1.x,
    y: a * c.p0.y + b * c.c1.y + cc * c.c2.y + d * c.p1.y
  }
}

export type EdgeStyleMode = 'bubble' | 'mindmap'

export interface EdgeGeometryResult {
  path: string
  from: Vec2
  to: Vec2
  curve: BezierCurve
}

/** 计算一条连线的完整几何：两端贴边 + 曲线 */
export function buildEdgeGeometry(
  from: BubbleGeometry,
  to: BubbleGeometry,
  mode: EdgeStyleMode
): EdgeGeometryResult {
  const fromPoint = pointOnShape(from.shape, from.radius, from.center, to.center)
  const toPoint = pointOnShape(to.shape, to.radius, to.center, from.center)
  const curve = mode === 'mindmap' ? mindmapCurve(fromPoint, toPoint) : lineCurve(fromPoint, toPoint)
  return { path: bezierToPath(curve), from: fromPoint, to: toPoint, curve }
}

/** 点到线段距离（命中测试/测试辅助） */
export function distancePointToPoint(a: Vec2, b: Vec2): number {
  return len(a.x - b.x, a.y - b.y)
}

/** 曲线采样后的最大偏差检查用：返回曲线上的采样点 */
export function sampleCurve(c: BezierCurve, samples = 16): Vec2[] {
  const out: Vec2[] = []
  for (let i = 0; i <= samples; i++) out.push(bezierPoint(c, i / samples))
  return out
}
