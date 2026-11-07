import { DEFAULT_VIEWPORT } from '@shared/constants'
import type { Zone } from '@shared/types/document'
import { worldToScreen } from '@renderer/logic/layout/fitView'
import { bubbleCountInZone, zonesInLevel } from '@renderer/logic/zones'
import { boundsOfItems, insertRadius } from '@renderer/logic/fitBounds'
import { makeRadiusResolver } from '@renderer/logic/nodeVisual'
import { deriveEdges } from '@renderer/logic/graph'
import { buildViewEdges } from '@renderer/logic/links'
import { insertDisplayPos } from '@renderer/actions/insertActions'
import { enterZone, moveZoneCard } from '@renderer/actions/zoneActions'
import { useDocStore } from '@renderer/store/docStore'
import { useUiStore } from '@renderer/store/uiStore'
import { ROOT_LEVEL, useViewportStore } from '@renderer/store/viewportStore'

/**
 * 专区卡片内的缩略预览（D62）：把专区内容按「适应画布」等比缩放，
 * 完整渲染气泡、插入项（含文字）、以及连线/关系线。
 */
function ZoneThumbnail({ zone }: { zone: Zone }): JSX.Element {
  const doc = useDocStore((s) => s.doc)
  const radiusOf = makeRadiusResolver(doc.nodes, doc.viewMode)
  const nodes = doc.nodes.filter((n) => n.zoneId === zone.id)
  const inserts = doc.inserts.filter((i) => i.zoneId === zone.id)

  const items = [
    ...nodes.map((n) => ({ pos: n.bubblePos, radius: radiusOf(n) })),
    ...inserts.map((i) => ({
      pos: insertDisplayPos(i, doc.nodes, doc.viewMode),
      radius: insertRadius(i) * 0.6
    }))
  ]
  const bounds = boundsOfItems(items, 60)

  if (!bounds || nodes.length + inserts.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          color: '#a2a9bf'
        }}
      >
        空专区
      </div>
    )
  }

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const insertById = new Map(inserts.map((i) => [i.id, i]))
  const edges = buildViewEdges(doc).filter((e) => byId.has(e.from) && byId.has(e.to))

  return (
    <svg
      viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: '100%', display: 'block', opacity: 0.95 }}
    >
      {/* 连线 / 关系线 */}
      {edges.map((edge) => {
        const a = byId.get(edge.from)
        const b = byId.get(edge.to)
        if (!a || !b) return null
        return (
          <line
            key={edge.id}
            x1={a.bubblePos.x}
            y1={a.bubblePos.y}
            x2={b.bubblePos.x}
            y2={b.bubblePos.y}
            stroke={edge.color ?? '#b9c2df'}
            strokeWidth={6}
            strokeDasharray={edge.dashed ? '18 12' : undefined}
          />
        )
      })}

      {/* 插入项 */}
      {inserts.map((insert) => {
        const p = insertDisplayPos(insert, doc.nodes, doc.viewMode)
        const label =
          insert.note?.title ?? insert.task?.items?.[0]?.text ?? insert.attachment?.name ?? insert.image?.name ?? ''
        return (
          <g key={insert.id}>
            <rect
              x={p.x - 44}
              y={p.y - 30}
              width={88}
              height={60}
              rx={10}
              fill="#ffffff"
              stroke="#c9d1ef"
              strokeWidth={4}
            />
            {label ? (
              <text x={p.x} y={p.y + 6} textAnchor="middle" fontSize={26} fill="#6b7285">
                {label.slice(0, 6)}
              </text>
            ) : null}
          </g>
        )
      })}

      {/* 气泡 + 文字 */}
      {nodes.map((node) => {
        const r = radiusOf(node)
        return (
          <g key={node.id}>
            <circle
              cx={node.bubblePos.x}
              cy={node.bubblePos.y}
              r={r}
              fill={node.parentIds.length === 0 ? '#e6ebff' : '#f4f6ff'}
              stroke={node.parentIds.length === 0 ? '#5b6fd6' : '#b8c1e8'}
              strokeWidth={node.parentIds.length === 0 ? 7 : 4}
            />
            {node.text ? (
              <text
                x={node.bubblePos.x}
                y={node.bubblePos.y + r * 0.18}
                textAnchor="middle"
                fontSize={Math.max(18, Math.min(30, r * 0.5))}
                fill="#2a3050"
              >
                {node.text.length > 6 ? `${node.text.slice(0, 6)}…` : node.text}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}

export function ZoneLayer(): JSX.Element {
  const doc = useDocStore((s) => s.doc)
  const levelId = useViewportStore((s) => s.levelId)
  const vp = useViewportStore((s) => s.viewports[s.levelId] ?? DEFAULT_VIEWPORT)

  if (levelId !== ROOT_LEVEL && !doc.zones.some((z) => z.id === levelId)) return <></>
  const parentZoneId = levelId === ROOT_LEVEL ? null : levelId
  const zones = zonesInLevel(doc.zones, parentZoneId)

  const beginDrag = (event: React.PointerEvent, zone: Zone): void => {
    if (event.button !== 0) return
    event.stopPropagation()
    const startX = event.clientX
    const startY = event.clientY
    const startPos = { ...zone.pos }
    let dx = 0
    let dy = 0
    const onMove = (ev: PointerEvent): void => {
      dx = (ev.clientX - startX) / vp.scale
      dy = (ev.clientY - startY) / vp.scale
      const el = document.querySelector<HTMLElement>(`[data-zone-id="${zone.id}"]`)
      if (el) {
        const screen = worldToScreen({ x: startPos.x + dx, y: startPos.y + dy }, vp)
        el.style.left = `${screen.x}px`
        el.style.top = `${screen.y}px`
      }
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      moveZoneCard(zone.id, dx, dy)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
      {zones.map((zone) => {
        const screen = worldToScreen(zone.pos, vp)
        const width = Math.max(80, zone.size.w * vp.scale)
        const height = Math.max(60, zone.size.h * vp.scale)
        const count = bubbleCountInZone(doc.nodes, zone.id)
        return (
          <div
            key={zone.id}
            data-zone-id={zone.id}
            style={{
              position: 'absolute',
              left: screen.x,
              top: screen.y,
              width,
              height,
              border: '1px dashed #c9d1ef',
              borderRadius: 12,
              background: 'rgba(91,111,214,0.05)',
              pointerEvents: 'auto',
              cursor: 'move',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
            onPointerDown={(e) => beginDrag(e, zone)}
            onDoubleClick={(e) => {
              e.stopPropagation()
              enterZone(zone.id)
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              useUiStore.getState().openContextMenu({ x: e.clientX, y: e.clientY, bubbleId: null, zoneId: zone.id })
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 8px',
                background: 'rgba(255,255,255,0.8)',
                borderBottom: '1px dashed #c9d1ef',
                fontSize: 11,
                color: '#5c6480',
                flex: '0 0 auto'
              }}
            >
              <span style={{ fontWeight: 600 }}>▦ {zone.title}</span>
              <span>{count} 个气泡</span>
            </div>
            <div style={{ flex: 1, minHeight: 0, padding: 4 }}>
              <ZoneThumbnail zone={zone} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default ZoneLayer
