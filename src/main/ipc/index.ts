/** IPC 处理器注册：文件读写、导出、最近打开、窗口控制。 */

import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { CH } from '@shared/channels'
import { FILE_EXTENSION, FILE_FILTER_NAME } from '@shared/constants'
import type { ExportRequest, OpenDialogResult, ReadResult, SaveResult } from '@shared/types/ipc'
import type { SparklogFile } from '@shared/types/document'
import { ensureExtension, readDocumentFile, writeDocumentFile } from '../services/documentFile'
import { clearRecent, dropRecent, listRecent, pushRecent } from '../services/recentFiles'
import { readSettings, writeSettings } from '../services/settings'
import { checkForUpdates } from '../services/updates'
import type { WindowManager } from '../windows/manager'

function ownerWindow(manager: WindowManager, sender: Electron.WebContents): BrowserWindow | null {
  const win = BrowserWindow.fromWebContents(sender)
  if (!win) return null
  if (!manager.get(win.id)) return null
  return win
}

export function registerIpcHandlers(manager: WindowManager): void {
  ipcMain.handle(CH.winGetContext, (event) => {
    const win = ownerWindow(manager, event.sender)
    const rec = win ? manager.get(win.id) : undefined
    return {
      windowId: win?.id ?? 0,
      kind: rec?.kind ?? 'workspace',
      filePath: rec?.filePath ?? null
    }
  })

  ipcMain.handle(CH.docOpenDialog, async (event): Promise<OpenDialogResult> => {
    const win = ownerWindow(manager, event.sender)
    const res = await dialog.showOpenDialog(win ?? undefined!, {
      title: '打开画布',
      filters: [{ name: FILE_FILTER_NAME, extensions: [FILE_EXTENSION] }],
      properties: ['openFile']
    })
    if (res.canceled || res.filePaths.length === 0) return { canceled: true }
    const filePath = res.filePaths[0]
    const existing = manager.findByPath(filePath)
    if (existing) {
      existing.win.show()
      existing.win.focus()
      return { canceled: false, filePath, alreadyOpenWindowId: existing.win.id }
    }
    const parsed = await readDocumentFile(filePath)
    if (!parsed.ok) return { canceled: false, filePath, error: parsed.error }
    await pushRecent(filePath)
    return { canceled: false, filePath, doc: parsed.doc, warnings: parsed.warnings }
  })

  ipcMain.handle(CH.docRead, async (_event, filePath: string): Promise<ReadResult> => {
    const parsed = await readDocumentFile(filePath)
    if (!parsed.ok) return { ok: false, error: parsed.error }
    await pushRecent(filePath)
    return { ok: true, doc: parsed.doc, warnings: parsed.warnings }
  })

  ipcMain.handle(
    CH.docWrite,
    async (event, doc: SparklogFile, filePath: string | null, saveAs: boolean): Promise<SaveResult> => {
      const win = ownerWindow(manager, event.sender)
      const rec = win ? manager.get(win.id) : undefined
      let target = filePath ?? rec?.filePath ?? null
      if (!target || saveAs) {
        const res = await dialog.showSaveDialog(win ?? undefined!, {
          title: saveAs ? '另存为' : '保存画布',
          defaultPath: ensureExtension(
            target ?? `${doc.meta.title || '未命名'}.${FILE_EXTENSION}`,
            FILE_EXTENSION
          ),
          filters: [{ name: FILE_FILTER_NAME, extensions: [FILE_EXTENSION] }]
        })
        if (res.canceled || !res.filePath) return { ok: false, canceled: true }
        target = ensureExtension(res.filePath, FILE_EXTENSION)
      }
      try {
        await writeDocumentFile(target, doc)
        if (win) manager.setFilePath(win.id, target)
        await pushRecent(target)
        return { ok: true, filePath: target }
      } catch (err) {
        return { ok: false, error: `保存失败：${(err as Error).message}` }
      }
    }
  )

  ipcMain.handle(CH.docExportDialog, async (event, req: ExportRequest) => {
    const win = ownerWindow(manager, event.sender)
    const res = await dialog.showSaveDialog(win ?? undefined!, {
      title: '导出为',
      defaultPath: ensureExtension(req.defaultName, req.extension),
      filters: [{ name: req.filterName, extensions: [req.extension] }]
    })
    if (res.canceled || !res.filePath) return { ok: false, canceled: true }
    try {
      const target = ensureExtension(res.filePath, req.extension)
      if (req.encoding === 'base64') {
        await fs.writeFile(target, Buffer.from(req.data, 'base64'))
      } else {
        await fs.writeFile(target, req.data, 'utf8')
      }
      return { ok: true, filePath: target }
    } catch (err) {
      return { ok: false, error: `导出失败：${(err as Error).message}` }
    }
  })

  ipcMain.handle(CH.docExportPdf, async (event, html: string, defaultName: string) => {
    const win = ownerWindow(manager, event.sender)
    const res = await dialog.showSaveDialog(win ?? undefined!, {
      title: '导出 PDF',
      defaultPath: ensureExtension(defaultName, 'pdf'),
      filters: [{ name: 'PDF 文档', extensions: ['pdf'] }]
    })
    if (res.canceled || !res.filePath) return { ok: false, canceled: true }
    const printer = new BrowserWindow({
      show: false,
      webPreferences: { offscreen: true }
    })
    try {
      await printer.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      const pdf = await printer.webContents.printToPDF({
        printBackground: true,
        landscape: true,
        pageSize: 'A4'
      })
      await fs.writeFile(ensureExtension(res.filePath, 'pdf'), pdf)
      return { ok: true, filePath: res.filePath }
    } catch (err) {
      return { ok: false, error: `导出 PDF 失败：${(err as Error).message}` }
    } finally {
      if (!printer.isDestroyed()) printer.destroy()
    }
  })

  ipcMain.handle(
    CH.appPickFile,
    async (event, filters: { name: string; extensions: string[] }[]) => {
      const win = ownerWindow(manager, event.sender)
      const res = await dialog.showOpenDialog(win ?? undefined!, {
        title: '选择文件',
        filters,
        properties: ['openFile']
      })
      if (res.canceled || res.filePaths.length === 0) return { canceled: true }
      return { canceled: false, filePath: res.filePaths[0] }
    }
  )

  ipcMain.handle(CH.appOpenPath, async (_event, target: string) => {
    if (!target) return { ok: false, error: '路径为空' }
    try {
      await fs.access(target)
    } catch {
      return { ok: false, error: '文件已移动或删除' }
    }
    const err = await shell.openPath(target)
    return err ? { ok: false, error: err } : { ok: true }
  })

  ipcMain.handle(CH.appReveal, (_event, target: string) => {
    shell.showItemInFolder(target)
  })

  ipcMain.handle(CH.settingsRead, () => readSettings())
  ipcMain.handle(CH.settingsWrite, (_event, value: unknown) => writeSettings(value))
  ipcMain.handle(CH.appCheckUpdate, () => checkForUpdates())
  ipcMain.handle(CH.appOpenExternal, (_event, url: string) => {
    if (typeof url === 'string' && /^https:\/\//.test(url)) void shell.openExternal(url)
  })
  ipcMain.handle(CH.recentList, () => listRecent())
  ipcMain.handle(CH.recentAdd, (_event, filePath: string) => pushRecent(filePath))
  ipcMain.handle(CH.recentRemove, (_event, filePath: string) => dropRecent(filePath))
  ipcMain.handle(CH.recentClear, () => clearRecent())

  ipcMain.handle(CH.appNewWindow, () => {
    void manager.createWorkspaceWindow(null)
  })

  ipcMain.handle(CH.appShowStart, () => {
    void manager.createStartWindow()
  })

  ipcMain.handle(CH.appOpenWorkspace, async (event, filePath?: string | null) => {
    let target: string | null = filePath ?? null
    if (filePath === undefined) {
      const win = ownerWindow(manager, event.sender)
      const res = await dialog.showOpenDialog(win ?? undefined!, {
        title: '打开画布',
        filters: [{ name: FILE_FILTER_NAME, extensions: [FILE_EXTENSION] }],
        properties: ['openFile']
      })
      if (res.canceled || res.filePaths.length === 0) return
      target = res.filePaths[0]
    }
    if (target) {
      const existing = manager.findByPath(target)
      if (existing) {
        existing.win.show()
        existing.win.focus()
        manager.closeStartWindow()
        return
      }
    }
    await manager.createWorkspaceWindow(target)
    manager.closeStartWindow()
  })

  ipcMain.handle(CH.winSetTitle, (event, title: string) => {
    const win = ownerWindow(manager, event.sender)
    if (win) win.setTitle(title)
  })

  ipcMain.handle(CH.winSetDirty, (event, dirty: boolean) => {
    const win = ownerWindow(manager, event.sender)
    if (win) manager.setDirty(win.id, dirty)
  })

  ipcMain.handle(CH.winCloseCurrent, (event) => {
    const win = ownerWindow(manager, event.sender)
    if (win) {
      manager.allowClose(win.id)
      win.close()
    }
  })

  ipcMain.handle(CH.winFocusByPath, (_event, filePath: string) => {
    const rec = manager.findByPath(filePath)
    if (!rec) return false
    rec.win.show()
    rec.win.focus()
    return true
  })

  ipcMain.handle(CH.appPathExists, async (_event, target: string) => {
    try {
      await fs.access(target)
      return true
    } catch {
      return false
    }
  })
}
