import { describe, expect, it } from 'vitest'
import { connectedComponent } from '@renderer/views/WorkspaceView/canvas/CanvasStage'
import { makeNode } from '../helpers'

const nodes = [
  makeNode('r', [], { x: 0, y: 0 }),
  makeNode('a', ['r'], { x: 100, y: 0 }),
  makeNode('b', ['a'], { x: 200, y: 0 }),
  makeNode('c', ['r'], { x: 100, y: 120 }),
  makeNode('other', [], { x: 900, y: 900 })
]

describe('连通分量（D34）', () => {
  it('包含自身与全部直接/间接相连的气泡', () => {
    const set = connectedComponent(nodes, 'b')
    expect([...set].sort()).toEqual(['a', 'b', 'c', 'r'])
  })

  it('互不相连的另一棵树不在同一分量', () => {
    const set = connectedComponent(nodes, 'a')
    expect(set.has('other')).toBe(false)
  })

  it('孤立节点只包含自己', () => {
    expect([...connectedComponent(nodes, 'other')]).toEqual(['other'])
  })

  it('网状多父节点不会被漏掉', () => {
    const dag = [
      makeNode('p1', [], { x: 0, y: 0 }),
      makeNode('p2', [], { x: 400, y: 0 }),
      makeNode('shared', ['p1', 'p2'], { x: 200, y: 100 })
    ]
    expect([...connectedComponent(dag, 'p2')].sort()).toEqual(['p1', 'p2', 'shared'])
  })

  it('支持上限保护', () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      makeNode(`n${i}`, i === 0 ? [] : [`n${i - 1}`], { x: i * 10, y: 0 })
    )
    expect(connectedComponent(many, 'n49', 10).size).toBe(10)
  })

  it('不存在的节点返回空集合', () => {
    expect(connectedComponent(nodes, 'ghost').size).toBe(0)
  })
})
