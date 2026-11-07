import { describe, expect, it } from 'vitest'
import { layoutMindmap } from '@renderer/logic/layout/mindmapLayout'
import { makeNode } from '../helpers'

const radius = (): number => 40

describe('思维导图布局', () => {
  it('空输入返回空布局', () => {
    const res = layoutMindmap([], { radiusOf: radius })
    expect(res.positions.size).toBe(0)
    expect(res.roots).toEqual([])
  })

  it('父子层级：父在左，子逐层向右', () => {
    const nodes = [makeNode('r'), makeNode('a', ['r']), makeNode('c', ['a'])]
    const res = layoutMindmap(nodes, { radiusOf: radius })
    const r = res.positions.get('r')!
    const a = res.positions.get('a')!
    const c = res.positions.get('c')!
    expect(r.x).toBeLessThan(a.x)
    expect(a.x).toBeLessThan(c.x)
    expect(r.x).toBe(0)
  })

  it('同一父节点下兄弟垂直分开且不重叠', () => {
    const nodes = [makeNode('r'), makeNode('a', ['r']), makeNode('b', ['r']), makeNode('c', ['r'])]
    const res = layoutMindmap(nodes, { radiusOf: radius, siblingGap: 28 })
    const ys = ['a', 'b', 'c'].map((id) => res.positions.get(id)!.y).sort((x, y) => x - y)
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(2 * 40 + 28 - 1e-6)
    }
  })

  it('不同半径层级不会重叠（按层最大半径计算层距）', () => {
    const nodes = [makeNode('r'), makeNode('a', ['r'])]
    const res = layoutMindmap(nodes, {
      radiusOf: (n) => (n.id === 'r' ? 120 : 30),
      levelGap: 90
    })
    const r = res.positions.get('r')!
    const a = res.positions.get('a')!
    expect(a.x - r.x).toBeGreaterThanOrEqual(120 + 90 + 30 - 1e-6)
  })

  it('所有节点都获得坐标', () => {
    const nodes = [makeNode('r'), makeNode('a', ['r']), makeNode('b', ['a']), makeNode('c', ['b'])]
    const res = layoutMindmap(nodes, { radiusOf: radius })
    expect(res.positions.size).toBe(4)
    for (const n of nodes) expect(res.positions.has(n.id)).toBe(true)
  })

  it('多父节点只在其主父的树中出现一次，并产生回边（D7）', () => {
    const nodes = [makeNode('r1'), makeNode('r2'), makeNode('a', ['r1', 'r2'])]
    const res = layoutMindmap(nodes, { radiusOf: radius })
    expect(res.positions.size).toBe(3)
    expect(res.roots.sort()).toEqual(['r1', 'r2'])
    expect(res.backEdges).toEqual([{ from: 'r2', to: 'a' }])
  })

  it('多棵树横向并排，不重叠', () => {
    const nodes = [makeNode('r1'), makeNode('r1a', ['r1']), makeNode('r2')]
    const res = layoutMindmap(nodes, { radiusOf: radius, treeGap: 120 })
    const r1a = res.positions.get('r1a')!
    const r2 = res.positions.get('r2')!
    expect(r2.x).toBeGreaterThan(r1a.x + 40)
  })

  it('包围盒覆盖全部节点', () => {
    const nodes = [makeNode('r'), makeNode('a', ['r'])]
    const res = layoutMindmap(nodes, { radiusOf: radius })
    for (const p of res.positions.values()) {
      expect(p.x - 40).toBeGreaterThanOrEqual(res.bounds.x - 1e-6)
      expect(p.x + 40).toBeLessThanOrEqual(res.bounds.x + res.bounds.w + 1e-6)
      expect(p.y - 40).toBeGreaterThanOrEqual(res.bounds.y - 1e-6)
      expect(p.y + 40).toBeLessThanOrEqual(res.bounds.y + res.bounds.h + 1e-6)
    }
  })

  it('父引用指向不存在的节点时该节点当作根', () => {
    const nodes = [makeNode('orphan', ['ghost'])]
    const res = layoutMindmap(nodes, { radiusOf: radius })
    expect(res.roots).toEqual(['orphan'])
    expect(res.positions.size).toBe(1)
  })
})
