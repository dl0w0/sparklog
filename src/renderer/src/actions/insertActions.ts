/** 插入对象：笔记 / 任务 / 附件 / 图片（D26 / D28 / D29）。 */

import { LINK_GAP } from '@shared/constants'
import type { BubbleNode, InsertKind, InsertObject, Link, TaskItem, Vec2 } from '@shared/types/document'
import { addTaskItem, makeTaskItem, removeTaskItem, toggleTaskItem, updateTaskItem } from '@shared/logic/tasks'
import { newId } from '@renderer/logic/ids'
import { makeRadiusResolver, radiusOf } from '@renderer/logic/nodeVisual'
import { useDocStore } from '@renderer/store/docStore'
import { useSelectionStore } from '@renderer/store/selectionStore'
import { ROOT_LEVEL, useViewportStore } from '@renderer/store/viewportStore'

export function currentZoneId(): string | null {
  const levelId = useViewportStore.getState().levelId
  return levelId === ROOT_LEVEL ? null : levelId
}

/** 附着且未展开的对象贴在气泡角上；其余使用自身坐标 */
export function insertDisplayPos(
  insert: InsertObject,
  nodes: readonly BubbleNode[],
  mode: 'bubble' | 'mindmap' = 'bubble'
): Vec2 {
  if (!insert.ownerBubbleId || insert.expanded) return insert.pos
  const owner = nodes.find((n) => n.id === insert.ownerBubbleId)
  if (!owner) return insert.pos
  const r = radiusOf(owner, mode)
  const siblings = owner.id
  void siblings
  return { x: owner.bubblePos.x + r * 0.78, y: owner.bubblePos.y + r * 0.78 }
}

export function addInsert(kind: InsertKind, ownerBubbleId: string | null, pos?: Vec2): string {
  const store = useDocStore.getState()
  const zoneId = currentZoneId()
  const owner = ownerBubbleId ? store.doc.nodes.find((n) => n.id === ownerBubbleId) : null
  const id = newId('i')
  const basePos = pos ?? (owner ? { x: owner.bubblePos.x + 60, y: owner.bubblePos.y + 60 } : { x: 0, y: 0 })
  const now = new Date().toISOString()
  const insert: InsertObject = {
    id,
    kind,
    zoneId,
    ownerBubbleId: ownerBubbleId ?? null,
    pos: basePos,
    // 落在鼠标点击处的独立对象直接可见；附着在气泡上的默认折叠成图标
    expanded: ownerBubbleId ? false : true,
    pinned: false,
    createdAt: now,
    updatedAt: now
  }
  if (kind === 'note') insert.note = { title: '笔记', content: '' }
  if (kind === 'task') insert.task = { items: [makeTaskItem('新任务')] }
  store.commit('插入' + kind, (d) => {
    d.inserts = [...d.inserts, insert]
  })
  useSelectionStore.getState().select(ownerBubbleId)
  return id
}

export function addAttachment(
  ownerBubbleId: string | null,
  file: { path: string; name: string; ext: string },
  pos?: Vec2
): string {
  const store = useDocStore.getState()
  const id = newId('i')
  const now = new Date().toISOString()
  const owner = ownerBubbleId ? store.doc.nodes.find((n) => n.id === ownerBubbleId) : null
  store.commit('插入附件', (d) => {
    d.inserts = [
      ...d.inserts,
      {
        id,
        kind: 'attachment',
        zoneId: currentZoneId(),
        ownerBubbleId: ownerBubbleId ?? null,
        pos: pos ?? (owner ? { x: owner.bubblePos.x + 80, y: owner.bubblePos.y + 40 } : { x: 0, y: 0 }),
        expanded: ownerBubbleId ? false : true,
        pinned: false,
        attachment: file,
        createdAt: now,
        updatedAt: now
      }
    ]
  })
  return id
}

export function addImage(
  ownerBubbleId: string | null,
  file: { path: string; name: string; w: number; h: number },
  pos?: Vec2
): string {
  const store = useDocStore.getState()
  const id = newId('i')
  const now = new Date().toISOString()
  const owner = ownerBubbleId ? store.doc.nodes.find((n) => n.id === ownerBubbleId) : null
  store.commit('插入图片', (d) => {
    d.inserts = [
      ...d.inserts,
      {
        id,
        kind: 'image',
        zoneId: currentZoneId(),
        ownerBubbleId: ownerBubbleId ?? null,
        pos: pos ?? (owner ? { x: owner.bubblePos.x + 90, y: owner.bubblePos.y } : { x: 0, y: 0 }),
        expanded: ownerBubbleId ? false : true,
        pinned: false,
        image: { path: file.path, name: file.name, w: file.w, h: file.h },
        createdAt: now,
        updatedAt: now
      }
    ]
  })
  return id
}

/** 拖动插入对象：落到新位置并钉住，避免跟气泡乱跑 */
export function moveInsert(id: string, pos: Vec2): void {
  useDocStore.getState().commit('移动插入对象', (d) => {
    const item = d.inserts.find((i) => i.id === id)
    if (!item) return
    item.pos = { x: pos.x, y: pos.y }
    item.pinned = true
    item.expanded = true
    item.updatedAt = new Date().toISOString()
  })
}

/** 折叠 / 展开附着对象（D26） */
export function setInsertExpanded(id: string, expanded: boolean): void {
  const store = useDocStore.getState()
  const item = store.doc.inserts.find((i) => i.id === id)
  const owner = item?.ownerBubbleId ? store.doc.nodes.find((n) => n.id === item.ownerBubbleId) : null
  const anchor = owner && !item?.pinned ? { x: owner.bubblePos.x + radiusOf(owner, store.doc.viewMode) + 130, y: owner.bubblePos.y - 20 } : null
  store.commit(expanded ? '展开插入对象' : '收起插入对象', (d) => {
    const target = d.inserts.find((i) => i.id === id)
    if (!target) return
    target.expanded = expanded
    if (expanded && anchor && !target.pinned) target.pos = anchor
    target.updatedAt = new Date().toISOString()
  })
}

export function updateNote(id: string, patch: { title?: string; content?: string }): void {
  useDocStore.getState().commit('编辑笔记', (d) => {
    const item = d.inserts.find((i) => i.id === id)
    if (!item) return
    item.note = { ...(item.note ?? { title: '', content: '' }), ...patch }
    item.updatedAt = new Date().toISOString()
  })
}

// —— 任务多行（D28） ——

export function addTaskLine(id: string, afterItemId?: string): string | null {
  const store = useDocStore.getState()
  const item = store.doc.inserts.find((i) => i.id === id)
  if (!item?.task) return null
  const newItem = makeTaskItem('')
  const index = afterItemId ? item.task.items.findIndex((it) => it.id === afterItemId) : item.task.items.length - 1
  store.commit('新增任务行', (d) => {
    const target = d.inserts.find((i) => i.id === id)
    if (!target?.task) return
    target.task = addTaskItem(target.task, index, newItem)
    target.updatedAt = new Date().toISOString()
  })
  return newItem.id
}

export function updateTaskLine(id: string, itemId: string, text: string): void {
  useDocStore.getState().commit('编辑任务', (d) => {
    const target = d.inserts.find((i) => i.id === id)
    if (!target?.task) return
    target.task = updateTaskItem(target.task, itemId, text)
    target.updatedAt = new Date().toISOString()
  })
}

export function toggleTaskLine(id: string, itemId: string): void {
  useDocStore.getState().commit('勾选任务', (d) => {
    const target = d.inserts.find((i) => i.id === id)
    if (!target?.task) return
    target.task = toggleTaskItem(target.task, itemId)
    target.updatedAt = new Date().toISOString()
  })
}

export function removeTaskLine(id: string, itemId: string): void {
  useDocStore.getState().commit('删除任务行', (d) => {
    const target = d.inserts.find((i) => i.id === id)
    if (!target?.task) return
    target.task = removeTaskItem(target.task, itemId)
    target.updatedAt = new Date().toISOString()
  })
}

export function toggleTask(id: string): void {
  const store = useDocStore.getState()
  const item = store.doc.inserts.find((i) => i.id === id)
  const first: TaskItem | undefined = item?.task?.items[0]
  if (!item || !first) return
  toggleTaskLine(id, first.id)
}

export function togglePin(id: string): void {
  const store = useDocStore.getState()
  const item = store.doc.inserts.find((i) => i.id === id)
  if (!item) return
  const pos = insertDisplayPos(item, store.doc.nodes)
  store.commit('钉住切换', (d) => {
    const target = d.inserts.find((i) => i.id === id)
    if (!target) return
    const willPin = !target.pinned
    target.pinned = willPin
    if (willPin) {
      // 钉住：固定在当前画布坐标，与其相连的连线长度自由伸缩（D54）
      target.pos = pos
      target.expanded = true
    } else {
      // 取消钉住：连线长度立即恢复为默认值或用户设定值（D55）
      restoreLinkedLengths(d, id)
    }
    target.updatedAt = new Date().toISOString()
  })
}

/**
 * 取消钉住：把相连连线的长度恢复为「默认长度」或「钉住前用户设置的长度」（D55）。
 * 只改长度，不瞬移对象——之后由弹簧把对象顺滑地拉到目标距离，避免闪跳。
 */
function restoreLinkedLengths(
  d: { nodes: BubbleNode[]; inserts: InsertObject[]; links?: Link[] },
  insertId: string
): void {
  const radiusOfNode = makeRadiusResolver(d.nodes, 'bubble')
  for (const link of d.links ?? []) {
    const isFrom = link.from === insertId
    const isTo = link.to === insertId
    if (!isFrom && !isTo) continue
    if (typeof link.length === 'number' && link.length > 0) continue // 恢复用户设定值（保持不变）
    const otherId = isFrom ? link.to : link.from
    const otherNode = d.nodes.find((n) => n.id === otherId)
    const otherRadius = otherNode ? radiusOfNode(otherNode) : 34
    link.length = Math.max(1, 34 + otherRadius + LINK_GAP)
  }
}

export function removeInsert(id: string): void {
  useDocStore.getState().commit('删除插入对象', (d) => {
    d.inserts = d.inserts.filter((i) => i.id !== id)
  })
}

export function insertsOf(levelId: string | null): InsertObject[] {
  const zoneId = levelId === ROOT_LEVEL ? null : levelId
  return useDocStore.getState().doc.inserts.filter((i) => i.zoneId === zoneId)
}

/** 选择本地文件并作为附件插入 */
export async function pickAndAttach(ownerBubbleId: string | null, pos?: Vec2): Promise<boolean> {
  const { api } = await import('@renderer/services/bridge')
  const picked = await api().pickFile([
    { name: '常见文件', extensions: ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf', 'png', 'jpg', 'txt'] }
  ])
  if (picked.canceled || !picked.filePath) return false
  const name = picked.filePath.split(/[\\/]/).pop() ?? 'file'
  addAttachment(ownerBubbleId, { path: picked.filePath, name, ext: name.split('.').pop() ?? '' }, pos)
  return true
}
