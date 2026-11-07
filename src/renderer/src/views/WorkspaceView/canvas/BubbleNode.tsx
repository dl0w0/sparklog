import { memo } from 'react'
import type { BubbleNode as BubbleNodeData, Vec2, ViewMode } from '@shared/types/document'
import { fittedFontSize, fontSizeOf, isRootNode, shapeOf, textOverflows } from '@renderer/logic/nodeVisual'
import { shapeMetrics } from '@renderer/logic/bubbleMetrics'

export interface BubbleNodeProps {
  node: BubbleNodeData
  pos: Vec2
  radius: number
  selected: boolean
  mode: ViewMode
  onPointerDown: (event: React.PointerEvent<SVGGElement>, id: string) => void
  onDoubleClick: (event: React.MouseEvent<SVGGElement>, id: string) => void
  onContextMenu: (event: React.MouseEvent<SVGGElement>, id: string) => void
  /** 折叠按钮相对气泡中心的偏移（D37：渲染在气泡自身的 transform 内） */
  toggleDx?: number
  toggleDy?: number
  toggleCollapsed?: boolean
  toggleCount?: number
  onToggle?: (id: string) => void
  /** 正在内联编辑：不再渲染文字层，避免重影（D43） */
  editing?: boolean
}

function BubbleNodeImpl({
  node,
  pos,
  radius,
  selected,
  mode,
  onPointerDown,
  onDoubleClick,
  onContextMenu,
  toggleDx,
  toggleDy,
  toggleCollapsed,
  toggleCount,
  onToggle,
  editing
}: BubbleNodeProps): JSX.Element {
  const shape = shapeOf(node)
  const metrics = shapeMetrics(shape, radius)
  const root = isRootNode(node)
  const baseFont = node.style?.fontSize ?? fontSizeOf(node, mode)
  const fontSize = fittedFontSize(node.text, radius, baseFont)
  const clamp = textOverflows(node.text, radius, fontSize)

  const classes = ['sl-bubble', root ? 'is-root' : '', selected ? 'is-selected' : '', node.collapsed ? 'is-collapsed' : '']
    .filter(Boolean)
    .join(' ')

  const glowRx = metrics.rx * 0.84
  const glowRy = metrics.ry * 0.66

  return (
    <g
      data-bubble-id={node.id}
      className={classes}
      transform={`translate(${pos.x} ${pos.y})`}
      onPointerDown={(e) => onPointerDown(e, node.id)}
      onDoubleClick={(e) => onDoubleClick(e, node.id)}
      onContextMenu={(e) => onContextMenu(e, node.id)}
    >
      {/* 柔和投影层（形状下方偏移一点点，避免 filter 抖动） */}
      <g className="bubble-shadow-layer" transform="translate(0 3)">
        {shape === 'circle' && <circle r={radius} />}
        {shape === 'ellipse' && <ellipse rx={metrics.rx} ry={metrics.ry} />}
        {shape === 'roundedRect' && (
          <rect
            x={-metrics.rx}
            y={-metrics.ry}
            width={metrics.rx * 2}
            height={metrics.ry * 2}
            rx={metrics.cornerRadius}
          />
        )}
      </g>

      {/* 主体填充 */}
      {shape === 'circle' && <circle className="bubble-fill" r={radius} />}
      {shape === 'ellipse' && <ellipse className="bubble-fill" rx={metrics.rx} ry={metrics.ry} />}
      {shape === 'roundedRect' && (
        <rect
          className="bubble-fill"
          x={-metrics.rx}
          y={-metrics.ry}
          width={metrics.rx * 2}
          height={metrics.ry * 2}
          rx={metrics.cornerRadius}
        />
      )}

      {/* 内层高光，制造「玻璃球」质感 */}
      <ellipse className="bubble-gloss" rx={glowRx} ry={glowRy} cy={-metrics.ry * 0.2} />

      {/* 描边 */}
      {shape === 'circle' && <circle className="bubble-stroke" r={radius} />}
      {shape === 'ellipse' && <ellipse className="bubble-stroke" rx={metrics.rx} ry={metrics.ry} />}
      {shape === 'roundedRect' && (
        <rect
          className="bubble-stroke"
          x={-metrics.rx}
          y={-metrics.ry}
          width={metrics.rx * 2}
          height={metrics.ry * 2}
          rx={metrics.cornerRadius}
        />
      )}

      {/* 选中光圈 */}
      {shape === 'circle' && <circle className="bubble-halo" r={radius + 5} />}
      {shape === 'ellipse' && <ellipse className="bubble-halo" rx={metrics.rx + 5} ry={metrics.ry + 5} />}
      {shape === 'roundedRect' && (
        <rect
          className="bubble-halo"
          x={-metrics.rx - 5}
          y={-metrics.ry - 5}
          width={metrics.rx * 2 + 10}
          height={metrics.ry * 2 + 10}
          rx={metrics.cornerRadius + 5}
        />
      )}

      {/* 折叠按钮：与气泡同一 transform 体系，拖拽/滑行/缩放时自动跟随 */}
      {onToggle && toggleDx !== undefined && toggleDy !== undefined && (toggleCount ?? 0) > 0 && (
        <g
          className={`sl-collapse-toggle${toggleCollapsed ? ' is-collapsed' : ''}`}
          transform={`translate(${toggleDx} ${toggleDy})`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onToggle(node.id)
          }}
        >
          <rect className="sl-collapse-hit" x={-13} y={-13} width={26} height={26} />
          <circle r={10} />
          <text textAnchor="middle" dominantBaseline="central">
            {toggleCollapsed ? toggleCount : '−'}
          </text>
        </g>
      )}

      {!editing && (
      <foreignObject x={-metrics.rx} y={-metrics.ry} width={metrics.rx * 2} height={metrics.ry * 2}>
        <div
          className={`sl-bubble-text${clamp ? ' clamp' : ''}`}
          style={{ fontSize: `${fontSize}px` }}
          title={node.text}
        >
          {node.text || ' '}
        </div>
      </foreignObject>
      )}
    </g>
  )
}

export const BubbleNode = memo(BubbleNodeImpl)
export default BubbleNode
