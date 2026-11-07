/**
 * `.insp` 文档编解码（纯函数，主进程与渲染进程共用）：
 * 空文档构造、序列化、解析、校验与修复。
 */

import {
  DEFAULT_VIEWPORT,
  FILE_VERSION,
  IMPORTANCE_DEFAULT,
  IMPORTANCE_MAX,
  IMPORTANCE_MIN
} from '../constants'
import { migrateTaskPayload } from './tasks'
import type { CanvasSettings } from '../types/settings'
import type {
  BubbleNode,
  EdgeStyle,
  InsertObject,
  Link,
  SparklogFile,
  ThemeConfig,
  Vec2,
  Viewport,
  ViewMode,
  Zone
} from '../types/document'

export interface ParseOk {
  ok: true
  doc: SparklogFile
  warnings: string[]
}
export interface ParseFail {
  ok: false
  error: string
}
export type ParseResult = ParseOk | ParseFail

const VALID_VIEW_MODES: ViewMode[] = ['bubble', 'mindmap']

export function createEmptyDocument(now = new Date().toISOString()): SparklogFile {
  return {
    fileVersion: FILE_VERSION,
    meta: { title: '未命名', createdAt: now, updatedAt: now, appVersion: '0.1.0' },
    viewMode: 'bubble',
    theme: { presetId: 'mist-blue' },
    rootViewport: { ...DEFAULT_VIEWPORT },
    nodes: [],
    zones: [],
    inserts: [],
    links: [],
    edgeStyles: {}
  }
}

export function serializeDocument(doc: SparklogFile, now = new Date().toISOString()): string {
  const ordered: SparklogFile = {
    fileVersion: FILE_VERSION,
    meta: { ...doc.meta, updatedAt: now },
    viewMode: doc.viewMode,
    theme: doc.theme,
    rootViewport: doc.rootViewport,
    nodes: doc.nodes,
    zones: doc.zones,
    inserts: doc.inserts,
    links: doc.links ?? [],
    edgeStyles: doc.edgeStyles ?? {}
  }
  return JSON.stringify(ordered, null, 2)
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}
function readVec(v: unknown, fallback: Vec2): Vec2 {
  if (!isObject(v)) return { ...fallback }
  return { x: num(v.x, fallback.x), y: num(v.y, fallback.y) }
}
function readViewport(v: unknown): Viewport {
  if (!isObject(v)) return { ...DEFAULT_VIEWPORT }
  return {
    scale: Math.min(4, Math.max(0.05, num(v.scale, 1))),
    offsetX: num(v.offsetX, 0),
    offsetY: num(v.offsetY, 0)
  }
}

export function parseDocument(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: '文件内容不是合法的 JSON，可能已损坏。' }
  }
  if (!isObject(raw)) return { ok: false, error: '文件根结构不是对象。' }

  const version = num(raw.fileVersion, 0)
  if (version > FILE_VERSION) {
    return {
      ok: false,
      error: `文件由更新版本的 Sparklog 创建（格式 v${version}），当前仅支持 v${FILE_VERSION}。`
    }
  }

  const warnings: string[] = []
  const now = new Date().toISOString()

  const meta = isObject(raw.meta) ? raw.meta : {}
  const theme: ThemeConfig =
    isObject(raw.theme) && typeof raw.theme.presetId === 'string'
      ? (raw.theme as unknown as ThemeConfig)
      : { presetId: 'mist-blue' }

  const viewMode: ViewMode = VALID_VIEW_MODES.includes(raw.viewMode as ViewMode)
    ? (raw.viewMode as ViewMode)
    : 'bubble'

  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : []
  const nodes: BubbleNode[] = []
  const seenIds = new Set<string>()
  for (const item of rawNodes) {
    if (!isObject(item)) continue
    const id = str(item.id)
    if (!id || seenIds.has(id)) {
      warnings.push(`丢弃无效或重复的气泡 id：${id || '(空)'}`)
      continue
    }
    seenIds.add(id)
    const importance = Math.min(
      IMPORTANCE_MAX,
      Math.max(IMPORTANCE_MIN, num(item.importance, IMPORTANCE_DEFAULT))
    )
    const parentIds = Array.isArray(item.parentIds)
      ? [...new Set(item.parentIds.filter((p): p is string => typeof p === 'string' && p !== id))]
      : []
    nodes.push({
      id,
      text: str(item.text),
      importance,
      shape: item.shape === 'ellipse' || item.shape === 'roundedRect' ? item.shape : 'circle',
      colorKey: str(item.colorKey, 'default'),
      parentIds,
      zoneId: typeof item.zoneId === 'string' ? item.zoneId : null,
      bubblePos: readVec(item.bubblePos, { x: 0, y: 0 }),
      style: isObject(item.style) ? (item.style as BubbleNode['style']) : undefined,
      collapsed: item.collapsed === true ? true : undefined,
      importanceOverride: item.importanceOverride === true ? true : undefined,
      linkLength:
        typeof item.linkLength === 'number' && Number.isFinite(item.linkLength)
          ? Math.max(1, item.linkLength)
          : undefined,
      createdAt: str(item.createdAt, now),
      updatedAt: str(item.updatedAt, now)
    })
  }

  const rawZones = Array.isArray(raw.zones) ? raw.zones : []
  const zones: Zone[] = []
  const zoneIds = new Set<string>()
  for (const item of rawZones) {
    if (!isObject(item)) continue
    const id = str(item.id)
    if (!id || zoneIds.has(id)) {
      warnings.push(`丢弃无效或重复的专区 id：${id || '(空)'}`)
      continue
    }
    zoneIds.add(id)
    const size = isObject(item.size) ? item.size : {}
    zones.push({
      id,
      title: str(item.title, '专区'),
      colorKey: str(item.colorKey, 'default'),
      parentZoneId: typeof item.parentZoneId === 'string' ? item.parentZoneId : null,
      pos: readVec(item.pos, { x: 0, y: 0 }),
      size: { w: Math.max(120, num(size.w, 320)), h: Math.max(120, num(size.h, 240)) },
      viewport: readViewport(item.viewport)
    })
  }
  for (const z of zones) {
    if (z.parentZoneId && !zoneIds.has(z.parentZoneId)) {
      warnings.push(`专区「${z.title}」的父专区不存在，已提升为顶层`)
      z.parentZoneId = null
    }
  }

  const nodeIds = new Set(nodes.map((n) => n.id))
  for (const n of nodes) {
    const kept = n.parentIds.filter((p) => nodeIds.has(p))
    if (kept.length !== n.parentIds.length) {
      warnings.push(`气泡「${n.id}」存在失效的父引用，已剪除`)
      n.parentIds = kept
    }
    if (n.zoneId && !zoneIds.has(n.zoneId)) {
      warnings.push(`气泡「${n.id}」所属专区不存在，已移至主画布`)
      n.zoneId = null
    }
  }

  const cycleRemoved = breakCycles(nodes)
  if (cycleRemoved > 0) warnings.push(`检测到 ${cycleRemoved} 条形成环的父连接，已剪除`)

  const rawInserts = Array.isArray(raw.inserts) ? raw.inserts : []
  const inserts: InsertObject[] = []
  const insertIds = new Set<string>()
  for (const item of rawInserts) {
    if (!isObject(item)) continue
    const id = str(item.id)
    if (!id || insertIds.has(id)) {
      warnings.push(`丢弃无效或重复的插入对象 id：${id || '(空)'}`)
      continue
    }
    insertIds.add(id)
    const kind = item.kind
    if (kind !== 'note' && kind !== 'task' && kind !== 'attachment' && kind !== 'image') {
      warnings.push(`丢弃未知类型的插入对象：${String(kind)}`)
      continue
    }
    let ownerBubbleId = typeof item.ownerBubbleId === 'string' ? item.ownerBubbleId : null
    if (ownerBubbleId && !nodeIds.has(ownerBubbleId)) {
      warnings.push(`插入对象「${id}」的宿主气泡不存在，已改为独立摆放`)
      ownerBubbleId = null
    }
    let zoneId = typeof item.zoneId === 'string' ? item.zoneId : null
    if (zoneId && !zoneIds.has(zoneId)) zoneId = null
    inserts.push({
      id,
      kind,
      zoneId,
      ownerBubbleId,
      pos: readVec(item.pos, { x: 0, y: 0 }),
      pinned: Boolean(item.pinned),
      expanded: item.expanded === true ? true : undefined,
      note: isObject(item.note)
        ? { title: str(item.note.title), content: str(item.note.content) }
        : kind === 'note'
          ? { title: '', content: '' }
          : undefined,
      task:
        kind === 'task'
          ? migrateTaskPayload(item.task)
          : isObject(item.task)
            ? migrateTaskPayload(item.task)
            : undefined,
      attachment: isObject(item.attachment)
        ? {
            path: str(item.attachment.path),
            name: str(item.attachment.name),
            ext: str(item.attachment.ext)
          }
        : undefined,
      image: isObject(item.image)
        ? {
            path: str(item.image.path),
            name: str(item.image.name),
            w: num(item.image.w, 100),
            h: num(item.image.h, 100)
          }
        : undefined,
      createdAt: str(item.createdAt, now),
      updatedAt: str(item.updatedAt, now)
    })
  }

  const links = readLinks(raw.links)
  const edgeStyles = readEdgeStyles(raw.edgeStyles)

  return {
    ok: true,
    warnings,
    doc: {
      fileVersion: FILE_VERSION,
      meta: {
        title: str(meta.title, '未命名'),
        createdAt: str(meta.createdAt, now),
        updatedAt: str(meta.updatedAt, now),
        appVersion: str(meta.appVersion, '0.1.0')
      },
      viewMode,
      theme,
      rootViewport: readViewport(raw.rootViewport),
      nodes,
      zones,
      inserts,
      links,
      edgeStyles
    }
  }
}

function readLinks(raw: unknown): Link[] {
  if (!Array.isArray(raw)) return []
  const byId = new Set<string>()
  const out: Link[] = []
  for (const item of raw) {
    if (!isObject(item)) continue
    const id = str(item.id)
    const from = str(item.from)
    const to = str(item.to)
    if (!id || !from || !to || byId.has(id)) continue
    byId.add(id)
    out.push({
      id,
      from,
      to,
      fromKind: item.fromKind === 'insert' ? 'insert' : 'bubble',
      toKind: item.toKind === 'insert' ? 'insert' : 'bubble',
      length: typeof item.length === 'number' && Number.isFinite(item.length) ? Math.max(1, item.length) : undefined,
      label: typeof item.label === 'string' ? item.label : undefined,
      style: isObject(item.style) ? (item.style as EdgeStyle) : undefined
    })
  }
  return out
}

function readEdgeStyles(raw: unknown): Record<string, EdgeStyle> {
  if (!isObject(raw)) return {}
  const out: Record<string, EdgeStyle> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!isObject(value)) continue
    out[key] = value as EdgeStyle
  }
  return out
}

/** 删除形成环的父连接（DFS 找回边），返回删除数量 */
export function breakCycles(nodes: BubbleNode[]): number {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const state = new Map<string, 0 | 1 | 2>()
  let removed = 0
  const visit = (id: string): void => {
    state.set(id, 1)
    const node = byId.get(id)
    if (!node) {
      state.set(id, 2)
      return
    }
    const kept: string[] = []
    for (const p of node.parentIds) {
      const st = state.get(p) ?? 0
      if (st === 1) {
        removed += 1
        continue
      }
      if (st === 0) visit(p)
      kept.push(p)
    }
    node.parentIds = kept
    state.set(id, 2)
  }
  for (const n of nodes) if ((state.get(n.id) ?? 0) === 0) visit(n.id)
  return removed
}
