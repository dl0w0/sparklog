import { useCallback, useEffect, useRef, useState } from 'react'
import type { RecentFileEntry } from '@shared/types/ipc'
import type { UpdateInfo } from '@shared/logic/version'
import { api } from '@renderer/services/bridge'
import { createDefaultSettings, normalizeSettings } from '@shared/types/settings'
import SkyBackground from './SkyBackground'
import BubbleField from './BubbleField'

/**
 * v0.2.0 排版 + 星空背景（D87/D88）：
 * 左栏品牌与操作，右侧夜空中漂浮最近文件气泡，底部版本与设置。
 */
export function StartView(): JSX.Element {
  const [recent, setRecent] = useState<RecentFileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [version, setVersion] = useState('0.2.0')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [checking, setChecking] = useState(false)

  const [brightness, setBrightness] = useState(1.3)
  const [fov, setFov] = useState(170)
  const [starSize, setStarSize] = useState(0.75)
  const [showLabels, setShowLabels] = useState(true)
  const [showConstellations, setShowConstellations] = useState(true)


  const refresh = useCallback(async () => {
    setRecent(await api().listRecent())
  }, [])

  useEffect(() => {
    void refresh()
    void (async () => {
      try {
        const stored = await api().readSettings()
        const settings = normalizeSettings(stored ?? createDefaultSettings())
        setBrightness(settings.skyBrightness)
        setFov(settings.skyFov)
        setStarSize(settings.starSize)
        setShowLabels(settings.showStarLabels)
        setShowConstellations(settings.showConstellations)
      } catch {
        // 读不到设置时用默认值
      }
    })()
  }, [refresh])

  const persist = useCallback(async (patch: Record<string, unknown>) => {
    try {
      const stored = await api().readSettings()
      const base = normalizeSettings(stored ?? createDefaultSettings())
      await api().writeSettings({ ...base, ...patch })
    } catch {
      // 写入失败保留本地状态
    }
  }, [])

  const openBlank = useCallback(async () => {
    setLoading(true)
    try {
      await api().openWorkspace(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const openDialog = useCallback(async () => {
    setLoading(true)
    try {
      await api().openWorkspace(undefined)
    } finally {
      setLoading(false)
    }
  }, [])

  const openRecent = useCallback(
    async (entry: RecentFileEntry) => {
      const exists = await api().pathExists(entry.path)
      if (!exists) {
        await api().removeRecent(entry.path)
        await refresh()
        return
      }
      setLoading(true)
      try {
        await api().openWorkspace(entry.path)
      } finally {
        setLoading(false)
      }
    },
    [refresh]
  )

  const checkForUpdate = useCallback(async () => {
    setChecking(true)
    try {
      const info = (await api().checkUpdate()) as UpdateInfo | null
      setUpdate(info)
      if (info?.current) setVersion(info.current)
    } finally {
      setChecking(false)
    }
  }, [])

  return (
    <div className="sl-start" data-start="root">
      <SkyBackground
        brightness={brightness}
        fov={fov}
        starSize={starSize}
        showLabels={showLabels}
        showConstellations={showConstellations}
        onFovChange={(next) => {
          setFov(next)
          void persist({ skyFov: next })
        }}
      />

      <BubbleField entries={recent} onOpen={(entry) => void openRecent(entry)} />

      <div className="sl-start-left">
        <div className="sl-brand">✦ Sparklog</div>
        <div className="sl-brand-sub">把灵感收进气泡里</div>
        <button
          className="sl-start-btn primary"
          disabled={loading}
          onClick={() => void openBlank()}
        >
          <span>＋</span>
          <span>新建空白画布</span>
        </button>
        <button className="sl-start-btn" disabled={loading} onClick={() => void openDialog()}>
          <span>📂</span>
          <span>打开文件…</span>
        </button>

        <div className="sl-start-footer">
          <span className="sl-start-version" data-start="version">
            v{version}
          </span>
          <button
            className="sl-start-settings"
            data-start="settings"
            title="设置"
            onClick={() => setSettingsOpen((v) => !v)}
          >
            ⚙
          </button>
        </div>
      </div>

      {settingsOpen && (
        <div className="sl-start-settings-pop" data-start="settingsPop">
          <div className="sl-start-settings-title">设置</div>
          <div className="sl-start-settings-row">
            <span>当前版本</span>
            <span>v{version}</span>
          </div>

          <div className="sl-start-settings-row">
            <span>星空亮度</span>
            <span data-start="brightnessValue">{brightness.toFixed(1)}</span>
          </div>
          <input
            className="sl-start-range"
            data-start="brightness"
            type="range"
            min={0.6}
            max={2.2}
            step={0.1}
            value={brightness}
            onChange={(e) => {
              const next = Number(e.target.value)
              setBrightness(next)
              void persist({ skyBrightness: next })
            }}
          />

          <label className="sl-start-toggle">
            <input
              type="checkbox"
              data-start="labels"
              checked={showLabels}
              onChange={(e) => {
                setShowLabels(e.target.checked)
                void persist({ showStarLabels: e.target.checked })
              }}
            />
            显示星星标签
          </label>
          <label className="sl-start-toggle">
            <input
              type="checkbox"
              data-start="constellations"
              checked={showConstellations}
              onChange={(e) => {
                setShowConstellations(e.target.checked)
                void persist({ showConstellations: e.target.checked })
              }}
            />
            显示星座
          </label>

          <div className="sl-start-settings-row">
            <span>星点大小</span>
            <span>{starSize.toFixed(2)}</span>
          </div>
          <input
            className="sl-start-range"
            data-start="starSize"
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={starSize}
            onChange={(e) => {
              const next = Number(e.target.value)
              setStarSize(next)
              void persist({ starSize: next })
            }}
          />

          <button
            className="sl-start-settings-btn"
            disabled={checking}
            onClick={() => void checkForUpdate()}
          >
            {checking ? '检查中…' : '检查更新'}
          </button>
          {update && (
            <div className="sl-start-settings-result" data-start="updateResult">
              {update.error
                ? `检查失败：${update.error}`
                : update.hasUpdate
                  ? `发现新版本 ${update.latest}，可在 GitHub Releases 下载`
                  : `已是最新版本（v${update.current}）`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default StartView
