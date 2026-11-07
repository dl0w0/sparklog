/** 与主进程通信的薄封装；在浏览器/测试环境下降级为内存实现。 */

import type { SparklogApi } from '@shared/types/ipc'

const fallback: SparklogApi = {
  getWindowContext: async () => ({ windowId: 0, kind: 'workspace', filePath: null }),
  openDialog: async () => ({ canceled: true }),
  readDocument: async () => ({ ok: false, error: '当前环境不支持文件读取' }),
  saveDocument: async () => ({ ok: false, error: '当前环境不支持文件保存' }),
  exportDocument: async () => ({ ok: false, error: '当前环境不支持导出' }),
  exportPdf: async () => ({ ok: false, error: '当前环境不支持导出' }),
  pickFile: async () => ({ canceled: true }),
  openPath: async () => ({ ok: false, error: '当前环境不支持打开文件' }),
  revealInFolder: () => undefined,
  listRecent: async () => [],
  addRecent: async () => [],
  removeRecent: async () => [],
  clearRecent: async () => [],
  newWindow: () => undefined,
  showStartWindow: () => undefined,
  openWorkspace: async () => undefined,
  pathExists: async () => false,
  setTitle: () => undefined,
  setDirty: () => undefined,
  closeCurrent: () => undefined,
  onMenuCommand: () => () => undefined,
  onCloseRequested: () => () => undefined,
  focusWindowByPath: async () => false
}

export function api(): SparklogApi {
  if (typeof window !== 'undefined' && window.sparklog) return window.sparklog
  return fallback
}

export function hasNativeApi(): boolean {
  return typeof window !== 'undefined' && Boolean(window.sparklog)
}
