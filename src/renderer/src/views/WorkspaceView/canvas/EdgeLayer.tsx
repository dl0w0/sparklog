import { memo } from 'react'
import type { ViewMode } from '@shared/types/document'
import { buildEdgeGeometry } from '@renderer/logic/geometry'
import type { EntityGeometry, ViewEdge } from '@renderer/logic/links'

export interface EdgeLayerProps {
  edges: ViewEdge[]
  geometry: Map<string, EntityGeometry>
  mode: ViewMode
  selectedEdgeId: string | null
  onSelectEdge: (id: string) => void
  onEdgeContextMenu: (event: React.MouseEvent, id: string) => void
}

function EdgeLayerImpl({
  edges,
  geometry,
  mode,
  selectedEdgeId,
  onSelectEdge,
  onEdgeContextMenu
}: EdgeLayerProps): JSX.Element {
  return (
    <g className="sl-edges">
      {edges.map((edge) => {
        const from = geometry.get(edge.from)
        const to = geometry.get(edge.to)
        if (!from || !to) return null
        const geo = buildEdgeGeometry(from, to, mode)
        const selected = selectedEdgeId === edge.id
        const className = ['sl-edge', edge.dashed ? 'back' : '', selected ? 'selected' : '']
          .filter(Boolean)
          .join(' ')
        const strokeProps: React.SVGProps<SVGPathElement> = {}
        if (edge.color) strokeProps.stroke = edge.color
        if (edge.width) strokeProps.strokeWidth = edge.width
        return (
          <g key={edge.id}>
            {/* 透明加宽命中区：让细线也好点中（D49） */}
            <path
              className="sl-edge-hit"
              data-edge-hit={edge.id}
              d={geo.path}
              onPointerDown={(e) => {
                e.stopPropagation()
                onSelectEdge(edge.id)
              }}
              onContextMenu={(e) => onEdgeContextMenu(e, edge.id)}
            />
            <path
              className={className}
              data-edge-id={edge.id}
              data-edge-from={edge.from}
              data-edge-to={edge.to}
              d={geo.path}
              {...strokeProps}
            />
            {edge.label ? (
              <text
                className="sl-edge-label"
                x={(geo.from.x + geo.to.x) / 2}
                y={(geo.from.y + geo.to.y) / 2 - 6}
                textAnchor="middle"
              >
                {edge.label}
              </text>
            ) : null}
          </g>
        )
      })}
    </g>
  )
}

export const EdgeLayer = memo(EdgeLayerImpl)
export default EdgeLayer
