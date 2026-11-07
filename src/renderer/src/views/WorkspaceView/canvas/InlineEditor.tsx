import { useEffect, useRef, useState } from 'react'
import type { BubbleNode, Vec2, ViewMode, Viewport } from '@shared/types/document'
import { fontSizeOf, shapeOf } from '@renderer/logic/nodeVisual'
import { shapeMetrics } from '@renderer/logic/bubbleMetrics'
import { worldToScreen } from '@renderer/logic/layout/fitView'

export interface InlineEditorProps {
  node: BubbleNode
  pos: Vec2
  mode: ViewMode
  viewport: Viewport
  onCommit: (text: string) => void
  onCommitAndAddChild: (text: string) => void
  onCommitAndAddSibling: (text: string) => void
  onExit: (text: string) => void
}

/**
 * 内联编辑（D25）：不画任何方框，文字直接叠在气泡里编辑，
 * 只有光标和气泡本身的轻微选中光圈。
 */
export function InlineEditor({
  node,
  pos,
  mode,
  viewport,
  onCommit,
  onCommitAndAddChild,
  onCommitAndAddSibling,
  onExit
}: InlineEditorProps): JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState(node.text)
  const committed = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(value.length, value.length)
    // 只在挂载时聚焦一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const metrics = shapeMetrics(shapeOf(node), 40)
  const center = worldToScreen(pos, viewport)
  const width = Math.max(80, metrics.rx * 1.62 * viewport.scale)
  const height = Math.max(38, metrics.ry * 1.4 * viewport.scale)
  const fontSize = Math.max(11, fontSizeOf(node, mode) * Math.min(1.15, Math.max(0.7, viewport.scale)))

  const finish = (action: 'commit' | 'child' | 'sibling' | 'exit'): void => {
    if (committed.current) return
    committed.current = true
    if (action === 'commit') onCommit(value)
    else if (action === 'child') onCommitAndAddChild(value)
    else if (action === 'sibling') onCommitAndAddSibling(value)
    else onExit(value)
  }

  return (
    <div
      className="sl-inline-editor"
      style={{
        left: center.x - width / 2,
        top: center.y - height / 2,
        width,
        height
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <textarea
        ref={ref}
        value={value}
        style={{ fontSize, lineHeight: 1.3 }}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => finish('commit')}
        onKeyDown={(e) => {
          // D31：Enter 换行；Ctrl+Enter 提交并建同级；Tab 提交并建子；Esc 提交退出
          if (e.key === 'Tab') {
            e.preventDefault()
            finish('child')
          } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            finish('sibling')
          } else if (e.key === 'Enter') {
            // 交给 textarea 原生换行
          } else if (e.key === 'Escape') {
            e.preventDefault()
            finish('exit')
          }
          e.stopPropagation()
        }}
      />
    </div>
  )
}

export default InlineEditor
