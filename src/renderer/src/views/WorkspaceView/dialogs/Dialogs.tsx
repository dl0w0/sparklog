import { SHORTCUT_TABLE } from '@renderer/logic/keyboard'
import { useUiStore } from '@renderer/store/uiStore'
import { resolveUnsaved } from '@renderer/actions/fileActions'
import {
  countUniqueDescendants,
  deleteBubbleWithUniqueDescendants
} from '@renderer/actions/bubbleActions'
import { useState } from 'react'
import { useDocStore } from '@renderer/store/docStore'
import { renameZone } from '@renderer/actions/zoneActions'
import SelectPanel from '../panels/SelectPanel'
import { buildViewEdges } from '@renderer/logic/links'
import { setEdgeLabel } from '@renderer/actions/edgeActions'
import ThemePanel from '../panels/ThemePanel'
import { ExportPanel, InsertPanel } from '../panels/InsertExportPanels'

export function Dialogs(): JSX.Element | null {
  const dialog = useUiStore((s) => s.dialog)
  const closeDialog = useUiStore((s) => s.closeDialog)
  const errorMessage = useDocStore((s) => s.errorMessage)

  if (!dialog) return null

  if (dialog.kind === 'unsaved') {
    return (
      <div className="sl-modal-mask">
        <div className="sl-modal">
          <h3>是否保存对「{dialog.fileName}」的更改？</h3>
          <p>如果不保存，本次的修改将会丢失。</p>
          <div className="sl-modal-actions">
            <button className="sl-btn" onClick={() => resolveUnsaved('cancel')}>
              取消
            </button>
            <button className="sl-btn" onClick={() => resolveUnsaved('dontSave')}>
              不保存
            </button>
            <button className="sl-btn primary" onClick={() => resolveUnsaved('save')}>
              保存
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (dialog.kind === 'deleteCascade') {
    return (
      <div className="sl-modal-mask">
        <div className="sl-modal">
          <h3>删除该气泡及其独有后代？</h3>
          <p>{`将一并删除 ${dialog.count} 个气泡，此操作不可撤销。\n仍被其它父节点引用的气泡会保留。`}</p>
          <div className="sl-modal-actions">
            <button className="sl-btn" onClick={closeDialog}>
              取消
            </button>
            <button
              className="sl-btn danger"
              onClick={() => {
                deleteBubbleWithUniqueDescendants(dialog.bubbleId)
                closeDialog()
              }}
            >
              删除
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (dialog.kind === 'error') {
    return (
      <div className="sl-modal-mask">
        <div className="sl-modal">
          <h3>出了点问题</h3>
          <p>{dialog.message || errorMessage || '未知错误'}</p>
          <div className="sl-modal-actions">
            <button className="sl-btn primary" onClick={closeDialog}>
              关闭
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (dialog.kind === 'shortcuts') {
    return (
      <div className="sl-modal-mask" onClick={closeDialog}>
        <div className="sl-modal" style={{ maxWidth: 640, maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
          <h3>快捷键一览</h3>
          <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
            <tbody>
              {SHORTCUT_TABLE.map((row) => (
                <tr key={row.keys}>
                  <td style={{ padding: '4px 8px', color: '#5c6480', whiteSpace: 'nowrap' }}>
                    <code>{row.keys}</code>
                  </td>
                  <td style={{ padding: '4px 8px' }}>{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="sl-modal-actions" style={{ marginTop: 12 }}>
            <button className="sl-btn primary" onClick={closeDialog}>
              关闭
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (dialog.kind === 'rename') {
    return <RenameZoneDialog zoneId={dialog.zoneId} onClose={closeDialog} />
  }

  if (dialog.kind === 'edgeLabel') {
    return <EdgeLabelDialog edgeId={dialog.edgeId} onClose={closeDialog} />
  }

  if (dialog.kind === 'select') {
    return <SelectPanel bubbleId={dialog.bubbleId} onClose={closeDialog} />
  }

  if (dialog.kind === 'theme') {
    return <ThemePanel onClose={closeDialog} />
  }

  if (dialog.kind === 'insert') {
    return <InsertPanel onClose={closeDialog} />
  }

  if (dialog.kind === 'export') {
    return <ExportPanel onClose={closeDialog} />
  }

  return null
}

function EdgeLabelDialog({ edgeId, onClose }: { edgeId: string; onClose: () => void }): JSX.Element {
  const doc = useDocStore((s) => s.doc)
  const edge = buildViewEdges(doc).find((e) => e.id === edgeId)
  const [value, setValue] = useState(edge?.label ?? '')
  const submit = (): void => {
    if (edge) setEdgeLabel(edge, value)
    onClose()
  }
  return (
    <div className="sl-modal-mask" onClick={onClose}>
      <div className="sl-modal" style={{ minWidth: 360 }} onClick={(e) => e.stopPropagation()}>
        <h3>连线标签</h3>
        <input
          autoFocus
          value={value}
          placeholder="给这条连线写一句说明"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') onClose()
            e.stopPropagation()
          }}
          style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d6dbe8', marginBottom: 14 }}
        />
        <div className="sl-modal-actions">
          <button className="sl-btn" onClick={onClose}>
            取消
          </button>
          <button className="sl-btn primary" onClick={submit}>
            确定
          </button>
        </div>
      </div>
    </div>
  )
}

export default Dialogs

function RenameZoneDialog({ zoneId, onClose }: { zoneId: string; onClose: () => void }): JSX.Element {
  const zone = useDocStore((s) => s.doc.zones.find((z) => z.id === zoneId))
  const [value, setValue] = useState(zone?.title ?? '')
  const submit = (): void => {
    renameZone(zoneId, value.trim() || '未命名专区')
    onClose()
  }
  return (
    <div className="sl-modal-mask" onClick={onClose}>
      <div className="sl-modal" style={{ minWidth: 340 }} onClick={(e) => e.stopPropagation()}>
        <h3>重命名专区</h3>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') onClose()
            e.stopPropagation()
          }}
          style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d6dbe8', marginBottom: 14 }}
        />
        <div className="sl-modal-actions">
          <button className="sl-btn" onClick={onClose}>
            取消
          </button>
          <button className="sl-btn primary" onClick={submit}>
            确定
          </button>
        </div>
      </div>
    </div>
  )
}
