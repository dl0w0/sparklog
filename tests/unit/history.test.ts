import { describe, expect, it } from 'vitest'
import { HistoryStack } from '@renderer/logic/commands/history'
import { HISTORY_LIMIT } from '@shared/constants'

describe('撤销栈（D94）', () => {
  it('栈上限提升到 500', () => {
    expect(HISTORY_LIMIT).toBe(500)
    const stack = new HistoryStack<number>()
    for (let i = 0; i < 600; i++) stack.push(`op${i}`, i, i + 1)
    expect(stack.size).toBe(500)
    // 保留最近 500 步：最早保留的是 op100
    expect(stack.labels()[0]).toBe('op100')
    expect(stack.labels()[499]).toBe('op599')
  })

  it('连续撤销可以一直回溯到最早一步', () => {
    const stack = new HistoryStack<number>()
    stack.push('a', 0, 1)
    stack.push('b', 1, 2)
    stack.push('c', 2, 3)
    expect(stack.undo()).toBe(2)
    expect(stack.undo()).toBe(1)
    expect(stack.undo()).toBe(0)
    expect(stack.undo()).toBeNull()
    expect(stack.canUndo).toBe(false)
  })

  it('重做按顺序前进，直到最新一步', () => {
    const stack = new HistoryStack<number>()
    stack.push('a', 0, 1)
    stack.push('b', 1, 2)
    stack.undo()
    stack.undo()
    expect(stack.redo()).toBe(1)
    expect(stack.redo()).toBe(2)
    expect(stack.redo()).toBeNull()
    expect(stack.canRedo).toBe(false)
  })

  it('撤销后执行新操作会清空重做栈', () => {
    const stack = new HistoryStack<number>()
    stack.push('a', 0, 1)
    stack.push('b', 1, 2)
    stack.undo()
    expect(stack.canRedo).toBe(true)
    stack.push('c', 1, 9)
    expect(stack.canRedo).toBe(false)
    expect(stack.labels()).toEqual(['a', 'c'])
  })

  it('无变化的操作不入栈', () => {
    const stack = new HistoryStack<number>()
    stack.push('noop', 5, 5)
    expect(stack.size).toBe(0)
  })
})
