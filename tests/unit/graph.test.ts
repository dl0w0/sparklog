import { describe, expect, it } from 'vitest'
import {
  addChild,
  addParentLink,
  addSibling,
  ancestorsOf,
  childrenOf,
  createBubble,
  deleteBubble,
  deleteBubbleCascade,
  deriveEdges,
  descendantsOf,
  moveSubtree,
  navigate,
  nodesInZone,
  primaryParentOf,
  removeParentLink,
  rootsOf,
  setNodeImportance,
  siblingsOf,
  subtreeIds,
  uniqueDescendantsOf,
  wouldCreateCycle
} from '@renderer/logic/graph'
import { idsOf, makeNode } from '../helpers'

describe('基础查询', () => {
  const nodes = [
    makeNode('r1'),
    makeNode('a', ['r1']),
    makeNode('b', ['r1']),
    makeNode('a1', ['a']),
    makeNode('a2', ['a']),
    makeNode('a1x', ['a1'])
  ]

  it('rootsOf 只返回无父节点', () => {
    expect(idsOf(rootsOf(nodes))).toEqual(['r1'])
  })

  it('childrenOf 返回直接子节点', () => {
    expect(idsOf(childrenOf(nodes, 'a'))).toEqual(['a1', 'a2'])
    expect(childrenOf(nodes, 'r1').map((n) => n.id).sort()).toEqual(['a', 'b'])
  })

  it('descendantsOf 返回全部后代，不含自身', () => {
    const d = descendantsOf(nodes, 'r1')
    expect(d.sort()).toEqual(['a', 'a1', 'a1x', 'a2', 'b'])
    expect(d).not.toContain('r1')
  })

  it('ancestorsOf 返回全部祖先', () => {
    expect(ancestorsOf(nodes, 'a1x').sort()).toEqual(['a', 'a1', 'r1'])
    expect(ancestorsOf(nodes, 'r1')).toEqual([])
  })

  it('primaryParentOf 取第一个父节点', () => {
    expect(primaryParentOf(makeNode('m', ['p1', 'p2']))).toBe('p1')
    expect(primaryParentOf(makeNode('m2'))).toBeNull()
  })

  it('siblingsOf 按主父分组，不含自身', () => {
    expect(idsOf(siblingsOf(nodes, 'a1'))).toEqual(['a2'])
    expect(idsOf(siblingsOf(nodes, 'a'))).toEqual(['b'])
    expect(idsOf(siblingsOf(nodes, 'r1'))).toEqual([])
  })

  it('nodesInZone 按层级过滤', () => {
    const zoned = [makeNode('x', [], { x: 0, y: 0 }), makeNode('y', [], { x: 0, y: 0 }, { zoneId: 'z1' })]
    expect(idsOf(nodesInZone(zoned, 'z1'))).toEqual(['y'])
    expect(idsOf(nodesInZone(zoned, null))).toEqual(['x'])
  })
})

describe('独有后代（网状共享节点）', () => {
  // r1 -> a -> b ; r2 -> b   （b 有 a 与 r2 两个父）
  const nodes = [
    makeNode('r1'),
    makeNode('r2'),
    makeNode('a', ['r1']),
    makeNode('b', ['a', 'r2'])
  ]

  it('共享子节点不算独有后代', () => {
    const unique = uniqueDescendantsOf(nodes, 'r1')
    expect(unique).toEqual(['a'])
  })

  it('a 视角下 b 是独有后代（除 a 外无其它路径）', () => {
    // b 还有 r2 这个父，因此不是 a 的独有后代
    expect(uniqueDescendantsOf(nodes, 'a')).toEqual([])
  })

  it('链式独有：a -> c 且 c 无其它父，则 c 是 a 的独有后代', () => {
    const chain = [makeNode('a'), makeNode('c', ['a'])]
    expect(uniqueDescendantsOf(chain, 'a')).toEqual(['c'])
  })

  it('深层共享：共享节点不可达其分支后的节点非独有，但独占链上的节点仍是独有', () => {
    const g = [
      makeNode('r'),
      makeNode('a', ['r']),
      makeNode('b', ['a']),
      makeNode('shared', ['b', 'r']),
      makeNode('deep', ['shared'])
    ]
    // b 的唯一父是 a → b 是 a 的独有后代
    // shared 可从 r 直达 → shared 非独有
    // deep 只能经 shared 到达，而 shared 可从 r 直达 → deep 也非独有
    expect(uniqueDescendantsOf(g, 'a')).toEqual(['b'])
    expect(uniqueDescendantsOf(g, 'a')).not.toContain('shared')
    expect(uniqueDescendantsOf(g, 'a')).not.toContain('deep')
  })
})

describe('删除语义', () => {
  it('单删只移除自身，子节点失去父后升级为根', () => {
    const nodes = [makeNode('r'), makeNode('a', ['r']), makeNode('c', ['a'])]
    const res = deleteBubble(nodes, 'a')
    expect(idsOf(res.nodes)).toEqual(['c', 'r'])
    expect(res.promotedIds).toEqual(['c'])
    expect(res.nodes.find((n) => n.id === 'c')?.parentIds).toEqual([])
  })

  it('单删共享子节点时保留其它父引用，不升级为根', () => {
    const nodes = [makeNode('a'), makeNode('x'), makeNode('b', ['a', 'x'])]
    const res = deleteBubble(nodes, 'a')
    const b = res.nodes.find((n) => n.id === 'b')
    expect(b?.parentIds).toEqual(['x'])
    expect(res.promotedIds).toEqual([])
  })

  it('级联删只带走独有后代，保留共享节点', () => {
    const nodes = [
      makeNode('r1'),
      makeNode('r2'),
      makeNode('a', ['r1']),
      makeNode('b', ['a', 'r2'])
    ]
    const res = deleteBubbleCascade(nodes, 'r1')
    expect(idsOf(res.nodes)).toEqual(['b', 'r2'])
    expect(res.nodes.find((n) => n.id === 'b')?.parentIds).toEqual(['r2'])
  })

  it('级联删会移除整条独有链', () => {
    const nodes = [makeNode('r'), makeNode('a', ['r']), makeNode('c', ['a']), makeNode('d', ['c'])]
    const res = deleteBubbleCascade(nodes, 'r')
    expect(res.nodes).toHaveLength(0)
    expect(res.removedIds.sort()).toEqual(['a', 'c', 'd', 'r'])
  })

  it('删除后 promotedIds 供 UI 重渲染为主气泡样式', () => {
    const nodes = [makeNode('p'), makeNode('k', ['p'])]
    const res = deleteBubble(nodes, 'p')
    expect(res.promotedIds).toEqual(['k'])
  })
})

describe('网状连接与环检测', () => {
  it('wouldCreateCycle 识别自环与祖先闭环', () => {
    const nodes = [makeNode('a'), makeNode('b', ['a']), makeNode('c', ['b'])]
    expect(wouldCreateCycle(nodes, 'a', 'a')).toBe(true)
    expect(wouldCreateCycle(nodes, 'a', 'c')).toBe(true)
    expect(wouldCreateCycle(nodes, 'c', 'a')).toBe(false)
  })

  it('wouldCreateCycle 对不存在的节点返回 true', () => {
    expect(wouldCreateCycle([makeNode('a')], 'a', 'ghost')).toBe(true)
  })

  it('addParentLink 成功建立第二个父', () => {
    const nodes = [makeNode('a'), makeNode('x'), makeNode('c', ['a'])]
    const res = addParentLink(nodes, 'c', 'x')
    expect(res.ok).toBe(true)
    expect(res.nodes.find((n) => n.id === 'c')?.parentIds).toEqual(['a', 'x'])
  })

  it('addParentLink 拒绝重复、成环与跨层级', () => {
    const nodes = [
      makeNode('a'),
      makeNode('b', ['a']),
      makeNode('z', [], { x: 0, y: 0 }, { zoneId: 'zone' })
    ]
    expect(addParentLink(nodes, 'b', 'a').error).toBe('duplicate')
    expect(addParentLink(nodes, 'a', 'b').error).toBe('cycle')
    expect(addParentLink(nodes, 'b', 'z').error).toBe('cross-zone')
    expect(addParentLink(nodes, 'b', 'ghost').error).toBe('not-found')
  })

  it('removeParentLink 只断开指定父连接', () => {
    const nodes = [makeNode('a'), makeNode('x'), makeNode('c', ['a', 'x'])]
    const res = removeParentLink(nodes, 'c', 'a')
    expect(res.find((n) => n.id === 'c')?.parentIds).toEqual(['x'])
  })

  it('deriveEdges 标记次要父连接为回边', () => {
    const nodes = [makeNode('a'), makeNode('x'), makeNode('c', ['a', 'x'])]
    const edges = deriveEdges(nodes)
    expect(edges).toHaveLength(2)
    expect(edges.find((e) => e.from === 'a')?.backEdge).toBe(false)
    expect(edges.find((e) => e.from === 'x')?.backEdge).toBe(true)
    expect(edges.every((e) => e.id === `${e.from}->${e.to}`)).toBe(true)
  })

  it('deriveEdges 跳过失效父引用', () => {
    const nodes = [makeNode('c', ['ghost'])]
    expect(deriveEdges(nodes)).toEqual([])
  })
})

describe('结构变更', () => {
  it('addChild 追加子节点并继承层级', () => {
    const parent = makeNode('p', [], { x: 0, y: 0 }, { zoneId: 'z' })
    const child = createBubble({ id: 'c' })
    const res = addChild([parent], 'p', child)
    expect(res).toHaveLength(2)
    expect(res[1].parentIds).toEqual(['p'])
    expect(res[1].zoneId).toBe('z')
  })

  it('addSibling 沿用同级的主父', () => {
    const nodes = [makeNode('p'), makeNode('a', ['p'])]
    const res = addSibling(nodes, 'a', createBubble({ id: 'b' }))
    expect(res.find((n) => n.id === 'b')?.parentIds).toEqual(['p'])
  })

  it('addSibling 对根节点产生新的根', () => {
    const nodes = [makeNode('r')]
    const res = addSibling(nodes, 'r', createBubble({ id: 'r2' }))
    expect(res.find((n) => n.id === 'r2')?.parentIds).toEqual([])
  })

  it('subtreeIds 含自身与全部后代', () => {
    const nodes = [makeNode('a'), makeNode('b', ['a']), makeNode('c', ['b']), makeNode('o')]
    expect(subtreeIds(nodes, 'a').sort()).toEqual(['a', 'b', 'c'])
  })

  it('moveSubtree 平移整棵子树且不影响其它节点', () => {
    const nodes = [
      makeNode('a', [], { x: 0, y: 0 }),
      makeNode('b', ['a'], { x: 10, y: 10 }),
      makeNode('o', [], { x: 100, y: 100 })
    ]
    const res = moveSubtree(nodes, 'a', 5, -5)
    expect(res.find((n) => n.id === 'a')?.bubblePos).toEqual({ x: 5, y: -5 })
    expect(res.find((n) => n.id === 'b')?.bubblePos).toEqual({ x: 15, y: 5 })
    expect(res.find((n) => n.id === 'o')?.bubblePos).toEqual({ x: 100, y: 100 })
  })

  it('setNodeImportance 夹紧到 1..100', () => {
    const nodes = [makeNode('a')]
    expect(setNodeImportance(nodes, 'a', 500)[0].importance).toBe(100)
    expect(setNodeImportance(nodes, 'a', -3)[0].importance).toBe(1)
  })
})

describe('方向键导航（D6）', () => {
  const nodes = [
    makeNode('root', [], { x: 0, y: 0 }),
    makeNode('c1', ['root'], { x: 10, y: 0 }),
    makeNode('c2', ['root'], { x: 10, y: 50 }),
    makeNode('gc', ['c1'], { x: 20, y: 0 })
  ]

  it('左 = 主父', () => {
    expect(navigate(nodes, 'c1', 'left')).toBe('root')
    expect(navigate(nodes, 'root', 'left')).toBeNull()
  })

  it('右 = 第一个子', () => {
    expect(navigate(nodes, 'root', 'right')).toBe('c1')
    expect(navigate(nodes, 'c2', 'right')).toBeNull()
  })

  it('上下 = 同父兄弟按 y 排序', () => {
    expect(navigate(nodes, 'c1', 'down')).toBe('c2')
    expect(navigate(nodes, 'c2', 'up')).toBe('c1')
    expect(navigate(nodes, 'c1', 'up')).toBeNull()
  })

  it('多父节点按主父计算左方向', () => {
    const multi = [makeNode('p1'), makeNode('p2'), makeNode('m', ['p1', 'p2'])]
    expect(navigate(multi, 'm', 'left')).toBe('p1')
  })
})
