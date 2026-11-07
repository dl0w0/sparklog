/**
 * 轻量力导向物理（D24）：弹簧 + 斥力 + 阻尼惯性。
 * 只在拖拽期间使用；纯数据运算，不接触 DOM，可单测。
 */

export interface PhysicsBody {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  /** 被鼠标拖拽的节点：位置由外部设定，不参与积分 */
  fixed: boolean
}

export interface Spring {
  a: string
  b: string
  /** 静止长度：拖动开始时两端距离，用于「保持网络形状」 */
  rest: number
  stiffness?: number
}

export interface PhysicsOptions {
  stiffness?: number
  repulsion?: number
  padding?: number
  damping?: number
  maxSpeed?: number
  cellSize?: number
}

const DEFAULTS: Required<PhysicsOptions> = {
  stiffness: 0.08,
  repulsion: 0.28,
  padding: 14,
  damping: 0.86,
  maxSpeed: 48,
  cellSize: 180
}

interface Force {
  fx: number
  fy: number
}

function cellKey(x: number, y: number, size: number): string {
  return `${Math.floor(x / size)}:${Math.floor(y / size)}`
}

/**
 * 推进一帧。返回系统动能（用于判断是否静止）。
 * bodies 会被原地修改（性能优先）。
 */
export function stepPhysics(
  bodies: PhysicsBody[],
  springs: readonly Spring[],
  options: PhysicsOptions = {}
): number {
  const opts = { ...DEFAULTS, ...options }
  const byId = new Map<string, PhysicsBody>()
  const forces = new Map<string, Force>()
  for (const b of bodies) {
    byId.set(b.id, b)
    forces.set(b.id, { fx: 0, fy: 0 })
  }

  // 1. 弹簧：沿连线方向把两端拉回静止长度
  for (const s of springs) {
    const a = byId.get(s.a)
    const b = byId.get(s.b)
    if (!a || !b) continue
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dist = Math.hypot(dx, dy) || 0.0001
    const stretch = dist - s.rest
    const k = s.stiffness ?? opts.stiffness
    const f = k * stretch
    const ux = dx / dist
    const uy = dy / dist
    const fa = forces.get(a.id)!
    const fb = forces.get(b.id)!
    fa.fx += ux * f
    fa.fy += uy * f
    fb.fx -= ux * f
    fb.fy -= uy * f
  }

  // 2. 斥力：网格加速，只处理邻近气泡
  const grid = new Map<string, PhysicsBody[]>()
  for (const b of bodies) {
    const key = cellKey(b.x, b.y, opts.cellSize)
    const arr = grid.get(key)
    if (arr) arr.push(b)
    else grid.set(key, [b])
  }
  for (const b of bodies) {
    const cx = Math.floor(b.x / opts.cellSize)
    const cy = Math.floor(b.y / opts.cellSize)
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const bucket = grid.get(`${cx + ox}:${cy + oy}`)
        if (!bucket) continue
        for (const other of bucket) {
          if (other.id <= b.id) continue
          const dx = other.x - b.x
          const dy = other.y - b.y
          const dist = Math.hypot(dx, dy) || 0.0001
          const minDist = b.radius + other.radius + opts.padding
          if (dist >= minDist) continue
          const overlap = minDist - dist
          const push = overlap * opts.repulsion
          const ux = dx / dist
          const uy = dy / dist
          const fa = forces.get(b.id)!
          const fb = forces.get(other.id)!
          // 质量按半径估算：大的更难被推动
          const wa = other.radius / (b.radius + other.radius)
          const wb = 1 - wa
          fa.fx -= ux * push * wa * 2
          fa.fy -= uy * push * wa * 2
          fb.fx += ux * push * wb * 2
          fb.fy += uy * push * wb * 2
        }
      }
    }
  }

  // 3. 积分 + 阻尼
  let kinetic = 0
  for (const b of bodies) {
    if (b.fixed) {
      b.vx = 0
      b.vy = 0
      continue
    }
    const f = forces.get(b.id)!
    b.vx = (b.vx + f.fx) * opts.damping
    b.vy = (b.vy + f.fy) * opts.damping
    const speed = Math.hypot(b.vx, b.vy)
    if (speed > opts.maxSpeed) {
      b.vx = (b.vx / speed) * opts.maxSpeed
      b.vy = (b.vy / speed) * opts.maxSpeed
    }
    b.x += b.vx
    b.y += b.vy
    kinetic += 0.5 * (b.vx * b.vx + b.vy * b.vy)
  }
  return kinetic
}

/** 是否需要继续跑惯性动画 */
export function isSettled(kinetic: number, bodies: readonly PhysicsBody[]): boolean {
  if (kinetic > 0.35) return false
  for (const b of bodies) {
    if (b.fixed) continue
    if (Math.hypot(b.vx, b.vy) > 0.12) return false
  }
  return true
}

/** 从当前坐标构造弹簧（rest = 当前距离，拖动时网络形状得以保持） */
export function buildSprings(
  bodies: readonly PhysicsBody[],
  edges: readonly { from: string; to: string }[]
): Spring[] {
  const byId = new Map(bodies.map((b) => [b.id, b]))
  const springs: Spring[] = []
  for (const e of edges) {
    const a = byId.get(e.from)
    const b = byId.get(e.to)
    if (!a || !b) continue
    const rest = Math.max(24, Math.hypot(b.x - a.x, b.y - a.y))
    springs.push({ a: e.from, b: e.to, rest })
  }
  return springs
}
