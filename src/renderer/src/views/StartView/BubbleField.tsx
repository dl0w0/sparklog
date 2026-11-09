import { useEffect, useMemo, useRef, useState } from 'react'
import type { RecentFileEntry } from '@shared/types/ipc'
import { stepPhysics, type PhysicsBody, type Spring } from '@renderer/logic/physics'

export interface BubbleFieldProps {
  entries: RecentFileEntry[]
  onOpen: (entry: RecentFileEntry) => void
  maxVisible?: number
}

const RADIUS = 52
/** 网格连线：所有连线共用同一个静止长度（D90） */
export const LINK_REST_RATIO = 0.36

export function uniformRest(width: number, height: number): number {
  return Math.max(180, Math.min(width, height) * LINK_REST_RATIO)
}

/** 越早的文件透明度越低（1.0 → 0.35） */
export function opacityFor(index: number, total: number): number {
  if (total <= 1) return 1
  const t = Math.min(1, Math.max(0, index / (total - 1)))
  return 1 - t * 0.65
}

/** 完全图的所有连线（n(n-1)/2 条） */
export function meshPairs(count: number): [number, number][] {
  const pairs: [number, number][] = []
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) pairs.push([i, j])
  }
  return pairs
}

/**
 * 最近文件气泡：彼此连线成网格，物理完全复用画布的 physics（D90）。
 * 弹性 / 阻尼 / 斥力 / 惯性都走 stepPhysics 与同一份运行时设置。
 */
export function BubbleField({ entries, onOpen, maxVisible = 5 }: BubbleFieldProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const nodesRef = useRef<(HTMLButtonElement | null)[]>([])
  const bodiesRef = useRef<PhysicsBody[]>([])
  const linesRef = useRef<SVGLineElement[]>([])
  const dragRef = useRef<{ index: number; offsetX: number; offsetY: number; moved: number } | null>(
    null
  )
  const [moreOpen, setMoreOpen] = useState(false)

  const visible = useMemo(() => entries.slice(0, maxVisible), [entries, maxVisible])
  const hidden = useMemo(() => entries.slice(maxVisible), [entries, maxVisible])
  const pairs = useMemo(() => meshPairs(visible.length), [visible.length])

  // 初始化物理体：均匀铺开，避免一上来就互相挤压
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const rect = host.getBoundingClientRect()
    const rest = uniformRest(rect.width, rect.height)
    const previous = bodiesRef.current
    bodiesRef.current = visible.map((_, index) => {
      const old = previous[index]
      if (old) return { ...old, fixed: false }
      const columns = Math.max(1, Math.min(3, visible.length))
      const col = index % columns
      const row = Math.floor(index / columns)
      return {
        id: `bubble-${index}`,
        x: rect.width * (0.26 + col * 0.24),
        y: rect.height * (0.34 + row * 0.28),
        vx: 0,
        vy: 0,
        radius: RADIUS,
        fixed: false
      }
    })
    void rest
  }, [visible])

  // 物理循环：与画布同一套 stepPhysics
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let raf = 0
    let disposed = false
    let last = performance.now()

    const tick = (now: number): void => {
      if (disposed) return
      const focused = document.hasFocus()
      if (!focused) {
        raf = document.hidden ? 0 : requestAnimationFrame(tick)
        return
      }
      const dt = Math.min(2, Math.max(0.2, (now - last) / 16.67))
      last = now
      const rect = host.getBoundingClientRect()
      const bodies = bodiesRef.current
      if (bodies.length === 0) {
        raf = requestAnimationFrame(tick)
        return
      }

      const dragging = dragRef.current
      for (const body of bodies) body.fixed = false
      if (dragging && bodies[dragging.index]) {
        bodies[dragging.index].fixed = true
      }

      const rest = uniformRest(rect.width, rect.height)
      const springs: Spring[] = pairs.map(([i, j]) => ({
        a: bodies[i].id,
        b: bodies[j].id,
        rest
      }))

      // 与画布相同的积分器：弹簧 + 斥力 + 阻尼
      const steps = Math.max(1, Math.min(3, Math.round(dt)))
      for (let step = 0; step < steps; step++) {
        stepPhysics(bodies, springs, { padding: 10 })
      }

      // 边界夹紧
      for (const body of bodies) {
        const pad = body.radius + 6
        if (body.x < pad) {
          body.x = pad
          body.vx = Math.abs(body.vx) * 0.5
        }
        if (body.x > rect.width - pad) {
          body.x = rect.width - pad
          body.vx = -Math.abs(body.vx) * 0.5
        }
        if (body.y < pad) {
          body.y = pad
          body.vy = Math.abs(body.vy) * 0.5
        }
        if (body.y > rect.height - pad) {
          body.y = rect.height - pad
          body.vy = -Math.abs(body.vy) * 0.5
        }
      }

      // 写 DOM：气泡位置 + 连线端点
      bodies.forEach((body, index) => {
        const el = nodesRef.current[index]
        if (el) {
          el.style.transform = `translate(${body.x}px, ${body.y}px) translate(-50%, -50%)`
        }
      })
      pairs.forEach(([i, j], index) => {
        const line = linesRef.current[index]
        if (!line) return
        line.setAttribute('x1', String(bodies[i].x))
        line.setAttribute('y1', String(bodies[i].y))
        line.setAttribute('x2', String(bodies[j].x))
        line.setAttribute('y2', String(bodies[j].y))
      })

      raf = requestAnimationFrame(tick)
    }

    const start = (): void => {
      if (raf) return
      last = performance.now()
      raf = requestAnimationFrame(tick)
    }
    const onVisibility = (): void => {
      if (!document.hidden) start()
      else if (raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    }
    const onFocus = (): void => start()

    start()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    return () => {
      disposed = true
      if (raf) cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
    }
  }, [pairs])

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>, index: number): void => {
    const host = hostRef.current
    const body = bodiesRef.current[index]
    if (!host || !body) return
    const rect = host.getBoundingClientRect()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      index,
      offsetX: event.clientX - rect.left - body.x,
      offsetY: event.clientY - rect.top - body.y,
      moved: 0
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current
    const host = hostRef.current
    if (!drag || !host) return
    const body = bodiesRef.current[drag.index]
    if (!body) return
    const rect = host.getBoundingClientRect()
    const nx = event.clientX - rect.left - drag.offsetX
    const ny = event.clientY - rect.top - drag.offsetY
    drag.moved += Math.hypot(nx - body.x, ny - body.y)
    body.vx = (nx - body.x) * 0.9
    body.vy = (ny - body.y) * 0.9
    body.x = nx
    body.y = ny
  }

  const endDrag = (event: React.PointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    if (drag.moved < 6) {
      const entry = visible[drag.index]
      if (entry) onOpen(entry)
    }
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  return (
    <div className="sl-bubbles" data-bubbles="root" ref={hostRef}>
      <svg className="sl-bubbles-links" ref={svgRef} data-bubbles="links">
        {pairs.map(([i, j], index) => (
          <line
            key={`${i}-${j}`}
            ref={(el) => {
              if (el) linesRef.current[index] = el
            }}
            className="sl-bubbles-link"
            data-bubbles="link"
          />
        ))}
      </svg>

      {visible.map((entry, index) => (
        <button
          key={entry.path}
          ref={(el) => {
            nodesRef.current[index] = el
          }}
          className="sl-bubble"
          data-bubbles="bubble"
          style={{ opacity: opacityFor(index, entries.length) }}
          title={entry.path}
          onPointerDown={(e) => onPointerDown(e, index)}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onWheel={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onOpen(entry)
            }
          }}
        >
          <span className="sl-bubble-name">{entry.name.replace(/\.insp$/i, '')}</span>
        </button>
      ))}

      {hidden.length > 0 && (
        <button className="sl-bubbles-more" data-bubbles="more" onClick={() => setMoreOpen(true)}>
          更多历史文件（{hidden.length}）
        </button>
      )}

      {moreOpen && (
        <div className="sl-bubbles-dialog-mask" onClick={() => setMoreOpen(false)}>
          <div className="sl-bubbles-dialog" data-bubbles="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="sl-bubbles-dialog-title">更多历史文件</div>
            <div className="sl-bubbles-dialog-list">
              {hidden.map((entry, index) => (
                <button
                  key={entry.path}
                  className="sl-bubbles-dialog-item"
                  style={{ opacity: opacityFor(visible.length + index, entries.length) }}
                  onClick={() => {
                    setMoreOpen(false)
                    onOpen(entry)
                  }}
                  title={entry.path}
                >
                  {entry.name}
                </button>
              ))}
            </div>
            <button className="sl-bubbles-dialog-close" onClick={() => setMoreOpen(false)}>
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default BubbleField
