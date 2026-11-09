/**
 * 图算法：多父有向无环图（DAG）的增删改查。
 * 全部为纯函数，输入输出均为不可变的节点数组。
 */

import { IMPORTANCE_DEFAULT, IMPORTANCE_MAX, IMPORTANCE_MIN } from '@shared/constants'
import type { BubbleNode, Edge, Vec2 } from '@shared/types/document'

export function primaryParentOf(node: BubbleNode): string | null {
  return node.parentIds.length > 0 ? node.parentIds[0] : null
}

export function indexNodes(nodes: readonly BubbleNode[]): Map<string, BubbleNode> {
  const map = new Map<string, BubbleNode>()
  for (const n of nodes) map.set(n.id, n)
  return map
}

/** parentId -> 直接子节点 id 列表（包含次要父连接） */
export function buildChildrenMap(nodes: readonly BubbleNode[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const n of nodes) {
    for (const pid of n.parentIds) {
      const arr = map.get(pid)
      if (arr) arr.push(n.id)
      else map.set(pid, [n.id])
    }
  }
  return map
}

export function childrenOf(nodes: readonly BubbleNode[], id: string): BubbleNode[] {
  return nodes.filter((n) => n.parentIds.includes(id))
}

/** 全部后代 id（不含自身），BFS，DAG 下去重 */
export function descendantsOf(nodes: readonly BubbleNode[], id: string): string[] {
  const children = buildChildrenMap(nodes)
  const seen = new Set<string>()
  const queue: string[] = [...(children.get(id) ?? [])]
  while (queue.length > 0) {
    const cur = queue.shift() as string
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const c of children.get(cur) ?? []) if (!seen.has(c)) queue.push(c)
  }
  return [...seen]
}

/** 全部祖先 id（不含自身） */
export function ancestorsOf(nodes: readonly BubbleNode[], id: string): string[] {
  const byId = indexNodes(nodes)
  const seen = new Set<string>()
  const queue: string[] = [...(byId.get(id)?.parentIds ?? [])]
  while (queue.length > 0) {
    const cur = queue.shift() as string
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const p of byId.get(cur)?.parentIds ?? []) if (!seen.has(p)) queue.push(p)
  }
  return [...seen]
}

export function rootsOf(nodes: readonly BubbleNode[], zoneId: string | null = null): BubbleNode[] {
  return nodes.filter((n) => n.parentIds.length === 0 && n.zoneId === zoneId)
}

/**
 * 独有后代：只有经由 ancestorId 才能到达的后代。
 * 判定方式：移除 ancestorId 后，该后代不再能从任何根到达。
 */
export function uniqueDescendantsOf(nodes: readonly BubbleNode[], ancestorId: string): string[] {
  const desc = descendantsOf(nodes, ancestorId)
  if (desc.length === 0) return []

  // 1. 建立「跳过 ancestorId」的邻接表
  const children = new Map<string, string[]>()
  for (const n of nodes) {
    if (n.id === ancestorId) continue
    for (const p of n.parentIds) {
      if (p === ancestorId) continue
      const arr = children.get(p)
      if (arr) arr.push(n.id)
      else children.set(p, [n.id])
    }
  }

  // 2. 从原始根（排除 ancestorId 自身）出发做可达性分析
  const queue: string[] = []
  for (const n of nodes) {
    if (n.id === ancestorId) continue
    if (n.parentIds.length === 0) queue.push(n.id)
  }
  const reachable = new Set<string>()
  while (queue.length > 0) {
    const cur = queue.shift() as string
    if (reachable.has(cur)) continue
    reachable.add(cur)
    for (const c of children.get(cur) ?? []) if (!reachable.has(c)) queue.push(c)
  }

  // 3. 不可达的后代即为「独有后代」
  return desc.filter((d) => !reachable.has(d))
}

export function isUniqueDescendant(
  nodes: readonly BubbleNode[],
  ancestorId: string,
  nodeId: string
): boolean {
  return uniqueDescendantsOf(nodes, ancestorId).includes(nodeId)
}

export function siblingsOf(nodes: readonly BubbleNode[], id: string): BubbleNode[] {
  const node = nodes.find((n) => n.id === id)
  if (!node) return []
  const pid = primaryParentOf(node)
  if (!pid) {
    return nodes.filter((n) => n.id !== id && n.parentIds.length === 0 && n.zoneId === node.zoneId)
  }
  return nodes.filter((n) => n.id !== id && n.parentIds[0] === pid)
}

/** 添加 parentId 作为 childId 的父是否会成环 */
export function wouldCreateCycle(
  nodes: readonly BubbleNode[],
  childId: string,
  newParentId: string
): boolean {
  if (childId === newParentId) return true
  if (!nodes.some((n) => n.id === childId) || !nodes.some((n) => n.id === newParentId)) return true
  return descendantsOf(nodes, childId).includes(newParentId)
}

export interface MutationResult {
  nodes: BubbleNode[]
  removedIds: string[]
  /** 因失去唯一父节点而升级为根的气泡 */
  promotedIds: string[]
}

/** 单删：只移除该节点，子节点失去父引用；无父者升级为根 */
export function deleteBubble(nodes: readonly BubbleNode[], id: string): MutationResult {
  const removedIds = [id]
  return removeNodesAndStrip(nodes, removedIds)
}

/** 级联删：移除该节点与其独有后代 */
export function deleteBubbleCascade(nodes: readonly BubbleNode[], id: string): MutationResult {
  const removedIds = [id, ...uniqueDescendantsOf(nodes, id)]
  return removeNodesAndStrip(nodes, removedIds)
}

function removeNodesAndStrip(nodes: readonly BubbleNode[], removedIds: string[]): MutationResult {
  const removed = new Set(removedIds)
  const promotedIds: string[] = []
  const out: BubbleNode[] = []
  for (const n of nodes) {
    if (removed.has(n.id)) continue
    if (n.parentIds.some((p) => removed.has(p))) {
      const remaining = n.parentIds.filter((p) => !removed.has(p))
      if (remaining.length === 0) promotedIds.push(n.id)
      out.push({ ...n, parentIds: remaining })
    } else {
      out.push(n)
    }
  }
  return { nodes: out, removedIds: [...removed], promotedIds }
}

export interface AddChildOptions {
  id: string
  text?: string
  importance?: number
  pos?: Vec2
  zoneId?: string | null
  shape?: BubbleNode['shape']
  colorKey?: string
  /** 新建时的文本样式快照（D91） */
  style?: BubbleNode['style']
  now?: string
}

export function createBubble(opts: AddChildOptions): BubbleNode {
  const now = opts.now ?? new Date().toISOString()
  return {
    id: opts.id,
    text: opts.text ?? '',
    importance: opts.importance ?? IMPORTANCE_DEFAULT,
    shape: opts.shape ?? 'circle',
    colorKey: opts.colorKey ?? 'default',
    ...(opts.style ? { style: opts.style } : {}),
    parentIds: [],
    zoneId: opts.zoneId ?? null,
    bubblePos: opts.pos ?? { x: 0, y: 0 },
    createdAt: now,
    updatedAt: now
  }
}

export function addChild(nodes: readonly BubbleNode[], parentId: string, child: BubbleNode): BubbleNode[] {
  const parent = nodes.find((n) => n.id === parentId)
  return [
    ...nodes,
    { ...child, parentIds: [parentId], zoneId: child.zoneId ?? parent?.zoneId ?? null }
  ]
}

export function addSibling(
  nodes: readonly BubbleNode[],
  siblingId: string,
  node: BubbleNode
): BubbleNode[] {
  const sibling = nodes.find((n) => n.id === siblingId)
  if (!sibling) return [...nodes]
  const pid = primaryParentOf(sibling)
  if (!pid) {
    return [...nodes, { ...node, parentIds: [], zoneId: sibling.zoneId }]
  }
  return [...nodes, { ...node, parentIds: [pid], zoneId: sibling.zoneId }]
}

export interface LinkResult {
  ok: boolean
  nodes: BubbleNode[]
  error?: 'not-found' | 'cycle' | 'duplicate' | 'cross-zone'
}

export function addParentLink(
  nodes: readonly BubbleNode[],
  childId: string,
  parentId: string
): LinkResult {
  const child = nodes.find((n) => n.id === childId)
  const parent = nodes.find((n) => n.id === parentId)
  if (!child || !parent) return { ok: false, nodes: [...nodes], error: 'not-found' }
  if (child.zoneId !== parent.zoneId) return { ok: false, nodes: [...nodes], error: 'cross-zone' }
  if (child.parentIds.includes(parentId)) return { ok: false, nodes: [...nodes], error: 'duplicate' }
  if (wouldCreateCycle(nodes, childId, parentId)) return { ok: false, nodes: [...nodes], error: 'cycle' }
  return {
    ok: true,
    nodes: nodes.map((n) =>
      n.id === childId ? { ...n, parentIds: [...n.parentIds, parentId] } : n
    )
  }
}

export function removeParentLink(
  nodes: readonly BubbleNode[],
  childId: string,
  parentId: string
): BubbleNode[] {
  return nodes.map((n) =>
    n.id === childId ? { ...n, parentIds: n.parentIds.filter((p) => p !== parentId) } : n
  )
}

/** 由 parentIds 推导连线；index > 0 的父连接标记为跨树回边 */
export function deriveEdges(nodes: readonly BubbleNode[]): Edge[] {
  const edges: Edge[] = []
  const byId = indexNodes(nodes)
  for (const n of nodes) {
    n.parentIds.forEach((pid, i) => {
      if (!byId.has(pid)) return
      edges.push({ id: `${pid}->${n.id}`, from: pid, to: n.id, backEdge: i > 0 })
    })
  }
  return edges
}

/** 子树（含自身）的节点 id */
export function subtreeIds(nodes: readonly BubbleNode[], id: string): string[] {
  return [id, ...descendantsOf(nodes, id)]
}

export function moveNodesBy(
  nodes: readonly BubbleNode[],
  ids: readonly string[],
  dx: number,
  dy: number,
  now?: string
): BubbleNode[] {
  const set = new Set(ids)
  return nodes.map((n) =>
    set.has(n.id)
      ? {
          ...n,
          bubblePos: { x: n.bubblePos.x + dx, y: n.bubblePos.y + dy },
          updatedAt: now ?? n.updatedAt
        }
      : n
  )
}

/** 拖动主气泡/子气泡：整棵子树跟随 */
export function moveSubtree(
  nodes: readonly BubbleNode[],
  id: string,
  dx: number,
  dy: number,
  now?: string
): BubbleNode[] {
  return moveNodesBy(nodes, subtreeIds(nodes, id), dx, dy, now)
}

export function nodesInZone(nodes: readonly BubbleNode[], zoneId: string | null): BubbleNode[] {
  return nodes.filter((n) => n.zoneId === zoneId)
}

export function setNodeText(
  nodes: readonly BubbleNode[],
  id: string,
  text: string,
  now?: string
): BubbleNode[] {
  return nodes.map((n) => (n.id === id ? { ...n, text, updatedAt: now ?? n.updatedAt } : n))
}

export function setNodeImportance(
  nodes: readonly BubbleNode[],
  id: string,
  importance: number,
  now?: string
): BubbleNode[] {
  const clamped = Math.min(IMPORTANCE_MAX, Math.max(IMPORTANCE_MIN, importance))
  return nodes.map((n) =>
    n.id === id ? { ...n, importance: clamped, updatedAt: now ?? n.updatedAt } : n
  )
}

/** 方向键导航结果 */
export type NavDirection = 'up' | 'down' | 'left' | 'right'

export function navigate(nodes: readonly BubbleNode[], id: string, dir: NavDirection): string | null {
  const node = nodes.find((n) => n.id === id)
  if (!node) return null
  if (dir === 'left') {
    return primaryParentOf(node)
  }
  if (dir === 'right') {
    const kids = childrenOf(nodes, id)
    return kids.length > 0 ? kids[0].id : null
  }
  const pid = primaryParentOf(node)
  const group = nodes.filter(
    (n) =>
      n.zoneId === node.zoneId &&
      (n.id === id || (pid === null ? n.parentIds.length === 0 : n.parentIds[0] === pid))
  )
  if (group.length <= 1) return null
  const sorted = [...group].sort(
    (a, b) => a.bubblePos.y - b.bubblePos.y || a.bubblePos.x - b.bubblePos.x
  )
  const idx = sorted.findIndex((s) => s.id === id)
  if (idx === -1) return null
  const next = dir === 'up' ? idx - 1 : idx + 1
  if (next < 0 || next >= sorted.length) return null
  return sorted[next].id
}
