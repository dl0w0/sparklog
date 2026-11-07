import { describe, expect, it } from 'vitest'
import { overlaps, placeNewChild, placeNewRoot } from '@renderer/logic/layout/bubbleSpawn'

const parent = { x: 0, y: 0 }

describe('新建子气泡自动分布', () => {
  it('与父节点保持精确的间隙距离', () => {
    const p = placeNewChild(parent, 50, 40, [], 24)
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(50 + 40 + 24, 5)
  })

  it('无占用时结果确定（同一输入同一输出）', () => {
    const a = placeNewChild(parent, 50, 40, [])
    const b = placeNewChild(parent, 50, 40, [])
    expect(a).toEqual(b)
  })

  it('避开已占用的兄弟气泡', () => {
    const first = placeNewChild(parent, 50, 40, [])
    const second = placeNewChild(parent, 50, 40, [{ pos: first, radius: 40 }])
    const dist = Math.hypot(second.x - first.x, second.y - first.y)
    expect(dist).toBeGreaterThanOrEqual(40 + 40 + 24 - 1e-6)
    expect(overlaps({ pos: first, radius: 40 }, { pos: second, radius: 40 })).toBe(false)
  })

  it('同一父节点下所有子气泡与父节点距离一致（D38）', () => {
    const placed: { pos: { x: number; y: number }; radius: number }[] = []
    const distances: number[] = []
    for (let i = 0; i < 8; i++) {
      const p = placeNewChild(parent, 50, 30, placed)
      placed.push({ pos: p, radius: 30 })
      distances.push(Math.hypot(p.x, p.y))
    }
    for (const d of distances) expect(d).toBeCloseTo(distances[0], 6)
  })

  it('等距环上摆放 8 个兄弟互不重叠', () => {
    const placed: { pos: { x: number; y: number }; radius: number }[] = []
    for (let i = 0; i < 8; i++) {
      const p = placeNewChild(parent, 50, 30, placed)
      placed.push({ pos: p, radius: 30 })
    }
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(overlaps(placed[i], placed[j])).toBe(false)
      }
    }
  })

  it('子气泡不落在父气泡内部', () => {
    const p = placeNewChild(parent, 80, 20, [])
    expect(Math.hypot(p.x, p.y)).toBeGreaterThan(80)
  })
})

describe('新建主气泡落点', () => {
  it('空画布使用给定原点', () => {
    expect(placeNewRoot([], { x: 10, y: 20 }, 60)).toEqual({ x: 10, y: 20 })
  })

  it('有占用时避开已有节点', () => {
    const occupied = [{ pos: { x: 0, y: 0 }, radius: 60 }]
    const p = placeNewRoot(occupied, { x: 0, y: 0 }, 60)
    expect(overlaps({ pos: p, radius: 60 }, occupied[0])).toBe(false)
  })
})
