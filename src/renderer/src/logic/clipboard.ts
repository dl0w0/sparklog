/**
 * 剪贴板逻辑（D17）：复制 / 剪切 / 粘贴的纯数据变换。
 *
 * 关键规则：
 * - 复制：把选中节点连同其全部后代打包。
 * - 剪切：独有子气泡一起被剪走；共享子气泡留在画布，只记录「它与被剪节点的连接」，
 *   粘贴时再重建这条连接。
 */

import type { BubbleNode } from '@shared/types/document'
import { descendantsOf, uniqueDescendantsOf } from './graph'

export interface ExternalLink {
  /** 留在画布上的共享子节点 */
  childId: string
  /** 被剪走、粘贴后会重新生成的父节点（剪贴板内的 id） */
  parentId: string
}

export interface ClipboardPayload {
  nodes: BubbleNode[]
  /** 载荷内的根节点 id（其父不在载荷内） */
  rootIds: string[]
  zoneId: string | null
  externalLinks: ExternalLink[]
  cut: boolean
}

function unionSubtrees(nodes: readonly BubbleNode[], ids: readonly string[]): Set<string> {
  const result = new Set<string>()
  for (const id of ids) {
    if (!nodes.some((n) => n.id === id)) continue
    result.add(id)
    for (const d of descendantsOf(nodes, id)) result.add(d)
  }
  return result
}

function pickRoots(nodes: readonly BubbleNode[], set: Set<string>): string[] {
  return [...set].filter((id) => {
    const node = nodes.find((n) => n.id === id)
    if (!node) return false
    return node.parentIds.every((p) => !set.has(p))
  })
}

/** 复制：打包选中节点及其全部后代 */
export function copyPayload(
  nodes: readonly BubbleNode[],
  ids: readonly string[],
  zoneId: string | null = null
): ClipboardPayload | null {
  const set = unionSubtrees(nodes, ids)
  if (set.size === 0) return null
  const picked = nodes.filter((n) => set.has(n.id)).map((n) => ({ ...n, parentIds: [...n.parentIds] }))
  return {
    nodes: picked,
    rootIds: pickRoots(nodes, set),
    zoneId,
    externalLinks: [],
    cut: false
  }
}

export interface CutResult {
  payload: ClipboardPayload
  nodes: BubbleNode[]
  removedIds: string[]
  promotedIds: string[]
}

/**
 * 剪切：剪走选中节点与其「独有后代」；
 * 共享子节点保留在画布上，只记录连接用于粘贴时重建。
 */
export function cutPayload(
  nodes: readonly BubbleNode[],
  ids: readonly string[],
  zoneId: string | null = null
): CutResult | null {
  const existing = ids.filter((id) => nodes.some((n) => n.id === id))
  if (existing.length === 0) return null

  const removed = new Set<string>()
  for (const id of existing) {
    removed.add(id)
    for (const d of uniqueDescendantsOf(nodes, id)) removed.add(d)
  }

  const externalLinks: ExternalLink[] = []
  const remaining: BubbleNode[] = []
  const promotedIds: string[] = []

  for (const n of nodes) {
    if (removed.has(n.id)) continue
    if (n.parentIds.some((p) => removed.has(p))) {
      for (const p of n.parentIds) if (removed.has(p)) externalLinks.push({ childId: n.id, parentId: p })
      const next = n.parentIds.filter((p) => !removed.has(p))
      if (next.length === 0) promotedIds.push(n.id)
      remaining.push({ ...n, parentIds: next })
    } else {
      remaining.push(n)
    }
  }

  const picked = nodes
    .filter((n) => removed.has(n.id))
    .map((n) => ({
      ...n,
      parentIds: n.parentIds.filter((p) => removed.has(p))
    }))

  const payload: ClipboardPayload = {
    nodes: picked,
    rootIds: pickRoots(nodes, removed),
    zoneId,
    externalLinks,
    cut: true
  }
  return { payload, nodes: remaining, removedIds: [...removed], promotedIds }
}

export interface PasteResult {
  nodes: BubbleNode[]
  newRootIds: string[]
  /** 需要重建的外部连接：把粘贴后的新节点连回画布上原有的共享子节点 */
  relinked: { childId: string; newParentId: string }[]
}

/**
 * 粘贴：重建 id、把根节点接到目标父气泡（或独立摆放），并重建剪切时记录的共享连接。
 */
export function pastePayload(
  current: readonly BubbleNode[],
  payload: ClipboardPayload,
  opts: {
    targetParentId: string | null
    zoneId: string | null
    offset: { x: number; y: number }
    makeId: () => string
    now?: string
  }
): PasteResult {
  const now = opts.now ?? new Date().toISOString()
  const idMap = new Map<string, string>()
  for (const n of payload.nodes) idMap.set(n.id, opts.makeId())

  const target = opts.targetParentId
    ? current.find((n) => n.id === opts.targetParentId) ?? null
    : null
  const basePos = target
    ? target.bubblePos
    : payload.nodes.find((n) => payload.rootIds.includes(n.id))?.bubblePos ?? { x: 0, y: 0 }
  const shift = { x: basePos.x + opts.offset.x, y: basePos.y + opts.offset.y }
  const originRoot = payload.nodes.find((n) => payload.rootIds.includes(n.id))

  const created: BubbleNode[] = payload.nodes.map((n) => {
    const mappedParents = n.parentIds.map((p) => idMap.get(p)).filter((p): p is string => Boolean(p))
    const isRoot = payload.rootIds.includes(n.id)
    const pos = originRoot
      ? {
          x: shift.x + (n.bubblePos.x - originRoot.bubblePos.x),
          y: shift.y + (n.bubblePos.y - originRoot.bubblePos.y)
        }
      : { ...n.bubblePos }
    return {
      ...n,
      id: idMap.get(n.id) as string,
      parentIds: isRoot && target ? [target.id, ...mappedParents] : mappedParents,
      zoneId: opts.zoneId ?? payload.zoneId,
      bubblePos: pos,
      createdAt: now,
      updatedAt: now
    }
  })

  const newRootIds = payload.rootIds.map((id) => idMap.get(id)).filter((id): id is string => Boolean(id))

  // 重建共享子节点连接：childId 仍在画布上时，挂到对应的新父节点
  const relinked: { childId: string; newParentId: string }[] = []
  const nodes = [...current, ...created]
  for (const link of payload.externalLinks) {
    const newParentId = idMap.get(link.parentId)
    if (!newParentId) continue
    const child = nodes.find((n) => n.id === link.childId)
    if (!child) continue
    if (child.parentIds.includes(newParentId)) continue
    const idx = nodes.indexOf(child)
    nodes[idx] = { ...child, parentIds: [...child.parentIds, newParentId] }
    relinked.push({ childId: link.childId, newParentId })
  }

  return { nodes, newRootIds, relinked }
}
