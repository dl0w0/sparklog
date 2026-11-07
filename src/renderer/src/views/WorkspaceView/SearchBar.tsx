import { useEffect, useMemo, useRef, useState } from 'react'
import { searchNodes } from '@renderer/logic/search'
import { getCanvasController } from '@renderer/actions/commands'
import { useDocStore } from '@renderer/store/docStore'
import { useSelectionStore } from '@renderer/store/selectionStore'
import { useUiStore } from '@renderer/store/uiStore'

export function SearchBar(): JSX.Element | null {
  const open = useUiStore((s) => s.searchOpen)
  const setOpen = useUiStore((s) => s.setSearchOpen)
  const doc = useDocStore((s) => s.doc)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const hits = useMemo(() => (open ? searchNodes(doc.nodes, query) : []), [open, doc.nodes, query])

  if (!open) return null

  const go = (id: string): void => {
    useSelectionStore.getState().select(id)
    getCanvasController()?.centerOn(id)
    setOpen(false)
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 420,
        zIndex: 40
      }}
    >
      <input
        ref={inputRef}
        value={query}
        placeholder="搜索气泡文字（Enter 跳到第一个结果，Esc 关闭）"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            setOpen(false)
          } else if (e.key === 'Enter' && hits.length > 0) {
            e.preventDefault()
            go(hits[0].id)
          }
        }}
        style={{
          width: '100%',
          padding: '8px 12px',
          borderRadius: 9,
          border: '1px solid rgba(91,111,214,.35)',
          boxShadow: '0 6px 20px rgba(35,45,90,.14)',
          fontSize: 13,
          outline: 'none'
        }}
      />
      {query && (
        <div
          style={{
            marginTop: 6,
            background: '#fff',
            borderRadius: 9,
            boxShadow: '0 8px 24px rgba(35,45,90,.16)',
            maxHeight: 320,
            overflow: 'auto',
            padding: 4
          }}
        >
          {hits.length === 0 && (
            <div style={{ padding: '8px 10px', color: '#a2a9bf', fontSize: 12.5 }}>没有匹配的气泡</div>
          )}
          {hits.map((hit) => (
            <div
              key={hit.id}
              className="sl-menu-item"
              onClick={() => go(hit.id)}
              style={{ justifyContent: 'space-between' }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {hit.text}
              </span>
              {hit.zoneId && <span className="shortcut">在专区</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default SearchBar
