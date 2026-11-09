/**
 * 夜空星图（D87）：真实星表 + astronomy-engine 计算地平坐标。
 * 星表：src/renderer/src/data/stars.json（最亮约 1200 颗，来源见同目录 NOTICE）。
 */

import { Observer, SiderealTime, Horizon } from 'astronomy-engine'
import catalog from '../data/stars.json'

export interface ObserverPoint {
  latitude: number
  longitude: number
  source: string
}

export interface SkyStar {
  ra: number
  dec: number
  mag: number
  name?: string
}

export interface ScreenStar {
  /** 星表下标，用于跨观测点插值 */
  id: number
  x: number
  y: number
  /** 亮度 0–1 */
  brightness: number
  /** 每颗星独立的闪烁参数，避免同步 */
  phase: number
  /** 主周期（秒，4–8） */
  periodA: number
  /** 次周期（秒，更长） */
  periodB: number
  name?: string
}

/** 时区 → 观测点（用户在设置里填了经纬度时优先用设置） */
const TIMEZONE_OBSERVERS: Record<string, [number, number]> = {
  'Asia/Shanghai': [31.23, 121.47],
  'Asia/Chongqing': [29.56, 106.55],
  'Asia/Harbin': [45.8, 126.53],
  'Asia/Urumqi': [43.83, 87.62],
  'Asia/Hong_Kong': [22.32, 114.17],
  'Asia/Taipei': [25.03, 121.56],
  'Asia/Tokyo': [35.68, 139.69],
  'Asia/Seoul': [37.57, 126.98],
  'Asia/Singapore': [1.35, 103.82],
  'Europe/London': [51.51, -0.13],
  'Europe/Paris': [48.86, 2.35],
  'Europe/Berlin': [52.52, 13.4],
  'America/New_York': [40.71, -74.01],
  'America/Los_Angeles': [34.05, -118.24],
  'America/Chicago': [41.88, -87.63],
  'Australia/Sydney': [-33.87, 151.21]
}

export const DEFAULT_OBSERVER: ObserverPoint = {
  latitude: 31.23,
  longitude: 121.47,
  source: '默认（北京）'
}

export function observerFromTimeZone(timeZone: string | undefined): ObserverPoint {
  if (!timeZone) return DEFAULT_OBSERVER
  const hit = TIMEZONE_OBSERVERS[timeZone]
  if (!hit) return { ...DEFAULT_OBSERVER, source: `未知时区 ${timeZone}，使用默认观测点` }
  return { latitude: hit[0], longitude: hit[1], source: timeZone }
}

/** 优先用户设置，其次时区推断 */
export function resolveObserver(options: {
  latitude?: number | null
  longitude?: number | null
  timeZone?: string
}): ObserverPoint {
  const { latitude, longitude } = options
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return { latitude: latitude as number, longitude: longitude as number, source: '手动设置' }
  }
  return observerFromTimeZone(options.timeZone)
}

const RAD = Math.PI / 180

const rawCatalog = catalog as [number, number, number][]

/** 内置真实星表 */
export const STAR_CATALOG: SkyStar[] = rawCatalog.map(([ra, dec, mag]) => ({
  ra: ((ra % 24) + 24) % 24,
  dec,
  mag
}))

/** 格林尼治平恒星时（小时），由 astronomy-engine 计算 */
export function gmstHours(date: Date): number {
  return SiderealTime(date)
}

/** 本地恒星时（小时） */
export function localSiderealHours(date: Date, longitude: number): number {
  return (((gmstHours(date) + longitude / 15) % 24) + 24) % 24
}

/** 赤道坐标 → 地平坐标（度），用 astronomy-engine 的 Horizon（含岁差/章动/折射） */
export function altAz(
  raHours: number,
  decDeg: number,
  latitude: number,
  longitude: number,
  date: Date = new Date()
): { alt: number; az: number } {
  const observer = new Observer(latitude, longitude, 0)
  const hor = Horizon(date, observer, raHours, decDeg, 'normal')
  return { alt: hor.altitude, az: hor.azimuth }
}

/** 天顶等距投影：画面中央 = 天顶 */
export function projectToScreen(
  alt: number,
  az: number,
  width: number,
  height: number
): { x: number; y: number } | null {
  if (alt <= 2) return null
  const maxR = Math.hypot(width, height) * 0.62
  const r = ((90 - alt) / 90) * maxR
  const rad = az * RAD
  return {
    x: width / 2 + Math.sin(rad) * r,
    y: height / 2 - Math.cos(rad) * r
  }
}

/** 星等 → 亮度 0–1 */
export function magnitudeToBrightness(mag: number): number {
  const value = (6.2 - mag) / 7.4
  return Math.max(0.12, Math.min(1, value))
}

/** 稳定伪随机 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 低频缓慢不规则闪烁（D90）：
 * 主周期 4–8 秒、次周期更长且不可公约，相位随机不同步；
 * 幅度温和（约 ±18%），并叠加少量偶发微亮。
 */
export function twinkle(t: number, phase: number, periodA: number, periodB: number): number {
  const a = Math.sin((t / Math.max(0.5, periodA)) * Math.PI * 2 + phase)
  const b = Math.sin((t / Math.max(0.5, periodB)) * Math.PI * 2 * 1.618 + phase * 1.7)
  const base = 0.5 + 0.26 * a + 0.12 * b
  // 偶发微亮：周期很长的高次幂脉冲，出现少、幅度小
  const flarePhase = (phase * 3.7 + 1.3) % (Math.PI * 2)
  const flare = Math.pow(Math.max(0, Math.sin((t / (periodA * 6.5)) * Math.PI * 2 + flarePhase)), 16)
  return Math.max(0, Math.min(1, base + flare * 0.18))
}

export interface ComputeSkyOptions {
  /** 最多返回多少颗（按亮度） */
  limit?: number
  seed?: number
}

/** 计算某一时刻、某一地点可见（地平线以上）的星星屏幕坐标 */
export function computeSky(
  date: Date,
  observer: ObserverPoint,
  width: number,
  height: number,
  options: ComputeSkyOptions = {}
): ScreenStar[] {
  const limit = options.limit ?? 420
  const random = mulberry32(options.seed ?? 20261108)
  const result: ScreenStar[] = []

  for (const star of STAR_CATALOG) {
    if (result.length >= limit) break
    // 只画肉眼明显的星，减少计算量（每颗星都要做一次地平坐标解算）
    if (star.mag > 4.2) continue
    const { alt, az } = altAz(star.ra, star.dec, observer.latitude, observer.longitude, date)
    const screen = projectToScreen(alt, az, width, height)
    if (!screen) continue
    if (screen.x < -200 || screen.y < -200 || screen.x > width + 200 || screen.y > height + 200) {
      continue
    }
    result.push({
      id: result.length,
      x: screen.x,
      y: screen.y,
      brightness: magnitudeToBrightness(star.mag),
      phase: random() * Math.PI * 2,
      periodA: 4 + random() * 4,
      periodB: 7 + random() * 7
    })
  }
  return result
}


/** 重要恒星（带名称，用于标签层） */
export const NAMED_STARS: { name: string; ra: number; dec: number; mag: number }[] = [
  { name: '天狼星', ra: 6.7525, dec: -16.716, mag: -1.44 },
  { name: '老人星', ra: 6.399, dec: -52.7, mag: -0.72 },
  { name: '大角星', ra: 14.261, dec: 19.18, mag: -0.05 },
  { name: '织女星', ra: 18.615, dec: 38.78, mag: 0.03 },
  { name: '五车二', ra: 5.278, dec: 45.99, mag: 0.08 },
  { name: '参宿七', ra: 5.242, dec: -8.2, mag: 0.13 },
  { name: '南河三', ra: 7.655, dec: 5.22, mag: 0.34 },
  { name: '参宿四', ra: 5.919, dec: 7.41, mag: 0.5 },
  { name: '牛郎星', ra: 19.846, dec: 8.87, mag: 0.77 },
  { name: '毕宿五', ra: 4.599, dec: 16.51, mag: 0.85 },
  { name: '心宿二', ra: 16.49, dec: -26.43, mag: 1.09 },
  { name: '角宿一', ra: 13.42, dec: -11.16, mag: 1.04 },
  { name: '北河三', ra: 7.755, dec: 28.03, mag: 1.14 },
  { name: '北落师门', ra: 22.961, dec: -29.62, mag: 1.16 },
  { name: '天津四', ra: 20.69, dec: 45.28, mag: 1.25 },
  { name: '轩辕十四', ra: 10.14, dec: 11.97, mag: 1.35 },
  { name: '北极星', ra: 2.53, dec: 89.26, mag: 1.98 }
]

export interface Constellation {
  name: string
  /** 以 RA(小时)/Dec(度) 表示的成员星坐标，按线段顺序连成折线 */
  lines: { ra: number; dec: number }[][]
}

/** 常见星座的简化连线（成员星坐标近似值） */
export const CONSTELLATIONS: Constellation[] = [
  {
    name: '猎户座',
    lines: [
      [
        { ra: 5.919, dec: 7.41 },
        { ra: 5.795, dec: 9.93 },
        { ra: 5.418, dec: 6.35 },
        { ra: 5.242, dec: -8.2 },
        { ra: 5.533, dec: -9.67 },
        { ra: 5.603, dec: -1.2 },
        { ra: 5.919, dec: 7.41 }
      ],
      [
        { ra: 5.418, dec: 6.35 },
        { ra: 5.533, dec: -9.67 }
      ],
      [
        { ra: 5.242, dec: -8.2 },
        { ra: 4.599, dec: 16.51 }
      ]
    ]
  },
  {
    name: '大熊座',
    lines: [
      [
        { ra: 11.062, dec: 61.75 },
        { ra: 11.031, dec: 56.38 },
        { ra: 11.897, dec: 53.69 },
        { ra: 12.257, dec: 57.03 },
        { ra: 12.9, dec: 55.96 },
        { ra: 13.399, dec: 54.93 },
        { ra: 13.792, dec: 49.31 }
      ]
    ]
  },
  {
    name: '仙后座',
    lines: [
      [
        { ra: 0.153, dec: 59.15 },
        { ra: 0.675, dec: 56.54 },
        { ra: 0.945, dec: 60.72 },
        { ra: 1.43, dec: 60.24 },
        { ra: 1.907, dec: 63.67 }
      ]
    ]
  },
  {
    name: '天鹅座',
    lines: [
      [
        { ra: 20.69, dec: 45.28 },
        { ra: 20.37, dec: 40.26 },
        { ra: 19.749, dec: 45.13 },
        { ra: 20.77, dec: 33.97 }
      ],
      [
        { ra: 20.37, dec: 40.26 },
        { ra: 21.215, dec: 30.23 }
      ]
    ]
  },
  {
    name: '天琴座',
    lines: [
      [
        { ra: 18.615, dec: 38.78 },
        { ra: 18.746, dec: 37.6 },
        { ra: 18.834, dec: 36.9 },
        { ra: 18.982, dec: 32.69 },
        { ra: 18.746, dec: 37.6 }
      ]
    ]
  },
  {
    name: '天蝎座',
    lines: [
      [
        { ra: 16.09, dec: -19.81 },
        { ra: 16.21, dec: -19.46 },
        { ra: 16.35, dec: -25.59 },
        { ra: 16.49, dec: -26.43 },
        { ra: 16.6, dec: -28.22 },
        { ra: 16.86, dec: -38.05 },
        { ra: 16.9, dec: -42.36 }
      ]
    ]
  },
  {
    name: '狮子座',
    lines: [
      [
        { ra: 10.14, dec: 11.97 },
        { ra: 10.28, dec: 23.42 },
        { ra: 11.24, dec: 20.52 },
        { ra: 11.14, dec: 15.43 },
        { ra: 10.33, dec: 19.84 },
        { ra: 10.14, dec: 11.97 }
      ]
    ]
  },
  {
    name: '御夫座',
    lines: [
      [
        { ra: 5.278, dec: 45.99 },
        { ra: 5.995, dec: 44.95 },
        { ra: 5.438, dec: 28.61 },
        { ra: 5.992, dec: 37.21 },
        { ra: 5.278, dec: 45.99 }
      ]
    ]
  }
]

export interface SkyPoint {
  ra: number
  dec: number
  x: number
  y: number
  alt: number
}

export interface SkyLayers {
  stars: ScreenStar[]
  labels: { x: number; y: number; name: string }[]
  constellations: { name: string; x: number; y: number; segments: { x1: number; y1: number; x2: number; y2: number }[] }[]
}

/** 按视野角（度）做天顶等距投影 */
export function projectWithFov(
  alt: number,
  az: number,
  width: number,
  height: number,
  fovDeg: number
): { x: number; y: number } | null {
  if (alt <= 1) return null
  const fov = Math.max(60, Math.min(240, fovDeg))
  const radius = (Math.min(width, height) / 2) * (180 / fov) * 1.15
  const r = ((90 - alt) / 90) * radius
  const rad = (az * Math.PI) / 180
  return { x: width / 2 + Math.sin(rad) * r, y: height / 2 - Math.cos(rad) * r }
}

/** 计算星星、标签、星座连线三层 */
export function computeSkyLayers(
  date: Date,
  observer: ObserverPoint,
  width: number,
  height: number,
  options: { fov: number; limit?: number; seed?: number } = { fov: 170 }
): SkyLayers {
  const limit = options.limit ?? 420
  const random = mulberry32(options.seed ?? 20261108)
  const stars: ScreenStar[] = []

  for (const star of STAR_CATALOG) {
    if (stars.length >= limit) break
    if (star.mag > 4.4) continue
    const { alt, az } = altAz(star.ra, star.dec, observer.latitude, observer.longitude, date)
    const screen = projectWithFov(alt, az, width, height, options.fov)
    if (!screen) continue
    if (screen.x < -100 || screen.y < -100 || screen.x > width + 100 || screen.y > height + 100) continue
    stars.push({
      id: STAR_CATALOG.indexOf(star),
      x: screen.x,
      y: screen.y,
      brightness: magnitudeToBrightness(star.mag),
      phase: random() * Math.PI * 2,
      periodA: 4 + random() * 4,
      periodB: 7 + random() * 7
    })
  }

  const labels: SkyLayers['labels'] = []
  for (const star of NAMED_STARS) {
    const { alt, az } = altAz(star.ra, star.dec, observer.latitude, observer.longitude, date)
    const screen = projectWithFov(alt, az, width, height, options.fov)
    if (!screen) continue
    if (screen.x < 40 || screen.y < 40 || screen.x > width - 40 || screen.y > height - 40) continue
    labels.push({ x: screen.x, y: screen.y, name: star.name })
  }

  const constellations: SkyLayers['constellations'] = []
  for (const constellation of CONSTELLATIONS) {
    const points = constellation.lines.map((line) =>
      line.map((node) => {
        const { alt, az } = altAz(node.ra, node.dec, observer.latitude, observer.longitude, date)
        return { alt, az, screen: projectWithFov(alt, az, width, height, options.fov) }
      })
    )
    const segments: SkyLayers['constellations'][number]['segments'] = []
    let sumX = 0
    let sumY = 0
    let count = 0
    let visible = 0
    for (const line of points) {
      for (let i = 0; i < line.length; i++) {
        const node = line[i]
        if (!node.screen) continue
        visible += 1
        sumX += node.screen.x
        sumY += node.screen.y
        count += 1
        const next = line[i + 1]
        if (next?.screen) {
          segments.push({
            x1: node.screen.x,
            y1: node.screen.y,
            x2: next.screen.x,
            y2: next.screen.y
          })
        }
      }
    }
    if (segments.length === 0 || count === 0 || visible < 2) continue
    constellations.push({ name: constellation.name, x: sumX / count, y: sumY / count, segments })
  }

  return { stars, labels, constellations }
}


export interface SkyTween {
  start: number
  stars: {
    id: number
    x0: number
    y0: number
    x1: number
    y1: number
    brightness: number
    phase: number
    periodA: number
    periodB: number
  }[]
  labels: { name: string; x0: number; y0: number; x1: number; y1: number }[]
  constellations: {
    name: string
    x0: number
    y0: number
    x1: number
    y1: number
    segments: {
      from: { x1: number; y1: number; x2: number; y2: number }
      to: { x1: number; y1: number; x2: number; y2: number }
    }[]
  }[]
}

/** 用旧星位 → 新星位构建过渡（D89），保证经纬度变化时画面连续 */
export function buildTransition(from: SkyLayers, to: SkyLayers, start: number): SkyTween {
  const oldStars = new Map(from.stars.map((star) => [star.id, star]))
  const stars = to.stars.map((star) => {
    const previous = oldStars.get(star.id)
    return {
      id: star.id,
      x0: previous?.x ?? star.x,
      y0: previous?.y ?? star.y,
      x1: star.x,
      y1: star.y,
      brightness: star.brightness,
      phase: star.phase,
      periodA: star.periodA,
      periodB: star.periodB
    }
  })

  const oldLabels = new Map(from.labels.map((label) => [label.name, label]))
  const labels = to.labels.map((label) => {
    const previous = oldLabels.get(label.name)
    return {
      name: label.name,
      x0: previous?.x ?? label.x,
      y0: previous?.y ?? label.y,
      x1: label.x,
      y1: label.y
    }
  })

  const oldConstellations = new Map(from.constellations.map((item) => [item.name, item]))
  const constellations = to.constellations.map((item) => {
    const previous = oldConstellations.get(item.name) ?? item
    return {
      name: item.name,
      x0: previous.x,
      y0: previous.y,
      x1: item.x,
      y1: item.y,
      segments: item.segments.map((segment, index) => ({
        from: previous.segments[Math.min(index, previous.segments.length - 1)] ?? segment,
        to: segment
      }))
    }
  })

  return { start, stars, labels, constellations }
}
