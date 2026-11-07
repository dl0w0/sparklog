import { useEffect, useLayoutEffect, useRef } from 'react'
import type { BubbleNode } from '@shared/types/document'
import { applyTextTransient, commitTransientText } from '@renderer/actions/bubbleActions'

export interface BubbleTextTipProps {
  node: BubbleNode
  depth: number
  /** 屏幕坐标：气泡中心 x 与提示框顶部 y */
  x: number
  y: number
  editing: boolean
  onStartEdit: () => void
  onClose: () => void
  onHoverChange?: (hovering: boolean) => void
}

/**
 * 气泡上方的全文文本框（D77/D81）：
 * 点击即在点击位置落光标进入编辑；框内按住拖动只做文本选择，事件不穿透到画布。
 */
export function BubbleTextTip({
  node,
  x,
  y,
  editing,
  onStartEdit,
  onClose,
  onHoverChange
}: BubbleTextTipProps): JSX.Element {
  const textRef = useRef<HTMLDivElement>(null)
  const editingRef = useRef(editing)
  editingRef.current = editing

  // 外部文字变化时同步（正在输入时不打断光标）
  useLayoutEffect(() => {
    const el = textRef.current
    if (!el) return
    if (document.activeElement === el) return
    if (el.textContent !== node.text) el.textContent = node.text
  }, [node.text])

  useEffect(() => {
    if (!editing) return
    const el = textRef.current
    if (!el) return
    el.focus()
  }, [editing])

  const read = (): string => {
    const el = textRef.current
    if (!el) return ''
    return (el.innerText ?? '').replace(/\r\n/g, '\n').replace(/\n$/, '')
  }

  const commit = (): void => {
    commitTransientText()
    onClose()
  }

  return (
    <div
      className={`sl-bubble-tooltip${editing ? ' editing' : ''}`}
      style={{ left: x, top: y }}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      // 事件不穿透：不触发画布平移、也不拖动下层气泡（D81）
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <div
        ref={textRef}
        className="sl-tip-text"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        // 点击/聚焦即进入编辑（光标由浏览器落在点击位置）
        onFocus={() => {
          if (!editingRef.current) onStartEdit()
        }}
        onBlur={commit}
        onInput={(e) => {
          const value = (e.currentTarget.innerText ?? '').replace(/\r\n/g, '\n')
          applyTextTransient(node.id, value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            commit()
          }
          e.stopPropagation()
        }}
      />
    </div>
  )
}

export default BubbleTextTip
