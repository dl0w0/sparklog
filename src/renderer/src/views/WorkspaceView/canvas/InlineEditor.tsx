import { useEffect, useRef, useState } from 'react'
import type { BubbleNode, Vec2, ViewMode, Viewport } from '@shared/types/document'
import {
  BUBBLE_LINE_HEIGHT,
  bubbleTextStyle,
  countLinesInBox,
  shapeOf,
  textBoxOf
} from '@renderer/logic/nodeVisual'
import { BUBBLE_TEXT_PADDING } from '@shared/constants'
import { shapeMetrics } from '@renderer/logic/bubbleMetrics'
import { worldToScreen } from '@renderer/logic/layout/fitView'
import { useUiStore } from '@renderer/store/uiStore'
import { useSelectionStore } from '@renderer/store/selectionStore'
import { getTypographySettings } from '@renderer/logic/runtimeSettings'

export interface InlineEditorProps {
  node: BubbleNode
  pos: Vec2
  mode: ViewMode
  viewport: Viewport
  onCommit: (text: string) => void
  onCommitAndAddChild: (text: string) => void
  onCommitAndAddSibling: (text: string) => void
  onExit: (text: string) => void
  /** 层级深度（字号规则用） */
  depth?: number
  /** 气泡真实半径（排版盒必须与展示态一致） */
  radius?: number
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
  onExit,
  depth = 0,
  radius = 40
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

  const metrics = shapeMetrics(shapeOf(node), radius)
  const center = worldToScreen(pos, viewport)
  // 与气泡文字区一致：内接矩形 × 缩放，字号 = 层级默认/覆盖 × 缩放（D74/D75）
  const box = textBoxOf(shapeOf(node), metrics, getTypographySettings().bubble.padding)
  const width = box.w * viewport.scale
  const height = box.h * viewport.scale
  const shared = bubbleTextStyle(node, depth)
  const fontSize = Math.max(8, Number(shared.fontSize) * viewport.scale)
  // 垂直居中偏移：与展示层 flex 居中一致，避免进入编辑时文字跳位（D76）
  const lines = countLinesInBox(value, box.w, Number(shared.fontSize))
  const contentHeight = Math.min(height, lines * Number(shared.fontSize) * BUBBLE_LINE_HEIGHT * viewport.scale)
  const padTop = Math.max(0, (height - contentHeight) / 2)

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
        style={{
          ...shared,
          fontSize,
          lineHeight: BUBBLE_LINE_HEIGHT,
          paddingTop: padTop,
          paddingBottom: 0,
          paddingLeft: 0,
          paddingRight: 0,
          width,
          height,
          boxSizing: 'border-box',
          resize: 'none',
          overflow: 'hidden',
          border: 'none',
          outline: 'none',
          background: 'transparent'
        }}
        onChange={(e) => setValue(e.target.value)}
        onSelect={(e) => {
          const el = e.currentTarget
          const range =
            el.selectionStart === el.selectionEnd
              ? null
              : { start: el.selectionStart, end: el.selectionEnd }
          useSelectionStore.getState().setEditingRange(range)
        }}
        onKeyUp={(e) => {
          const el = e.currentTarget
          const range =
            el.selectionStart === el.selectionEnd
              ? null
              : { start: el.selectionStart, end: el.selectionEnd }
          useSelectionStore.getState().setEditingRange(range)
        }}
        onBlur={() => finish('commit')}
        onContextMenu={(e) => {
          const el = e.currentTarget
          // 只有选中了文字才弹格式菜单，否则交给画布/气泡菜单（D72）
          if (el.selectionStart === el.selectionEnd) return
          e.preventDefault()
          e.stopPropagation()
          useUiStore.getState().openContextMenu({
            x: e.clientX,
            y: e.clientY,
            bubbleId: null,
            textNodeId: node.id
          })
        }}
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
