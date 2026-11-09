import { memo, useRef } from 'react'
import type { BubbleNode as BubbleNodeData, Vec2, ViewMode } from '@shared/types/document'
import {
  bubbleTextStyle,
  fontSizeOf,
  isBubbleTextTruncated,
  isRootNode,
  shapeOf,
  textBoxOf
} from '@renderer/logic/nodeVisual'
import { shapeMetrics } from '@renderer/logic/bubbleMetrics'
import { BUBBLE_TEXT_PADDING } from '@shared/constants'
import { getTypographySettings } from '@renderer/logic/runtimeSettings'
import { splitRuns } from '@renderer/logic/richText'
import type { TextRunStyle } from '@shared/types/document'
import { useSettingsStore } from '@renderer/store/settingsStore'

const LONG_HOVER_MS = 650

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
  /** 层级深度，用于默认字号递减（D65） */
  depth?: number
  /** 悬停回调（D73 tooltip） */
  onHover?: (id: string | null) => void
  /** 悬停在省略号上（D80） */
  onEllipsisHover?: (id: string | null) => void
  /** 长时间悬浮（D80） */
  onLongHover?: (id: string | null) => void
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
  editing,
  depth = 0,
  onHover,
  onEllipsisHover,
  onLongHover
}: BubbleNodeProps): JSX.Element {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 订阅设置变化，让内边距/字号等即时生效（D84）
  useSettingsStore((s) => s.effective)
  const shape = shapeOf(node)
  const metrics = shapeMetrics(shape, radius)
  const root = isRootNode(node)
  // 字号只由层级默认值 + style 覆盖决定，不随半径/缩放变化（D74）
  const fontSize = node.style?.fontSize ?? fontSizeOf(node, mode, depth)
  const padding = getTypographySettings().bubble.padding
  // 文字区 = 气泡真实形状的内接矩形（D75），四角不会压到圆弧
  const textBox = textBoxOf(shape, metrics, padding)
  // 与 CanvasStage 的判定保持一致（D83）
  const clamp = isBubbleTextTruncated(node, radius, depth)
  const maxLines = Math.max(1, Math.floor(textBox.h / (fontSize * 1.3)))
  const shared = bubbleTextStyle(node, depth)
  const textStyle: React.CSSProperties = {
    ...shared,
    fontSize: `${fontSize}px`,
    background: node.style?.highlight,
    padding: 0
  }

  const classes = ['sl-bubble', root ? 'is-root' : '', selected ? 'is-selected' : '', node.collapsed ? 'is-collapsed' : '']
    .filter(Boolean)
    .join(' ')

  const glowRx = metrics.rx * 0.84
  const glowRy = metrics.ry * 0.66

  return (
    <g
      onPointerEnter={() => {
        onHover?.(node.id)
        if (clamp) {
          longPressTimer.current = setTimeout(() => onLongHover?.(node.id), LONG_HOVER_MS)
        }
      }}
      onPointerLeave={() => {
        onHover?.(null)
        if (longPressTimer.current) clearTimeout(longPressTimer.current)
        onLongHover?.(null)
      }}
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
      <foreignObject x={-textBox.w / 2} y={-textBox.h / 2} width={textBox.w} height={textBox.h}>
        <div
          className={`sl-bubble-text${clamp ? ' clamp' : ''}`}
          style={{ ...textStyle, padding: 0, WebkitLineClamp: clamp ? maxLines : undefined }}
          title={clamp ? node.text : undefined}
        >
          {node.runs && node.runs.length > 0 ? (
            splitRuns(node.text, node.runs).map((segment, index) => {
              const style = segment.style as TextRunStyle
              return (
                <span
                  key={index}
                  style={{
                    fontFamily: style.fontFamily,
                    fontSize: style.fontSize ? `${style.fontSize}px` : undefined,
                    color: style.color,
                    fontWeight: style.bold ? 700 : undefined,
                    fontStyle: style.italic ? 'italic' : undefined,
                    textDecoration: style.underline ? 'underline' : undefined,
                    background: style.highlight
                  }}
                >
                  {segment.text}
                </span>
              )
            })
          ) : (
            node.text || ' '
          )}
        </div>
      </foreignObject>
      )}
      {!editing && clamp && (
        <rect
          className="sl-ellipsis-hit"
          x={textBox.w / 2 - Math.max(18, fontSize * 1.2)}
          y={textBox.h / 2 - fontSize * 1.2}
          width={Math.max(18, fontSize * 1.2)}
          height={fontSize * 1.2}
          fill="transparent"
          onPointerEnter={(e) => {
            e.stopPropagation()
            // 悬停省略号走「即时显示」通道，不算长按（D80）
            if (longPressTimer.current) clearTimeout(longPressTimer.current)
            onEllipsisHover?.(node.id)
          }}
          onPointerLeave={() => onEllipsisHover?.(null)}
        />
      )}
    </g>
  )
}

export const BubbleNode = memo(BubbleNodeImpl)
export default BubbleNode
