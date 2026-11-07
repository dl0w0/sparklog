/** `.insp` 磁盘读写（主进程侧）；编解码逻辑复用 shared/logic/documentCodec。 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { SparklogFile } from '@shared/types/document'
import {
  breakCycles,
  createEmptyDocument,
  parseDocument,
  serializeDocument,
  type ParseResult
} from '@shared/logic/documentCodec'

export { breakCycles, createEmptyDocument, parseDocument, serializeDocument }
export type { ParseResult }

export async function readDocumentFile(filePath: string): Promise<ParseResult> {
  let text: string
  try {
    text = await fs.readFile(filePath, 'utf8')
  } catch (err) {
    return { ok: false, error: `无法读取文件：${(err as Error).message}` }
  }
  return parseDocument(text)
}

/** 原子写：先写临时文件再改名替换，避免写入中断损坏原文件 */
export async function writeDocumentFile(filePath: string, doc: SparklogFile): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const tmp = `${filePath}.${process.pid}.tmp`
  await fs.writeFile(tmp, serializeDocument(doc), 'utf8')
  await fs.rename(tmp, filePath)
}

export function ensureExtension(filePath: string, ext = 'insp'): string {
  return filePath.toLowerCase().endsWith(`.${ext}`) ? filePath : `${filePath}.${ext}`
}
