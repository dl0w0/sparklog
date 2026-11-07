/** 主进程与渲染进程之间的 IPC 契约。 */

import type { MenuCommand } from '../channels'
import type { SparklogFile } from './document'

export interface RecentFileEntry {
  path: string
  name: string
  openedAt: string
}

export interface DocumentPayload {
  doc: SparklogFile
  filePath: string
  warnings?: string[]
}

export interface OpenDialogResult {
  canceled: boolean
  filePath?: string
  doc?: SparklogFile
  warnings?: string[]
  error?: string
  /** 该文件已在另一个窗口中打开时，返回该窗口 id */
  alreadyOpenWindowId?: number
}

export interface ReadResult {
  ok: boolean
  doc?: SparklogFile
  warnings?: string[]
  error?: string
}

export interface SaveResult {
  ok: boolean
  canceled?: boolean
  filePath?: string
  error?: string
}

export interface ExportRequest {
  defaultName: string
  extension: string
  filterName: string
  /** utf8 文本（svg / md）或 base64（png / pdf） */
  data: string
  encoding: 'utf8' | 'base64'
}

export interface ExportResult {
  ok: boolean
  canceled?: boolean
  filePath?: string
  error?: string
}

export interface PickFileResult {
  canceled: boolean
  filePath?: string
}

export interface WindowContext {
  windowId: number
  kind: 'start' | 'workspace'
  filePath: string | null
}

export interface SparklogApi {
  /** 窗口上下文 */
  getWindowContext(): Promise<WindowContext>
  /** 文件 */
  openDialog(): Promise<OpenDialogResult>
  readDocument(filePath: string): Promise<ReadResult>
  saveDocument(doc: SparklogFile, filePath: string | null, saveAs: boolean): Promise<SaveResult>
  exportDocument(req: ExportRequest): Promise<ExportResult>
  exportPdf(html: string, defaultName: string): Promise<ExportResult>
  pickFile(filters: { name: string; extensions: string[] }[]): Promise<PickFileResult>
  openPath(target: string): Promise<{ ok: boolean; error?: string }>
  revealInFolder(target: string): void
  /** 最近打开 */
  listRecent(): Promise<RecentFileEntry[]>
  addRecent(filePath: string): Promise<RecentFileEntry[]>
  removeRecent(filePath: string): Promise<RecentFileEntry[]>
  clearRecent(): Promise<RecentFileEntry[]>
  /** 窗口 */
  newWindow(): void
  showStartWindow(): void
  /** 从开始窗口打开工作区：undefined = 弹选择对话框，null = 空白画布，字符串 = 打开该路径 */
  openWorkspace(filePath?: string | null): Promise<void>
  pathExists(target: string): Promise<boolean>
  /** 设置与更新 */
  readSettings(): Promise<unknown>
  writeSettings(settings: unknown): Promise<boolean>
  checkUpdate(): Promise<unknown>
  openExternal(url: string): void
  setTitle(title: string): void
  setDirty(dirty: boolean): void
  closeCurrent(): void
  onMenuCommand(handler: (command: MenuCommand) => void): () => void
  onCloseRequested(handler: () => void): () => void
  /** 该路径是否已在别的窗口打开；是则聚焦并返回 true */
  focusWindowByPath(filePath: string): Promise<boolean>
}

declare global {
  interface Window {
    sparklog?: SparklogApi
  }
}
