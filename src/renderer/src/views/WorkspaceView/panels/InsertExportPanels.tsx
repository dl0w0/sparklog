import { useState } from 'react'
import { exportAs, type ExportFormat } from '@renderer/actions/exportActions'
import { addAttachment, addImage, addInsert } from '@renderer/actions/insertActions'
import { api } from '@renderer/services/bridge'
import { useSelectionStore } from '@renderer/store/selectionStore'
import { useUiStore } from '@renderer/store/uiStore'

export function ExportPanel({ onClose }: { onClose: () => void }): JSX.Element {
  const [busy, setBusy] = useState<ExportFormat | null>(null)
  const rows: { format: ExportFormat; label: string; desc: string }[] = [
    { format: 'png', label: 'PNG 图片', desc: '当前层级全图，2× 超采样' },
    { format: 'svg', label: 'SVG 矢量图', desc: '可进 Figma / Illustrator 继续编辑' },
    { format: 'pdf', label: 'PDF 文档', desc: 'A4 横向，适合打印与分享' },
    { format: 'md', label: 'Markdown 大纲', desc: '按层级缩进，含重要程度注释' }
  ]
  return (
    <div className="sl-modal-mask" onClick={onClose}>
      <div className="sl-modal" style={{ minWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3>导出为…</h3>
        <p style={{ marginTop: -6 }}>导出范围为当前所在层级（主画布或某个专区）。</p>
        {rows.map((row) => (
          <div
            key={row.format}
            className="sl-menu-item"
            style={{ justifyContent: 'space-between', padding: '9px 10px' }}
            onClick={async () => {
              setBusy(row.format)
              const ok = await exportAs(row.format)
              setBusy(null)
              if (ok) onClose()
            }}
          >
            <div>
              <div>{row.label}</div>
              <div style={{ color: '#9aa1b8', fontSize: 11.5 }}>{row.desc}</div>
            </div>
            <span className="shortcut">{busy === row.format ? '导出中…' : '⇩'}</span>
          </div>
        ))}
        <div className="sl-modal-actions" style={{ marginTop: 12 }}>
          <button className="sl-btn" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

export function InsertPanel({ onClose }: { onClose: () => void }): JSX.Element {
  const ownerId = useSelectionStore.getState().primaryId()

  const run = async (kind: 'note' | 'task' | 'attachment' | 'image'): Promise<void> => {
    if (kind === 'note' || kind === 'task') {
      addInsert(kind, ownerId)
      onClose()
      return
    }
    const filters =
      kind === 'image'
        ? [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
        : [{ name: '常见文件', extensions: ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf', 'png', 'jpg', 'txt'] }]
    const picked = await api().pickFile(filters)
    if (picked.canceled || !picked.filePath) return
    const name = picked.filePath.split(/[\\/]/).pop() ?? 'file'
    if (kind === 'image') addImage(ownerId, { path: picked.filePath, name, w: 200, h: 140 })
    else addAttachment(ownerId, { path: picked.filePath, name, ext: name.split('.').pop() ?? '' })
    onClose()
  }

  return (
    <div className="sl-modal-mask" onClick={onClose}>
      <div className="sl-modal" style={{ minWidth: 360 }} onClick={(e) => e.stopPropagation()}>
        <h3>插入</h3>
        <div className="sl-menu-item" onClick={() => void run('note')}>
          📝 笔记 <span className="shortcut">Ctrl+Alt+N</span>
        </div>
        <div className="sl-menu-item" onClick={() => void run('task')}>
          ☑ 任务 <span className="shortcut">Ctrl+Alt+T</span>
        </div>
        <div className="sl-menu-item" onClick={() => void run('attachment')}>
          📎 附件 <span className="shortcut">Ctrl+Alt+A</span>
        </div>
        <div className="sl-menu-item" onClick={() => void run('image')}>
          🖼 图片
        </div>
        <div className="sl-modal-actions" style={{ marginTop: 12 }}>
          <button className="sl-btn" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

export function useExportToast(): void {
  useUiStore.getState()
}
