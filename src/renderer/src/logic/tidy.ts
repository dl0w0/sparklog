/**
 * 「梳理气泡」布局整理（D69）——**不改变任何连线长度**的前提下：
 * 1. 先把各主气泡拉开（间距由子树半径决定，保证子代离自己的主气泡更近）；
 * 2. 每个节点的子节点绕它均匀分布；
 * 3. 尝试多组整体旋转角，取违规最少的一版。
 * 硬约束：① 子代到其它主气泡的距离 > 到其所属主气泡的距离；
 *        ② 连线不穿过其它气泡、也不与其它连线交叉。
 */

import type { BubbleNode, Vec2, ViewMode } from '@shared/types/document'
import { makeRadiusResolver, shapeOf } from './nodeVisual'
import { geomOf, shapesOverlap } from './shapes'

const ROOT_GAP = 180
const ANGLE_TRIES = 36

export interface LayoutInput {
  nodes: readonly BubbleNode[]
  zoneId: string | null
  mode?: ViewMode
}

interface Segment {
  a: Vec2
  b: Vec2
  fromId: string
  toId: string
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** 线段到点距离 */
export function segmentPointDistance(a: Vec2, b: Vec2, p: Vec2): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const lenSq = abx * abx + aby * aby
  if (lenSq < 1e-9) return dist(a, p)
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t))
}

function cross(o: Vec2, a: Vec2, b: Vec2): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

/** 两条线段是否「真交叉」（共享端点不算） */
export function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const sharesEndpoint =
    (a.x === c.x && a.y === c.y) ||
    (a.x === d.x && a.y === d.y) ||
    (b.x === c.x && b.y === c.y) ||
    (b.x === d.x && b.y === d.y)
  if (sharesEndpoint) return false
  const d1 = cross(c, d, a)
  const d2 = cross(c, d, b)
  const d3 = cross(a, b, c)
  const d4 = cross(a, b, d)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

export interface Violations {
  edgeHitsBubble: number
  edgeCrossings: number
  overlap: number
  territory: number
  total: number
}

function segmentsOf(
  positions: Map<string, Vec2>,
  level: readonly BubbleNode[]
): Segment[] {
  const segments: Segment[] = []
  for (const node of level) {
    for (const pid of node.parentIds) {
      const pa = positions.get(pid)
      const pb = positions.get(node.id)
      if (!pa || !pb) continue
      segments.push({ a: pa, b: pb, fromId: pid, toId: node.id })
    }
  }
  return segments
}

/** 硬约束①：子代必须离自己的主气泡比离其它主气泡更近 */
export function countTerritoryViolations(
  positions: Map<string, Vec2>,
  nodes: readonly BubbleNode[],
  zoneId: string | null
): number {
  const level = nodes.filter((n) => n.zoneId === zoneId && positions.has(n.id))
  const ids = new Set(level.map((n) => n.id))
  const byId = new Map(level.map((n) => [n.id, n]))

  // 找出每个节点所属的主气泡
  const rootOf = new Map<string, string>()
  for (const node of level) {
    let current = node
    const seen = new Set<string>()
    while (current.parentIds[0] && ids.has(current.parentIds[0]) && !seen.has(current.id)) {
      seen.add(current.id)
      const parent = byId.get(current.parentIds[0])
      if (!parent) break
      current = parent
    }
    rootOf.set(node.id, current.id)
  }
  const roots = level.filter((n) => !n.parentIds[0] || !ids.has(n.parentIds[0]))

  let bad = 0
  for (const node of level) {
    const ownRoot = rootOf.get(node.id)
    const own = positions.get(ownRoot ?? '')
    const self = positions.get(node.id)
    if (!own || !self) continue
    const ownDistance = dist(self, own)
    for (const root of roots) {
      if (root.id === ownRoot) continue
      const rp = positions.get(root.id)
      if (!rp) continue
      if (dist(self, rp) <= ownDistance + 0.5) bad += 1
    }
  }
  return bad
}

/** 统计当前布局的违规数量（同时用于算法与测试） */
export function countViolations(
  positions: Map<string, Vec2>,
  nodes: readonly BubbleNode[],
  zoneId: string | null,
  mode: ViewMode = 'bubble'
): Violations {
  const radiusOf = makeRadiusResolver(nodes, mode)
  const level = nodes.filter((n) => n.zoneId === zoneId && positions.has(n.id))
  const segments = segmentsOf(positions, level)

  let edgeHitsBubble = 0
  for (const seg of segments) {
    for (const node of level) {
      if (node.id === seg.fromId || node.id === seg.toId) continue
      const p = positions.get(node.id)
      if (!p) continue
      if (segmentPointDistance(seg.a, seg.b, p) < radiusOf(node) - 0.5) edgeHitsBubble += 1
    }
  }

  let edgeCrossings = 0
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const s1 = segments[i]
      const s2 = segments[j]
      if (
        s1.fromId === s2.fromId ||
        s1.fromId === s2.toId ||
        s1.toId === s2.fromId ||
        s1.toId === s2.toId
      ) {
        continue
      }
      if (segmentsCross(s1.a, s1.b, s2.a, s2.b)) edgeCrossings += 1
    }
  }

  let overlap = 0
  for (let i = 0; i < level.length; i++) {
    for (let j = i + 1; j < level.length; j++) {
      const pa = positions.get(level[i].id)
      const pb = positions.get(level[j].id)
      if (!pa || !pb) continue
      const ga = geomOf(shapeOf(level[i]), pa, radiusOf(level[i]))
      const gb = geomOf(shapeOf(level[j]), pb, radiusOf(level[j]))
      if (shapesOverlap(ga, gb)) overlap += 1
    }
  }

  const territory = countTerritoryViolations(positions, nodes, zoneId)
  return {
    edgeHitsBubble,
    edgeCrossings,
    overlap,
    territory,
    total: edgeHitsBubble + edgeCrossings + overlap + territory
  }
}

export interface TidyResult {
  positions: Map<string, Vec2>
  violations: Violations
}

export function tidyLayout(input: LayoutInput): TidyResult {
  const mode = input.mode ?? 'bubble'
  const radiusOf = makeRadiusResolver(input.nodes, mode)
  const level = input.nodes.filter((n) => n.zoneId === input.zoneId)
  const positions = new Map<string, Vec2>()
  if (level.length === 0) {
    return { positions, violations: { edgeHitsBubble: 0, edgeCrossings: 0, overlap: 0, territory: 0, total: 0 } }
  }

  const byId = new Map(level.map((n) => [n.id, n]))
  const ids = new Set(byId.keys())
  const childrenOf = new Map<string, BubbleNode[]>()
  const roots: BubbleNode[] = []
  for (const node of level) {
    const pid = node.parentIds[0]
    if (pid && ids.has(pid)) {
      const arr = childrenOf.get(pid)
      if (arr) arr.push(node)
      else childrenOf.set(pid, [node])
    } else {
      roots.push(node)
    }
  }

  // 归属（主气泡 → 其子树节点）
  const ownerOf = new Map<string, string>()
  const claim = (rootId: string, id: string): void => {
    ownerOf.set(id, rootId)
    for (const kid of childrenOf.get(id) ?? []) claim(rootId, kid.id)
  }
  for (const root of roots) claim(root.id, root.id)

  // —— 1. 局部布局（相对根坐标，子节点绕父均匀分布，半径 = 当前连线长度） ——
  const local = new Map<string, Vec2>()
  const treeRadius = new Map<string, number>()

  const layoutTree = (rootId: string): number => {
    local.set(rootId, { x: 0, y: 0 })
    let maxR = 0
    const placedNodes: { id: string; pos: Vec2; radius: number }[] = [
      { id: rootId, pos: { x: 0, y: 0 }, radius: radiusOf(byId.get(rootId)!) }
    ]
    const placedEdges: { a: Vec2; b: Vec2; fromId: string; toId: string }[] = []
    const queue: string[] = [rootId]

    while (queue.length > 0) {
      const parentId = queue.shift()!
      const parent = byId.get(parentId)
      const parentPos = local.get(parentId)
      if (!parent || !parentPos) continue
      const kids = childrenOf.get(parentId) ?? []
      if (kids.length === 0) continue

      const sorted = [...kids].sort((a, b) => {
        const aa = Math.atan2(a.bubblePos.y - parent.bubblePos.y, a.bubblePos.x - parent.bubblePos.x)
        const bb = Math.atan2(b.bubblePos.y - parent.bubblePos.y, b.bubblePos.x - parent.bubblePos.x)
        return aa - bb
      })
      const radii = sorted.map((kid) => Math.max(1, dist(kid.bubblePos, parent.bubblePos)))

      // 尝试多个环起点角度，选违规最少的一个（贪心，避免连线穿气泡/交叉）
      let bestChoice: { startAngle: number; score: number } | null = null
      const CANDIDATES = 24
      for (let attempt = 0; attempt < CANDIDATES; attempt++) {
        const startAngle = (attempt / CANDIDATES) * (Math.PI * 2)
        const positions = sorted.map((_kid, index) => {
          const angle = startAngle + (Math.PI * 2 * index) / sorted.length
          return {
            x: parentPos.x + Math.cos(angle) * radii[index],
            y: parentPos.y + Math.sin(angle) * radii[index]
          }
        })
        let score = 0
        sorted.forEach((kid, index) => {
          const p = positions[index]
          const r = radiusOf(kid)
          for (const placed of placedNodes) {
            if (placed.id === parentId) continue
            const self = geomOf(shapeOf(kid), p, r)
            const other = geomOf(shapeOf(byId.get(placed.id)!), placed.pos, placed.radius)
            if (shapesOverlap(self, other)) score += 4
          }
          const seg = { a: parentPos, b: p, fromId: parentId, toId: kid.id }
          for (const placed of placedNodes) {
            if (placed.id === parentId || placed.id === kid.id) continue
            if (segmentPointDistance(seg.a, seg.b, placed.pos) < placed.radius - 0.5) score += 3
          }
          for (const edge of placedEdges) {
            if (edge.fromId === parentId || edge.toId === kid.id || edge.fromId === kid.id) continue
            if (segmentsCross(seg.a, seg.b, edge.a, edge.b)) score += 5
          }
          // 同环兄弟之间的连线交叉
          for (let j = index + 1; j < positions.length; j++) {
            const other = { a: parentPos, b: positions[j], fromId: parentId, toId: sorted[j].id }
            if (segmentsCross(seg.a, seg.b, other.a, other.b)) score += 5
          }
        })
        if (!bestChoice || score < bestChoice.score) bestChoice = { startAngle, score }
        if (score === 0) break
      }

      const startAngle = bestChoice?.startAngle ?? 0
      sorted.forEach((kid, index) => {
        const angle = startAngle + (Math.PI * 2 * index) / sorted.length
        const p = {
          x: parentPos.x + Math.cos(angle) * radii[index],
          y: parentPos.y + Math.sin(angle) * radii[index]
        }
        local.set(kid.id, p)
        maxR = Math.max(maxR, Math.hypot(p.x, p.y) + radiusOf(kid))
        placedNodes.push({ id: kid.id, pos: p, radius: radiusOf(kid) })
        placedEdges.push({ a: parentPos, b: p, fromId: parentId, toId: kid.id })
        queue.push(kid.id)
      })
    }
    return maxR
  }

  for (const root of roots) treeRadius.set(root.id, layoutTree(root.id))

  // —— 2. 主气泡拉开：相邻间距 = 2×较大子树半径 + 间隔 → 硬约束①成立 ——
  const slotX: number[] = []
  {
    let cursor = 0
    roots.forEach((root, index) => {
      if (index > 0) {
        const prev = roots[index - 1]
        const rPrev = treeRadius.get(prev.id) ?? 0
        const rCur = treeRadius.get(root.id) ?? 0
        cursor += Math.max(rPrev, rCur) * 2 + ROOT_GAP
      }
      slotX.push(cursor)
    })
  }
  const centerX = roots.reduce((sum, r) => sum + r.bubblePos.x, 0) / Math.max(1, roots.length)
  const centerY = roots.reduce((sum, r) => sum + r.bubblePos.y, 0) / Math.max(1, roots.length)
  const totalWidth = slotX.length > 0 ? slotX[slotX.length - 1] : 0

  // —— 3. 多组旋转角取最优 ——
  let best: { positions: Map<string, Vec2>; violations: Violations } | null = null
  for (let attempt = 0; attempt < ANGLE_TRIES; attempt++) {
    const rotated = new Map<string, Vec2>()
    roots.forEach((root, index) => {
      const treeAngle = (attempt / ANGLE_TRIES) * (Math.PI * 2) + index * 0.618
      const cos = Math.cos(treeAngle)
      const sin = Math.sin(treeAngle)
      const originX = centerX + (slotX[index] ?? 0) - totalWidth / 2
      const originY = centerY
      for (const [id, p] of local) {
        if (ownerOf.get(id) !== root.id) continue
        rotated.set(id, {
          x: originX + p.x * cos - p.y * sin,
          y: originY + p.x * sin + p.y * cos
        })
      }
    })
    const violations = countViolations(rotated, input.nodes, input.zoneId, mode)
    if (!best || violations.total < best.violations.total) best = { positions: rotated, violations }
    if (violations.total === 0) break
  }

  const finalPositions = best?.positions ?? local
  for (const node of level) if (!finalPositions.has(node.id)) finalPositions.set(node.id, { ...node.bubblePos })
  return {
    positions: finalPositions,
    violations: best?.violations ?? countViolations(finalPositions, input.nodes, input.zoneId, mode)
  }
}

/** 兼容旧接口：只返回坐标 */
export function tidyPositions(nodes: readonly BubbleNode[], zoneId: string | null): Map<string, Vec2> {
  return tidyLayout({ nodes, zoneId }).positions
}

/** 统计重叠对数（测试与调参用） */
export function countOverlaps(items: { id: string; x: number; y: number; radius: number }[]): number {
  let count = 0
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const d = Math.hypot(items[i].x - items[j].x, items[i].y - items[j].y)
      if (d < items[i].radius + items[j].radius - 0.5) count++
    }
  }
  return count
}
