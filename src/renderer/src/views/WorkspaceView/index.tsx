import { useEffect } from 'react'
import { useShortcuts } from '@renderer/hooks/useShortcuts'
import { executeMenuCommand } from '@renderer/actions/commands'
import { openIntoWorkspace, requestClose } from '@renderer/actions/fileActions'
import { api } from '@renderer/services/bridge'
import { themeVars } from '@renderer/logic/theme'
import { useDocStore } from '@renderer/store/docStore'
import { useUiStore } from '@renderer/store/uiStore'
import CanvasStage from './canvas/CanvasStage'
import SideToolbar from './SideToolbar'
import StatusBar from './StatusBar'
import SearchBar from './SearchBar'
import BatchActionBar from './BatchActionBar'
import Breadcrumb from './Breadcrumb'
import ContextMenu from './ContextMenu'
import Dialogs from './dialogs/Dialogs'
import { menuFor } from './menuItems'

export function WorkspaceView(): JSX.Element {
  useShortcuts()

  const theme = useDocStore((s) => s.doc.theme)
  const contextMenu = useUiStore((s) => s.contextMenu)
  const toast = useUiStore((s) => s.toast)
  const closeContextMenu = useUiStore((s) => s.closeContextMenu)

  // 菜单命令
  useEffect(() => api().onMenuCommand(executeMenuCommand), [])
  // 主进程请求关闭（有未保存变更）
  useEffect(() => api().onCloseRequested(() => void requestClose()), [])
  // 窗口打开时按记录的文件路径载入
  useEffect(() => {
    void (async () => {
      const ctx = await api().getWindowContext()
      if (ctx.kind !== 'workspace' || !ctx.filePath) return
      const res = await api().readDocument(ctx.filePath)
      if (res.ok && res.doc) openIntoWorkspace(res.doc, ctx.filePath, res.warnings)
      else if (res.error) useUiStore.getState().openDialog({ kind: 'error', message: res.error })
    })()
  }, [])

  return (
    <div className="sl-app" style={themeVars(theme) as React.CSSProperties}>
      <div className="sl-workspace">
        <SideToolbar />
        <div className="sl-main">
          <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}>
            <CanvasStage />
            <Breadcrumb />
            <SearchBar />
            <BatchActionBar />
          </div>
          <StatusBar />
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={menuFor(
            { bubbleId: contextMenu.bubbleId, zoneId: contextMenu.zoneId, edgeId: contextMenu.edgeId, insertId: contextMenu.insertId },
            { x: contextMenu.x, y: contextMenu.y, world: contextMenu.world }
          )}
          onClose={closeContextMenu}
        />
      )}

      <Dialogs />
      {toast && <div className="sl-toast">{toast}</div>}
    </div>
  )
}

export default WorkspaceView
