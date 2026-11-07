import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface MenuNode {
  id: string
  label: string
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  separator?: boolean
  children?: MenuNode[]
  onClick?: () => void
  /** 自定义颜色选择行（D52） */
  colorInput?: { value: string; onChange: (value: string) => void }
}

export interface ContextMenuProps {
  x: number
  y: number
  items: MenuNode[]
  onClose: () => void
}

const MARGIN = 8

interface AnchorRect {
  left: number
  right: number
  top: number
  bottom: number
}

/**
 * 二级菜单：先渲染再测量，空间不足时整块左翻 / 上移 / 夹紧，
 * 不用滚动容器（D47）。
 */
function SubMenu({
  items,
  onClose,
  depth,
  anchor
}: {
  items: MenuNode[]
  onClose: () => void
  depth: number
  anchor: AnchorRect
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; flip: boolean }>({ left: 0, top: 0, flip: false })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    // 水平：默认贴父项右侧；右侧放不下则翻到左侧；两侧都放不下则夹进视口
    let left = anchor.right
    if (left + rect.width > vw - MARGIN) {
      left = anchor.left - rect.width
    }
    if (left < MARGIN) left = Math.max(MARGIN, Math.min(vw - MARGIN - rect.width, vw - MARGIN - rect.width))
    if (left + rect.width > vw - MARGIN) left = vw - MARGIN - rect.width

    // 垂直：首行与父项对齐；下方放不下则整块上移；顶部放不下则夹紧
    let top = anchor.top
    if (top + rect.height > vh - MARGIN) top = anchor.bottom - rect.height
    if (top < MARGIN) top = MARGIN
    if (top + rect.height > vh - MARGIN) top = Math.max(MARGIN, vh - MARGIN - rect.height)

    setPos({
      left: left - anchor.left,
      top: top - anchor.top,
      flip: left < anchor.left
    })
  }, [items, anchor.left, anchor.right, anchor.top, anchor.bottom])

  return (
    <div
      ref={ref}
      className="sl-context-menu"
      style={{
        position: 'absolute',
        left: pos.left,
        top: pos.top,
        zIndex: 1000 + depth,
        maxHeight: 'none',
        overflow: 'visible'
      }}
    >
      <MenuList items={items} onClose={onClose} depth={depth} />
    </div>
  )
}

function MenuList({
  items,
  onClose,
  depth
}: {
  items: MenuNode[]
  onClose: () => void
  depth: number
}): JSX.Element {
  const [open, setOpen] = useState<{ idx: number; anchor: AnchorRect } | null>(null)
  return (
    <>
      {items.map((item, idx) =>
        item.separator ? (
          <div key={`${item.id}-sep`} className="sl-menu-sep" />
        ) : (
          <div
            key={item.id}
            className={[
              'sl-menu-item',
              item.danger ? 'danger' : '',
              item.disabled ? 'disabled' : ''
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ position: 'relative' }}
            onMouseEnter={(e) => {
              if (!item.children) {
                setOpen(null)
                return
              }
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setOpen({
                idx,
                anchor: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
              })
            }}
            onClick={(e) => {
              e.stopPropagation()
              if (item.children) {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                setOpen({
                  idx,
                  anchor: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
                })
                return
              }
              if (item.disabled) return
              item.onClick?.()
              onClose()
            }}
          >
            <span>{item.label}</span>
            {item.colorInput && (
              <input
                type="color"
                className="sl-color-input"
                value={item.colorInput.value}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => item.colorInput?.onChange(e.target.value)}
              />
            )}
            {item.shortcut && <span className="shortcut">{item.shortcut}</span>}
            {item.children && <span className="shortcut">▸</span>}
            {item.children && open?.idx === idx && (
              <SubMenu items={item.children} onClose={onClose} depth={depth + 1} anchor={open.anchor} />
            )}
          </div>
        )
      )}
    </>
  )
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  // 根菜单：测量后整块翻转 / 偏移，保证完整可见且不出现滚动条（D47）
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    let nx = x
    if (nx + rect.width > vw - MARGIN) nx = x - rect.width
    if (nx < MARGIN) nx = MARGIN
    if (nx + rect.width > vw - MARGIN) nx = Math.max(MARGIN, vw - MARGIN - rect.width)

    let ny = y
    if (ny + rect.height > vh - MARGIN) ny = y - rect.height
    if (ny < MARGIN) ny = MARGIN
    if (ny + rect.height > vh - MARGIN) ny = Math.max(MARGIN, vh - MARGIN - rect.height)

    if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny })
  }, [x, y, items, pos.x, pos.y])

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      data-context-menu="root"
      style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 1000 }}
    >
      <div className="sl-context-menu" style={{ position: 'relative', maxHeight: 'none', overflow: 'visible' }}>
        <MenuList items={items} onClose={onClose} depth={0} />
      </div>
    </div>,
    document.body
  )
}

export default ContextMenu
