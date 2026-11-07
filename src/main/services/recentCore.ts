/** 最近打开列表的纯逻辑（不依赖 electron / fs，可单测）。 */

export interface RecentEntry {
  path: string
  name: string
  openedAt: string
}

export const RECENT_LIMIT = 10

function baseName(p: string): string {
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] || p
}

/** 加入最近列表：去重（同一路径只保留最新）、置顶、截断 */
export function addRecent(
  list: readonly RecentEntry[],
  filePath: string,
  openedAt = new Date().toISOString(),
  limit = RECENT_LIMIT
): RecentEntry[] {
  const entry: RecentEntry = { path: filePath, name: baseName(filePath), openedAt }
  const rest = list.filter((e) => e.path !== filePath)
  return [entry, ...rest].slice(0, limit)
}

export function removeRecent(list: readonly RecentEntry[], filePath: string): RecentEntry[] {
  return list.filter((e) => e.path !== filePath)
}

/** 清理已不存在的文件；exists 由调用方注入以便测试 */
export function pruneRecent(
  list: readonly RecentEntry[],
  exists: (p: string) => boolean
): RecentEntry[] {
  return list.filter((e) => exists(e.path))
}

/** 按打开时间倒序，保证 UI 展示稳定 */
export function sortRecent(list: readonly RecentEntry[]): RecentEntry[] {
  return [...list].sort((a, b) => (a.openedAt < b.openedAt ? 1 : a.openedAt > b.openedAt ? -1 : 0))
}

export function isSamePath(a: string, b: string): boolean {
  const norm = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  return norm(a) === norm(b)
}
