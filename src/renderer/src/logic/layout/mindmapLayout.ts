/** 思维导图自动布局：以主气泡为根，d3-hierarchy 计算树形坐标。 */

import { LEVEL_GAP, SIBLING_GAP, TREE_GAP } from '@shared/constants'
import type { BubbleNode, Rect, Vec2 } from '@shared/types/document'
import { hierarchy, tree as d3tree } from 'd3-hierarchy'
import { primaryParentOf } from '../graph'

export interface MindmapOptions {
  levelGap?: number
  siblingGap?: number
  treeGap?: number
  /** 半径计算函数（默认按 40 兜底） */
  radiusOf?: (node: BubbleNode) => number
}

export interface BackEdge {
  from: string
  to: string
}

export interface MindmapResult {
  positions: Map<string, Vec2>
  bounds: Rect
  backEdges: BackEdge[]
  roots: string[]
  /** 每层最大半径，供连线端点计算 */
  levelRadius: number[]
}

const FALLBACK_RADIUS = 40

export function layoutMindmap(
  nodes: readonly BubbleNode[],
  opts: MindmapOptions = {}
): MindmapResult {
  const levelGap = opts.levelGap ?? LEVEL_GAP
  const siblingGap = opts.siblingGap ?? SIBLING_GAP
  const treeGap = opts.treeGap ?? TREE_GAP
  const radiusOf = opts.radiusOf ?? (() => FALLBACK_RADIUS)

  const byId = new Map<string, BubbleNode>()
  for (const n of nodes) byId.set(n.id, n)

  // 仅按主父构建子关系，保证每个节点在导图中只出现一次（D7）
  const childrenByPrimary = new Map<string, string[]>()
  const roots: string[] = []
  for (const n of nodes) {
    const pid = primaryParentOf(n)
    if (pid && byId.has(pid)) {
      const arr = childrenByPrimary.get(pid)
      if (arr) arr.push(n.id)
      else childrenByPrimary.set(pid, [n.id])
    } else {
      roots.push(n.id)
    }
  }

  const positions = new Map<string, Vec2>()
  if (nodes.length === 0) {
    return {
      positions,
      bounds: { x: 0, y: 0, w: 0, h: 0 },
      backEdges: [],
      roots: [],
      levelRadius: []
    }
  }

  interface Item {
    node: BubbleNode
    children: Item[]
    depth: number
    breadth: number
  }

  const buildItem = (id: string, depth: number, seen: Set<string>): Item => {
    const node = byId.get(id) as BubbleNode
    const item: Item = { node, children: [], depth, breadth: 0 }
    if (seen.has(id)) return item
    seen.add(id)
    for (const cid of childrenByPrimary.get(id) ?? []) {
      if (!byId.has(cid)) continue
      item.children.push(buildItem(cid, depth + 1, seen))
    }
    return item
  }

  const forest: Item[] = roots.map((id) => buildItem(id, 0, new Set<string>()))

  // 用 d3-hierarchy 求广度坐标（nodeSize[1,1] 下 x 即兄弟排序位置）
  const trees: { item: Item; breadth: Map<string, number>; width: number }[] = []
  let maxDepth = 0
  for (const rootItem of forest) {
    const root = hierarchy<Item>(rootItem, (d) => d.children)
    const layout = d3tree<Item>().nodeSize([1, 1])
    layout(root)
    const breadth = new Map<string, number>()
    root.each((d) => {
      breadth.set(d.data.node.id, d.x ?? 0)
      if (d.depth > maxDepth) maxDepth = d.depth
    })
    trees.push({ item: rootItem, breadth, width: 0 })
  }

  // 每层最大半径（跨所有树），用于横向间距
  const levelRadius: number[] = new Array(maxDepth + 1).fill(0)
  const visit = (item: Item): void => {
    const r = radiusOf(item.node)
    if (r > levelRadius[item.depth]) levelRadius[item.depth] = r
    item.children.forEach(visit)
  }
  for (const rootItem of forest) visit(rootItem)
  for (let i = 0; i < levelRadius.length; i++) {
    if (levelRadius[i] === 0) levelRadius[i] = FALLBACK_RADIUS
  }

  // 每层的 x 坐标：累积层宽
  const xOfDepth: number[] = [0]
  for (let d = 1; d <= maxDepth; d++) {
    xOfDepth[d] = xOfDepth[d - 1] + levelRadius[d - 1] + levelGap + levelRadius[d]
  }

  let offsetX = 0
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const t of trees) {
    let localMaxX = Number.NEGATIVE_INFINITY
    const walk = (item: Item): void => {
      const id = item.node.id
      const r = radiusOf(item.node)
      const bx = t.breadth.get(id) ?? 0
      const slot = 2 * levelRadius[item.depth] + siblingGap
      const x = offsetX + xOfDepth[item.depth]
      const y = bx * slot
      positions.set(id, { x, y })
      if (x + r > localMaxX) localMaxX = x + r
      if (x - r < minX) minX = x - r
      if (y - r < minY) minY = y - r
      if (x + r > maxX) maxX = x + r
      if (y + r > maxY) maxY = y + r
      item.children.forEach(walk)
    }
    walk(t.item)
    t.width = localMaxX - offsetX
    offsetX = localMaxX + treeGap
  }

  const backEdges: BackEdge[] = []
  for (const n of nodes) {
    if (n.parentIds.length <= 1) continue
    for (const pid of n.parentIds.slice(1)) {
      if (positions.has(pid)) backEdges.push({ from: pid, to: n.id })
    }
  }

  return {
    positions,
    bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    backEdges,
    roots: roots.slice(),
    levelRadius
  }
}
