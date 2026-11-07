import { useEffect, useMemo, useState } from 'react'
import type { UpdateInfo } from '@shared/logic/version'
import {
  DEFAULT_SHORTCUTS,
  FONT_FAMILIES,
  SHORTCUT_LABELS,
  findShortcutConflicts,
  type TextSettings,
  type TypographySettings
} from '@shared/types/settings'
import { useSettingsStore, type SettingsScope } from '@renderer/store/settingsStore'
import { useDocStore } from '@renderer/store/docStore'
import { api } from '@renderer/services/bridge'
import { useUiStore } from '@renderer/store/uiStore'

export type SettingsTab = 'shortcuts' | 'text' | 'shape' | 'physics' | 'update'

const TEXT_KINDS: { key: keyof TypographySettings; label: string }[] = [
  { key: 'bubble', label: '气泡文字' },
  { key: 'note', label: '笔记' },
  { key: 'task', label: '任务' },
  { key: 'attachment', label: '附件' },
  { key: 'image', label: '图片' }
]

const TAB_LABELS: { key: SettingsTab; label: string }[] = [
  { key: 'shortcuts', label: '快捷键' },
  { key: 'text', label: '文本编辑器' },
  { key: 'shape', label: '图形编辑' },
  { key: 'physics', label: '物理性质' },
  { key: 'update', label: '检查更新' }
]

export function SettingsDialog({
  tab,
  onClose
}: {
  tab: SettingsTab
  onClose: () => void
}): JSX.Element {
  const [current, setCurrent] = useState<SettingsTab>(tab)
  const [scope, setScope] = useState<SettingsScope>('global')
  const settings = useSettingsStore((s) => s.settings)
  const effective = useSettingsStore((s) => s.effective)
  const patch = useSettingsStore((s) => s.patch)
  const patchCanvas = useSettingsStore((s) => s.patchCanvas)
  const resetSection = useSettingsStore((s) => s.resetSection)

  const conflicts = useMemo(() => findShortcutConflicts(settings.shortcuts), [settings.shortcuts])

  const setText = (kind: keyof TypographySettings, value: Partial<TextSettings>): void => {
    if (scope === 'global') {
      patch((d) => {
        d.typography[kind] = { ...d.typography[kind], ...value }
      })
      return
    }
    patchCanvas((d) => {
      d.typography = { ...(d.typography ?? {}), [kind]: { ...(d.typography?.[kind] ?? {}), ...value } }
    })
  }

  const setShape = (value: Record<string, unknown>): void => {
    if (scope === 'global') {
      patch((d) => Object.assign(d.shape, value))
      return
    }
    patchCanvas((d) => {
      d.shape = { ...(d.shape ?? {}), ...value }
    })
  }

  const setPhysics = (value: Record<string, unknown>): void => {
    if (scope === 'global') {
      patch((d) => Object.assign(d.physics, value))
      return
    }
    patchCanvas((d) => {
      d.physics = { ...(d.physics ?? {}), ...value }
    })
  }

  return (
    <div className="sl-modal-mask" onClick={onClose}>
      <div className="sl-settings" onClick={(e) => e.stopPropagation()} data-settings="root">
        <div className="sl-settings-head">
          <h3>设置</h3>
          <div className="sl-scope">
            <label>
              <input
                type="radio"
                checked={scope === 'global'}
                onChange={() => setScope('global')}
              />
              保存到全局
            </label>
            <label>
              <input
                type="radio"
                checked={scope === 'canvas'}
                onChange={() => setScope('canvas')}
              />
              仅本画布
            </label>
          </div>
          <button className="sl-btn" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="sl-settings-body">
          <div className="sl-settings-tabs">
            {TAB_LABELS.map((item) => (
              <button
                key={item.key}
                className={current === item.key ? 'active' : ''}
                onClick={() => setCurrent(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="sl-settings-panel" data-tab={current}>
            {current === 'shortcuts' && (
              <ShortcutsPanel
                shortcuts={settings.shortcuts}
                conflicts={conflicts}
                onChange={(command, accelerator) =>
                  patch((d) => {
                    d.shortcuts[command] = accelerator
                  })
                }
                onReset={() => resetSection('shortcuts')}
              />
            )}

            {current === 'text' && (
              <div>
                {TEXT_KINDS.map(({ key, label }) => {
                  const value = effective.typography[key]
                  return (
                    <div className="sl-setting-row" key={key} data-text={key}>
                      <span className="sl-setting-label">{label}</span>
                      <select
                        data-field="fontFamily"
                        value={value.fontFamily ?? ''}
                        onChange={(e) => setText(key, { fontFamily: e.target.value || undefined })}
                      >
                        {FONT_FAMILIES.map((f) => (
                          <option key={f.label} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                      <input
                        data-field="fontSize"
                        type="number"
                        min={8}
                        max={72}
                        value={value.fontSize ?? ''}
                        onChange={(e) => setText(key, { fontSize: Number(e.target.value) })}
                      />
                      <input
                        data-field="color"
                        type="color"
                        value={value.color ?? '#2a3050'}
                        onChange={(e) => setText(key, { color: e.target.value })}
                      />
                      <label className="sl-inline">
                        内边距
                        <input
                          data-field="padding"
                          type="number"
                          min={0}
                          max={40}
                          value={value.padding}
                          onChange={(e) => setText(key, { padding: Number(e.target.value) })}
                        />
                      </label>
                    </div>
                  )
                })}
              </div>
            )}

            {current === 'shape' && (
              <div>
                <div className="sl-setting-row">
                  <span className="sl-setting-label">气泡形状</span>
                  <select
                    value={effective.shape.bubbleShape}
                    onChange={(e) => setShape({ bubbleShape: e.target.value })}
                  >
                    <option value="circle">圆形</option>
                    <option value="ellipse">椭圆</option>
                    <option value="roundedRect">圆角矩形</option>
                  </select>
                  <label className="sl-inline">
                    <input
                      type="checkbox"
                      checked={effective.shape.gradient}
                      onChange={(e) => setShape({ gradient: e.target.checked })}
                    />
                    渐变填充
                  </label>
                </div>
                <div className="sl-setting-row">
                  <span className="sl-setting-label">描边</span>
                  <input
                    type="number"
                    min={0}
                    max={8}
                    step={0.5}
                    value={effective.shape.strokeWidth}
                    onChange={(e) => setShape({ strokeWidth: Number(e.target.value) })}
                  />
                  <input
                    type="color"
                    value={effective.shape.strokeColor ?? '#5b6fd6'}
                    onChange={(e) => setShape({ strokeColor: e.target.value })}
                  />
                </div>
                <div className="sl-setting-row">
                  <span className="sl-setting-label">连线</span>
                  <input
                    type="color"
                    value={effective.shape.linkColor ?? '#9aa4c8'}
                    onChange={(e) => setShape({ linkColor: e.target.value })}
                  />
                  <input
                    type="number"
                    min={0.5}
                    max={8}
                    step={0.5}
                    value={effective.shape.linkWidth}
                    onChange={(e) => setShape({ linkWidth: Number(e.target.value) })}
                  />
                  <label className="sl-inline">
                    <input
                      type="checkbox"
                      checked={effective.shape.linkDashed}
                      onChange={(e) => setShape({ linkDashed: e.target.checked })}
                    />
                    虚线
                  </label>
                </div>
              </div>
            )}

            {current === 'physics' && (
              <div>
                <Slider
                  field="damping"
                  label="阻尼"
                  min={0.2}
                  max={0.98}
                  step={0.01}
                  value={effective.physics.damping}
                  onChange={(v) => setPhysics({ damping: v })}
                />
                <Slider
                  field="minDistance"
                  label="气泡最小距离"
                  min={0}
                  max={120}
                  step={1}
                  value={effective.physics.minDistance}
                  onChange={(v) => setPhysics({ minDistance: v })}
                />
                <Slider
                  field="elasticity"
                  label="连线弹性"
                  min={0.01}
                  max={0.6}
                  step={0.01}
                  value={effective.physics.elasticity}
                  onChange={(v) => setPhysics({ elasticity: v })}
                />
                <button className="sl-btn" onClick={() => resetSection('physics')}>
                  恢复默认
                </button>
              </div>
            )}

            {current === 'update' && <UpdatePanel />}
          </div>
        </div>
      </div>
    </div>
  )
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  field,
  onChange
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  field: string
  onChange: (value: number) => void
}): JSX.Element {
  return (
    <div className="sl-setting-row" data-physics={field}>
      <span className="sl-setting-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

function ShortcutsPanel({
  shortcuts,
  conflicts,
  onChange,
  onReset
}: {
  shortcuts: Record<string, string>
  conflicts: Record<string, string[]>
  onChange: (command: string, accelerator: string) => void
  onReset: () => void
}): JSX.Element {
  const conflictCount = Object.keys(conflicts).length
  return (
    <div>
      <div className="sl-setting-row">
        <span className={`sl-conflict${conflictCount > 0 ? ' bad' : ''}`} data-conflicts={conflictCount}>
          {conflictCount > 0
            ? `检测到 ${conflictCount} 处快捷键冲突`
            : '快捷键无冲突'}
        </span>
        <button className="sl-btn" onClick={onReset}>
          恢复默认
        </button>
      </div>
      <div className="sl-shortcut-list">
        {Object.keys(SHORTCUT_LABELS).map((command) => (
          <div className="sl-setting-row" key={command} data-command={command}>
            <span className="sl-setting-label">{SHORTCUT_LABELS[command]}</span>
            <input
              value={shortcuts[command] ?? ''}
              placeholder="未设置"
              onChange={(e) => onChange(command, e.target.value)}
            />
            <span className="sl-hint">{DEFAULT_SHORTCUTS[command]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function UpdatePanel(): JSX.Element {
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (): Promise<void> => {
    setBusy(true)
    try {
      const result = (await api().checkUpdate()) as UpdateInfo | null
      setInfo(result)
    } catch {
      setInfo(null)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div data-update="panel">
      <div className="sl-setting-row">
        <span className="sl-setting-label">当前版本</span>
        <span data-update="current">{info?.current ?? '0.1.0'}</span>
        <button className="sl-btn" disabled={busy} onClick={() => void run()}>
          {busy ? '检查中…' : '检查更新'}
        </button>
      </div>
      {info && (
        <div className="sl-update-result" data-update="result">
          {info.error ? (
            <span className="bad">检查失败：{info.error}</span>
          ) : info.hasUpdate ? (
            <span>
              发现新版本 <b data-update="latest">{info.latest}</b>
              {'  '}
              <button
                className="sl-btn primary"
                onClick={() => {
                  if (info.url) api().openExternal(info.url)
                  useUiStore.getState().showToast('已在浏览器打开下载页')
                }}
              >
                前往下载
              </button>
            </span>
          ) : (
            <span>已是最新版本（{info.current}）</span>
          )}
        </div>
      )}
      <div className="sl-hint">依赖网络连接 GitHub Releases；失败时会给出明确提示。</div>
    </div>
  )
}

export default SettingsDialog
