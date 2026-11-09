/** 多窗口管理：开始窗口单例、工作区窗口多实例、窗口 ↔ 文件绑定（D10）。 */

import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { CH } from '@shared/channels'
import { isSamePath } from '../services/recentCore'
import { loadWindowState, saveWindowState } from './state'

export type WindowKind = 'start' | 'workspace'

export interface WindowRecord {
  win: BrowserWindow
  kind: WindowKind
  filePath: string | null
  dirty: boolean
  allowClose: boolean
}

const DEFAULT_START = { width: 960, height: 640, minWidth: 800, minHeight: 520 }
const DEFAULT_WORKSPACE = { width: 1280, height: 820, minWidth: 900, minHeight: 600 }

export class WindowManager {
  private records = new Map<number, WindowRecord>()
  private startWinId: number | null = null
  onWorkspaceClosed: (() => void) | null = null
  /** 应用正在退出时不要重建开始页（D92） */
  private quitting = false
  /** 进行中的开始页创建（避免并发创建出两个窗口，D97） */
  private startCreating: Promise<BrowserWindow> | null = null

  setQuitting(value: boolean): void {
    this.quitting = value
  }

  constructor(private readonly preloadDir: string) {}

  private preloadPath(): string {
    return join(this.preloadDir, 'index.js')
  }

  private async load(win: BrowserWindow, page: 'start' | 'index'): Promise<void> {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl) {
      await win.loadURL(`${devUrl}/${page}.html`)
    } else {
      await win.loadFile(join(__dirname, `../renderer/${page}.html`))
    }
  }

  get(windowId: number): WindowRecord | undefined {
    return this.records.get(windowId)
  }

  all(): WindowRecord[] {
    return [...this.records.values()]
  }

  async createStartWindow(): Promise<BrowserWindow> {
    // D97：并发调用复用同一次创建
    if (this.startCreating) return this.startCreating
    const existing = this.findStartWindow()
    if (existing) {
      existing.show()
      existing.focus()
      return existing
    }
    const task = this.doCreateStartWindow()
    this.startCreating = task
    try {
      return await task
    } finally {
      this.startCreating = null
    }
  }

  /** 找到任意一个仍存活的开始页窗口（D97） */
  private findStartWindow(): BrowserWindow | null {
    for (const rec of this.records.values()) {
      if (rec.kind !== 'start') continue
      try {
        if (!rec.win.isDestroyed()) return rec.win
      } catch {
        // 窗口对象已销毁，跳过
      }
    }
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (this.records.get(win.id)?.kind === 'start' && !win.isDestroyed()) return win
      } catch {
        // 同上
      }
    }
    return null
  }

  private async doCreateStartWindow(): Promise<BrowserWindow> {
    if (this.startWinId !== null) {
      const existing = this.records.get(this.startWinId)
      if (existing && !existing.win.isDestroyed()) {
        existing.win.show()
        existing.win.focus()
        return existing.win
      }
    }
    const saved = await loadWindowState('start')
    const win = new BrowserWindow({
      width: saved?.width ?? DEFAULT_START.width,
      height: saved?.height ?? DEFAULT_START.height,
      x: saved?.x,
      y: saved?.y,
      minWidth: DEFAULT_START.minWidth,
      minHeight: DEFAULT_START.minHeight,
      title: 'Sparklog',
      backgroundColor: '#F7F8FC',
      show: false,
      autoHideMenuBar: false,
      webPreferences: {
        preload: this.preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })
    this.records.set(win.id, {
      win,
      kind: 'start',
      filePath: null,
      dirty: false,
      allowClose: false
    })
    this.startWinId = win.id

    win.on('close', () => {
      const bounds = win.getBounds()
      void saveWindowState('start', bounds, win.isMaximized())
    })
    win.on('closed', () => {
      this.records.delete(win.id)
      if (this.startWinId === win.id) this.startWinId = null
    })
    win.once('ready-to-show', () => win.show())
    await this.load(win, 'start')
    return win
  }

  /** 确保开始页窗口存在并聚焦（D92） */
  async ensureStartWindow(): Promise<void> {
    const existing = this.findStartWindow()
    if (existing) {
      existing.show()
      existing.focus()
      return
    }
    await this.createStartWindow()
  }

  async createWorkspaceWindow(filePath: string | null = null): Promise<BrowserWindow> {
    const saved = await loadWindowState('workspace')
    const win = new BrowserWindow({
      width: saved?.width ?? DEFAULT_WORKSPACE.width,
      height: saved?.height ?? DEFAULT_WORKSPACE.height,
      x: saved?.x,
      y: saved?.y,
      minWidth: DEFAULT_WORKSPACE.minWidth,
      minHeight: DEFAULT_WORKSPACE.minHeight,
      title: filePath ?? '未命名 - Sparklog',
      backgroundColor: '#F7F8FC',
      show: false,
      webPreferences: {
        preload: this.preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        // 拖拽性能依赖硬件加速与合成层，显式开启
        backgroundThrottling: false
      }
    })
    const record: WindowRecord = {
      win,
      kind: 'workspace',
      filePath,
      dirty: false,
      allowClose: false
    }
    this.records.set(win.id, record)

    win.on('close', (event) => {
      if (record.dirty && !record.allowClose) {
        event.preventDefault()
        win.webContents.send(CH.winCloseRequested)
        return
      }
      const bounds = win.getBounds()
      void saveWindowState('workspace', bounds, win.isMaximized())
    })
    win.on('closed', () => {
      this.records.delete(win.id)
      this.onWorkspaceClosed?.()
      if (!this.quitting) void this.ensureStartWindow()
    })
    win.once('ready-to-show', () => win.show())
    await this.load(win, 'index')
    return win
  }

  /** 开始窗口 → 工作区窗口的交接：先建工作区窗口，再关开始窗口 */
  async handOffToWorkspace(): Promise<BrowserWindow> {
    const win = await this.createWorkspaceWindow(null)
    if (this.startWinId !== null) {
      const startRec = this.records.get(this.startWinId)
      if (startRec && !startRec.win.isDestroyed()) {
        startRec.allowClose = true
        startRec.win.close()
      }
    }
    win.focus()
    return win
  }

  setFilePath(windowId: number, filePath: string | null): void {
    const rec = this.records.get(windowId)
    if (rec) rec.filePath = filePath
  }

  setDirty(windowId: number, dirty: boolean): void {
    const rec = this.records.get(windowId)
    if (rec) rec.dirty = dirty
  }

  /** 找到已打开同一文件的窗口（D10） */
  findByPath(filePath: string): WindowRecord | undefined {
    for (const rec of this.records.values()) {
      if (rec.kind === 'workspace' && rec.filePath && isSamePath(rec.filePath, filePath)) return rec
    }
    return undefined
  }

  allowClose(windowId: number): void {
    const rec = this.records.get(windowId)
    if (rec) rec.allowClose = true
  }

  /** 关闭开始窗口（交接给工作区窗口后） */
  closeStartWindow(): void {
    if (this.startWinId === null) return
    const rec = this.records.get(this.startWinId)
    if (rec && !rec.win.isDestroyed()) {
      rec.allowClose = true
      rec.win.close()
    }
  }

  hasWorkspaceWindows(): boolean {
    return this.all().some((r) => r.kind === 'workspace')
  }
}
