import { selectBranchSet } from '@renderer/actions/bubbleActions'
import { useDocStore } from '@renderer/store/docStore'
import { useSelectionStore } from '@renderer/store/selectionStore'
import { ROOT_LEVEL, useViewportStore } from '@renderer/store/viewportStore'

export interface SelectPanelProps {
  /** null = 空白处打开的面板 */
  bubbleId: string | null
  onClose: () => void
}

interface Row {
  key: string
  label: string
  count: number
  run: () => void
}

export function SelectPanel({ bubbleId, onClose }: SelectPanelProps): JSX.Element {
  const doc = useDocStore((s) => s.doc)
  const sel = useSelectionStore()
  const levelId = useViewportStore((s) => s.levelId)
  const zoneId = levelId === ROOT_LEVEL ? null : levelId

  const levelNodes = doc.nodes.filter((n) => n.zoneId === zoneId)
  const allInLevel = levelNodes.map((n) => n.id)

  const rows: Row[] = bubbleId
    ? [
        {
          key: 'siblings',
          label: '所有并列气泡（兄弟）',
          count: selectBranchSet('siblings', bubbleId).length,
          run: () => sel.selectMany(selectBranchSet('siblings', bubbleId))
        },
        {
          key: 'unique',
          label: '所有独有子气泡',
          count: selectBranchSet('uniqueDescendants', bubbleId).length,
          run: () => sel.selectMany(selectBranchSet('uniqueDescendants', bubbleId))
        },
        {
          key: 'descendants',
          label: '所有子气泡（全部后代）',
          count: selectBranchSet('descendants', bubbleId).length,
          run: () => sel.selectMany(selectBranchSet('descendants', bubbleId))
        },
        {
          key: 'ancestors',
          label: '所有父级气泡（全部祖先）',
          count: selectBranchSet('ancestors', bubbleId).length,
          run: () => sel.selectMany(selectBranchSet('ancestors', bubbleId))
        },
        {
          key: 'all',
          label: '全选',
          count: allInLevel.length,
          run: () => sel.selectMany(allInLevel)
        }
      ]
    : [
        {
          key: 'zones',
          label: '所有专区',
          count: doc.zones.length,
          run: () => sel.selectMany([])
        },
        {
          key: 'notes',
          label: '所有笔记',
          count: doc.inserts.filter((i) => i.kind === 'note').length,
          run: () => sel.selectMany([])
        },
        {
          key: 'tasks',
          label: '所有任务',
          count: doc.inserts.filter((i) => i.kind === 'task').length,
          run: () => sel.selectMany([])
        },
        {
          key: 'attachments',
          label: '所有附件',
          count: doc.inserts.filter((i) => i.kind === 'attachment').length,
          run: () => sel.selectMany([])
        },
        {
          key: 'images',
          label: '所有图片',
          count: doc.inserts.filter((i) => i.kind === 'image').length,
          run: () => sel.selectMany([])
        },
        {
          key: 'all',
          label: '全选',
          count: allInLevel.length,
          run: () => sel.selectMany(allInLevel)
        }
      ]

  return (
    <div className="sl-modal-mask" onClick={onClose}>
      <div className="sl-modal" style={{ minWidth: 360 }} onClick={(e) => e.stopPropagation()}>
        <h3>选择</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {rows.map((row) => (
            <div
              key={row.key}
              className="sl-menu-item"
              onClick={() => {
                row.run()
                onClose()
              }}
            >
              <span>{row.label}</span>
              <span className="shortcut">{row.count}</span>
            </div>
          ))}
        </div>
        <div className="sl-modal-actions" style={{ marginTop: 12 }}>
          <button className="sl-btn" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

export default SelectPanel
