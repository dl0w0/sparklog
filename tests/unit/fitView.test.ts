import { describe, expect, it } from 'vitest'
import {
  clampScale,
  contentBounds,
  fitViewport,
  screenToWorld,
  viewportWorldRect,
  worldToScreen,
  zoomAt
} from '@renderer/logic/layout/fitView'
import { SCALE_MAX, SCALE_MIN } from '@shared/constants'

describe('内容包围盒', () => {
  it('空内容返回 null', () => {
    expect(contentBounds([])).toBeNull()
  })

  it('单个节点的包围盒是外接正方形', () => {
    expect(contentBounds([{ pos: { x: 0, y: 0 }, radius: 10 }])).toEqual({
      x: -10,
      y: -10,
      w: 20,
      h: 20
    })
  })

  it('多个节点取并集', () => {
    const b = contentBounds([
      { pos: { x: 0, y: 0 }, radius: 10 },
      { pos: { x: 100, y: 50 }, radius: 20 }
    ])
    expect(b).toEqual({ x: -10, y: -10, w: 130, h: 80 })
  })

  it('padding 向外扩张', () => {
    const b = contentBounds([{ pos: { x: 0, y: 0 }, radius: 10 }], 5)
    expect(b).toEqual({ x: -15, y: -15, w: 30, h: 30 })
  })
})

describe('适应画布', () => {
  it('把内容居中到视口中央', () => {
    const vp = fitViewport({ x: -10, y: -10, w: 20, h: 20 }, { w: 1000, h: 800 })
    const screen = worldToScreen({ x: 0, y: 0 }, vp)
    expect(screen.x).toBeCloseTo(500, 5)
    expect(screen.y).toBeCloseTo(400, 5)
  })

  it('内容过大时缩小但不低于下限', () => {
    const vp = fitViewport({ x: 0, y: 0, w: 100000, h: 100000 }, { w: 800, h: 600 })
    expect(vp.scale).toBeGreaterThanOrEqual(SCALE_MIN)
    expect(vp.scale).toBeLessThan(1)
  })

  it('内容极小时放大但不高于上限', () => {
    const vp = fitViewport({ x: 0, y: 0, w: 1, h: 1 }, { w: 800, h: 600 })
    expect(vp.scale).toBe(SCALE_MAX)
  })

  it('保证内容完整落入视口', () => {
    const bounds = { x: -300, y: -200, w: 600, h: 400 }
    const size = { w: 900, h: 700 }
    const vp = fitViewport(bounds, size)
    const tl = worldToScreen({ x: bounds.x, y: bounds.y }, vp)
    const br = worldToScreen({ x: bounds.x + bounds.w, y: bounds.y + bounds.h }, vp)
    expect(tl.x).toBeGreaterThanOrEqual(0)
    expect(tl.y).toBeGreaterThanOrEqual(0)
    expect(br.x).toBeLessThanOrEqual(size.w)
    expect(br.y).toBeLessThanOrEqual(size.h)
  })
})

describe('坐标转换', () => {
  it('worldToScreen 与 screenToWorld 互逆', () => {
    const vp = { scale: 1.7, offsetX: -40, offsetY: 25 }
    const p = { x: 123, y: -456 }
    const back = screenToWorld(worldToScreen(p, vp), vp)
    expect(back.x).toBeCloseTo(p.x, 6)
    expect(back.y).toBeCloseTo(p.y, 6)
  })

  it('zoomAt 保持锚点下的世界坐标不动', () => {
    const vp = { scale: 1, offsetX: 0, offsetY: 0 }
    const anchor = { x: 300, y: 200 }
    const before = screenToWorld(anchor, vp)
    const next = zoomAt(vp, anchor, 2.5)
    const after = screenToWorld(anchor, next)
    expect(after.x).toBeCloseTo(before.x, 6)
    expect(after.y).toBeCloseTo(before.y, 6)
    expect(next.scale).toBe(2.5)
  })

  it('zoomAt 夹紧缩放上下限', () => {
    const vp = { scale: 1, offsetX: 0, offsetY: 0 }
    expect(zoomAt(vp, { x: 0, y: 0 }, 999).scale).toBe(SCALE_MAX)
    expect(zoomAt(vp, { x: 0, y: 0 }, 0.0001).scale).toBe(SCALE_MIN)
  })

  it('clampScale 处理非法输入', () => {
    expect(clampScale(Number.NaN)).toBe(1)
  })

  it('viewportWorldRect 覆盖整个视口', () => {
    const vp = { scale: 2, offsetX: -100, offsetY: -50 }
    const rect = viewportWorldRect(vp, { w: 800, h: 600 })
    expect(rect.x).toBe(50)
    expect(rect.y).toBe(25)
    expect(rect.w).toBe(400)
    expect(rect.h).toBe(300)
  })
})
