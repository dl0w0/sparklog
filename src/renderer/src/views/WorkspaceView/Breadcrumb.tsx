import { currentBreadcrumb, enterZone, exitZone } from '@renderer/actions/zoneActions'
import { useDocStore } from '@renderer/store/docStore'
import { useViewportStore } from '@renderer/store/viewportStore'

export function Breadcrumb(): JSX.Element | null {
  // 订阅层级与专区，保证进出专区时立即重渲染
  const levelId = useViewportStore((s) => s.levelId)
  const zones = useDocStore((s) => s.doc.zones)
  const crumbs = currentBreadcrumb()

  void levelId
  void zones
  if (crumbs.length <= 1) return null

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 10px',
        background: 'rgba(255,255,255,0.92)',
        border: '1px solid rgba(91,111,214,.2)',
        borderRadius: 8,
        fontSize: 12,
        boxShadow: '0 4px 14px rgba(35,45,90,.1)',
        zIndex: 25
      }}
    >
      {crumbs.map((crumb, index) => (
        <span key={crumb.id ?? 'root'} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {index > 0 && <span style={{ color: '#c3c8d8' }}>›</span>}
          <span
            style={{
              cursor: 'pointer',
              color: index === crumbs.length - 1 ? '#2a3050' : '#5c6480',
              fontWeight: index === crumbs.length - 1 ? 600 : 400
            }}
            onClick={() => {
              if (index === crumbs.length - 1) return
              if (crumb.id) enterZone(crumb.id)
              else exitZone()
            }}
          >
            {crumb.title}
          </span>
        </span>
      ))}
      <button
        className="sl-btn"
        style={{ marginLeft: 8, padding: '2px 8px', fontSize: 11 }}
        onClick={() => exitZone()}
      >
        ⌂ 返回主画布
      </button>
    </div>
  )
}

export default Breadcrumb
