/** Electron 主进程入口：应用生命周期、窗口、菜单、IPC。 */

import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { applyAppMenu } from './menu/appMenu'
import { registerIpcHandlers } from './ipc'
import { WindowManager } from './windows/manager'

const preloadDir = join(__dirname, '../preload')
const manager = new WindowManager(preloadDir)

// 单实例：第二个实例启动时聚焦已有窗口
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const windows = manager.all().filter((r) => r.kind === 'workspace')
    if (windows.length > 0) {
      const win = windows[0].win
      win.show()
      win.focus()
    } else {
      void manager.createStartWindow()
    }
  })

  app.whenReady().then(async () => {
    applyAppMenu()
    registerIpcHandlers(manager)
    await manager.createStartWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void manager.createStartWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
