import { describe, expect, it } from 'vitest'
import { densityRingDistance, resolveLinkLengths } from '@renderer/logic/linkLength'
import { makeRadiusResolver } from '@renderer/logic/nodeVisual'
import { LINK_GAP } from '@shared/constants'
import { makeNode } from '../helpers'

function family(childCount: number) {
  const nodes = [makeNode('r', [], { x: 0, y: 0 })]
  for (let i = 0; i < childCount; i++) {
    nodes.push(makeNode(`c${i}`, ['r'], { x: 200, y: i * 160 }))
  }
  return nodes
}

const radiusOf = makeRadiusResolver(family(0), 'bubble')

describe('默认连线长度（D40 / D44 / D45）', () => {
  it('同一父节点下所有子连线默认等长', () => {
    const nodes = family(4)
    const lengths = resolveLinkLengths(nodes)
    const values = [0, 1, 2, 3].map((i) => lengths.get(`r->c${i}`)?.rest)
    expect(new Set(values).size).toBe(1)
  })

  it('默认长度 = 父半径 + 子半径 + 间隙', () => {
    const nodes = family(2)
    const radiusOfNode = makeRadiusResolver(nodes, 'bubble')
    const expected = radiusOfNode(nodes[0]) + radiusOfNode(nodes[1]) + LINK_GAP
    const resolved = resolveLinkLengths(nodes).get('r->c0')
    expect(resolved?.rest).toBeCloseTo(expected, 5)
    expect(resolved?.manual).toBe(false)
  })

  it('用户固定的长度优先且标记为 manual', () => {
    const nodes = family(2)
    nodes[1].linkLength = 500 // nodes[1] 是 c0
    const resolved = resolveLinkLengths(nodes).get('r->c0')
    expect(resolved?.rest).toBe(500)
    expect(resolved?.manual).toBe(true)
  })

  it('子节点过多时自动伸长（密度）', () => {
    const few = resolveLinkLengths(family(3)).get('r->c0')
    const many = resolveLinkLengths(family(40)).get('r->c0')
    expect(few?.stretched).toBe(false)
    expect(many?.stretched).toBe(true)
    expect((many?.rest ?? 0)).toBeGreaterThan(few?.rest ?? 0)
  })

  it('密度回落后恢复默认长度', () => {
    const many = family(40)
    const stretched = resolveLinkLengths(many).get('r->c0')
    expect(stretched?.stretched).toBe(true)
    // 删掉多余子节点后重新计算
    const few = many.filter((n) => n.id === 'r' || n.id === 'c0' || n.id === 'c1')
    const restored = resolveLinkLengths(few).get('r->c0')
    expect(restored?.stretched).toBe(false)
    expect(restored?.rest).toBeLessThan(stretched?.rest ?? 0)
  })

  it('手动固定的连线不受密度影响', () => {
    const many = family(40)
    many[1].linkLength = 300 // many[1] 是 c0
    expect(resolveLinkLengths(many).get('r->c0')?.rest).toBe(300)
  })

  it('伸长有上限倍数', () => {
    const nodes = family(200)
    const resolved = resolveLinkLengths(nodes).get('r->c0')
    const defaultLength = (radiusOf(nodes[0]) + radiusOf(nodes[1])) + LINK_GAP
    expect(resolved?.rest).toBeLessThanOrEqual(defaultLength * 2.6 + 1e-6)
  })

  it('densityRingDistance 随子节点数增长', () => {
    expect(densityRingDistance(2, 40)).toBeLessThan(densityRingDistance(20, 40))
    expect(densityRingDistance(1, 40)).toBe(0)
  })

  it('根节点没有连线长度', () => {
    expect(resolveLinkLengths([makeNode('r', [])]).size).toBe(0)
  })
})
