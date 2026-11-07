import { beforeEach, describe, expect, it } from 'vitest'
import {
  addChildBubble,
  addParentLink,
  addRootBubble,
  addSiblingBubble,
  adjustImportance,
  commitMove,
  toggleCollapse,
  childCountOf,
  commitPositionsAbsolute,
  commitText,
  countUniqueDescendants,
  deleteBubbleWithUniqueDescendants,
  deleteSingleBubble,
  endImportanceGesture,
  selectBranchSet
} from '@renderer/actions/bubbleActions'
import { useDocStore } from '@renderer/store/docStore'
import { useSelectionStore } from '@renderer/store/selectionStore'
import { radiusOf } from '@renderer/logic/nodeVisual'
import { overlaps } from '@renderer/logic/layout/bubbleSpawn'

beforeEach(() => {
  useDocStore.getState().newDocument()
  useSelectionStore.getState().clear()
})

function nodes() {
  return useDocStore.getState().doc.nodes
}

function byText(text: string) {
  return nodes().find((n) => n.text === text)
}

describe('新建气泡', () => {
  it('新建主气泡后自动进入编辑态', () => {
    const id = addRootBubble({ x: 100, y: 100 })
    expect(id).toBeTruthy()
    expect(nodes()).toHaveLength(1)
    expect(useSelectionStore.getState().editingId).toBe(id)
    expect(nodes()[0].parentIds).toEqual([])
  })

  it('Tab 新建子气泡：父引用正确、位置不与父重叠', () => {
    const rootId = addRootBubble({ x: 0, y: 0 }) as string
    commitText(rootId, '父')
    const childId = addChildBubble(rootId) as string
    const parent = byText('父')
    const child = nodes().find((n) => n.id === childId)
    expect(child?.parentIds).toEqual([rootId])
    const dist = Math.hypot(
      (child as any).bubblePos.x - (parent as any).bubblePos.x,
      (child as any).bubblePos.y - (parent as any).bubblePos.y
    )
    expect(dist).toBeGreaterThan(radiusOf(parent as any, 'bubble'))
  })

  it('Enter 新建同级气泡沿用主父', () => {
    const rootId = addRootBubble({ x: 0, y: 0 }) as string
    const childId = addChildBubble(rootId) as string
    const siblingId = addSiblingBubble(childId) as string
    expect(nodes().find((n) => n.id === siblingId)?.parentIds).toEqual([rootId])
  })

  it('同一父节点下子气泡与父节点等距（D38）', () => {
    const rootId = addRootBubble({ x: 0, y: 0 }) as string
    const ids: string[] = []
    for (let i = 0; i < 5; i++) ids.push(addChildBubble(rootId) as string)
    const parent = nodes().find((n) => n.id === rootId)!
    const dists = ids.map((id) => {
      const child = nodes().find((n) => n.id === id)!
      return Math.hypot(child.bubblePos.x - parent.bubblePos.x, child.bubblePos.y - parent.bubblePos.y)
    })
    for (const d of dists) expect(d).toBeCloseTo(dists[0], 6)
  })

  it('多个子气泡互不重叠', () => {
    const rootId = addRootBubble({ x: 0, y: 0 }) as string
    for (let i = 0; i < 6; i++) addChildBubble(rootId)
    const kids = nodes().filter((n) => n.parentIds[0] === rootId)
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        expect(
          overlaps(
            { pos: kids[i].bubblePos, radius: radiusOf(kids[i], 'bubble') },
            { pos: kids[j].bubblePos, radius: radiusOf(kids[j], 'bubble') }
          )
        ).toBe(false)
      }
    }
  })
})

describe('删除语义', () => {
  it('单删：子气泡升根，位置不变', () => {
    const rootId = addRootBubble({ x: 0, y: 0 }) as string
    const childId = addChildBubble(rootId) as string
    const before = { ...nodes().find((n) => n.id === childId)!.bubblePos }
    const out = deleteSingleBubble(rootId)
    expect(out?.promotedIds).toEqual([childId])
    const child = nodes().find((n) => n.id === childId)!
    expect(child.parentIds).toEqual([])
    expect(child.bubblePos).toEqual(before)
  })

  it('级联删：只删独有后代，共享节点保留', () => {
    const r1 = addRootBubble({ x: 0, y: 0 }) as string
    const r2 = addRootBubble({ x: 400, y: 0 }) as string
    const a = addChildBubble(r1) as string
    const shared = addChildBubble(a) as string
    addParentLink(shared, r2)
    expect(countUniqueDescendants(r1)).toBe(1)
    deleteBubbleWithUniqueDescendants(r1)
    expect(nodes().some((n) => n.id === shared)).toBe(true)
    expect(nodes().some((n) => n.id === a)).toBe(false)
  })
})

describe('重要程度', () => {
  it('滚轮调整夹紧到 1..100，并在手势结束时入栈', () => {
    const id = addRootBubble({ x: 0, y: 0 }) as string
    for (let i = 0; i < 40; i++) adjustImportance(id, 5)
    expect(nodes()[0].importance).toBe(100)
    endImportanceGesture()
    useDocStore.getState().undo()
    expect(nodes()[0].importance).toBeLessThan(100)
  })

  it('调整后半径随之增大', () => {
    const id = addRootBubble({ x: 0, y: 0 }) as string
    const before = radiusOf(nodes()[0], 'bubble')
    adjustImportance(id, 20)
    endImportanceGesture()
    expect(radiusOf(nodes()[0], 'bubble')).toBeGreaterThan(before)
  })
})

describe('网状父连接', () => {
  it('成功建立第二个父，并生成回边', () => {
    const a = addRootBubble({ x: 0, y: 0 }) as string
    const b = addRootBubble({ x: 300, y: 0 }) as string
    const c = addChildBubble(a) as string
    const res = addParentLink(c, b)
    expect(res.ok).toBe(true)
    expect(nodes().find((n) => n.id === c)?.parentIds).toEqual([a, b])
  })

  it('拒绝成环并给出可读错误', () => {
    const a = addRootBubble({ x: 0, y: 0 }) as string
    const b = addChildBubble(a) as string
    const res = addParentLink(a, b)
    expect(res.ok).toBe(false)
    expect(res.error).toContain('后代')
  })
})

describe('子节点折叠（D27）', () => {
  it('折叠写入落盘字段，可再展开', () => {
    const root = addRootBubble({ x: 0, y: 0 }) as string
    addChildBubble(root)
    toggleCollapse(root)
    expect(nodes().find((n) => n.id === root)?.collapsed).toBe(true)
    toggleCollapse(root)
    expect(nodes().find((n) => n.id === root)?.collapsed).toBeUndefined()
  })

  it('折叠可撤销', () => {
    const root = addRootBubble({ x: 0, y: 0 }) as string
    addChildBubble(root)
    toggleCollapse(root)
    useDocStore.getState().undo()
    expect(nodes().find((n) => n.id === root)?.collapsed).toBeUndefined()
  })

  it('childCountOf 统计直接子节点', () => {
    const root = addRootBubble({ x: 0, y: 0 }) as string
    addChildBubble(root)
    addChildBubble(root)
    expect(childCountOf(root)).toBe(2)
  })
})

describe('移动与选择集合', () => {
  it('拖动父气泡带动整棵子树', () => {
    const root = addRootBubble({ x: 0, y: 0 }) as string
    const child = addChildBubble(root) as string
    const childPos = { ...nodes().find((n) => n.id === child)!.bubblePos }
    commitMove(null, root, 50, 30)
    expect(nodes().find((n) => n.id === child)!.bubblePos).toEqual({
      x: childPos.x + 50,
      y: childPos.y + 30
    })
  })

  it('选择集合：兄弟 / 后代 / 祖先', () => {
    const root = addRootBubble({ x: 0, y: 0 }) as string
    const c1 = addChildBubble(root) as string
    const c2 = addChildBubble(root) as string
    const gc = addChildBubble(c1) as string
    expect(selectBranchSet('siblings', c1).sort()).toEqual([c1, c2].sort())
    expect(selectBranchSet('descendants', root).sort()).toEqual([c1, c2, gc].sort())
    expect(selectBranchSet('ancestors', gc).sort()).toEqual([c1, root].sort())
    expect(selectBranchSet('uniqueDescendants', root).sort()).toEqual([c1, c2, gc].sort())
  })
})
