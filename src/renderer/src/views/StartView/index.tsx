import { useCallback, useEffect, useState } from 'react'
import type { RecentFileEntry } from '@shared/types/ipc'
import { api } from '@renderer/services/bridge'

export function StartView(): JSX.Element {
  const [recent, setRecent] = useState<RecentFileEntry[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setRecent(await api().listRecent())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

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

  const openRecent = useCallback(async (entry: RecentFileEntry) => {
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
  }, [refresh])

  return (
    <div className="sl-start">
      <div className="sl-start-left">
        <div className="sl-brand">✦ Sparklog</div>
        <div className="sl-brand-sub">把灵感收进气泡里</div>
        <button className="sl-start-btn primary" disabled={loading} onClick={() => void openBlank()}>
          <span>＋</span>
          <span>新建空白画布</span>
        </button>
        <button className="sl-start-btn" disabled={loading} onClick={() => void openDialog()}>
          <span>📂</span>
          <span>打开文件…</span>
        </button>
        <div className="sl-start-footer">v0.1.0</div>
      </div>

      <div className="sl-start-right">
        <div className="sl-start-section-title">最近打开</div>
        {recent.length === 0 && (
          <div style={{ color: '#a2a9bf', fontSize: 13, padding: '18px 4px' }}>
            还没有最近打开的文件，先新建一张画布吧。
          </div>
        )}
        {recent.map((entry) => (
          <div
            key={entry.path}
            className="sl-recent-item"
            onClick={() => void openRecent(entry)}
            title={entry.path}
          >
            <span>📄</span>
            <div style={{ minWidth: 0 }}>
              <div className="name">{entry.name}</div>
              <div className="path">{entry.path}</div>
            </div>
            <button
              className="sl-recent-remove"
              title="从列表移除"
              onClick={(e) => {
                e.stopPropagation()
                void api()
                  .removeRecent(entry.path)
                  .then(setRecent)
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default StartView
