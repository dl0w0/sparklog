import { beforeEach, describe, expect, it } from 'vitest'
import {
  copySelection,
  copyStyle,
  cutSelection,
  pasteBubbles,
  pasteStyle,
  selectAllInLevel
} from '@renderer/actions/clipboardActions'
import { addChildBubble, addRootBubble, commitText } from '@renderer/actions/bubbleActions'
import { useClipboardStore } from '@renderer/store/clipboardStore'
import { useDocStore } from '@renderer/store/docStore'
import { useSelectionStore } from '@renderer/store/selectionStore'

beforeEach(() => {
  useDocStore.getState().newDocument()
  useClipboardStore.getState().clear()
  useSelectionStore.getState().clear()
})

function nodes() {
  return useDocStore.getState().doc.nodes
}

describe('复制与粘贴（应用内剪贴板）', () => {
  it('复制选中子树后粘贴出新副本', () => {
    const root = addRootBubble({ x: 0, y: 0 }) as string
    commitText(root, '根')
    const child = addChildBubble(root) as string
    commitText(child, '子')

    useSelectionStore.getState().select(root)
    expect(copySelection()).toBe(true)
    expect(useClipboardStore.getState().bubbles?.nodes).toHaveLength(2)

    const before = nodes().length
    expect(pasteBubbles(null)).toBe(true)
    expect(nodes().length).toBe(before + 2)
    // 粘贴后新节点被选中
    expect(useSelectionStore.getState().selectedIds).toHaveLength(1)
  })

  it('粘贴到某个气泡上会成为其子节点', () => {
    const a = addRootBubble({ x: 0, y: 0 }) as string
    const b = addRootBubble({ x: 400, y: 0 }) as string
    useSelectionStore.getState().select(a)
    copySelection()
    pasteBubbles(b)
    const pasted = nodes().find((n) => n.id !== a && n.id !== b)
    expect(pasted?.parentIds).toContain(b)
  })

  it('剪切后画布移除，粘贴重建（id 重新生成）', () => {
    const root = addRootBubble({ x: 0, y: 0 }) as string
    addChildBubble(root)
    useSelectionStore.getState().select(root)
    expect(cutSelection()).toBe(true)
    expect(nodes()).toHaveLength(0)
    expect(pasteBubbles(null)).toBe(true)
    expect(nodes()).toHaveLength(2)
    const roots = nodes().filter((n) => n.parentIds.length === 0)
    const kids = nodes().filter((n) => n.parentIds.length > 0)
    expect(roots).toHaveLength(1)
    expect(kids).toHaveLength(1)
    expect(kids[0].parentIds[0]).toBe(roots[0].id)
  })

  it('剪切后再粘贴会清空剪贴板，避免重复产出', () => {
    const root = addRootBubble({ x: 0, y: 0 }) as string
    useSelectionStore.getState().select(root)
    cutSelection()
    pasteBubbles(null)
    expect(useClipboardStore.getState().bubbles).toBeNull()
    expect(pasteBubbles(null)).toBe(false)
  })

  it('空剪贴板粘贴返回 false', () => {
    expect(pasteBubbles(null)).toBe(false)
  })
})

describe('样式拷贝与粘贴', () => {
  it('拷贝样式后粘贴到另一个气泡', () => {
    const a = addRootBubble({ x: 0, y: 0 }) as string
    const b = addRootBubble({ x: 400, y: 0 }) as string
    useDocStore.getState().commit('改形状', (d) => {
      const node = d.nodes.find((n) => n.id === a)
      if (node) {
        node.shape = 'ellipse'
        node.colorKey = 'warm'
      }
    })
    useSelectionStore.getState().select(a)
    expect(copyStyle()).toBe(true)
    useSelectionStore.getState().select(b)
    expect(pasteStyle()).toBe(true)
    const target = nodes().find((n) => n.id === b)
    expect(target?.shape).toBe('ellipse')
    expect(target?.colorKey).toBe('warm')
  })

  it('没有样式时粘贴返回 false', () => {
    const a = addRootBubble({ x: 0, y: 0 }) as string
    useSelectionStore.getState().select(a)
    expect(pasteStyle()).toBe(false)
  })

  it('支持一次粘贴样式到多个气泡', () => {
    const a = addRootBubble({ x: 0, y: 0 }) as string
    const b = addRootBubble({ x: 200, y: 0 }) as string
    const c = addRootBubble({ x: 400, y: 0 }) as string
    useDocStore.getState().commit('改形状', (d) => {
      const node = d.nodes.find((n) => n.id === a)
      if (node) node.shape = 'roundedRect'
    })
    useSelectionStore.getState().select(a)
    copyStyle()
    useSelectionStore.getState().selectMany([b, c])
    pasteStyle()
    expect(nodes().find((n) => n.id === b)?.shape).toBe('roundedRect')
    expect(nodes().find((n) => n.id === c)?.shape).toBe('roundedRect')
  })
})

describe('全选', () => {
  it('只选中当前层级的气泡', () => {
    addRootBubble({ x: 0, y: 0 })
    addRootBubble({ x: 200, y: 0 })
    useDocStore.getState().commit('加专区节点', (d) => {
      d.nodes.push({
        id: 'zoned',
        text: '',
        importance: 50,
        shape: 'circle',
        colorKey: 'default',
        parentIds: [],
        zoneId: 'z1',
        bubblePos: { x: 0, y: 0 },
        createdAt: '',
        updatedAt: ''
      })
    })
    selectAllInLevel()
    expect(useSelectionStore.getState().selectedIds).toHaveLength(2)
  })
})
