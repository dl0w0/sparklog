import { beforeEach, describe, expect, it } from 'vitest'
import {
  bubbleCountInZone,
  deleteZoneCascade,
  descendantZoneIds,
  hitTestZone,
  moveBubbleToLevel,
  zonePath,
  zonesInLevel
} from '@renderer/logic/zones'
import {
  createZoneAt,
  currentZoneId,
  deleteZone,
  ensureValidLevel,
  enterZone,
  exitZone,
  moveZoneCard,
  renameZone
} from '@renderer/actions/zoneActions'
import { addRootBubble, commitText } from '@renderer/actions/bubbleActions'
import { addInsert } from '@renderer/actions/insertActions'
import { useDocStore } from '@renderer/store/docStore'
import { ROOT_LEVEL, useViewportStore } from '@renderer/store/viewportStore'
import type { Zone } from '@shared/types/document'

function makeZone(id: string, parentZoneId: string | null = null): Zone {
  return {
    id,
    title: id,
    colorKey: 'default',
    parentZoneId,
    pos: { x: 0, y: 0 },
    size: { w: 300, h: 200 },
    viewport: { scale: 1, offsetX: 0, offsetY: 0 }
  }
}

beforeEach(() => {
  useDocStore.getState().newDocument()
  useViewportStore.getState().setLevel(ROOT_LEVEL)
})

const doc = () => useDocStore.getState().doc

describe('专区层级运算', () => {
  const zones = [makeZone('a'), makeZone('b'), makeZone('a1', 'a'), makeZone('a1x', 'a1')]

  it('zonesInLevel 按父专区过滤', () => {
    expect(zonesInLevel(zones, null).map((z) => z.id).sort()).toEqual(['a', 'b'])
    expect(zonesInLevel(zones, 'a').map((z) => z.id)).toEqual(['a1'])
  })

  it('zonePath 返回从根到目标的路径', () => {
    expect(zonePath(zones, 'a1x').map((z) => z.id)).toEqual(['a', 'a1', 'a1x'])
    expect(zonePath(zones, 'b')).toHaveLength(1)
  })

  it('descendantZoneIds 返回全部子孙（不含自身）', () => {
    expect(descendantZoneIds(zones, 'a').sort()).toEqual(['a1', 'a1x'])
    expect(descendantZoneIds(zones, 'b')).toEqual([])
  })

  it('bubbleCountInZone 统计气泡数', () => {
    const nodes = [
      { zoneId: 'a' } as never,
      { zoneId: 'a' } as never,
      { zoneId: null } as never
    ]
    expect(bubbleCountInZone(nodes, 'a')).toBe(2)
  })

  it('hitTestZone 命中最后创建（最上层）的专区', () => {
    const stacked = [
      { ...makeZone('bottom'), pos: { x: 0, y: 0 }, size: { w: 100, h: 100 } },
      { ...makeZone('top'), pos: { x: 0, y: 0 }, size: { w: 100, h: 100 } }
    ]
    expect(hitTestZone(stacked, { x: 50, y: 50 })?.id).toBe('top')
    expect(hitTestZone(stacked, { x: 500, y: 500 })).toBeNull()
  })

  it('级联删除专区会带走气泡与子孙专区', () => {
    const res = deleteZoneCascade(
      zones,
      [
        { id: 'n1', zoneId: 'a' } as never,
        { id: 'n2', zoneId: 'a1' } as never,
        { id: 'n3', zoneId: null } as never
      ],
      [{ id: 'i1', zoneId: 'a1' } as never, { id: 'i2', zoneId: null } as never],
      'a'
    )
    expect(res.removedZoneIds.sort()).toEqual(['a', 'a1', 'a1x'])
    expect(res.zones.map((z) => z.id)).toEqual(['b'])
    expect(res.nodes.map((n) => n.id)).toEqual(['n3'])
    expect(res.inserts.map((i) => i.id)).toEqual(['i2'])
  })

  it('moveBubbleToLevel 只改目标节点层级', () => {
    const nodes = [
      { id: 'a', zoneId: null, bubblePos: { x: 0, y: 0 }, updatedAt: '' } as never,
      { id: 'b', zoneId: null, bubblePos: { x: 1, y: 1 }, updatedAt: '' } as never
    ]
    const next = moveBubbleToLevel(nodes, 'a', 'z1', { x: 9, y: 9 })
    expect((next[0] as never as { zoneId: string }).zoneId).toBe('z1')
    expect((next[1] as never as { zoneId: string | null }).zoneId).toBeNull()
  })
})

describe('专区动作', () => {
  it('创建专区在当前位置生成并写入文档', () => {
    const id = createZoneAt({ x: 10, y: 20, w: 300, h: 200 })
    expect(doc().zones).toHaveLength(1)
    expect(doc().zones[0].id).toBe(id)
    expect(doc().zones[0].parentZoneId).toBeNull()
    expect(useDocStore.getState().dirty).toBe(true)
  })

  it('进入与退出专区切换层级并保存视口', () => {
    const id = createZoneAt({ x: 0, y: 0, w: 300, h: 200 })
    expect(currentZoneId()).toBeNull()
    expect(enterZone(id)).toBe(true)
    expect(currentZoneId()).toBe(id)
    expect(useViewportStore.getState().levelId).toBe(id)
    exitZone()
    expect(currentZoneId()).toBeNull()
    expect(useViewportStore.getState().levelId).toBe(ROOT_LEVEL)
  })

  it('在专区内建的气泡归属该专区', () => {
    const id = createZoneAt({ x: 0, y: 0, w: 300, h: 200 })
    enterZone(id)
    const bubble = addRootBubble({ x: 0, y: 0 }) as string
    expect(doc().nodes.find((n) => n.id === bubble)?.zoneId).toBe(id)
    exitZone()
    expect(doc().nodes.filter((n) => n.zoneId === null)).toHaveLength(0)
  })

  it('嵌套专区：父专区 id 正确', () => {
    const outer = createZoneAt({ x: 0, y: 0, w: 300, h: 200 })
    enterZone(outer)
    const inner = createZoneAt({ x: 20, y: 20, w: 200, h: 150 })
    expect(doc().zones.find((z) => z.id === inner)?.parentZoneId).toBe(outer)
  })

  it('重命名专区', () => {
    const id = createZoneAt({ x: 0, y: 0, w: 300, h: 200 })
    renameZone(id, '想法收集')
    expect(doc().zones[0].title).toBe('想法收集')
  })

  it('删除专区后层级守卫退回主画布', () => {
    const id = createZoneAt({ x: 0, y: 0, w: 300, h: 200 })
    enterZone(id)
    deleteZone(id)
    ensureValidLevel()
    expect(useViewportStore.getState().levelId).toBe(ROOT_LEVEL)
    expect(doc().zones).toHaveLength(0)
  })

  it('删除专区内气泡与插入对象一并移除', () => {
    const id = createZoneAt({ x: 0, y: 0, w: 300, h: 200 })
    enterZone(id)
    const bubble = addRootBubble({ x: 0, y: 0 }) as string
    commitText(bubble, '专区内气泡')
    addInsert('note', bubble)
    deleteZone(id)
    expect(doc().nodes).toHaveLength(0)
    expect(doc().inserts).toHaveLength(0)
  })

  it('移动专区卡片', () => {
    const id = createZoneAt({ x: 10, y: 10, w: 300, h: 200 })
    moveZoneCard(id, 30, -20)
    expect(doc().zones[0].pos).toEqual({ x: 40, y: -10 })
  })

  it('删除专区可撤销', () => {
    const id = createZoneAt({ x: 0, y: 0, w: 300, h: 200 })
    deleteZone(id)
    expect(doc().zones).toHaveLength(0)
    useDocStore.getState().undo()
    expect(doc().zones).toHaveLength(1)
  })
})
