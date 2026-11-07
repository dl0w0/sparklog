import { useEffect, useMemo, useRef, useState } from 'react'
import type { BubbleNode, InsertObject } from '@shared/types/document'
import { useDocStore } from '@renderer/store/docStore'
import { useSelectionStore } from '@renderer/store/selectionStore'
import { applyTextTransient, commitTransientText, setStyleMany } from '@renderer/actions/bubbleActions'
import { updateNote, updateTaskLine } from '@renderer/actions/insertActions'

const FONT_FAMILIES = [
  { label: '默认', value: '' },
  { label: '微软雅黑', value: '"Microsoft YaHei UI", sans-serif' },
  { label: '宋体', value: 'SimSun, serif' },
  { label: '黑体', value: 'SimHei, sans-serif' },
  { label: '楷体', value: 'KaiTi, serif' },
  { label: 'Segoe UI', value: '"Segoe UI", sans-serif' }
]

const FONT_SIZES = [11, 12, 13, 14, 16, 18, 20, 24, 28]

/** 会话内记忆「字体区是否锁定常展开」（D70） */
let sessionLocked = false

export function FormulaBar(): JSX.Element {
  const doc = useDocStore((s) => s.doc)
  const selectedIds = useSelectionStore((s) => s.selectedIds)
  const [open, setOpen] = useState(false)
  const [locked, setLocked] = useState(sessionLocked)
  const [sizeMenu, setSizeMenu] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const sizeRef = useRef<HTMLInputElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const target = useMemo(() => {
    if (selectedIds.length === 0) return null
    const id = selectedIds[0]
    const node = doc.nodes.find((n) => n.id === id)
    if (node) return { kind: 'bubble' as const, node }
    const insert = doc.inserts.find((i) => i.id === id)
    if (insert) return { kind: 'insert' as const, node: insert }
    return null
  }, [doc, selectedIds])

  const selectedBubbles = useMemo(
    () => doc.nodes.filter((n) => selectedIds.includes(n.id)),
    [doc.nodes, selectedIds]
  )

  const textOf = (): string => {
    if (!target) return ''
    if (target.kind === 'bubble') return (target.node as BubbleNode).text
    const insert = target.node as InsertObject
    if (insert.kind === 'note') return insert.note?.title ?? ''
    if (insert.kind === 'task') return insert.task?.items?.[0]?.text ?? ''
    return ''
  }

  const editable =
    target !== null &&
    !(target.kind === 'insert' && ['attachment', 'image'].includes((target.node as InsertObject).kind))

  const commitText = (value: string): void => {
    if (!target) return
    if (target.kind === 'bubble') {
      applyTextTransient((target.node as BubbleNode).id, value)
      return
    }
    const insert = target.node as InsertObject
    if (insert.kind === 'note') updateNote(insert.id, { title: value })
    else if (insert.kind === 'task' && insert.task?.items?.[0]) {
      updateTaskLine(insert.id, insert.task.items[0].id, value)
    }
  }

  const bubble = target?.kind === 'bubble' ? (target.node as BubbleNode) : null
  const style = bubble?.style ?? {}
  const currentFontSize = style.fontSize ?? ''

  const patchAll = (patch: Parameters<typeof setStyleMany>[1]): void => {
    const ids = selectedBubbles.map((n) => n.id)
    if (ids.length === 0) return
    setStyleMany(ids, patch)
  }

  const patchOne = (patch: Parameters<typeof setStyleMany>[1]): void => {
    if (bubble) setStyleMany([bubble.id], patch)
  }

  const setFontSize = (value: number | undefined): void => {
    if (value === undefined || Number.isNaN(value)) return patchAll({ fontSize: undefined })
    const clamped = Math.max(8, Math.min(72, Math.round(value)))
    patchAll({ fontSize: clamped })
  }

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent): void => {
      if (locked) return
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, locked])

  useEffect(() => {
    sessionLocked = locked
  }, [locked])

  // 滚轮连续增减字号：用非 passive 监听，才能阻止页面滚动（D71）
  useEffect(() => {
    const el = sizeRef.current
    if (!el) return
    const onWheel = (event: WheelEvent): void => {
      if (selectedBubbles.length === 0) return
      event.preventDefault()
      const base = typeof currentFontSize === 'number' ? currentFontSize : 14
      setFontSize(base + (event.deltaY < 0 ? 1 : -1))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [selectedBubbles.length, currentFontSize])

  const hoverIn = (): void => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(true)
  }
  const hoverOut = (): void => {
    if (locked) return
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpen(false), 260)
  }

  const toggleLock = (): void => {
    const next = !locked
    setLocked(next)
    setOpen(next ? true : open)
  }

  return (
    <div className="sl-formula-bar" ref={wrapRef}>
      <div className="sl-formula-font" onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
        <span
          className={`sl-formula-font-title${locked ? ' locked' : ''}`}
          data-locked={locked ? 'true' : 'false'}
          title={locked ? '已锁定展开，点击解除' : '悬停展开，点击锁定'}
          onClick={(e) => {
            e.stopPropagation()
            toggleLock()
          }}
        >
          字体 ▾{locked ? ' 🔒' : ''}
        </span>

        {open && (
          <div
            className="sl-font-pop"
            onMouseEnter={hoverIn}
            onMouseLeave={hoverOut}
            onClick={(e) => e.stopPropagation()}
          >
            <label className="sl-font-row">
              <span>字体</span>
              <select
                value={style.fontFamily ?? ''}
                disabled={!bubble}
                onChange={(e) => patchAll({ fontFamily: e.target.value || undefined })}
              >
                {FONT_FAMILIES.map((f) => (
                  <option key={f.label} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="sl-font-row">
              <span>字号</span>
              <div className="sl-size-box">
                <input
                  ref={sizeRef}
                  className="sl-size-input"
                  type="number"
                  min={8}
                  max={72}
                  step={1}
                  value={currentFontSize}
                  placeholder="默认"
                  disabled={selectedBubbles.length === 0}
                  onChange={(e) => {
                    const raw = e.target.value
                    if (raw === '') return setFontSize(undefined)
                    setFontSize(Number(raw))
                  }}
                />
                <button
                  className="sl-size-caret"
                  disabled={selectedBubbles.length === 0}
                  onClick={() => setSizeMenu((v) => !v)}
                  title="预设字号"
                >
                  ▾
                </button>
                {sizeMenu && (
                  <div className="sl-size-menu" onMouseLeave={() => setSizeMenu(false)}>
                    {FONT_SIZES.map((size) => (
                      <button
                        key={size}
                        onClick={() => {
                          setFontSize(size)
                          setSizeMenu(false)
                        }}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="sl-font-row">
              <span>样式</span>
              <div className="sl-font-buttons">
                <button
                  className={`sl-fmt${style.bold ? ' active' : ''}`}
                  disabled={!bubble}
                  onClick={() => patchAll({ bold: !style.bold })}
                  style={{ fontWeight: 700 }}
                >
                  B
                </button>
                <button
                  className={`sl-fmt${style.italic ? ' active' : ''}`}
                  disabled={!bubble}
                  onClick={() => patchAll({ italic: !style.italic })}
                  style={{ fontStyle: 'italic' }}
                >
                  I
                </button>
                <button
                  className={`sl-fmt${style.underline ? ' active' : ''}`}
                  disabled={!bubble}
                  onClick={() => patchAll({ underline: !style.underline })}
                  style={{ textDecoration: 'underline' }}
                >
                  U
                </button>
              </div>
            </div>

            <label className="sl-font-row">
              <span>颜色</span>
              <input
                type="color"
                disabled={!bubble}
                value={style.textColor ?? '#2a3050'}
                onChange={(e) => patchAll({ textColor: e.target.value })}
              />
            </label>
          </div>
        )}
      </div>

      <input
        className="sl-formula-input"
        placeholder={editable ? '在这里编辑选中对象的文字…' : '未选中对象'}
        disabled={!editable}
        value={editable ? textOf() : ''}
        onChange={(e) => commitText(e.target.value)}
        onBlur={() => commitTransientText()}
      />
    </div>
  )
}

export default FormulaBar
