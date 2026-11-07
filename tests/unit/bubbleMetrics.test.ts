import { describe, expect, it } from 'vitest'
import {
  importanceToMindmapRadius,
  importanceToRadius,
  radiusToFontSize,
  shapeMetrics,
  boundingRadius,
  clampImportance,
  clamp
} from '@renderer/logic/bubbleMetrics'
import {
  MINDMAP_RADIUS_MAX,
  MINDMAP_RADIUS_MIN,
  RADIUS_BASE,
  RADIUS_MAX,
  RADIUS_MIN,
  RADIUS_SPAN,
  FONT_MIN,
  FONT_MAX
} from '@shared/constants'

describe('clamp 与重要程度边界', () => {
  it('clamp 处理越界与 NaN', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
    expect(clamp(Number.NaN, 0, 10)).toBe(0)
  })

  it('clampImportance 夹紧到 1..100', () => {
    expect(clampImportance(0)).toBe(1)
    expect(clampImportance(101)).toBe(100)
    expect(clampImportance(50)).toBe(50)
  })
})

describe('重要程度 -> 半径', () => {
  it('最小重要程度映射到基础半径', () => {
    expect(importanceToRadius(1)).toBeCloseTo(RADIUS_BASE, 5)
  })

  it('最大重要程度映射到 BASE + SPAN', () => {
    expect(importanceToRadius(100)).toBeCloseTo(RADIUS_BASE + RADIUS_SPAN, 5)
  })

  it('主气泡比子气泡大 12%', () => {
    const child = importanceToRadius(50, false)
    const root = importanceToRadius(50, true)
    expect(root / child).toBeCloseTo(1.12, 5)
  })

  it('严格单调递增', () => {
    let prev = 0
    for (let i = 1; i <= 100; i++) {
      const r = importanceToRadius(i)
      expect(r).toBeGreaterThanOrEqual(prev)
      prev = r
    }
  })

  it('半径始终夹紧在 [RADIUS_MIN, RADIUS_MAX]', () => {
    for (let i = 1; i <= 100; i++) {
      for (const isRoot of [false, true]) {
        const r = importanceToRadius(i, isRoot)
        expect(r).toBeGreaterThanOrEqual(RADIUS_MIN)
        expect(r).toBeLessThanOrEqual(RADIUS_MAX)
      }
    }
  })

  it('思维导图半径上限不破坏布局', () => {
    expect(importanceToMindmapRadius(100)).toBe(MINDMAP_RADIUS_MAX)
    expect(importanceToMindmapRadius(100, true)).toBe(MINDMAP_RADIUS_MAX)
    expect(importanceToMindmapRadius(1)).toBeGreaterThanOrEqual(MINDMAP_RADIUS_MIN)
  })
})

describe('半径 -> 字号', () => {
  it('落在 11..20 区间且单调', () => {
    let prev = 0
    for (let r = 20; r <= 220; r += 5) {
      const f = radiusToFontSize(r)
      expect(f).toBeGreaterThanOrEqual(FONT_MIN)
      expect(f).toBeLessThanOrEqual(FONT_MAX)
      expect(f).toBeGreaterThanOrEqual(prev)
      prev = f
    }
  })

  it('最小/最大半径对应基础与最大字号', () => {
    expect(radiusToFontSize(RADIUS_MIN)).toBe(13)
    expect(radiusToFontSize(RADIUS_MAX)).toBe(20)
  })
})

describe('形状度量', () => {
  it('圆形 rx = ry = r，无圆角', () => {
    expect(shapeMetrics('circle', 50)).toEqual({ rx: 50, ry: 50, cornerRadius: 0 })
  })

  it('椭圆横向拉长、纵向压扁', () => {
    const m = shapeMetrics('ellipse', 50)
    expect(m.rx).toBeCloseTo(57.5, 5)
    expect(m.ry).toBeCloseTo(42.5, 5)
  })

  it('圆角矩形带 22% 圆角', () => {
    const m = shapeMetrics('roundedRect', 50)
    expect(m.cornerRadius).toBeCloseTo(11, 5)
  })

  it('boundingRadius 取长半轴', () => {
    expect(boundingRadius('ellipse', 50)).toBeCloseTo(57.5, 5)
    expect(boundingRadius('circle', 50)).toBe(50)
  })
})
