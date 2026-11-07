import { describe, expect, it } from 'vitest'
import { countViolations, tidyLayout, tidyPositions } from '@renderer/logic/tidy'
import { makeNode } from '../helpers'

/**
 * 两棵树：R1(a1,a2,a3)，a1 有子 a1x,a1y；R2(b1,b2)。
 * 初始位置故意挤在一起，用来验证梳理后的两条硬约束。
 */
function forest() {
  return [
    makeNode('R1', [], { x: 0, y: 0 }),
    makeNode('a1', ['R1'], { x: 260, y: 20 }),
    makeNode('a2', ['R1'], { x: -40, y: 260 }),
    makeNode('a3', ['R1'], { x: 60, y: -240 }),
    makeNode('a1x', ['a1'], { x: 520, y: 120 }),
    makeNode('a1y', ['a1'], { x: 300, y: 240 }),
    makeNode('R2', [], { x: 900, y: 0 }),
    makeNode('b1', ['R2'], { x: 1120, y: -60 }),
    makeNode('b2', ['R2'], { x: 980, y: 200 }),
    makeNode('inZone', [], { x: 3000, y: 3000 }, { zoneId: 'z' })
  ]
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y)

describe('梳理气泡（D69：两条硬约束）', () => {
  it('不改变任何连线长度', () => {
    const nodes = forest()
    const before = new Map(
      nodes
        .filter((n) => n.zoneId === null && n.parentIds.length > 0)
        .map((n) => {
          const parent = nodes.find((p) => p.id === n.parentIds[0])!
          return [n.id, dist(n.bubblePos, parent.bubblePos)] as const
        })
    )
    const position = tidyPositions(nodes, null)
    for (const [childId, length] of before) {
      const child = nodes.find((n) => n.id === childId)!
      const parent = nodes.find((p) => p.id === child.parentIds[0])!
      expect(dist(position.get(childId)!, position.get(parent.id)!)).toBeCloseTo(length, 5)
    }
  })

  it('子代离自己的主气泡比离其它主气泡更近（硬约束①）', () => {
    const nodes = forest()
    const { violations } = tidyLayout({ nodes, zoneId: null })
    expect(violations.territory).toBe(0)
  })

  it('连线不穿过其它气泡、也不互相交叉（硬约束②）', () => {
    const nodes = forest()
    const { violations } = tidyLayout({ nodes, zoneId: null })
    expect(violations.edgeHitsBubble).toBe(0)
    expect(violations.edgeCrossings).toBe(0)
    expect(violations.overlap).toBe(0)
  })

  it('主气泡之间被拉开', () => {
    const nodes = forest()
    const before = dist(
      nodes.find((n) => n.id === 'R1')!.bubblePos,
      nodes.find((n) => n.id === 'R2')!.bubblePos
    )
    const position = tidyPositions(nodes, null)
    expect(dist(position.get('R1')!, position.get('R2')!)).toBeGreaterThan(before)
  })

  it('只处理当前层级', () => {
    const result = tidyPositions(forest(), null)
    expect(result.has('inZone')).toBe(false)
  })

  it('纯函数：不修改入参', () => {
    const nodes = forest()
    const snapshot = nodes.map((n) => ({ ...n.bubblePos }))
    tidyPositions(nodes, null)
    expect(nodes.map((n) => n.bubblePos)).toEqual(snapshot)
  })

  it('单节点保持原位', () => {
    const single = [makeNode('only', [], { x: 42, y: -7 })]
    expect(tidyPositions(single, null).get('only')).toEqual({ x: 42, y: -7 })
  })

  it('混合形状梳理后任意两气泡真实边界互不重叠（D79）', () => {
    const nodes = [
      makeNode('R1', [], { x: 0, y: 0 }, { style: { shape: 'circle' } }),
      makeNode('e1', ['R1'], { x: 280, y: 20 }, { style: { shape: 'ellipse' } }),
      makeNode('r1', ['R1'], { x: -40, y: 280 }, { style: { shape: 'roundedRect' } }),
      makeNode('e2', ['e1'], { x: 520, y: 140 }, { style: { shape: 'ellipse' } }),
      makeNode('R2', [], { x: 900, y: 0 }, { style: { shape: 'roundedRect' } }),
      makeNode('c2', ['R2'], { x: 1120, y: 60 }, { style: { shape: 'circle' } })
    ]
    const { violations } = tidyLayout({ nodes, zoneId: null })
    expect(violations.overlap).toBe(0)
    expect(violations.territory).toBe(0)
    expect(violations.edgeHitsBubble).toBe(0)
    expect(violations.edgeCrossings).toBe(0)
  })

  it('一次梳理只产生一条可撤销命令', async () => {
    const { commitPositionsAbsolute } = await import('@renderer/actions/bubbleActions')
    const { useDocStore } = await import('@renderer/store/docStore')
    const nodes = forest()
    useDocStore.setState({ doc: { ...useDocStore.getState().doc, nodes } } as never)
    const before = new Map(nodes.map((n) => [n.id, { ...n.bubblePos }]))
    const target = tidyPositions(nodes, null)
    commitPositionsAbsolute(target)
    useDocStore.getState().undo()
    expect(useDocStore.getState().doc.nodes.find((n) => n.id === 'a1')!.bubblePos).toEqual(
      before.get('a1')
    )
    // 一次梳理 = 一步：撤销后不能再撤销回「部分整理」状态
    expect(useDocStore.getState().canUndo).toBe(false)
  })

  it('空层级返回空结果', () => {
    expect(tidyPositions([], null).size).toBe(0)
    expect(countViolations(new Map(), [], null).total).toBe(0)
  })
})
