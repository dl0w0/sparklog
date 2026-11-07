import { describe, expect, it } from 'vitest'
import { computeDepths, depthScale, radiusOf, makeRadiusResolver } from '@renderer/logic/nodeVisual'
import { DEPTH_SCALE, MIN_DEPTH_SCALE } from '@shared/constants'
import { makeNode } from '../helpers'

const nodes = [
  makeNode('r', []),
  makeNode('c1', ['r']),
  makeNode('c2', ['c1']),
  makeNode('c3', ['c2'])
]

describe('层级深度（D46）', () => {
  it('computeDepths 沿主父链计算层级', () => {
    const depths = computeDepths(nodes)
    expect(depths.get('r')).toBe(0)
    expect(depths.get('c1')).toBe(1)
    expect(depths.get('c2')).toBe(2)
    expect(depths.get('c3')).toBe(3)
  })

  it('每下一级半径 ×0.88', () => {
    const depth1 = radiusOf(nodes[1], 'bubble', 1)
    const depth2 = radiusOf(nodes[2], 'bubble', 2)
    expect(depth2 / depth1).toBeCloseTo(DEPTH_SCALE, 5)
  })

  it('主气泡最大，逐级变小', () => {
    const r = radiusOf(nodes[0], 'bubble', 0)
    const d1 = radiusOf(nodes[1], 'bubble', 1)
    const d2 = radiusOf(nodes[2], 'bubble', 2)
    const d3 = radiusOf(nodes[3], 'bubble', 3)
    expect(r).toBeGreaterThan(d1)
    expect(d1).toBeGreaterThan(d2)
    expect(d2).toBeGreaterThan(d3)
  })

  it('存在全局下限', () => {
    const deep = radiusOf(nodes[3], 'bubble', 40)
    const base = radiusOf(nodes[3], 'bubble', 0)
    expect(deep / base).toBeCloseTo(MIN_DEPTH_SCALE, 5)
  })

  it('手动调过重要程度后不再叠加层级缩放', () => {
    const overridden = { ...nodes[2], importanceOverride: true }
    const withDepth = radiusOf(overridden, 'bubble', 5)
    const noDepth = radiusOf(overridden, 'bubble', 0)
    expect(withDepth).toBeCloseTo(noDepth, 6)
  })

  it('makeRadiusResolver 使用内部深度表', () => {
    const radiusOfNode = makeRadiusResolver(nodes, 'bubble')
    expect(radiusOfNode(nodes[0])).toBeGreaterThan(radiusOfNode(nodes[2]))
  })

  it('depthScale 单调不增且有下界', () => {
    let prev = Number.POSITIVE_INFINITY
    for (let d = 0; d < 20; d++) {
      const s = depthScale(d)
      expect(s).toBeLessThanOrEqual(prev)
      expect(s).toBeGreaterThanOrEqual(MIN_DEPTH_SCALE)
      prev = s
    }
  })
})
