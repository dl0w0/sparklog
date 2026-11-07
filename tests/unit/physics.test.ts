import { describe, expect, it } from 'vitest'
import {
  buildSprings,
  isSettled,
  stepPhysics,
  type PhysicsBody,
  type Spring
} from '@renderer/logic/physics'

function body(id: string, x: number, y: number, radius = 40, fixed = false): PhysicsBody {
  return { id, x, y, vx: 0, vy: 0, radius, fixed }
}

describe('弹簧', () => {
  it('拉长的弹簧会把两端拉回静止长度', () => {
    const bodies = [body('a', 0, 0), body('b', 200, 0)]
    const springs: Spring[] = [{ a: 'a', b: 'b', rest: 100 }]
    const startDist = Math.hypot(bodies[1].x - bodies[0].x, bodies[1].y - bodies[0].y)
    for (let i = 0; i < 60; i++) stepPhysics(bodies, springs, { repulsion: 0 })
    const endDist = Math.hypot(bodies[1].x - bodies[0].x, bodies[1].y - bodies[0].y)
    expect(endDist).toBeLessThan(startDist)
    expect(Math.abs(endDist - 100)).toBeLessThan(40)
  })

  it('压短的弹簧会把两端推开', () => {
    const bodies = [body('a', 0, 0), body('b', 40, 0)]
    const springs: Spring[] = [{ a: 'a', b: 'b', rest: 200 }]
    for (let i = 0; i < 30; i++) stepPhysics(bodies, springs, { repulsion: 0 })
    expect(bodies[1].x).toBeGreaterThan(40)
  })

  it('固定端不动，只推动另一端', () => {
    const bodies = [body('a', 0, 0, 40, true), body('b', 300, 0)]
    const springs: Spring[] = [{ a: 'a', b: 'b', rest: 100 }]
    for (let i = 0; i < 30; i++) stepPhysics(bodies, springs, { repulsion: 0 })
    expect(bodies[0].x).toBe(0)
    expect(bodies[0].y).toBe(0)
    expect(bodies[1].x).toBeLessThan(300)
  })

  it('buildSprings 用当前距离作为静止长度', () => {
    const bodies = [body('a', 0, 0), body('b', 0, 250)]
    const springs = buildSprings(bodies, [{ from: 'a', to: 'b' }])
    expect(springs).toHaveLength(1)
    expect(springs[0].rest).toBeCloseTo(250, 5)
  })

  it('缺失一端的边不会产生弹簧', () => {
    expect(buildSprings([body('a', 0, 0)], [{ from: 'a', to: 'ghost' }])).toHaveLength(0)
  })
})

describe('斥力', () => {
  it('重叠的气泡会被推开', () => {
    const bodies = [body('a', 0, 0, 50), body('b', 60, 0, 50)]
    const before = Math.hypot(bodies[1].x - bodies[0].x, bodies[1].y - bodies[0].y)
    for (let i = 0; i < 40; i++) stepPhysics(bodies, [])
     const after = Math.hypot(bodies[1].x - bodies[0].x, bodies[1].y - bodies[0].y)
    expect(after).toBeGreaterThan(before)
  })

  it('相距很远的气泡不受斥力影响', () => {
    const bodies = [body('a', 0, 0, 50), body('b', 5000, 5000, 50)]
    stepPhysics(bodies, [])
    expect(bodies[0].x).toBe(0)
    expect(bodies[0].y).toBe(0)
    expect(bodies[1].x).toBe(5000)
  })

  it('大半径气泡被推动得更少', () => {
    const small = [body('s', 0, 0, 20), body('l', 50, 0, 80)]
    stepPhysics(small, [])
    const smallMoved = Math.abs(small[0].x)
    const bigMoved = Math.abs(small[1].x - 50)
    expect(smallMoved).toBeGreaterThan(bigMoved)
  })
})

describe('惯性衰减', () => {
  it('松手后动能逐步衰减到静止', () => {
    const bodies = [body('a', 0, 0, 40, true), body('b', 300, 0)]
    for (let i = 0; i < 20; i++) stepPhysics(bodies, [])
    let kinetic = stepPhysics(bodies, [], { repulsion: 0 })
    let steps = 0
    while (!isSettled(kinetic, bodies) && steps < 600) {
      kinetic = stepPhysics(bodies, [], { repulsion: 0 })
      steps++
    }
    expect(steps).toBeLessThan(600)
    expect(kinetic).toBeLessThan(0.35)
  })

  it('阻尼让速度单调下降（无外力时）', () => {
    const bodies = [body('a', 0, 0)]
    bodies[0].vx = 10
    const speeds: number[] = []
    for (let i = 0; i < 12; i++) {
      stepPhysics(bodies, [])
      speeds.push(Math.abs(bodies[0].vx))
    }
    for (let i = 1; i < speeds.length; i++) {
      expect(speeds[i]).toBeLessThanOrEqual(speeds[i - 1])
    }
  })

  it('速度被上限约束', () => {
    const bodies = [body('a', 0, 0)]
    bodies[0].vx = 1000
    stepPhysics(bodies, [], { maxSpeed: 20 })
    expect(Math.abs(bodies[0].vx)).toBeLessThanOrEqual(20.0001)
  })
})

describe('性能与确定性', () => {
  it('300 个节点单帧计算 ≤ 4ms', () => {
    const bodies = Array.from({ length: 300 }, (_, i) =>
      body(`b${i}`, (i % 20) * 120, Math.floor(i / 20) * 120, 40)
    )
    const springs = buildSprings(bodies, [
      { from: 'b0', to: 'b1' },
      { from: 'b1', to: 'b2' }
    ])
    const start = performance.now()
    for (let i = 0; i < 10; i++) stepPhysics(bodies, springs)
    const perStep = (performance.now() - start) / 10
    expect(perStep).toBeLessThanOrEqual(4)
  })

  it('相同输入产生相同结果', () => {
    const make = (): PhysicsBody[] => [body('a', 0, 0, 50), body('b', 70, 10, 50)]
    const first = make()
    const second = make()
    for (let i = 0; i < 10; i++) {
      stepPhysics(first, [])
      stepPhysics(second, [])
    }
    expect(first.map((b) => [b.x, b.y])).toEqual(second.map((b) => [b.x, b.y]))
  })
})
