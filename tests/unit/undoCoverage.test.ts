import { beforeEach, describe, expect, it } from 'vitest'
import { useDocStore } from '@renderer/store/docStore'
import { useSelectionStore } from '@renderer/store/selectionStore'
import { addChildBubble, addRootBubble, commitText, setStyleMany } from '@renderer/actions/bubbleActions'
import { addInsert, updateNote } from '@renderer/actions/insertActions'
import { createZoneAt } from '@renderer/actions/zoneActions'
import { changeFontSize } from '@renderer/actions/fontActions'
import { applyRunStyle } from '@renderer/logic/richText'
import { setEdgeColor } from '@renderer/actions/edgeActions'
import { buildViewEdges } from '@renderer/logic/links'
import { createDefaultSettings } from '@shared/types/settings'
import { setRuntimeSettings } from '@renderer/logic/runtimeSettings'
import type { SparklogFile } from '@shared/types/document'

const doc = (): SparklogFile => useDocStore.getState().doc

describe('撤销覆盖全部操作类型（D94）', () => {
  beforeEach(() => {
    setRuntimeSettings(createDefaultSettings())
    useDocStore.getState().newDocument()
    useSelectionStore.getState().clear()
  })

  it('建气泡 → 改文字 → 改样式 → 改字号 可以逐步撤销并逐步重做', () => {
    const rootId = addRootBubble({ x: 0, y: 0 }) as string
    commitText(rootId, '原始文字')
    setStyleMany([rootId], { colorKey: 'mint' })
    useSelectionStore.getState().selectMany([rootId])
    changeFontSize(1)

    expect(doc().nodes[0].text).toBe('原始文字')
    expect(doc().nodes[0].style?.fontSize).toBeDefined()

    // 逐步撤销
    // 撤销：字号 → 颜色 → 新建（新建与首次输入文字合并为一步）
    useDocStore.getState().undo()
    expect(doc().nodes[0].style?.fontSize).toBe(20)
    useDocStore.getState().undo()
    expect(doc().nodes[0].colorKey).not.toBe('mint')
    useDocStore.getState().undo()
    expect(doc().nodes).toHaveLength(0)
    expect(useDocStore.getState().canUndo).toBe(false)

    // 逐步重做回到最新一步
    useDocStore.getState().redo()
    expect(doc().nodes).toHaveLength(1)
    useDocStore.getState().redo()
    expect(doc().nodes[0].colorKey).toBe('mint')
    useDocStore.getState().redo()
    expect(doc().nodes[0].style?.fontSize).toBeGreaterThan(20)
    expect(useDocStore.getState().canRedo).toBe(false)
  })

  it('插入项与专区也可撤销/重做', () => {
    const rootId = addRootBubble({ x: 0, y: 0 }) as string
    const insertId = addInsert('note', rootId)
    updateNote(insertId, { title: '笔记标题' })
    createZoneAt({ x: 200, y: 200, w: 300, h: 200 })

    expect(doc().inserts).toHaveLength(1)
    expect(doc().zones).toHaveLength(1)

    useDocStore.getState().undo()
    expect(doc().zones).toHaveLength(0)
    useDocStore.getState().undo()
    expect(doc().inserts[0].note?.title).toBe('笔记')
    useDocStore.getState().undo()
    expect(doc().inserts).toHaveLength(0)
  })

  it('富文本区间样式可撤销', () => {
    const rootId = addRootBubble({ x: 0, y: 0 }) as string
    commitText(rootId, '一段文字')
    useDocStore.getState().commit('选区加粗', (draft) => {
      const node = draft.nodes.find((n) => n.id === rootId)!
      node.runs = applyRunStyle(node.runs, 0, 2, { bold: true })
    })
    expect(doc().nodes[0].runs).toHaveLength(1)
    useDocStore.getState().undo()
    expect(doc().nodes[0].runs ?? []).toHaveLength(0)
    useDocStore.getState().redo()
    expect(doc().nodes[0].runs).toHaveLength(1)
  })

  it('连线样式可撤销', () => {
    const rootId = addRootBubble({ x: 0, y: 0 }) as string
    const childId = addChildBubble(rootId) as string
    const edge = buildViewEdges(doc()).find((e) => e.to === childId)!
    setEdgeColor(edge, '#ff0000')
    expect(doc().edgeStyles[edge.id]?.color).toBe('#ff0000')
    useDocStore.getState().undo()
    expect(doc().edgeStyles[edge.id]?.color).toBeUndefined()
  })

  it('撤销后执行新操作会清空重做栈', () => {
    addRootBubble({ x: 0, y: 0 })
    addRootBubble({ x: 300, y: 0 })
    expect(doc().nodes).toHaveLength(2)

    useDocStore.getState().undo()
    expect(doc().nodes).toHaveLength(1)
    expect(useDocStore.getState().canRedo).toBe(true)

    // 新操作：再建一个气泡
    addRootBubble({ x: 600, y: 0 })
    expect(doc().nodes).toHaveLength(2)
    expect(useDocStore.getState().canRedo).toBe(false)
  })

  it('可连续撤销回本次会话最早一步', () => {
    useDocStore.getState().resetHistory()
    const ids: string[] = []
    for (let i = 0; i < 8; i++) ids.push(addRootBubble({ x: i * 200, y: 0 }) as string)
    expect(doc().nodes).toHaveLength(8)
    for (let i = 0; i < 8; i++) useDocStore.getState().undo()
    expect(doc().nodes).toHaveLength(0)
    expect(useDocStore.getState().canUndo).toBe(false)
  })
})
