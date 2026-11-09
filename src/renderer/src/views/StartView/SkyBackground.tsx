import { useEffect, useRef } from 'react'
import {
  buildTransition,
  computeSkyLayers,
  resolveObserver,
  twinkle,
  type SkyLayers,
  type SkyTween
} from '@renderer/logic/sky'

export interface SkyBackgroundProps {
  brightness?: number
  fov?: number
  starSize?: number
  showLabels?: boolean
  showConstellations?: boolean
  onFovChange?: (fov: number) => void
}

const TWEEN_MS = 700

const easeInOut = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/**
 * 开始窗口背景：实时星空（D88/D89）。
 * 经纬度或视野变化时，旧星位 → 新星位做连续插值，不重建、不闪屏。
 */
export function SkyBackground({
  brightness = 1.3,
  fov = 170,
  starSize = 0.75,
  showLabels = true,
  showConstellations = true,
  onFovChange
}: SkyBackgroundProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const optsRef = useRef({ brightness, fov, starSize, showLabels, showConstellations })
  optsRef.current = { brightness, fov, starSize, showLabels, showConstellations }
  const fovCbRef = useRef(onFovChange)
  fovCbRef.current = onFovChange

  const tweenRef = useRef<SkyTween | null>(null)
  const layersRef = useRef<SkyLayers>({ stars: [], labels: [], constellations: [] })
  const sizeRef = useRef({ w: 1, h: 1 })
  const requestRef = useRef<{ observerChanged: boolean; fovChanged: boolean }>({
    observerChanged: false,
    fovChanged: false
  })

  const buildLayers = (): SkyLayers => {
    const { w, h } = sizeRef.current
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const observer = resolveObserver({ timeZone })
    return computeSkyLayers(new Date(), observer, w, h, { fov: optsRef.current.fov })
  }

  /** 用「当前渲染位置」到「新位置」构建过渡（D89） */
  const rebuild = (instant: boolean): void => {
    const next = buildLayers()
    const current = layersRef.current

    if (instant || current.stars.length === 0) {
      layersRef.current = next
      tweenRef.current = null
      return
    }

    tweenRef.current = buildTransition(current, next, performance.now())
    layersRef.current = next
  }

  // 主循环：长生命周期，不随经纬度/视野重建
  useEffect(() => {
    const canvas = canvasRef.current
    const host = hostRef.current
    if (!canvas || !host) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    let raf = 0
    let disposed = false
    let lastPaint = 0
    let lastRefresh = 0

    const resize = (instant: boolean): void => {
      const rect = host.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      sizeRef.current = { w: rect.width, h: rect.height }
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      rebuild(instant)
    }
    resize(true)
    const observerHandle = new ResizeObserver(() => resize(false))
    observerHandle.observe(host)

    const paint = (now: number): void => {
      if (disposed) return
      const focused = document.hasFocus()
      const interval = focused ? 50 : 1000000
      if (now - lastPaint < interval) {
        raf = document.hidden ? 0 : requestAnimationFrame(paint)
        return
      }
      lastPaint = now

      const request = requestRef.current
      if (request.observerChanged || request.fovChanged) {
        request.observerChanged = false
        request.fovChanged = false
        rebuild(false)
      }
      // 每分钟按当前时间刷新一次星空
      if (now - lastRefresh > 60000) {
        lastRefresh = now
        if (!request.observerChanged) rebuild(false)
      }

      const { w, h } = sizeRef.current
      const opts = optsRef.current
      const t = now / 1000

      const sky = ctx.createLinearGradient(0, 0, 0, h)
      sky.addColorStop(0, '#03060f')
      sky.addColorStop(0.55, '#071226')
      sky.addColorStop(1, '#0d1e33')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, w, h)

      const tween = tweenRef.current
      const progress = reduced || !tween ? 1 : Math.min(1, (now - tween.start) / TWEEN_MS)
      const eased = easeInOut(progress)
      if (tween && progress >= 1) tweenRef.current = null

      const layers = layersRef.current

      // 星座层
      if (opts.showConstellations) {
        ctx.strokeStyle = `rgba(150, 180, 240, ${0.16 + (opts.brightness - 1) * 0.05})`
        ctx.lineWidth = 0.7
        const constellations = tween
          ? tween.constellations.map((item) => ({
              name: item.name,
              x: lerp(item.x0, item.x1, eased),
              y: lerp(item.y0, item.y1, eased),
              segments: item.segments.map((seg) => ({
                x1: lerp(seg.from.x1, seg.to.x1, eased),
                y1: lerp(seg.from.y1, seg.to.y1, eased),
                x2: lerp(seg.from.x2, seg.to.x2, eased),
                y2: lerp(seg.from.y2, seg.to.y2, eased)
              }))
            }))
          : layers.constellations

        for (const constellation of constellations) {
          ctx.beginPath()
          for (const seg of constellation.segments) {
            ctx.moveTo(seg.x1, seg.y1)
            ctx.lineTo(seg.x2, seg.y2)
          }
          ctx.stroke()
          ctx.font = '11px "Microsoft YaHei UI", "Segoe UI", sans-serif'
          ctx.fillStyle = `rgba(170, 200, 255, ${0.35 + (opts.brightness - 1) * 0.1})`
          ctx.textAlign = 'center'
          ctx.fillText(constellation.name, constellation.x, constellation.y)
        }
      }

      // 星星层
      const stars = tween
        ? tween.stars.map((star) => ({
            id: star.id,
            x: lerp(star.x0, star.x1, eased),
            y: lerp(star.y0, star.y1, eased),
            brightness: star.brightness,
            phase: star.phase,
            periodA: star.periodA,
            periodB: star.periodB
          }))
        : layers.stars

      for (const star of stars) {
        const tw = reduced ? 0.5 : twinkle(t, star.phase, star.periodA, star.periodB)
        const amplitude = 0.28
        const glow = star.brightness * (1 - amplitude + amplitude * tw) * opts.brightness
        const radius = (0.35 + star.brightness * 1.15) * opts.starSize

        ctx.globalAlpha = Math.min(1, 0.16 + glow * 0.72)
        ctx.fillStyle = '#f2f6ff'
        ctx.beginPath()
        ctx.arc(star.x, star.y, Math.max(0.25, radius), 0, Math.PI * 2)
        ctx.fill()

        if (star.brightness > 0.55) {
          const halo = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, radius * 5)
          halo.addColorStop(0, `rgba(214, 230, 255, ${0.2 * glow})`)
          halo.addColorStop(1, 'rgba(214, 230, 255, 0)')
          ctx.fillStyle = halo
          ctx.beginPath()
          ctx.arc(star.x, star.y, radius * 5, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1

      // 标签层
      if (opts.showLabels) {
        const labels = tween
          ? tween.labels.map((label) => ({
              name: label.name,
              x: lerp(label.x0, label.x1, eased),
              y: lerp(label.y0, label.y1, eased)
            }))
          : layers.labels
        ctx.font = '11px "Microsoft YaHei UI", "Segoe UI", sans-serif'
        ctx.textAlign = 'left'
        for (const label of labels) {
          ctx.fillStyle = `rgba(226, 236, 255, ${0.55 + (opts.brightness - 1) * 0.15})`
          ctx.fillText(label.name, label.x + 6, label.y - 6)
        }
      }

      raf = document.hidden ? 0 : requestAnimationFrame(paint)
    }

    const start = (): void => {
      if (raf) return
      lastRefresh = 0
      raf = requestAnimationFrame(paint)
    }
    const stop = (): void => {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }
    const onVisibility = (): void => {
      if (document.hidden) stop()
      else start()
    }

    const onFocus = (): void => start()
    start()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    return () => {
      disposed = true
      stop()
      observerHandle.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  // 视野变化：同样走过渡
  useEffect(() => {
    requestRef.current.fovChanged = true
  }, [fov])

  // 空白处滚轮 = 缩放星图
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const direction = event.deltaY < 0 ? 1 : -1
      const next = Math.min(240, Math.max(90, Math.round(fov + direction * 8)))
      fovCbRef.current?.(next)
    }
    host.addEventListener('wheel', onWheel, { passive: false })
    return () => host.removeEventListener('wheel', onWheel)
  }, [fov])

  return (
    <div ref={hostRef} className="sl-sky" data-sky="root">
      <canvas ref={canvasRef} data-sky="canvas" />
    </div>
  )
}

export default SkyBackground
