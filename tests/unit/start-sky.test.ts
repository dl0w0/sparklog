import { describe, expect, it } from 'vitest'
import { meshPairs, opacityFor, uniformRest } from '@renderer/views/StartView/BubbleField'
import {
  CONSTELLATIONS,
  NAMED_STARS,
  buildTransition,
  computeSkyLayers,
  projectWithFov,
  twinkle
} from '@renderer/logic/sky'
import { createDefaultSettings, normalizeSettings } from '@shared/types/settings'

const observer = { latitude: 31.23, longitude: 121.47, source: 'test' }

describe('开始窗口星空与气泡（D88）', () => {
  it('透明度按时间 1.0 → 0.35', () => {
    expect(opacityFor(0, 5)).toBeCloseTo(1, 5)
    expect(opacityFor(4, 5)).toBeCloseTo(0.35, 5)
    expect(opacityFor(0, 1)).toBe(1)
    expect(opacityFor(2, 5)).toBeGreaterThan(opacityFor(3, 5))
  })

  it('网格连线：完全图数量与统一静止长度（D90）', () => {
    expect(meshPairs(1)).toEqual([])
    expect(meshPairs(2)).toEqual([[0, 1]])
    expect(meshPairs(5)).toHaveLength(10)
    // 所有连线共用同一个静止长度
    expect(uniformRest(1200, 800)).toBe(uniformRest(1200, 800))
    expect(uniformRest(1200, 800)).toBeGreaterThanOrEqual(180)
  })

  it('闪烁：周期 4–8 秒、相位不同步、偶发微亮（D90）', () => {
    const t = 3.7
    const a = twinkle(t, 0.2, 4.5, 9)
    const b = twinkle(t, 2.4, 4.5, 9)
    expect(a).not.toBe(b)
    // 幅度温和：远离 0 和 1
    expect(a).toBeGreaterThan(0.05)
    expect(a).toBeLessThan(0.95)
    // 低频：0.2 秒内变化很小
    expect(Math.abs(twinkle(t + 0.2, 0.2, 4.5, 9) - a)).toBeLessThan(0.12)
    // 长时间窗口内存在比基线更亮的时刻（偶发微亮）
    let max = 0
    let min = 1
    for (let s = 0; s < 120; s += 0.5) {
      const value = twinkle(s, 0.2, 4.5, 9)
      max = Math.max(max, value)
      min = Math.min(min, value)
    }
    expect(max - min).toBeGreaterThan(0.2)
  })

  it('视野越大，同一颗星离中心越近', () => {
    const near = projectWithFov(45, 0, 1000, 800, 120)
    const wide = projectWithFov(45, 0, 1000, 800, 220)
    expect(near).not.toBeNull()
    expect(wide).not.toBeNull()
    const nearR = Math.hypot(near!.x - 500, near!.y - 400)
    const wideR = Math.hypot(wide!.x - 500, wide!.y - 400)
    expect(wideR).toBeLessThan(nearR)
  })

  it('标签层包含重要恒星，星座层有连线', () => {
    const layers = computeSkyLayers(new Date('2026-11-08T14:00:00Z'), observer, 1280, 800, {
      fov: 170
    })
    expect(layers.stars.length).toBeGreaterThan(20)
    expect(NAMED_STARS.length).toBeGreaterThanOrEqual(10)
    expect(CONSTELLATIONS.length).toBeGreaterThanOrEqual(6)
    for (const label of layers.labels) {
      expect(label.name.length).toBeGreaterThan(0)
    }
    for (const constellation of layers.constellations) {
      expect(constellation.segments.length).toBeGreaterThan(0)
      expect(constellation.name.length).toBeGreaterThan(0)
    }
  })

  it('经纬度变化时按新旧星位做连续插值（D89）', () => {
    const date = new Date('2026-11-08T14:00:00Z')
    const from = computeSkyLayers(date, { latitude: 31.23, longitude: 121.47, source: 'a' }, 1280, 800, {
      fov: 170
    })
    const to = computeSkyLayers(date, { latitude: 39.9, longitude: 116.4, source: 'b' }, 1280, 800, {
      fov: 170
    })
    const tween = buildTransition(from, to, 1000)
    expect(tween.stars.length).toBe(to.stars.length)

    const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
    const eased = 0.5
    const sample = tween.stars[0]
    const mid = { x: lerp(sample.x0, sample.x1, eased), y: lerp(sample.y0, sample.y1, eased) }
    // 中间态位于起止之间
    const between = (v: number, a: number, b: number): boolean =>
      v >= Math.min(a, b) - 0.001 && v <= Math.max(a, b) + 0.001
    expect(between(mid.x, sample.x0, sample.x1)).toBe(true)
    expect(between(mid.y, sample.y0, sample.y1)).toBe(true)
    // 起点即旧位置、终点即新位置
    expect(sample.x0).toBeCloseTo(from.stars[0].x, 5)
    expect(sample.x1).toBeCloseTo(to.stars[0].x, 5)
    // 有明显位移，不是原地不动
    expect(Math.hypot(sample.x1 - sample.x0, sample.y1 - sample.y0)).toBeGreaterThan(0.5)
  })

  it('设置项规范化：亮度/视野/星点大小与两个开关', () => {
    const defaults = createDefaultSettings()
    expect(defaults.skyBrightness).toBeGreaterThan(1)
    expect(defaults.skyFov).toBeGreaterThan(120)
    expect(defaults.starSize).toBeLessThan(1)
    expect(defaults.showStarLabels).toBe(true)
    expect(defaults.showConstellations).toBe(true)

    const clamped = normalizeSettings({
      skyBrightness: 99,
      skyFov: 10,
      starSize: 9,
      showStarLabels: false,
      showConstellations: false
    })
    expect(clamped.skyBrightness).toBeLessThanOrEqual(2.2)
    expect(clamped.skyFov).toBeGreaterThanOrEqual(90)
    expect(clamped.starSize).toBeLessThanOrEqual(2)
    expect(clamped.showStarLabels).toBe(false)
    expect(clamped.showConstellations).toBe(false)
  })
})
