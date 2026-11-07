/** 搜索：在整份文档中查找气泡（跨专区），按匹配优先级排序。 */

import type { BubbleNode } from '@shared/types/document'

export interface SearchHit {
  id: string
  text: string
  zoneId: string | null
  /** 前缀匹配 > 包含匹配 */
  score: number
}

export function searchNodes(nodes: readonly BubbleNode[], query: string, limit = 50): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits: SearchHit[] = []
  for (const n of nodes) {
    const text = n.text ?? ''
    if (!text) continue
    const lower = text.toLowerCase()
    const idx = lower.indexOf(q)
    if (idx === -1) continue
    const score = idx === 0 ? 2 : 1
    hits.push({ id: n.id, text, zoneId: n.zoneId, score })
  }
  hits.sort((a, b) => b.score - a.score || a.text.length - b.text.length || a.id.localeCompare(b.id))
  return hits.slice(0, limit)
}
