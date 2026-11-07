import { describe, expect, it } from 'vitest'
import { HistoryStack } from '@renderer/logic/commands/history'

describe('撤销/重做栈（D12）', () => {
  it('初始不可撤销/重做', () => {
    const h = new HistoryStack<number>()
    expect(h.canUndo).toBe(false)
    expect(h.canRedo).toBe(false)
    expect(h.undo()).toBeNull()
    expect(h.redo()).toBeNull()
  })

  it('撤销回到 before，重做回到 after', () => {
    const h = new HistoryStack<number>()
    h.push('建气泡', 1, 2)
    expect(h.canUndo).toBe(true)
    expect(h.undo()).toBe(1)
    expect(h.canRedo).toBe(true)
    expect(h.redo()).toBe(2)
  })

  it('多步撤销按相反顺序回退', () => {
    const h = new HistoryStack<string>()
    h.push('a', 's0', 's1')
    h.push('b', 's1', 's2')
    h.push('c', 's2', 's3')
    expect(h.undo()).toBe('s2')
    expect(h.undo()).toBe('s1')
    expect(h.undo()).toBe('s0')
    expect(h.canUndo).toBe(false)
  })

  it('新操作会清空重做栈', () => {
    const h = new HistoryStack<number>()
    h.push('a', 0, 1)
    h.push('b', 1, 2)
    h.undo()
    expect(h.canRedo).toBe(true)
    h.push('c', 1, 5)
    expect(h.canRedo).toBe(false)
    expect(h.labels()).toEqual(['a', 'c'])
  })

  it('before === after 时不入栈', () => {
    const h = new HistoryStack<object>()
    const same = {}
    h.push('noop', same, same)
    expect(h.size).toBe(0)
    expect(h.canUndo).toBe(false)
  })

  it('超过上限丢弃最旧记录', () => {
    const h = new HistoryStack<number>(3)
    for (let i = 0; i < 6; i++) h.push(`op${i}`, i, i + 1)
    expect(h.size).toBe(3)
    expect(h.labels()).toEqual(['op3', 'op4', 'op5'])
    expect(h.undo()).toBe(5)
    expect(h.undo()).toBe(4)
    expect(h.undo()).toBe(3)
    expect(h.canUndo).toBe(false)
  })

  it('undoLabel / redoLabel 反映下一步操作', () => {
    const h = new HistoryStack<number>()
    h.push('拖拽移动', 0, 1)
    expect(h.undoLabel).toBe('拖拽移动')
    h.undo()
    expect(h.redoLabel).toBe('拖拽移动')
    expect(h.undoLabel).toBeNull()
  })

  it('clear 重置栈', () => {
    const h = new HistoryStack<number>()
    h.push('a', 0, 1)
    h.clear()
    expect(h.size).toBe(0)
    expect(h.canUndo).toBe(false)
    expect(h.canRedo).toBe(false)
  })
})
