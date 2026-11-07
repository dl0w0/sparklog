import { describe, expect, it } from 'vitest'
import { searchNodes } from '@renderer/logic/search'
import { makeNode } from '../helpers'

const nodes = [
  makeNode('1', [], { x: 0, y: 0 }, { text: '灵感气泡' }),
  makeNode('2', [], { x: 0, y: 0 }, { text: '记录灵感' }),
  makeNode('3', [], { x: 0, y: 0 }, { text: '无关内容' }),
  makeNode('4', [], { x: 0, y: 0 }, { text: '' }),
  makeNode('5', [], { x: 0, y: 0 }, { text: 'Inspiration', zoneId: 'z1' })
]

describe('搜索', () => {
  it('空查询返回空结果', () => {
    expect(searchNodes(nodes, '')).toEqual([])
    expect(searchNodes(nodes, '   ')).toEqual([])
  })

  it('匹配中文子串', () => {
    const hits = searchNodes(nodes, '灵感')
    expect(hits.map((h) => h.id).sort()).toEqual(['1', '2'])
  })

  it('前缀匹配排在前', () => {
    const hits = searchNodes(nodes, '灵感')
    expect(hits[0].id).toBe('1')
  })

  it('大小写不敏感', () => {
    expect(searchNodes(nodes, 'insp').map((h) => h.id)).toEqual(['5'])
  })

  it('结果带所在专区', () => {
    expect(searchNodes(nodes, 'insp')[0].zoneId).toBe('z1')
  })

  it('空文本节点不参与匹配', () => {
    expect(searchNodes(nodes, '').length).toBe(0)
    expect(searchNodes(nodes, ' ').length).toBe(0)
  })

  it('未命中的查询返回空', () => {
    expect(searchNodes(nodes, '不存在的词')).toEqual([])
  })

  it('限制返回数量', () => {
    const many = Array.from({ length: 80 }, (_, i) =>
      makeNode(`m${i}`, [], { x: 0, y: 0 }, { text: `匹配项 ${i}` })
    )
    expect(searchNodes(many, '匹配', 10)).toHaveLength(10)
  })
})
