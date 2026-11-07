import { describe, expect, it } from 'vitest'
import { boundsOfItems, collectLevelItems, computeLevelBounds, insertRadius } from '@renderer/logic/fitBounds'
import { makeRadiusResolver } from '@renderer/logic/nodeVisual'
import { makeNode } from '../helpers'
import type { InsertObject, Zone } from '@shared/types/document'

const nodes = [
  makeNode('r', [], { x: 0, y: 0 }),
  makeNode('a', ['r'], { x: 400, y: 0 }),
  makeNode('zoned', [], { x: 9999, y: 9999 }, { zoneId: 'z1' })
]

const insert = (id: string, x: number, y: number, pinned = false): InsertObject => ({
  id,
  kind: 'note',
  zoneId: null,
  ownerBubbleId: null,
  pos: { x, y },
  pinned,
  expanded: true,
  note: { title: 'n', content: '' },
  createdAt: '',
  updatedAt: ''
})

const zone: Zone = {
  id: 'z2',
  title: '专区',
  colorKey: 'default',
  parentZoneId: null,
  pos: { x: 1200, y: -200 },
  size: { w: 400, h: 300 },
  viewport: { scale: 1, offsetX: 0, offsetY: 0 }
}

describe('适应画布包围盒（D56）', () => {
  const radiusOf = makeRadiusResolver(nodes, 'bubble')

  it('包含气泡、插入对象与专区卡片', () => {
    const items = collectLevelItems({
      nodes,
      inserts: [insert('i1', 800, 300, true)],
      zones: [zone],
      levelZoneId: null,
      radiusOf
    })
    const bounds = boundsOfItems(items)
    expect(bounds).not.toBeNull()
    if (!bounds) return
    // 覆盖到插入对象
    expect(bounds.x + bounds.w).toBeGreaterThanOrEqual(800 + insertRadius(insert('i2', 0, 0)) - 1)
    // 覆盖到专区卡片
    expect(bounds.x + bounds.w).toBeGreaterThanOrEqual(1600 - 1)
    expect(bounds.y).toBeLessThanOrEqual(-200 - 1)
  })

  it('不包含其它层级的节点', () => {
    const bounds = computeLevelBounds({
      nodes,
      inserts: [],
      zones: [],
      levelZoneId: null,
      radiusOf
    })
    expect(bounds).not.toBeNull()
    if (!bounds) return
    expect(bounds.x + bounds.w).toBeLessThan(9999)
  })

  it('空层级返回 null', () => {
    expect(
      computeLevelBounds({ nodes: [], inserts: [], zones: [], levelZoneId: null, radiusOf })
    ).toBeNull()
  })

  it('钉住与附着对象都计入包围盒', () => {
    const attached: InsertObject = {
      ...insert('i3', 700, 0),
      ownerBubbleId: 'a',
      expanded: false
    }
    const withAttached = collectLevelItems({
      nodes,
      inserts: [attached],
      zones: [],
      levelZoneId: null,
      radiusOf
    })
    // 附着对象贴在宿主气泡角上，位置由宿主决定
    expect(
      withAttached.some((i) => Math.hypot(i.pos.x - 400, i.pos.y - 0) < radiusOf(nodes[1]) * 2)
    ).toBe(true)
  })

  it('boundsOfItems 加 padding', () => {
    const b = boundsOfItems([{ pos: { x: 0, y: 0 }, radius: 10 }], 5)
    expect(b).toEqual({ x: -15, y: -15, w: 30, h: 30 })
  })
})
