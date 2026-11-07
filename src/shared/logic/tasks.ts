/** 任务多行条目（D28）：纯函数，含旧格式迁移。 */

import type { TaskItem, TaskPayload } from '@shared/types/document'

export function makeTaskItem(text = '', done = false, id?: string): TaskItem {
  return { id: id ?? `t${Math.random().toString(36).slice(2, 9)}`, text, done }
}

/** 旧版单行 `{ text, done }` 自动升级为一行条目 */
export function migrateTaskPayload(raw: unknown): TaskPayload {
  if (raw && typeof raw === 'object') {
    const obj = raw as { items?: unknown; text?: unknown; done?: unknown }
    if (Array.isArray(obj.items)) {
      const items: TaskItem[] = obj.items
        .filter((it): it is Record<string, unknown> => typeof it === 'object' && it !== null)
        .map((it, index) => ({
          id: typeof it.id === 'string' && it.id ? it.id : `t${index}`,
          text: typeof it.text === 'string' ? it.text : '',
          done: Boolean(it.done)
        }))
      if (items.length > 0) return { items }
    }
    if (typeof obj.text === 'string') {
      return { items: [{ id: 't0', text: obj.text, done: Boolean(obj.done) }] }
    }
  }
  return { items: [makeTaskItem()] }
}

export function addTaskItem(payload: TaskPayload, afterIndex: number, item: TaskItem): TaskPayload {
  const items = [...payload.items]
  const at = Math.max(0, Math.min(items.length, afterIndex + 1))
  items.splice(at, 0, item)
  return { items }
}

export function updateTaskItem(payload: TaskPayload, id: string, text: string): TaskPayload {
  return { items: payload.items.map((it) => (it.id === id ? { ...it, text } : it)) }
}

export function toggleTaskItem(payload: TaskPayload, id: string): TaskPayload {
  return { items: payload.items.map((it) => (it.id === id ? { ...it, done: !it.done } : it)) }
}

/** 删除一行；至少保留一行 */
export function removeTaskItem(payload: TaskPayload, id: string): TaskPayload {
  const items = payload.items.filter((it) => it.id !== id)
  return { items: items.length > 0 ? items : [makeTaskItem()] }
}

export function taskProgress(payload: TaskPayload): { done: number; total: number } {
  return {
    done: payload.items.filter((it) => it.done).length,
    total: payload.items.length
  }
}

/** 卡片摘要（折叠成图标时的提示文案） */
export function taskSummary(payload: TaskPayload): string {
  const { done, total } = taskProgress(payload)
  const first = payload.items.find((it) => !it.done) ?? payload.items[0]
  return `${done}/${total} ${first?.text ?? ''}`.trim()
}
