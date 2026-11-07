import { beforeEach, describe, expect, it } from 'vitest'
import { useDocStore, historySize } from '@renderer/store/docStore'
import { useSelectionStore } from '@renderer/store/selectionStore'
import { createBubble } from '@renderer/logic/graph'

beforeEach(() => {
  useDocStore.getState().newDocument()
  useSelectionStore.getState().clear()
  useSelectionStore.getState().setIsolate(null)
})

describe('文档 store：修改与脏标记', () => {
  it('新建文档是干净的', () => {
    const s = useDocStore.getState()
    expect(s.dirty).toBe(false)
    expect(s.doc.nodes).toHaveLength(0)
    expect(s.canUndo).toBe(false)
  })

  it('commit 产生新文档、标脏并入栈', () => {
    const store = useDocStore.getState()
    store.commit('新建主气泡', (d) => {
      d.nodes.push(createBubble({ id: 'a' }))
    })
    const s = useDocStore.getState()
    expect(s.doc.nodes).toHaveLength(1)
    expect(s.dirty).toBe(true)
    expect(s.canUndo).toBe(true)
    expect(s.undoLabel).toBe('新建主气泡')
  })

  it('无实际变化时不入栈', () => {
    useDocStore.getState().commit('空操作', () => undefined)
    expect(historySize()).toBe(0)
    expect(useDocStore.getState().dirty).toBe(false)
  })

  it('撤销与重做恢复文档', () => {
    const store = useDocStore.getState()
    store.commit('加一个', (d) => {
      d.nodes.push(createBubble({ id: 'a' }))
    })
    store.commit('加第二个', (d) => {
      d.nodes.push(createBubble({ id: 'b' }))
    })
    useDocStore.getState().undo()
    expect(useDocStore.getState().doc.nodes).toHaveLength(1)
    useDocStore.getState().undo()
    expect(useDocStore.getState().doc.nodes).toHaveLength(0)
    useDocStore.getState().redo()
    expect(useDocStore.getState().doc.nodes).toHaveLength(1)
  })

  it('切换视图写入 viewMode 并入栈', () => {
    useDocStore.getState().setViewMode('mindmap')
    expect(useDocStore.getState().doc.viewMode).toBe('mindmap')
    expect(useDocStore.getState().dirty).toBe(true)
    useDocStore.getState().undo()
    expect(useDocStore.getState().doc.viewMode).toBe('bubble')
  })

  it('markSaved 清除脏标记并记录路径', () => {
    useDocStore.getState().commit('改', (d) => {
      d.viewMode = 'mindmap'
    })
    useDocStore.getState().markSaved('C:/tmp/a.insp')
    const s = useDocStore.getState()
    expect(s.dirty).toBe(false)
    expect(s.filePath).toBe('C:/tmp/a.insp')
    expect(s.status).toBe('saved')
  })

  it('加载文档重置历史与脏标记', () => {
    useDocStore.getState().commit('改', (d) => {
      d.viewMode = 'mindmap'
    })
    useDocStore.getState().loadDocument(createEmpty(), 'C:/b.insp')
    expect(useDocStore.getState().canUndo).toBe(false)
    expect(useDocStore.getState().dirty).toBe(false)
    expect(useDocStore.getState().filePath).toBe('C:/b.insp')
  })

  it('commitMerged 把首次文字输入并入新建操作', () => {
    useDocStore.getState().commit('新建主气泡', (d) => {
      d.nodes.push(createBubble({ id: 'a' }))
    })
    useDocStore.getState().commitMerged('编辑文字', (d) => {
      d.nodes[0].text = '你好'
    })
    expect(historySize()).toBe(1)
    expect(useDocStore.getState().doc.nodes[0].text).toBe('你好')
    useDocStore.getState().undo()
    expect(useDocStore.getState().doc.nodes).toHaveLength(0)
  })

  it('瞬时修改不入栈，pushTransient 一次性入栈', () => {
    useDocStore.getState().commit('新建', (d) => {
      d.nodes.push(createBubble({ id: 'a', importance: 50 }))
    })
    const before = historySize()
    useDocStore.getState().beginTransient()
    useDocStore.getState().applyTransient((d) => {
      d.nodes[0].importance = 60
    })
    useDocStore.getState().applyTransient((d) => {
      d.nodes[0].importance = 70
    })
    expect(historySize()).toBe(before)
    expect(useDocStore.getState().doc.nodes[0].importance).toBe(70)
    useDocStore.getState().pushTransient('调整重要程度')
    expect(historySize()).toBe(before + 1)
    useDocStore.getState().undo()
    expect(useDocStore.getState().doc.nodes[0].importance).toBe(50)
  })
})

function createEmpty() {
  const s = useDocStore.getState()
  const doc = { ...s.doc, nodes: [], viewMode: 'bubble' as const }
  return doc
}
