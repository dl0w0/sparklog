import { DEFAULT_VIEWPORT } from '@shared/constants'
import type { Zone } from '@shared/types/document'
import { worldToScreen } from '@renderer/logic/layout/fitView'
import { bubbleCountInZone, zonesInLevel } from '@renderer/logic/zones'
import { enterZone, moveZoneCard, currentZoneId } from '@renderer/actions/zoneActions'
import { useDocStore } from '@renderer/store/docStore'
import { useUiStore } from '@renderer/store/uiStore'
import { ROOT_LEVEL, useViewportStore } from '@renderer/store/viewportStore'

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
              overflow: 'hidden'
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
                padding: '6px 10px',
                background: 'rgba(255,255,255,0.75)',
                borderBottom: '1px dashed #c9d1ef',
                fontSize: 12,
                color: '#5c6480'
              }}
            >
              <span style={{ fontWeight: 600 }}>▦ {zone.title}</span>
              <span>{count} 个气泡</span>
            </div>
            <div style={{ padding: 10, fontSize: 11, color: '#a2a9bf' }}>
              双击进入专区；在里面双击空白处可返回
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default ZoneLayer
