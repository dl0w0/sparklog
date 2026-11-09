import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OBSERVER,
  STAR_CATALOG,
  altAz,
  computeSky,
  gmstHours,
  localSiderealHours,
  magnitudeToBrightness,
  mulberry32,
  observerFromTimeZone,
  projectToScreen,
  resolveObserver,
  twinkle
} from '@renderer/logic/sky'

describe('夜空星图（D87）', () => {
  it('内置真实星表足够大且含最亮恒星', () => {
    expect(STAR_CATALOG.length).toBeGreaterThanOrEqual(1000)
    const brightest = Math.min(...STAR_CATALOG.map((s) => s.mag))
    // 天狼星 -1.46 等，是全天最亮恒星
    expect(brightest).toBeLessThan(-1.2)
    expect(brightest).toBeGreaterThan(-2)
    for (const star of STAR_CATALOG.slice(0, 50)) {
      expect(star.ra).toBeGreaterThanOrEqual(0)
      expect(star.ra).toBeLessThan(24)
      expect(Math.abs(star.dec)).toBeLessThanOrEqual(90)
    }
  })

  it('时区 → 观测点，未知时区回退默认', () => {
    expect(observerFromTimeZone('Asia/Shanghai')).toMatchObject({ latitude: 31.23, longitude: 121.47 })
    const fallback = observerFromTimeZone('Mars/Olympus')
    expect(fallback.latitude).toBe(DEFAULT_OBSERVER.latitude)
    expect(fallback.source).toContain('未知时区')
    expect(observerFromTimeZone(undefined).latitude).toBe(DEFAULT_OBSERVER.latitude)
  })

  it('手动经纬度优先于时区', () => {
    const observer = resolveObserver({ latitude: 39.9, longitude: 116.4, timeZone: 'Asia/Shanghai' })
    expect(observer.latitude).toBe(39.9)
    expect(observer.longitude).toBe(116.4)
    expect(observer.source).toBe('手动设置')
    const byZone = resolveObserver({ timeZone: 'Asia/Tokyo' })
    expect(byZone.latitude).toBeCloseTo(35.68, 1)
  })

  it('恒星时随时间推进（astronomy-engine）', () => {
    const a = gmstHours(new Date('2026-11-08T00:00:00Z'))
    const b = gmstHours(new Date('2026-11-08T01:00:00Z'))
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(24)
    expect((b - a + 24) % 24).toBeCloseTo(1.0027, 2)
    const lst = localSiderealHours(new Date('2026-11-08T00:00:00Z'), 121.47)
    expect(lst).toBeGreaterThanOrEqual(0)
    expect(lst).toBeLessThan(24)
  })

  it('北极星高度角接近当地纬度', () => {
    const date = new Date('2026-11-08T15:00:00Z')
    const { alt } = altAz(2.53, 89.26, 31.23, 121.47, date)
    expect(alt).toBeGreaterThan(28)
    expect(alt).toBeLessThan(34)
  })

  it('投影：天顶在画面中心，地平以下不投影', () => {
    const center = projectToScreen(90, 0, 1000, 800)
    expect(center).not.toBeNull()
    expect(center!.x).toBeCloseTo(500, 5)
    expect(center!.y).toBeCloseTo(400, 5)
    expect(projectToScreen(0, 0, 1000, 800)).toBeNull()
  })

  it('星等越亮亮度越高', () => {
    expect(magnitudeToBrightness(-1.46)).toBeGreaterThan(magnitudeToBrightness(4.5))
    expect(magnitudeToBrightness(20)).toBeGreaterThanOrEqual(0.12)
    expect(magnitudeToBrightness(-20)).toBeLessThanOrEqual(1)
  })

  it('闪烁：低频、有相位差、不会同步', () => {
    const t = 12.34
    const a = twinkle(t, 0.4, 0.05, 0.07)
    const b = twinkle(t, 2.9, 0.05, 0.07)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThanOrEqual(1)
    expect(Math.abs(a - b)).toBeGreaterThan(0.001)
    expect(Math.abs(twinkle(t, 0.4, 0.05, 0.07) - twinkle(t + 0.5, 0.4, 0.05, 0.07))).toBeLessThan(0.2)
  })

  it('computeSky 返回地平线以上、屏幕内的星', () => {
    const date = new Date('2026-11-08T15:30:00Z')
    const stars = computeSky(date, observerFromTimeZone('Asia/Shanghai'), 1280, 800, { limit: 300 })
    expect(stars.length).toBeGreaterThan(30)
    expect(stars.length).toBeLessThanOrEqual(300)
    for (const star of stars) {
      expect(star.brightness).toBeGreaterThanOrEqual(0.12)
      expect(star.brightness).toBeLessThanOrEqual(1)
      expect(star.periodA).toBeGreaterThan(0)
      expect(Number.isFinite(star.x)).toBe(true)
    }
    expect(mulberry32(1)()).toBe(mulberry32(1)())
  })
})
