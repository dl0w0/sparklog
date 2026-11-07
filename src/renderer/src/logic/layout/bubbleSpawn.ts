/** 新建子气泡的自动摆放：同一父节点下的子气泡连线长度一致（D38）。 */

import { SPAWN_GAP } from '@shared/constants'
import type { Vec2 } from '@shared/types/document'

export interface Occupant {
  pos: Vec2
  radius: number
}

const CANDIDATE_COUNT = 48
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

/**
 * 在父节点周围挑选角度：**距离固定**为 父半径 + 子半径 + 间隙，
 * 只挑选与已有节点冲突最小的角度，保证同级连线等长。
 */
export function placeNewChild(
  parentPos: Vec2,
  parentRadius: number,
  childRadius: number,
  occupied: readonly Occupant[] = [],
  gap = SPAWN_GAP
): Vec2 {
  const distance = parentRadius + childRadius + gap
  let best: Vec2 = { x: parentPos.x + distance, y: parentPos.y }
  let bestScore = Number.NEGATIVE_INFINITY

  for (let i = 0; i < CANDIDATE_COUNT; i++) {
    const angle = i * GOLDEN_ANGLE
    const candidate: Vec2 = {
      x: parentPos.x + Math.cos(angle) * distance,
      y: parentPos.y + Math.sin(angle) * distance
    }
    let score = Number.POSITIVE_INFINITY
    if (occupied.length === 0) {
      score = 0
    } else {
      for (const o of occupied) {
        const d = Math.hypot(candidate.x - o.pos.x, candidate.y - o.pos.y)
        const clearance = d - (o.radius + childRadius + gap)
        if (clearance < score) score = clearance
      }
    }
    if (score > bestScore + 1e-9) {
      bestScore = score
      best = candidate
    }
  }
  return best
}

/** 新建主气泡的落点：避开已有节点，向右下方依次错开 */
export function placeNewRoot(
  occupied: readonly Occupant[] = [],
  spawn: Vec2 = { x: 0, y: 0 },
  radius = 60
): Vec2 {
  if (occupied.length === 0) return spawn
  let candidate: Vec2 = spawn
  for (let step = 0; step < 200; step++) {
    const angle = step * GOLDEN_ANGLE
    const ring = 1 + Math.floor(step / 12)
    candidate = {
      x: spawn.x + Math.cos(angle) * (radius + SPAWN_GAP) * ring * 1.4,
      y: spawn.y + Math.sin(angle) * (radius + SPAWN_GAP) * ring * 1.4
    }
    const collides = occupied.some((o) => {
      const d = Math.hypot(candidate.x - o.pos.x, candidate.y - o.pos.y)
      return d < o.radius + radius + SPAWN_GAP
    })
    if (!collides) return candidate
  }
  return candidate
}

/** 两个节点是否重叠 */
export function overlaps(a: Occupant, b: Occupant, gap = 0): boolean {
  return Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y) < a.radius + b.radius + gap - 1e-6
}

/** 默认连线长度（父半径 + 子半径 + 间隙），用于等长约束与自动松弛 */
export function defaultLinkLength(parentRadius: number, childRadius: number, gap = SPAWN_GAP): number {
  return parentRadius + childRadius + gap
}
