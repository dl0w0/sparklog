import { describe, expect, it } from 'vitest'
import {
  bezierPoint,
  bezierToPath,
  buildEdgeGeometry,
  freeCurve,
  mindmapCurve,
  pointOnShape,
  sampleCurve
} from '@renderer/logic/geometry'

const center = { x: 0, y: 0 }

describe('气泡边界交点', () => {
  it('圆形：交点距离等于半径', () => {
    const p = pointOnShape('circle', 50, center, { x: 200, y: 0 })
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(50, 5)
    expect(p.x).toBeCloseTo(50, 5)
    expect(p.y).toBeCloseTo(0, 5)
  })

  it('圆形：任意方向都在圆上', () => {
    for (const angle of [0, 0.7, 1.9, 3.3, 5.1]) {
      const p = pointOnShape('circle', 80, { x: 10, y: -5 }, {
        x: 10 + Math.cos(angle) * 500,
        y: -5 + Math.sin(angle) * 500
      })
      expect(Math.hypot(p.x - 10, p.y + 5)).toBeCloseTo(80, 4)
    }
  })

  it('椭圆：交点满足椭圆方程', () => {
    const p = pointOnShape('ellipse', 50, center, { x: 100, y: 100 })
    expect((p.x / 57.5) ** 2 + (p.y / 42.5) ** 2).toBeCloseTo(1, 4)
  })

  it('圆角矩形：命中直边', () => {
    const p = pointOnShape('roundedRect', 50, center, { x: 100, y: 0 })
    expect(p.x).toBeCloseTo(50, 5)
    expect(p.y).toBeCloseTo(0, 5)
  })

  it('圆角矩形：命中角落时落在圆弧上', () => {
    const p = pointOnShape('roundedRect', 50, center, { x: 100, y: 100 })
    const corner = 50 - 11
    expect(Math.hypot(p.x - corner, p.y - corner)).toBeCloseTo(11, 4)
    expect(Math.abs(p.x)).toBeLessThanOrEqual(50 + 1e-6)
    expect(Math.abs(p.y)).toBeLessThanOrEqual(50 + 1e-6)
  })

  it('目标点与圆心重合时给出兜底点', () => {
    const p = pointOnShape('circle', 50, center, center)
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(50, 5)
  })
})

describe('贝塞尔曲线', () => {
  it('freeCurve 保留端点并产生弯曲', () => {
    const c = freeCurve({ x: 0, y: 0 }, { x: 100, y: 0 })
    expect(c.p0).toEqual({ x: 0, y: 0 })
    expect(c.p1).toEqual({ x: 100, y: 0 })
    // 控制点应偏离直线（y 不为 0）
    expect(Math.abs(c.c1.y)).toBeGreaterThan(1)
    expect(Math.abs(c.c2.y)).toBeGreaterThan(1)
  })

  it('mindmapCurve 使用水平切线', () => {
    const c = mindmapCurve({ x: 0, y: 0 }, { x: 200, y: 60 })
    expect(c.c1.y).toBeCloseTo(0, 6)
    expect(c.c2.y).toBeCloseTo(60, 6)
  })

  it('bezierToPath 输出合法 SVG path', () => {
    const path = bezierToPath(freeCurve({ x: 0, y: 0 }, { x: 10, y: 10 }))
    expect(path.startsWith('M ')).toBe(true)
    expect(path).toContain('C ')
    // 结构：M x y C x y x y x y —— 共 10 段
    expect(path.split(' ')).toHaveLength(10)
    expect(path).toMatch(/^M [-\d.]+ [-\d.]+ C [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+$/)
  })

  it('bezierPoint 端点正确', () => {
    const c = freeCurve({ x: 0, y: 0 }, { x: 30, y: 40 })
    expect(bezierPoint(c, 0)).toEqual({ x: 0, y: 0 })
    const end = bezierPoint(c, 1)
    expect(end.x).toBeCloseTo(30, 5)
    expect(end.y).toBeCloseTo(40, 5)
  })

  it('sampleCurve 返回 samples+1 个点', () => {
    expect(sampleCurve(freeCurve({ x: 0, y: 0 }, { x: 10, y: 0 }), 8)).toHaveLength(9)
  })
})

describe('气泡视图连线为直线（D23）', () => {
  it('两端为直线时控制点与端点共线', () => {
    const from = { center: { x: 0, y: 0 }, radius: 50, shape: 'circle' as const }
    const to = { center: { x: 400, y: 200 }, radius: 40, shape: 'circle' as const }
    const res = buildEdgeGeometry(from, to, 'bubble')
    const cross = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) =>
      (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
    expect(Math.abs(cross(res.from, res.curve.c1, res.to))).toBeLessThan(1e-6)
    expect(Math.abs(cross(res.from, res.curve.c2, res.to))).toBeLessThan(1e-6)
  })

  it('导图视图仍然有弯曲（控制点不共线）', () => {
    const from = { center: { x: 0, y: 0 }, radius: 50, shape: 'circle' as const }
    const to = { center: { x: 400, y: 200 }, radius: 40, shape: 'circle' as const }
    const res = buildEdgeGeometry(from, to, 'mindmap')
    const mid = {
      x: (res.from.x + res.to.x) / 2,
      y: (res.from.y + res.to.y) / 2
    }
    const cross = (res.curve.c1.x - mid.x) * (res.to.y - mid.y) - (res.curve.c1.y - mid.y) * (res.to.x - mid.x)
    expect(Math.abs(cross)).toBeGreaterThan(1)
  })
})

describe('整条连线的几何', () => {
  it('两端都贴合气泡边缘，且不穿过气泡本体', () => {
    const from = { center: { x: 0, y: 0 }, radius: 60, shape: 'circle' as const }
    const to = { center: { x: 300, y: 120 }, radius: 40, shape: 'circle' as const }
    const res = buildEdgeGeometry(from, to, 'bubble')
    expect(Math.hypot(res.from.x - from.center.x, res.from.y - from.center.y)).toBeCloseTo(60, 4)
    expect(Math.hypot(res.to.x - to.center.x, res.to.y - to.center.y)).toBeCloseTo(40, 4)
    expect(res.path.startsWith('M ')).toBe(true)

    // 曲线上的采样点都不应深入任一端气泡内部
    for (const p of sampleCurve(res.curve, 24)) {
      const dFrom = Math.hypot(p.x - from.center.x, p.y - from.center.y)
      const dTo = Math.hypot(p.x - to.center.x, p.y - to.center.y)
      expect(dFrom).toBeGreaterThan(60 - 6)
      expect(dTo).toBeGreaterThan(40 - 6)
    }
  })

  it('导图模式同样贴边', () => {
    const from = { center: { x: 0, y: 0 }, radius: 50, shape: 'roundedRect' as const }
    const to = { center: { x: 250, y: 0 }, radius: 30, shape: 'circle' as const }
    const res = buildEdgeGeometry(from, to, 'mindmap')
    expect(res.from.x).toBeCloseTo(50, 4)
    expect(res.to.x).toBeCloseTo(220, 4)
  })
})
