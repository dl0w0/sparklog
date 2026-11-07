import { PALETTES } from '@renderer/logic/theme'
import { applyThemePreset, setThemeOverride } from '@renderer/actions/themeActions'
import { setStyleMany } from '@renderer/actions/bubbleActions'
import { useDocStore } from '@renderer/store/docStore'
import { useSelectionStore } from '@renderer/store/selectionStore'

export interface ThemePanelProps {
  onClose: () => void
}

export function ThemePanel({ onClose }: ThemePanelProps): JSX.Element {
  const theme = useDocStore((s) => s.doc.theme)
  const selectedIds = useSelectionStore((s) => s.selectedIds)

  return (
    <div className="sl-modal-mask" onClick={onClose}>
      <div className="sl-modal" style={{ minWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3>主题</h3>
        <p style={{ marginTop: -6 }}>套用后整张画布统一变化；单个气泡已设置的样式仍然优先。</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {PALETTES.map((palette) => (
            <div
              key={palette.id}
              onClick={() => applyThemePreset(palette.id)}
              style={{
                border:
                  theme.presetId === palette.id
                    ? '2px solid var(--sl-accent)'
                    : '1px solid rgba(91,111,214,.2)',
                borderRadius: 9,
                padding: 8,
                cursor: 'pointer',
                background: palette.background
              }}
            >
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 8,
                    background: palette.bubbleTo,
                    border: `2px solid ${palette.rootStroke}`
                  }}
                />
                <span style={{ width: 12, height: 12, borderRadius: 6, background: palette.childStroke }} />
                <span style={{ width: 12, height: 12, borderRadius: 6, background: palette.edge }} />
              </div>
              <div style={{ fontSize: 12.5 }}>{palette.name}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 96, color: '#6b7285' }}>默认形状</span>
            <select
              value={theme.overrides?.defaultShape ?? 'circle'}
              onChange={(e) => setThemeOverride({ defaultShape: e.target.value as 'circle' })}
              style={{ padding: 4, borderRadius: 6, border: '1px solid #d6dbe8' }}
            >
              <option value="circle">圆形</option>
              <option value="ellipse">椭圆</option>
              <option value="roundedRect">圆角矩形</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 96, color: '#6b7285' }}>连线粗细</span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.5}
              value={theme.overrides?.edgeWidth ?? 1.5}
              onChange={(e) => setThemeOverride({ edgeWidth: Number(e.target.value) })}
            />
            <span>{theme.overrides?.edgeWidth ?? 1.5}px</span>
          </label>
          {selectedIds.length > 0 && (
            <button
              className="sl-btn"
              onClick={() => {
                const shape = theme.overrides?.defaultShape ?? 'circle'
                setStyleMany(selectedIds, { shape })
              }}
            >
              把默认形状应用到选中的 {selectedIds.length} 个气泡
            </button>
          )}
        </div>

        <div className="sl-modal-actions" style={{ marginTop: 16 }}>
          <button className="sl-btn primary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  )
}

export default ThemePanel
