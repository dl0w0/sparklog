import { useDocStore } from '@renderer/store/docStore'
import { useUiStore } from '@renderer/store/uiStore'
import { getCanvasController } from '@renderer/actions/commands'
import { saveDocument } from '@renderer/actions/fileActions'

export function SideToolbar(): JSX.Element {
  const viewMode = useDocStore((s) => s.doc.viewMode)
  const setViewMode = useDocStore((s) => s.setViewMode)
  const dirty = useDocStore((s) => s.dirty)
  const status = useDocStore((s) => s.status)
  const setSearchOpen = useUiStore((s) => s.setSearchOpen)

  return (
    <div className="sl-sidebar">
      <button
        className={`sl-tool${viewMode === 'bubble' ? ' active' : ''}`}
        title="气泡视图"
        onClick={() => setViewMode('bubble')}
      >
        ◉
      </button>
      <button
        className={`sl-tool${viewMode === 'mindmap' ? ' active' : ''}`}
        title="思维导图"
        onClick={() => setViewMode('mindmap')}
      >
        ⬡
      </button>
      <div className="sl-divider" />
      <button className="sl-tool" title="适应画布 (Ctrl+Shift+F)" onClick={() => getCanvasController()?.fit()}>
        ⤢
      </button>
      <button className="sl-tool" title="搜索 (Ctrl+F)" onClick={() => setSearchOpen(true)}>
        🔍
      </button>
      <div className="sl-divider" />
      <button
        className="sl-tool"
        title="保存 (Ctrl+S)"
        disabled={!dirty || status === 'saving'}
        onClick={() => void saveDocument(false)}
      >
        {status === 'saving' ? '…' : '💾'}
      </button>
    </div>
  )
}

export default SideToolbar
