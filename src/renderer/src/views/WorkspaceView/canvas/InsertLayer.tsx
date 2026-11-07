import { useMemo, useRef, useState } from 'react'
import { DEFAULT_VIEWPORT } from '@shared/constants'
import type { InsertKind, InsertObject } from '@shared/types/document'
import { taskSummary } from '@shared/logic/tasks'
import { worldToScreen } from '@renderer/logic/layout/fitView'
import { radiusOf } from '@renderer/logic/nodeVisual'
import {
  addTaskLine,
  insertDisplayPos,
  moveInsert,
  removeInsert,
  removeTaskLine,
  setInsertExpanded,
  togglePin,
  toggleTaskLine,
  updateNote,
  updateTaskLine
} from '@renderer/actions/insertActions'
import { api } from '@renderer/services/bridge'
import { createAssocLink } from '@renderer/actions/edgeActions'
import { useDocStore } from '@renderer/store/docStore'
import { useUiStore } from '@renderer/store/uiStore'
import { ROOT_LEVEL, useViewportStore } from '@renderer/store/viewportStore'

const BADGE_OFFSETS = [
  [0.82, 0.62],
  [0.62, 0.86],
  [0.94, 0.34],
  [0.34, 0.94]
]

function iconFor(kind: InsertKind): JSX.Element {
  switch (kind) {
    case 'note':
      return (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 4h9l4 4v12H6z" />
          <path d="M14 4v5h5" />
          <path d="M9 13h7M9 16h5" />
        </svg>
      )
    case 'task':
      return (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7l2.2 2.2L10 5.5" />
          <path d="M4 16l2.2 2.2L10 14.5" />
          <path d="M13 7h7M13 16h7" />
        </svg>
      )
    case 'attachment':
      return (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 7l-6.5 6.5a3 3 0 104.2 4.2L20 10.4a5 5 0 10-7-7L5.6 10.8" />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <circle cx="9" cy="10" r="1.6" />
          <path d="M5 17l5-4 4 3 5-4" />
        </svg>
      )
  }
}

export function InsertLayer(): JSX.Element {
  const doc = useDocStore((s) => s.doc)
  const levelId = useViewportStore((s) => s.levelId)
  const vp = useViewportStore((s) => s.viewports[s.levelId] ?? DEFAULT_VIEWPORT)
  const dragging = useRef<{ id: string; dx: number; dy: number } | null>(null)

  const zoneId = levelId === ROOT_LEVEL ? null : levelId
  const inserts = useMemo(() => doc.inserts.filter((i) => i.zoneId === zoneId), [doc.inserts, zoneId])

  const badges = inserts.filter((i) => i.ownerBubbleId && !i.expanded)
  const cards = inserts.filter((i) => !i.ownerBubbleId || i.expanded)

  /** 已有「建立连接」起点时，点击插入对象即完成连线（D51 / D53） */
  const tryCompleteLink = (targetId: string): boolean => {
    const ui = useUiStore.getState()
    const source = ui.linkSource
    if (!source || source === targetId) return false
    const nodes = useDocStore.getState().doc.nodes
    const sourceKind = nodes.some((n) => n.id === source) ? 'bubble' : 'insert'
    const id = createAssocLink(source, sourceKind, targetId, 'insert')
    ui.setLinkSource(null)
    ui.showToast(id ? '已建立连接' : '这两者已经连接过了')
    return true
  }

  const startDrag = (event: React.PointerEvent, insert: InsertObject): void => {
    if (tryCompleteLink(insert.id)) return
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, button, [contenteditable="true"]')) return
    event.stopPropagation()
    // D39：屏幕位移 1:1 跟手，世界坐标按缩放换算
    const base = insertDisplayPos(insert, doc.nodes, doc.viewMode)
    const startScreen = worldToScreen(base, vp)
    dragging.current = { id: insert.id, dx: 0, dy: 0 }
    const startX = event.clientX
    const startY = event.clientY
    let dx = 0
    let dy = 0
    let raf: number | null = null
    const onMove = (ev: PointerEvent): void => {
      dx = ev.clientX - startX
      dy = ev.clientY - startY
      if (raf !== null) return
      raf = requestAnimationFrame(() => {
        raf = null
        const el = document.querySelector<HTMLElement>(`[data-insert-id="${insert.id}"]`)
        if (el) {
          el.style.left = `${startScreen.x + dx}px`
          el.style.top = `${startScreen.y + dy}px`
        }
      })
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (raf !== null) cancelAnimationFrame(raf)
      dragging.current = null
      const scale = useViewportStore.getState().current().scale
      if (Math.abs(dx) + Math.abs(dy) > 3) {
        moveInsert(insert.id, { x: base.x + dx / scale, y: base.y + dy / scale })
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 18 }}>
      {/* 附着对象：简笔小图标，按类型排在气泡角上 */}
      {badges.map((insert) => {
        const owner = doc.nodes.find((n) => n.id === insert.ownerBubbleId)
        if (!owner) return null
        const ownerScreen = worldToScreen(owner.bubblePos, vp)
        const offset = BADGE_OFFSETS[badgeIndex(badges, insert)]
        // D32：图标随画布缩放同步改变大小与位置
        const ownerRadius = radiusOf(owner, doc.viewMode) * vp.scale
        const scale = Math.max(0.2, vp.scale)
        return (
          <button
            key={insert.id}
            data-insert-id={insert.id}
            className="sl-insert-badge"
            title={`${labelOf(insert)}（点击展开）`}
            style={{
              position: 'absolute',
              left: ownerScreen.x + (offset[0] - 0.5) * ownerRadius * 1.7,
              top: ownerScreen.y + (offset[1] - 0.5) * ownerRadius * 1.7,
              transform: `translate(-50%, -50%) scale(${scale})`,
              pointerEvents: 'auto'
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              if (tryCompleteLink(insert.id)) return
              setInsertExpanded(insert.id, true)
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              useUiStore.getState().openContextMenu({
                x: e.clientX,
                y: e.clientY,
                bubbleId: null,
                insertId: insert.id
              })
            }}
          >
            {iconFor(insert.kind)}
          </button>
        )
      })}

      {/* 独立 / 已展开的卡片 */}
      {cards.map((insert) => {
        const pos = insertDisplayPos(insert, doc.nodes, doc.viewMode)
        const screen = worldToScreen(pos, vp)
        return (
          <div
            key={insert.id}
            data-insert-id={insert.id}
            className="sl-insert-card"
            style={{
              left: screen.x,
              top: screen.y,
              pointerEvents: 'auto',
              // D32：卡片随画布缩放同步缩放与移位（拖动时只改 left/top，保持缩放不变）
              transform: `translate(-50%, -50%) scale(${Math.max(0.2, vp.scale)})`
            }}
            onPointerDown={(e) => startDrag(e, insert)}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              useUiStore.getState().openContextMenu({
                x: e.clientX,
                y: e.clientY,
                bubbleId: null,
                insertId: insert.id
              })
            }}
          >
            <div className="sl-insert-head">
              <span className="sl-insert-icon">{iconFor(insert.kind)}</span>
              <span className="sl-insert-title">{labelOf(insert)}</span>
              <span className="spacer" />
              {insert.ownerBubbleId && (
                <button
                  className="sl-insert-mini"
                  title="收起为图标"
                  onClick={() => setInsertExpanded(insert.id, false)}
                >
                  ⌃
                </button>
              )}
              <button className="sl-insert-mini" title="钉住/取消钉住" onClick={() => togglePin(insert.id)}>
                {insert.pinned ? '📌' : '📍'}
              </button>
              <button className="sl-insert-mini" title="删除" onClick={() => removeInsert(insert.id)}>
                ×
              </button>
            </div>

            {insert.kind === 'note' && (
              <div className="sl-insert-body">
                <input
                  defaultValue={insert.note?.title ?? ''}
                  placeholder="标题"
                  className="sl-insert-input"
                  onBlur={(e) => updateNote(insert.id, { title: e.target.value })}
                />
                <textarea
                  defaultValue={insert.note?.content ?? ''}
                  placeholder="随手记点什么…"
                  className="sl-insert-textarea"
                  onBlur={(e) => updateNote(insert.id, { content: e.target.value })}
                />
              </div>
            )}

            {insert.kind === 'task' && (
              <div className="sl-insert-body">
                {(insert.task?.items ?? []).map((item) => (
                  <div key={item.id} className="sl-task-row">
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => toggleTaskLine(insert.id, item.id)}
                    />
                    <span
                      contentEditable
                      suppressContentEditableWarning
                      className={`sl-task-text${item.done ? ' done' : ''}`}
                      onBlur={(e) => updateTaskLine(insert.id, item.id, e.currentTarget.textContent ?? '')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          updateTaskLine(insert.id, item.id, e.currentTarget.textContent ?? '')
                          const newId = addTaskLine(insert.id, item.id)
                          if (newId) {
                            requestAnimationFrame(() => {
                              const el = document.querySelector<HTMLElement>(
                                `[data-task-item="${newId}"]`
                              )
                              el?.focus()
                            })
                          }
                        } else if (e.key === 'Backspace' && (e.currentTarget.textContent ?? '') === '') {
                          e.preventDefault()
                          removeTaskLine(insert.id, item.id)
                        }
                        e.stopPropagation()
                      }}
                      data-task-item={item.id}
                    >
                      {item.text}
                    </span>
                  </div>
                ))}
                <button className="sl-insert-mini" onClick={() => addTaskLine(insert.id)}>
                  ＋ 新建一行
                </button>
              </div>
            )}

            {(insert.kind === 'attachment' || insert.kind === 'image') && (
              <div className="sl-insert-body">
                {insert.kind === 'image' ? (
                  <img
                    className="sl-insert-image"
                    src={`file://${insert.image?.path ?? ''}`}
                    alt={insert.image?.name ?? ''}
                  />
                ) : (
                  <div className="sl-insert-file">{insert.attachment?.name}</div>
                )}
                <button
                  className="sl-insert-mini"
                  onClick={() => {
                    const target = insert.attachment?.path ?? insert.image?.path
                    if (!target) return
                    void api()
                      .openPath(target)
                      .then((res) => {
                        if (!res.ok) useUiStore.getState().showToast(res.error ?? '无法打开文件')
                      })
                  }}
                >
                  打开
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function badgeIndex(list: InsertObject[], insert: InsertObject): number {
  const sameOwner = list.filter((i) => i.ownerBubbleId === insert.ownerBubbleId)
  return Math.max(0, sameOwner.findIndex((i) => i.id === insert.id)) % BADGE_OFFSETS.length
}

function labelOf(insert: InsertObject): string {
  if (insert.kind === 'note') return insert.note?.title || '笔记'
  if (insert.kind === 'task') return taskSummary(insert.task ?? { items: [] })
  if (insert.kind === 'attachment') return insert.attachment?.name ?? '附件'
  return insert.image?.name ?? '图片'
}

export default InsertLayer
