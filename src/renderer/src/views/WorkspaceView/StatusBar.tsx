import { displayName } from '@renderer/logic/title'
import { nodesInZone } from '@renderer/logic/graph'
import { useDocStore } from '@renderer/store/docStore'
import { useSelectionStore } from '@renderer/store/selectionStore'
import { ROOT_LEVEL, useViewportStore } from '@renderer/store/viewportStore'

export function StatusBar(): JSX.Element {
  const doc = useDocStore((s) => s.doc)
  const filePath = useDocStore((s) => s.filePath)
  const dirty = useDocStore((s) => s.dirty)
  const status = useDocStore((s) => s.status)
  const errorMessage = useDocStore((s) => s.errorMessage)
  const setError = useDocStore((s) => s.setError)
  const levelId = useViewportStore((s) => s.levelId)
  const vp = useViewportStore((s) => s.viewports[s.levelId])
  const selectedIds = useSelectionStore((s) => s.selectedIds)

  const zoneId = levelId === ROOT_LEVEL ? null : levelId
  const nodes = nodesInZone(doc.nodes, zoneId)
  const roots = nodes.filter((n) => n.parentIds.length === 0).length
  const zones = doc.zones.filter((z) => z.parentZoneId === zoneId).length
  const selected = selectedIds.length === 1 ? doc.nodes.find((n) => n.id === selectedIds[0]) : null

  const statusText =
    status === 'saving'
      ? '保存中…'
      : status === 'error'
        ? `保存失败：${errorMessage ?? ''}`
        : dirty
          ? '未保存更改'
          : '已保存'

  return (
    <div className="sl-status">
      <span>📄 {displayName(filePath)}</span>
      <span className={status === 'error' ? 'error' : dirty ? 'dirty' : ''} onClick={() => status === 'error' && setError(null)}>
        {statusText}
      </span>
      <span>{Math.round((vp?.scale ?? 1) * 100)}%</span>
      <span>
        节点 {nodes.length} · 主气泡 {roots}
        {zones > 0 ? ` · 专区 ${zones}` : ''}
      </span>
      {selected && (
        <span>
          已选中：{selected.text || '（空）'}（重要程度 {Math.round(selected.importance)}）
        </span>
      )}
      <span className="spacer" />
      <span>Sparklog</span>
    </div>
  )
}

export default StatusBar
