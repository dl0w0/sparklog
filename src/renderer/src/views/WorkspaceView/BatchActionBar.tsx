import { useDocStore } from '@renderer/store/docStore'
import { useSelectionStore } from '@renderer/store/selectionStore'
import { copySelection, cutSelection } from '@renderer/actions/clipboardActions'
import { deleteManyBubbles, adjustImportanceMany } from '@renderer/actions/bubbleActions'

export function BatchActionBar(): JSX.Element | null {
  const selectedIds = useSelectionStore((s) => s.selectedIds)
  const canUndo = useDocStore((s) => s.canUndo)

  if (selectedIds.length < 2) return null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 12px',
        background: '#fff',
        border: '1px solid rgba(91,111,214,.2)',
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(35,45,90,.16)',
        fontSize: 13,
        zIndex: 30
      }}
    >
      <span style={{ color: '#6b7285' }}>已选中 {selectedIds.length} 个</span>
      <button className="sl-btn" onClick={() => adjustImportanceMany(selectedIds, -5)}>
        重要程度 −
      </button>
      <button className="sl-btn" onClick={() => adjustImportanceMany(selectedIds, 5)}>
        +
      </button>
      <button className="sl-btn" onClick={() => copySelection()}>
        复制
      </button>
      <button className="sl-btn" onClick={() => cutSelection()}>
        剪切
      </button>
      <button className="sl-btn danger" onClick={() => deleteManyBubbles(selectedIds)}>
        删除
      </button>
      <button className="sl-btn" onClick={() => useSelectionStore.getState().clear()}>
        取消选择
      </button>
      <span style={{ color: '#a2a9bf', fontSize: 11 }}>{canUndo ? '可撤销' : ''}</span>
    </div>
  )
}

export default BatchActionBar
