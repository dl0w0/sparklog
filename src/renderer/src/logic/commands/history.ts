/**
 * 撤销栈（D12）：按「操作」粒度记录，不记录逐字符输入。
 *
 * 采用快照式命令：一次操作保存 before/after 两份文档快照。
 * 文档不可变（每次修改产生新对象），因此快照之间共享大部分结构，内存开销可接受。
 */

import { HISTORY_LIMIT } from '@shared/constants'

export interface HistoryEntry<T> {
  label: string
  before: T
  after: T
}

export class HistoryStack<T> {
  private entries: HistoryEntry<T>[] = []
  private cursor = -1
  private readonly limit: number

  constructor(limit: number = HISTORY_LIMIT) {
    this.limit = Math.max(1, limit)
  }

  get size(): number {
    return this.entries.length
  }

  get canUndo(): boolean {
    return this.cursor >= 0
  }

  get canRedo(): boolean {
    return this.cursor < this.entries.length - 1
  }

  get undoLabel(): string | null {
    return this.canUndo ? this.entries[this.cursor].label : null
  }

  get redoLabel(): string | null {
    return this.canRedo ? this.entries[this.cursor + 1].label : null
  }

  /** 记录一次操作；会清空重做栈 */
  push(label: string, before: T, after: T): void {
    if (before === after) return
    if (this.cursor < this.entries.length - 1) {
      this.entries = this.entries.slice(0, this.cursor + 1)
    }
    this.entries.push({ label, before, after })
    if (this.entries.length > this.limit) {
      this.entries.shift()
    }
    this.cursor = this.entries.length - 1
  }

  /** 用新的 after 覆盖栈顶（用于「新建气泡 + 首次输入文字」合并成一次撤销） */
  amendTop(after: T): boolean {
    if (this.cursor < 0) return false
    // 撤销之后再改：不能并入旧记录，必须作为新操作（D94）
    if (this.canRedo) return false
    const entry = this.entries[this.cursor]
    if (!entry) return false
    this.entries[this.cursor] = { ...entry, after }
    return true
  }

  /** 撤销一步，返回应恢复的状态；无可用撤销时返回 null */
  undo(): T | null {
    if (!this.canUndo) return null
    const entry = this.entries[this.cursor]
    this.cursor -= 1
    return entry.before
  }

  /** 重做一步，返回应恢复的状态 */
  redo(): T | null {
    if (!this.canRedo) return null
    this.cursor += 1
    return this.entries[this.cursor].after
  }

  clear(): void {
    this.entries = []
    this.cursor = -1
  }

  /** 当前栈内容快照（测试与调试用） */
  labels(): string[] {
    return this.entries.map((e) => e.label)
  }
}
