import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import {
  addRecent,
  pruneRecent,
  removeRecent,
  sortRecent,
  type RecentEntry
} from './recentCore'

function storeFile(): string {
  return path.join(app.getPath('userData'), 'recent-files.json')
}

export async function loadRecent(): Promise<RecentEntry[]> {
  try {
    const text = await fs.readFile(storeFile(), 'utf8')
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) return []
    return sortRecent(
      parsed.filter(
        (e): e is RecentEntry =>
          !!e && typeof e.path === 'string' && typeof e.name === 'string' &&
          typeof e.openedAt === 'string'
      )
    )
  } catch {
    return []
  }
}

async function saveRecent(list: RecentEntry[]): Promise<void> {
  try {
    await fs.mkdir(path.dirname(storeFile()), { recursive: true })
    await fs.writeFile(storeFile(), JSON.stringify(list, null, 2), 'utf8')
  } catch {
    // 最近列表写入失败不影响主流程
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

/** 读取并清理失效路径 */
export async function listRecent(): Promise<RecentEntry[]> {
  const list = await loadRecent()
  const kept: RecentEntry[] = []
  for (const entry of list) {
    if (await fileExists(entry.path)) kept.push(entry)
  }
  if (kept.length !== list.length) await saveRecent(kept)
  return kept
}

export async function pushRecent(filePath: string): Promise<RecentEntry[]> {
  const list = await loadRecent()
  const next = addRecent(list, filePath)
  await saveRecent(next)
  return next
}

export async function dropRecent(filePath: string): Promise<RecentEntry[]> {
  const list = await loadRecent()
  const next = removeRecent(list, filePath)
  await saveRecent(next)
  return next
}

export async function clearRecent(): Promise<RecentEntry[]> {
  await saveRecent([])
  return []
}
