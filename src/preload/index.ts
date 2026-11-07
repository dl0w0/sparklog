/** preload：通过 contextBridge 暴露白名单 API，渲染层不直接接触 Node。 */

import { contextBridge, ipcRenderer } from 'electron'
import { CH, type MenuCommand } from '@shared/channels'
import type {
  ExportRequest,
  RecentFileEntry,
  SparklogApi,
  WindowContext
} from '@shared/types/ipc'

const api: SparklogApi = {
  getWindowContext: () => ipcRenderer.invoke(CH.winGetContext) as Promise<WindowContext>,
  openDialog: () => ipcRenderer.invoke(CH.docOpenDialog),
  readDocument: (filePath: string) => ipcRenderer.invoke(CH.docRead, filePath),
  saveDocument: (doc, filePath, saveAs) => ipcRenderer.invoke(CH.docWrite, doc, filePath, saveAs),
  exportDocument: (req: ExportRequest) => ipcRenderer.invoke(CH.docExportDialog, req),
  exportPdf: (html: string, defaultName: string) =>
    ipcRenderer.invoke(CH.docExportPdf, html, defaultName),
  pickFile: (filters) => ipcRenderer.invoke(CH.appPickFile, filters),
  openPath: (target: string) => ipcRenderer.invoke(CH.appOpenPath, target),
  revealInFolder: (target: string) => {
    void ipcRenderer.invoke(CH.appReveal, target)
  },
  listRecent: () => ipcRenderer.invoke(CH.recentList) as Promise<RecentFileEntry[]>,
  addRecent: (filePath: string) => ipcRenderer.invoke(CH.recentAdd, filePath),
  removeRecent: (filePath: string) => ipcRenderer.invoke(CH.recentRemove, filePath),
  clearRecent: () => ipcRenderer.invoke(CH.recentClear),
  newWindow: () => {
    void ipcRenderer.invoke(CH.appNewWindow)
  },
  showStartWindow: () => {
    void ipcRenderer.invoke(CH.appShowStart)
  },
  openWorkspace: (filePath?: string | null) =>
    ipcRenderer.invoke(CH.appOpenWorkspace, filePath) as Promise<void>,
  pathExists: (target: string) => ipcRenderer.invoke(CH.appPathExists, target) as Promise<boolean>,
  readSettings: () => ipcRenderer.invoke(CH.settingsRead),
  writeSettings: (settings: unknown) => ipcRenderer.invoke(CH.settingsWrite, settings),
  checkUpdate: () => ipcRenderer.invoke(CH.appCheckUpdate),
  openExternal: (url: string) => {
    void ipcRenderer.invoke(CH.appOpenExternal, url)
  },
  setTitle: (title: string) => {
    void ipcRenderer.invoke(CH.winSetTitle, title)
  },
  setDirty: (dirty: boolean) => {
    void ipcRenderer.invoke(CH.winSetDirty, dirty)
  },
  closeCurrent: () => {
    void ipcRenderer.invoke(CH.winCloseCurrent)
  },
  onMenuCommand: (handler: (command: MenuCommand) => void) => {
    const listener = (_event: unknown, command: MenuCommand): void => handler(command)
    ipcRenderer.on(CH.menuCommand, listener)
    return () => ipcRenderer.removeListener(CH.menuCommand, listener)
  },
  onCloseRequested: (handler: () => void) => {
    const listener = (): void => handler()
    ipcRenderer.on(CH.winCloseRequested, listener)
    return () => ipcRenderer.removeListener(CH.winCloseRequested, listener)
  },
  focusWindowByPath: (filePath: string) => ipcRenderer.invoke(CH.winFocusByPath, filePath) as Promise<boolean>
}

contextBridge.exposeInMainWorld('sparklog', api)
