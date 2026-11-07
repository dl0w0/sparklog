/** 导出：Markdown 大纲、SVG、PNG（渲染层转码）、PDF（HTML 包装）。 */

import type { BubbleNode, Vec2, ViewMode } from '@shared/types/document'
import { primaryParentOf } from './graph'
import { radiusOf, shapeOf } from './nodeVisual'
import { shapeMetrics } from './bubbleMetrics'
import { buildEdgeGeometry } from './geometry'
import { deriveEdges } from './graph'

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;'
}

export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c)
}

export function importanceNote(importance: number): string {
  return ` <!-- importance:${Math.round(importance)} -->`
}

/** Markdown 大纲：主气泡为一级标题，后代为缩进列表 */
export function buildOutline(nodes: readonly BubbleNode[], zoneId: string | null = null): string {
  const pool = nodes.filter((n) => n.zoneId === zoneId)
  const byId = new Map(pool.map((n) => [n.id, n]))
  const childrenOf = new Map<string, BubbleNode[]>()
  const roots: BubbleNode[] = []
  for (const n of pool) {
    const pid = primaryParentOf(n)
    if (pid && byId.has(pid)) {
      const arr = childrenOf.get(pid)
      if (arr) arr.push(n)
      else childrenOf.set(pid, [n])
    } else {
      roots.push(n)
    }
  }
  const label = (n: BubbleNode): string => `${n.text || '（空）'}${importanceNote(n.importance)}`
  const lines: string[] = []

  const walk = (node: BubbleNode, depth: number): void => {
    const indent = '  '.repeat(depth)
    lines.push(`${indent}- ${label(node)}`)
    for (const child of childrenOf.get(node.id) ?? []) walk(child, depth + 1)
  }

  for (const root of roots) {
    lines.push(`# ${label(root)}`)
    for (const child of childrenOf.get(root.id) ?? []) walk(child, 0)
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}

export interface SvgExportParams {
  nodes: readonly BubbleNode[]
  positions: Map<string, Vec2>
  mode: ViewMode
  background?: string
  bubbleFrom?: string
  bubbleTo?: string
  rootStroke?: string
  childStroke?: string
  edgeColor?: string
  textColor?: string
  padding?: number
}

interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** 生成当前层级的完整 SVG（矢量导出，PNG/PDF 复用） */
export function buildSvgExport(params: SvgExportParams): string {
  const {
    nodes,
    positions,
    mode,
    background = '#F7F8FC',
    bubbleFrom = '#FFFFFF',
    bubbleTo = '#EEF2FF',
    rootStroke = '#5B6FD6',
    childStroke = '#B8C1E8',
    edgeColor = '#B9C2DF',
    textColor = '#2A3050',
    padding = 48
  } = params

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const pos = (n: BubbleNode): Vec2 => positions.get(n.id) ?? n.bubblePos

  const box: Box = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY
  }
  for (const n of nodes) {
    const p = pos(n)
    const r = radiusOf(n, mode)
    box.minX = Math.min(box.minX, p.x - r)
    box.minY = Math.min(box.minY, p.y - r)
    box.maxX = Math.max(box.maxX, p.x + r)
    box.maxY = Math.max(box.maxY, p.y + r)
  }
  if (!Number.isFinite(box.minX)) {
    box.minX = 0
    box.minY = 0
    box.maxX = 100
    box.maxY = 100
  }
  const x = box.minX - padding
  const y = box.minY - padding
  const w = Math.max(1, box.maxX - box.minX + padding * 2)
  const h = Math.max(1, box.maxY - box.minY + padding * 2)

  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${round(x)} ${round(y)} ${round(w)} ${round(h)}" width="${Math.round(w)}" height="${Math.round(h)}">`
  )
  parts.push(`<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" fill="${background}"/>`)

  const edges = deriveEdges(nodes).filter((e) => byId.has(e.from) && byId.has(e.to))
  for (const edge of edges) {
    const from = byId.get(edge.from) as BubbleNode
    const to = byId.get(edge.to) as BubbleNode
    const geo = buildEdgeGeometry(
      { center: pos(from), radius: radiusOf(from, mode), shape: shapeOf(from) },
      { center: pos(to), radius: radiusOf(to, mode), shape: shapeOf(to) },
      mode
    )
    parts.push(
      `<path d="${geo.path}" fill="none" stroke="${edgeColor}" stroke-width="1.5" stroke-linecap="round"${edge.backEdge ? ' stroke-dasharray="4 4"' : ''}/>`
    )
  }

  for (const n of nodes) {
    const p = pos(n)
    const r = radiusOf(n, mode)
    const m = shapeMetrics(shapeOf(n), r)
    const stroke = n.parentIds.length === 0 ? rootStroke : childStroke
    const strokeWidth = n.parentIds.length === 0 ? 2.5 : 1.5
    if (shapeOf(n) === 'ellipse') {
      parts.push(
        `<ellipse cx="${round(p.x)}" cy="${round(p.y)}" rx="${round(m.rx)}" ry="${round(m.ry)}" fill="${bubbleFrom}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`
      )
    } else if (shapeOf(n) === 'roundedRect') {
      parts.push(
        `<rect x="${round(p.x - m.rx)}" y="${round(p.y - m.ry)}" width="${round(m.rx * 2)}" height="${round(m.ry * 2)}" rx="${round(m.cornerRadius)}" fill="${bubbleFrom}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`
      )
    } else {
      parts.push(
        `<circle cx="${round(p.x)}" cy="${round(p.y)}" r="${round(r)}" fill="${bubbleFrom}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`
      )
    }
    const lines = wrapText(n.text, r)
    if (lines.length > 0) {
      const fontSize = Math.max(11, Math.min(20, Math.round(13 + (r - 32) / 14)))
      const lineHeight = fontSize * 1.3
      const startY = p.y - ((lines.length - 1) * lineHeight) / 2
      const tspans = lines
        .map(
          (line, i) =>
            `<tspan x="${round(p.x)}" y="${round(startY + i * lineHeight)}">${escapeXml(line)}</tspan>`
        )
        .join('')
      parts.push(
        `<text text-anchor="middle" dominant-baseline="middle" font-family="Microsoft YaHei UI, Segoe UI, sans-serif" font-size="${fontSize}" fill="${textColor}">${tspans}</text>`
      )
    }
  }

  parts.push('</svg>')
  return parts.join('\n')
}

/** 粗略换行：按可用宽度估算每行字符数（导出用，保证可读） */
export function wrapText(text: string, radius: number, maxLines = 5): string[] {
  const content = text.trim()
  if (!content) return []
  const perLine = Math.max(2, Math.floor((radius * 1.6) / 12))
  const lines: string[] = []
  let rest = content
  while (rest.length > 0 && lines.length < maxLines) {
    lines.push(rest.slice(0, perLine))
    rest = rest.slice(perLine)
  }
  if (rest.length > 0) {
    const last = lines[lines.length - 1]
    lines[lines.length - 1] = `${last.slice(0, Math.max(1, perLine - 1))}…`
  }
  return lines
}

/** PDF：把 SVG 包进一张横向自适应页面 */
export function buildPdfHtml(svg: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: A4 landscape; margin: 12mm; }
html, body { margin: 0; padding: 0; }
svg { width: 100%; height: auto; display: block; }
</style></head><body>${svg}</body></html>`
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
