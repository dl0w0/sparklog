/** 窗口标题与文件名显示（D9）。 */

import { APP_NAME, UNTITLED_NAME } from '@shared/constants'
import type { SparklogFile } from '@shared/types/document'

export function fileBaseName(filePath: string | null): string | null {
  if (!filePath) return null
  const parts = filePath.split(/[\\/]/)
  return parts[parts.length - 1] || filePath
}

export function displayName(filePath: string | null): string {
  return fileBaseName(filePath) ?? UNTITLED_NAME
}

/** `*灵感集.insp - Sparklog` / `未命名 - Sparklog` */
export function windowTitle(filePath: string | null, dirty: boolean): string {
  const name = displayName(filePath)
  return `${dirty ? '*' : ''}${name} - ${APP_NAME}`
}

/** 另存为/导出时的默认文件名（不含扩展名） */
export function defaultFileStem(doc: SparklogFile, filePath: string | null): string {
  const base = fileBaseName(filePath)
  if (base) return base.replace(/\.[^.]+$/, '')
  return doc.meta.title || UNTITLED_NAME
}
