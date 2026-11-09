/**
 * 气泡结构性操作：把纯函数图算法 + 文档 store 串起来。
 * 不依赖 React，便于在 node 环境测试。
 */

import { IMPORTANCE_DEFAULT } from '@shared/constants'
import type { BubbleNode, Vec2, ViewMode } from '@shared/types/document'
import {
  addChild,
  addParentLink as addParentLinkPure,
  addSibling,
  createBubble,
  deleteBubble,
  deleteBubbleCascade,
  descendantsOf,
  ancestorsOf,
  nodesInZone,
  primaryParentOf,
  setNodeImportance,
  setNodeText,
  subtreeIds,
  uniqueDescendantsOf,
  moveSubtree
} from '@renderer/logic/graph'
import { placeNewChild, placeNewRoot } from '@renderer/logic/layout/bubbleSpawn'
import { computeDepths, depthFontSize, makeRadiusResolver } from '@renderer/logic/nodeVisual'
import { newId } from '@renderer/logic/ids'
import { useDocStore } from '@renderer/store/docStore'
import { getShapeSettings, getTypographySettings } from '@renderer/logic/runtimeSettings'
import { useSelectionStore } from '@renderer/store/selectionStore'
import { currentZoneLevelId } from '@renderer/store/viewportStore'

export interface BubblesInLevel {
  nodes: BubbleNode[]
  mode: ViewMode
}

export function levelNodes(all: readonly BubbleNode[], zoneId: string | null): BubbleNode[] {
  return nodesInZone(all, zoneId)
}

function occupiedOf(nodes: readonly BubbleNode[], mode: ViewMode): { pos: Vec2; radius: number }[] {
  const radiusOf = makeRadiusResolver(nodes, mode)
  return nodes.map((n) => ({ pos: n.bubblePos, radius: radiusOf(n) }))
}

/** 新建子气泡，返回新 id（供 UI 进入编辑态） */
/** 新建对象时把文本编辑器设置快照为默认样式（D91） */
export function defaultTextStyle(
  depth = 0
): { fontFamily?: string; textColor?: string; fontSize?: number } | undefined {
  const typography = getTypographySettings().bubble
  const style: { fontFamily?: string; textColor?: string; fontSize?: number } = {}
  if (typography.fontFamily) style.fontFamily = typography.fontFamily
  if (typography.color) style.textColor = typography.color
  // 字号按层级在创建时定格，已有气泡不随后续设置变化（D91）
  style.fontSize = depthFontSize(depth)
  return style
}

export function addChildBubble(parentId: string): string | null {
  const { doc, commit } = useDocStore.getState()
  const parent = doc.nodes.find((n) => n.id === parentId)
  if (!parent) return null
  const mode = doc.viewMode
  const radiusOf = makeRadiusResolver(doc.nodes, mode)
  const siblings = nodesInZone(doc.nodes, parent.zoneId)
  const pos = placeNewChild(
    parent.bubblePos,
    radiusOf(parent),
    radiusOf(createBubble({ id: 'probe', importance: IMPORTANCE_DEFAULT })),
    occupiedOf(siblings, mode)
  )
  const childDepth = (computeDepths(doc.nodes).get(parentId) ?? 0) + 1
  const child = createBubble({
    id: newId('b'),
    text: '',
    zoneId: parent.zoneId,
    pos,
    shape: doc.theme.overrides?.defaultShape ?? 'circle',
    style: defaultTextStyle(childDepth)
  })
  commit('新建子气泡', (d) => {
    const next = addChild(d.nodes, parentId, child)
    d.nodes = next
  })
  useSelectionStore.getState().startEdit(child.id)
  return child.id
}

/** 新建同级气泡 */
export function addSiblingBubble(siblingId: string): string | null {
  const { doc, commit } = useDocStore.getState()
  const sibling = doc.nodes.find((n) => n.id === siblingId)
  if (!sibling) return null
  const mode = doc.viewMode
  const radiusOf = makeRadiusResolver(doc.nodes, mode)
  const pid = primaryParentOf(sibling)
  let pos: Vec2
  if (pid) {
    const parent = doc.nodes.find((n) => n.id === pid)
    if (!parent) return null
    const mates = nodesInZone(doc.nodes, sibling.zoneId)
    pos = placeNewChild(parent.bubblePos, radiusOf(parent), radiusOf(sibling), occupiedOf(mates, mode))
  } else {
    const mates = nodesInZone(doc.nodes, sibling.zoneId)
    pos = placeNewRoot(
      occupiedOf(mates, mode),
      { x: sibling.bubblePos.x, y: sibling.bubblePos.y + 180 },
      radiusOf(sibling)
    )
  }
  const siblingDepth = computeDepths(doc.nodes).get(siblingId) ?? 0
  const node = createBubble({
    id: newId('b'),
    text: '',
    zoneId: sibling.zoneId,
    pos,
    shape: doc.theme.overrides?.defaultShape ?? 'circle',
    style: defaultTextStyle(siblingDepth)
  })
  commit('新建同级气泡', (d) => {
    d.nodes = addSibling(d.nodes, siblingId, node)
  })
  useSelectionStore.getState().startEdit(node.id)
  return node.id
}

/** 空白处新建主气泡（未显式指定层级时落在当前层级） */
export function addRootBubble(pos: Vec2, zoneId?: string | null): string | null {
  const { doc, commit } = useDocStore.getState()
  const mode = doc.viewMode
  const targetZone = zoneId === undefined ? currentZoneLevelId() : zoneId
  const mates = nodesInZone(doc.nodes, targetZone)
  const radius = makeRadiusResolver(doc.nodes, mode)(createBubble({ id: 'probe' }))
  const placed = mates.length === 0 ? pos : placeNewRoot(occupiedOf(mates, mode), pos, radius)
  const node = createBubble({
    id: newId('b'),
    zoneId: targetZone,
    pos: placed,
    shape: doc.theme.overrides?.defaultShape ?? 'circle',
    style: defaultTextStyle()
  })
  commit('新建主气泡', (d) => {
    d.nodes = [...d.nodes, node]
  })
  useSelectionStore.getState().startEdit(node.id)
  return node.id
}

export interface DeleteOutcome {
  removedIds: string[]
  promotedIds: string[]
}

/** Delete：只删自身，子级升根（D2） */
export function deleteSingleBubble(id: string): DeleteOutcome | null {
  const { doc, commit } = useDocStore.getState()
  if (!doc.nodes.some((n) => n.id === id)) return null
  let outcome: DeleteOutcome = { removedIds: [], promotedIds: [] }
  commit('删除气泡', (d) => {
    const res = deleteBubble(d.nodes, id)
    d.nodes = res.nodes
    d.inserts = d.inserts.filter((i) => i.ownerBubbleId !== id)
    outcome = { removedIds: res.removedIds, promotedIds: res.promotedIds }
  })
  useSelectionStore.getState().clear()
  return outcome
}

/** Shift+Delete：删自身 + 独有后代（D3） */
export function deleteBubbleWithUniqueDescendants(id: string): DeleteOutcome | null {
  const { doc, commit } = useDocStore.getState()
  if (!doc.nodes.some((n) => n.id === id)) return null
  let outcome: DeleteOutcome = { removedIds: [], promotedIds: [] }
  commit('删除气泡及独有后代', (d) => {
    const res = deleteBubbleCascade(d.nodes, id)
    d.nodes = res.nodes
    d.inserts = d.inserts.filter((i) => !res.removedIds.includes(i.ownerBubbleId ?? ''))
    outcome = { removedIds: res.removedIds, promotedIds: res.promotedIds }
  })
  useSelectionStore.getState().clear()
  return outcome
}

export function countUniqueDescendants(id: string): number {
  return uniqueDescendantsOf(useDocStore.getState().doc.nodes, id).length
}

/** 公式栏实时输入：先进入瞬时状态，失焦后一次性入栈（D66） */
export function applyTextTransient(id: string, text: string): void {
  const store = useDocStore.getState()
  store.beginTransient()
  store.applyTransient((d) => {
    d.nodes = setNodeText(d.nodes, id, text, new Date().toISOString())
  })
}

export function commitTransientText(): void {
  useDocStore.getState().pushTransient('编辑文字')
}

export function commitText(id: string, text: string): void {
  const store = useDocStore.getState()
  const node = store.doc.nodes.find((n) => n.id === id)
  if (!node || node.text === text) return
  store.commitMerged('编辑文字', (d) => {
    d.nodes = setNodeText(d.nodes, id, text, new Date().toISOString())
  })
}

/** 滚轮调节重要程度：连续手势，结束后一次入栈（D12） */
export function adjustImportance(id: string, delta: number): void {
  const store = useDocStore.getState()
  const node = store.doc.nodes.find((n) => n.id === id)
  if (!node) return
  const next = Math.max(1, Math.min(100, node.importance + delta))
  if (next === node.importance) return
  store.beginTransient()
  store.applyTransient((d) => {
    d.nodes = setNodeImportance(d.nodes, id, next, new Date().toISOString())
    const target = d.nodes.find((n) => n.id === id)
    if (target) target.importanceOverride = true
  })
}

export function endImportanceGesture(): void {
  useDocStore.getState().pushTransient('调整重要程度')
}

/** 拖拽落位：一次性提交并标脏 */
export function commitMove(ids: string[] | null, id: string, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return
  const { commit } = useDocStore.getState()
  commit('移动气泡', (d) => {
    if (ids && ids.length > 1) {
      const set = new Set(ids)
      d.nodes = d.nodes.map((n) =>
        set.has(n.id)
          ? { ...n, bubblePos: { x: n.bubblePos.x + dx, y: n.bubblePos.y + dy } }
          : n
      )
    } else {
      d.nodes = moveSubtree(d.nodes, id, dx, dy, new Date().toISOString())
    }
  })
}

/** 物理拖拽结束：按绝对坐标一次性提交（含被弹簧带动的邻居） */
export function commitPositionsAbsolute(positions: Map<string, Vec2>): void {
  if (positions.size === 0) return
  const store = useDocStore.getState()
  const now = new Date().toISOString()
  store.commit('移动气泡', (d) => {
    for (const node of d.nodes) {
      const next = positions.get(node.id)
      if (!next) continue
      node.bubblePos = { x: next.x, y: next.y }
      node.updatedAt = now
    }
    // 参与物理的插入对象（关联线另一端）也要落盘（D55）
    for (const insert of d.inserts) {
      const next = positions.get(insert.id)
      if (!next) continue
      insert.pos = { x: next.x, y: next.y }
      insert.updatedAt = now
    }
  })
}

/** 折叠 / 展开子节点（D27） */
export function toggleCollapse(id: string): void {
  const store = useDocStore.getState()
  const node = store.doc.nodes.find((n) => n.id === id)
  if (!node) return
  store.commit(node.collapsed ? '展开子节点' : '折叠子节点', (d) => {
    const target = d.nodes.find((n) => n.id === id)
    if (!target) return
    if (target.collapsed) delete target.collapsed
    else target.collapsed = true
  })
}

export function childCountOf(id: string): number {
  return useDocStore.getState().doc.nodes.filter((n) => n.parentIds.includes(id)).length
}

export function addParentLink(childId: string, parentId: string): { ok: boolean; error?: string } {
  const { doc, commit } = useDocStore.getState()
  const res = addParentLinkPure(doc.nodes, childId, parentId)
  if (!res.ok) {
    const message =
      res.error === 'cycle'
        ? '不能连接到自己或自己的后代。'
        : res.error === 'duplicate'
          ? '这两个气泡已经连接。'
          : res.error === 'cross-zone'
            ? '不能跨专区连接。'
            : '气泡不存在。'
    return { ok: false, error: message }
  }
  const child = doc.nodes.find((n) => n.id === childId)
  const parent = doc.nodes.find((n) => n.id === parentId)
  const initialDistance =
    child && parent
      ? Math.hypot(child.bubblePos.x - parent.bubblePos.x, child.bubblePos.y - parent.bubblePos.y)
      : undefined
  commit('建立连接', (d) => {
    d.nodes = res.nodes
    if (initialDistance !== undefined) {
      const target = d.nodes.find((n) => n.id === childId)
      if (target) target.linkLength = Math.max(1, initialDistance)
    }
  })
  return { ok: true }
}

export function selectBranchSet(kind: 'siblings' | 'uniqueDescendants' | 'descendants' | 'ancestors', id: string): string[] {
  const { doc } = useDocStore.getState()
  const nodes = doc.nodes
  switch (kind) {
    case 'siblings':
      return nodes
        .filter((n) => {
          const self = nodes.find((x) => x.id === id)
          if (!self) return false
          const pid = primaryParentOf(self)
          if (pid === null) return n.parentIds.length === 0 && n.zoneId === self.zoneId
          return n.parentIds[0] === pid
        })
        .map((n) => n.id)
    case 'uniqueDescendants':
      return uniqueDescendantsOf(nodes, id)
    case 'descendants':
      return descendantsOf(nodes, id)
    case 'ancestors':
      return ancestorsOf(nodes, id)
    default:
      return []
  }
}

export function subtreeOf(id: string): string[] {
  return subtreeIds(useDocStore.getState().doc.nodes, id)
}

/** 批量删除（每个都按「只删自身、子级升根」规则处理） */
export function deleteManyBubbles(ids: readonly string[]): number {
  const store = useDocStore.getState()
  let remaining = store.doc.nodes
  const removed = new Set<string>()
  for (const id of ids) {
    if (!remaining.some((n) => n.id === id)) continue
    const res = deleteBubble(remaining, id)
    remaining = res.nodes
    res.removedIds.forEach((r) => removed.add(r))
  }
  if (removed.size === 0) return 0
  store.commit('批量删除', (d) => {
    d.nodes = remaining
    d.inserts = d.inserts.filter((i) => !removed.has(i.ownerBubbleId ?? ''))
  })
  useSelectionStore.getState().clear()
  return removed.size
}

/** 批量调整重要程度（一次入栈） */
export function adjustImportanceMany(ids: readonly string[], delta: number): void {
  const store = useDocStore.getState()
  const set = new Set(ids)
  store.commit('批量调整重要程度', (d) => {
    for (const node of d.nodes) {
      if (!set.has(node.id)) continue
      node.importance = Math.max(1, Math.min(100, node.importance + delta))
      node.importanceOverride = true
    }
  })
}

/** 批量改形状/配色（形状面板与主题面板复用） */
export function setStyleMany(
  ids: readonly string[],
  patch: {
    shape?: BubbleNode['shape']
    colorKey?: string
    fontFamily?: string
    fontSize?: number
    bold?: boolean
    italic?: boolean
    underline?: boolean
    textColor?: string
    highlight?: string
  }
): void {
  const store = useDocStore.getState()
  const set = new Set(ids)
  store.commit('修改气泡样式', (d) => {
    for (const node of d.nodes) {
      if (!set.has(node.id)) continue
      if (patch.shape) {
        node.shape = patch.shape
        node.style = { ...(node.style ?? {}), shape: patch.shape }
      }
      if (patch.colorKey) {
        node.colorKey = patch.colorKey
        node.style = { ...(node.style ?? {}), colorKey: patch.colorKey }
      }
      const extra: Record<string, unknown> = {}
      for (const key of ['fontFamily', 'fontSize', 'bold', 'italic', 'underline', 'textColor', 'highlight'] as const) {
        if (patch[key] !== undefined) extra[key] = patch[key]
      }
      if (Object.keys(extra).length > 0) {
        node.style = { ...(node.style ?? {}), ...extra }
      }
    }
  })
}
