import { describe, expect, it } from 'vitest'
import { cullVisible, filterVisibleEdges } from '@renderer/logic/layout/culling'

const viewport = { scale: 1, offsetX: 0, offsetY: 0 }
const viewSize = { w: 800, h: 600 }

describe('视口裁剪（性能关键路径）', () => {
  it('只保留视口内（含留白）的对象', () => {
    const items = [
      { id: 'in', pos: { x: 100, y: 100 }, radius: 40 },
      { id: 'edge', pos: { x: 900, y: 100 }, radius: 40 },
      { id: 'out', pos: { x: 2000, y: 2000 }, radius: 40 }
    ]
    const visible = cullVisible(items, viewport, viewSize, 200)
    expect(visible.has('in')).toBe(true)
    // 800+200 留白内，属于边缘可见
    expect(visible.has('edge')).toBe(true)
    expect(visible.has('out')).toBe(false)
  })

  it('缩放后视野内的对象随之变化', () => {
    const items = [{ id: 'far', pos: { x: 3000, y: 0 }, radius: 40 }]
    expect(cullVisible(items, viewport, viewSize, 0).size).toBe(0)
    const zoomedOut = { scale: 0.2, offsetX: 0, offsetY: 0 }
    expect(cullVisible(items, zoomedOut, viewSize, 0).has('far')).toBe(true)
  })

  it('半径跨越边界时不误裁', () => {
    const items = [{ id: 'big', pos: { x: -300, y: 300 }, radius: 100 }]
    // 中心在 -300，外接半径 100 → 右边缘 -200，仍在留白 200 的内侧
    expect(cullVisible(items, viewport, viewSize, 200).has('big')).toBe(true)
  })

  it('连线任一端可见即保留', () => {
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'c', to: 'd' }
    ]
    const visible = new Set(['a', 'd'])
    expect(filterVisibleEdges(edges, visible)).toEqual(edges)
    expect(filterVisibleEdges(edges, new Set(['a'])).length).toBe(1)
  })

  it('500 个节点裁剪计算足够快', () => {
    const items = Array.from({ length: 500 }, (_, i) => ({
      id: `n${i}`,
      pos: { x: (i % 25) * 200, y: Math.floor(i / 25) * 200 },
      radius: 50
    }))
    const start = performance.now()
    for (let i = 0; i < 50; i++) cullVisible(items, viewport, viewSize)
    const perCall = (performance.now() - start) / 50
    expect(perCall).toBeLessThan(8)
  })
})
