import { useEffect } from 'react'
import { useShortcuts } from '@renderer/hooks/useShortcuts'
import { executeMenuCommand } from '@renderer/actions/commands'
import { openIntoWorkspace, requestClose, seedStartingBubble } from '@renderer/actions/fileActions'
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
import FormulaBar from './FormulaBar'
import { useSettingsStore } from '@renderer/store/settingsStore'
import ContextMenu from './ContextMenu'
import Dialogs from './dialogs/Dialogs'
import { menuFor } from './menuItems'

export function WorkspaceView(): JSX.Element {
  useShortcuts()

  // 设置：启动加载一次，文档切换后重算画布覆盖（D84）
  useEffect(() => {
    void useSettingsStore.getState().load()
  }, [])
  const canvasSettings = useDocStore((s) => s.doc.settings)
  useEffect(() => {
    useSettingsStore.getState().refreshEffective()
  }, [canvasSettings])

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
      if (ctx.kind !== 'workspace') return
      if (!ctx.filePath) {
        // 从开始页「新建空白画布」进入：空画布补一个起点气泡（D61）
        seedStartingBubble()
        return
      }
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
          <FormulaBar />
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
            { bubbleId: contextMenu.bubbleId, zoneId: contextMenu.zoneId, edgeId: contextMenu.edgeId, insertId: contextMenu.insertId, textNodeId: contextMenu.textNodeId },
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
