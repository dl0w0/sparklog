import { describe, expect, it } from 'vitest'
import {
  buildViewEdges,
  computeLengthChange,
  edgeId,
  entityGeometry,
  findLink,
  isParentEdgeId,
  styleOf
} from '@renderer/logic/links'
import { createEmptyDocument, parseDocument, serializeDocument } from '@shared/logic/documentCodec'
import { makeRadiusResolver } from '@renderer/logic/nodeVisual'
import { makeNode } from '../helpers'
import type { InsertObject, Link } from '@shared/types/document'

const nodes = [makeNode('r'), makeNode('a', ['r']), makeNode('b', ['r'])]
const inserts: InsertObject[] = [
  {
    id: 'i1',
    kind: 'note',
    zoneId: null,
    ownerBubbleId: null,
    pos: { x: 400, y: 0 },
    pinned: true,
    expanded: true,
    note: { title: 'n', content: '' },
    createdAt: '',
    updatedAt: ''
  }
]

function docWithLinks(links: Link[], edgeStyles = {}) {
  const doc = createEmptyDocument()
  doc.nodes = nodes
  doc.inserts = inserts
  doc.links = links
  doc.edgeStyles = edgeStyles
  return doc
}

describe('连线视图模型（D49 / D50 / D51）', () => {
  it('父子连线默认实线，次要父连接为虚线', () => {
    const doc = docWithLinks([])
    const edges = buildViewEdges(doc)
    const primary = edges.find((e) => e.id === edgeId('r', 'a'))
    expect(primary?.kind).toBe('parent')
    expect(primary?.dashed).toBe(false)
  })

  it('edgeStyles 可以覆盖为虚线/颜色/粗细', () => {
    const doc = docWithLinks([], { [edgeId('r', 'a')]: { dashed: true, color: '#c0392b', width: 3 } })
    const edge = buildViewEdges(doc).find((e) => e.id === edgeId('r', 'a'))!
    expect(edge.dashed).toBe(true)
    expect(edge.color).toBe('#c0392b')
    expect(edge.width).toBe(3)
    expect(styleOf(doc, edge).color).toBe('#c0392b')
  })

  it('关联线默认虚线并带 linkId', () => {
    const doc = docWithLinks([
      { id: 'l1', from: 'a', to: 'i1', fromKind: 'bubble', toKind: 'insert' }
    ])
    const edge = buildViewEdges(doc).find((e) => e.id === 'l1')!
    expect(edge.kind).toBe('assoc')
    expect(edge.dashed).toBe(true)
    expect(edge.linkId).toBe('l1')
    expect(findLink(doc, 'l1')?.toKind).toBe('insert')
    expect(isParentEdgeId(doc, 'l1')).toBe(false)
  })

  it('entityGeometry 支持气泡与插入对象', () => {
    const radiusOf = makeRadiusResolver(nodes, 'bubble')
    const bubble = entityGeometry('r', nodes, inserts, radiusOf, (i) => i.pos)
    const insert = entityGeometry('i1', nodes, inserts, radiusOf, (i) => i.pos)
    expect(bubble?.radius).toBeGreaterThan(0)
    expect(insert?.center).toEqual({ x: 400, y: 0 })
    expect(entityGeometry('ghost', nodes, inserts, radiusOf, (i) => i.pos)).toBeNull()
  })

  it('computeLengthChange 沿原方向移动可移动端', () => {
    const doc = docWithLinks([])
    const edge = buildViewEdges(doc).find((e) => e.id === edgeId('r', 'a'))!
    const fixed = { center: { x: 0, y: 0 }, radius: 40, shape: 'circle' as const }
    const movable = { center: { x: 200, y: 0 }, radius: 30, shape: 'circle' as const }
    const change = computeLengthChange(doc, edge, fixed, movable, 300)
    expect(change?.length).toBe(300)
    expect(change?.newPos.x).toBeCloseTo(300, 5)
    expect(change?.newPos.y).toBeCloseTo(0, 5)
  })

  it('长度不会小于两端半径之和 + 1', () => {
    const doc = docWithLinks([])
    const edge = buildViewEdges(doc).find((e) => e.id === edgeId('r', 'a'))!
    const fixed = { center: { x: 0, y: 0 }, radius: 40, shape: 'circle' as const }
    const movable = { center: { x: 200, y: 0 }, radius: 30, shape: 'circle' as const }
    const change = computeLengthChange(doc, edge, fixed, movable, 5)
    expect(change?.length).toBe(71)
  })
})

describe('文档格式新增字段（D50 / D51）', () => {
  it('links 与 edgeStyles 往返保留', () => {
    const doc = docWithLinks(
      [{ id: 'l1', from: 'a', to: 'b', fromKind: 'bubble', toKind: 'bubble', length: 233 }],
      { [edgeId('r', 'a')]: { dashed: true } }
    )
    const parsed = parseDocument(serializeDocument(doc))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.doc.links).toHaveLength(1)
    expect(parsed.doc.links[0].length).toBe(233)
    expect(parsed.doc.edgeStyles[edgeId('r', 'a')]).toEqual({ dashed: true })
  })

  it('缺失 links/edgeStyles 的旧文件自动补空', () => {
    const parsed = parseDocument(JSON.stringify({ fileVersion: 1, nodes: [] }))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.doc.links).toEqual([])
    expect(parsed.doc.edgeStyles).toEqual({})
  })

  it('非法 link 被丢弃', () => {
    const parsed = parseDocument(
      JSON.stringify({
        fileVersion: 1,
        nodes: [],
        links: [{ id: '', from: 'a', to: 'b' }, { id: 'ok', from: 'a', to: 'b' }]
      })
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.doc.links).toHaveLength(1)
  })
})
