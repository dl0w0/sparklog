import { describe, expect, it } from 'vitest'
import {
  addTaskItem,
  makeTaskItem,
  migrateTaskPayload,
  removeTaskItem,
  taskProgress,
  taskSummary,
  toggleTaskItem,
  updateTaskItem
} from '@shared/logic/tasks'

describe('任务多行（D28）', () => {
  it('旧版单行格式自动迁移为一行条目', () => {
    const migrated = migrateTaskPayload({ text: '旧任务', done: true })
    expect(migrated.items).toHaveLength(1)
    expect(migrated.items[0]).toMatchObject({ text: '旧任务', done: true })
  })

  it('空数据给出一行空任务', () => {
    expect(migrateTaskPayload(undefined).items).toHaveLength(1)
    expect(migrateTaskPayload(null).items[0].text).toBe('')
  })

  it('已有 items 的结构保持', () => {
    const payload = migrateTaskPayload({
      items: [
        { id: 'a', text: '一', done: false },
        { id: 'b', text: '二', done: true }
      ]
    })
    expect(payload.items.map((i) => i.text)).toEqual(['一', '二'])
    expect(payload.items[1].done).toBe(true)
  })

  it('缺失 id 的条目补齐 id', () => {
    const payload = migrateTaskPayload({ items: [{ text: '无 id' }] })
    expect(payload.items[0].id).toBeTruthy()
  })

  it('在指定行后插入新行', () => {
    const base = { items: [makeTaskItem('一', false, 'a'), makeTaskItem('二', false, 'b')] }
    const next = addTaskItem(base, 0, makeTaskItem('插入', false, 'c'))
    expect(next.items.map((i) => i.text)).toEqual(['一', '插入', '二'])
  })

  it('越界索引时追加到末尾', () => {
    const base = { items: [makeTaskItem('一', false, 'a')] }
    expect(addTaskItem(base, 99, makeTaskItem('末', false, 'z')).items).toHaveLength(2)
  })

  it('修改与勾选只影响目标行', () => {
    const base = { items: [makeTaskItem('一', false, 'a'), makeTaskItem('二', false, 'b')] }
    const edited = updateTaskItem(base, 'b', '二改')
    expect(edited.items[1].text).toBe('二改')
    expect(edited.items[0].text).toBe('一')
    const toggled = toggleTaskItem(edited, 'a')
    expect(toggled.items[0].done).toBe(true)
    expect(toggled.items[1].done).toBe(false)
  })

  it('删除行，删空时保留一行', () => {
    const base = { items: [makeTaskItem('一', false, 'a')] }
    expect(removeTaskItem(base, 'a').items).toHaveLength(1)
    expect(removeTaskItem(base, 'a').items[0].text).toBe('')
  })

  it('进度统计与摘要', () => {
    const payload = {
      items: [makeTaskItem('一', true, 'a'), makeTaskItem('二', false, 'b')]
    }
    expect(taskProgress(payload)).toEqual({ done: 1, total: 2 })
    expect(taskSummary(payload)).toContain('1/2')
  })
})
