import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  breakCycles,
  createEmptyDocument,
  ensureExtension,
  parseDocument,
  readDocumentFile,
  serializeDocument,
  writeDocumentFile
} from '../../src/main/services/documentFile'
import type { BubbleNode } from '@shared/types/document'
import { makeNode } from '../helpers'

const tmpDir = path.join(os.tmpdir(), `sparklog-test-${process.pid}`)

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('空文档', () => {
  it('包含全部必需字段', () => {
    const doc = createEmptyDocument('2026-01-01T00:00:00.000Z')
    expect(doc.fileVersion).toBe(1)
    expect(doc.viewMode).toBe('bubble')
    expect(doc.nodes).toEqual([])
    expect(doc.zones).toEqual([])
    expect(doc.inserts).toEqual([])
    expect(doc.rootViewport).toEqual({ scale: 1, offsetX: 0, offsetY: 0 })
    expect(doc.meta.title).toBe('未命名')
  })
})

describe('序列化与反序列化', () => {
  it('往返保持一致', () => {
    const doc = createEmptyDocument('2026-01-01T00:00:00.000Z')
    doc.nodes = [makeNode('r'), makeNode('a', ['r'], { x: 100, y: 50 })]
    doc.viewMode = 'mindmap'
    const text = serializeDocument(doc)
    const parsed = parseDocument(text)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.doc.nodes).toHaveLength(2)
    expect(parsed.doc.nodes[1].bubblePos).toEqual({ x: 100, y: 50 })
    expect(parsed.doc.viewMode).toBe('mindmap')
    expect(parsed.warnings).toEqual([])
  })

  it('序列化写入版本号与缩进 JSON', () => {
    const text = serializeDocument(createEmptyDocument())
    expect(text.startsWith('{\n  "fileVersion": 1')).toBe(true)
  })
})

describe('损坏与版本校验', () => {
  it('非 JSON 内容报错而不是崩溃', () => {
    const res = parseDocument('not json at all')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('JSON')
  })

  it('更高版本的文件被拒绝', () => {
    const res = parseDocument(JSON.stringify({ fileVersion: 99, nodes: [] }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('更新版本')
  })

  it('根不是对象时报错', () => {
    expect(parseDocument('[]').ok).toBe(false)
  })
})

describe('字段修复', () => {
  it('未知 viewMode 回落为 bubble', () => {
    const res = parseDocument(JSON.stringify({ fileVersion: 1, viewMode: 'weird', nodes: [] }))
    expect(res.ok && res.doc.viewMode).toBe('bubble')
  })

  it('重复 id 被丢弃并记录警告', () => {
    const res = parseDocument(
      JSON.stringify({
        fileVersion: 1,
        nodes: [
          { id: 'a', text: '1', importance: 50, parentIds: [], bubblePos: { x: 0, y: 0 } },
          { id: 'a', text: '2', importance: 50, parentIds: [], bubblePos: { x: 0, y: 0 } }
        ]
      })
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.doc.nodes).toHaveLength(1)
    expect(res.warnings.join()).toContain('重复')
  })

  it('重要程度被夹紧到 1..100', () => {
    const res = parseDocument(
      JSON.stringify({
        fileVersion: 1,
        nodes: [{ id: 'a', text: '', importance: 500, parentIds: [], bubblePos: { x: 0, y: 0 } }]
      })
    )
    expect(res.ok && res.doc.nodes[0].importance).toBe(100)
  })

  it('失效的父引用被剪除', () => {
    const res = parseDocument(
      JSON.stringify({
        fileVersion: 1,
        nodes: [{ id: 'a', text: '', importance: 50, parentIds: ['ghost'], bubblePos: { x: 0, y: 0 } }]
      })
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.doc.nodes[0].parentIds).toEqual([])
    expect(res.warnings.join()).toContain('父引用')
  })

  it('不存在的专区引用回落为主画布', () => {
    const res = parseDocument(
      JSON.stringify({
        fileVersion: 1,
        nodes: [
          { id: 'a', text: '', importance: 50, parentIds: [], zoneId: 'nope', bubblePos: { x: 0, y: 0 } }
        ]
      })
    )
    expect(res.ok && res.doc.nodes[0].zoneId).toBeNull()
  })

  it('专区父引用失效时提升为顶层', () => {
    const res = parseDocument(
      JSON.stringify({
        fileVersion: 1,
        nodes: [],
        zones: [{ id: 'z', title: 'Z', parentZoneId: 'ghost', pos: { x: 0, y: 0 }, size: { w: 300, h: 200 } }]
      })
    )
    expect(res.ok && res.doc.zones[0].parentZoneId).toBeNull()
  })

  it('插入对象宿主不存在时改为独立摆放', () => {
    const res = parseDocument(
      JSON.stringify({
        fileVersion: 1,
        nodes: [],
        inserts: [{ id: 'i1', kind: 'note', ownerBubbleId: 'ghost', pos: { x: 0, y: 0 }, note: { title: 't', content: 'c' } }]
      })
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.doc.inserts[0].ownerBubbleId).toBeNull()
  })

  it('未知类型的插入对象被丢弃', () => {
    const res = parseDocument(
      JSON.stringify({ fileVersion: 1, nodes: [], inserts: [{ id: 'i', kind: 'weird' }] })
    )
    expect(res.ok && res.doc.inserts).toHaveLength(0)
  })
})

describe('新增字段解析（D27 / D28）', () => {
  it('collapsed 被保留，缺省为 undefined', () => {
    const res = parseDocument(
      JSON.stringify({
        fileVersion: 1,
        nodes: [
          { id: 'a', text: '', importance: 50, parentIds: [], bubblePos: { x: 0, y: 0 }, collapsed: true },
          { id: 'b', text: '', importance: 50, parentIds: [], bubblePos: { x: 0, y: 0 } }
        ]
      })
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.doc.nodes[0].collapsed).toBe(true)
    expect(res.doc.nodes[1].collapsed).toBeUndefined()
  })

  it('旧版单行任务升级为 items 数组', () => {
    const res = parseDocument(
      JSON.stringify({
        fileVersion: 1,
        nodes: [],
        inserts: [{ id: 'i1', kind: 'task', task: { text: '旧任务', done: true }, pos: { x: 0, y: 0 } }]
      })
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const task = res.doc.inserts[0].task
    expect(task?.items).toHaveLength(1)
    expect(task?.items[0]).toMatchObject({ text: '旧任务', done: true })
  })

  it('新版多行任务完整保留', () => {
    const res = parseDocument(
      JSON.stringify({
        fileVersion: 1,
        nodes: [],
        inserts: [
          {
            id: 'i1',
            kind: 'task',
            task: { items: [{ id: 'a', text: '一', done: false }, { id: 'b', text: '二', done: true }] },
            pos: { x: 0, y: 0 }
          }
        ]
      })
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.doc.inserts[0].task?.items).toHaveLength(2)
  })

  it('expanded 字段被保留', () => {
    const res = parseDocument(
      JSON.stringify({
        fileVersion: 1,
        nodes: [],
        inserts: [{ id: 'i', kind: 'note', expanded: true, note: { title: 't', content: 'c' }, pos: { x: 0, y: 0 } }]
      })
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.doc.inserts[0].expanded).toBe(true)
  })
})

describe('环修复', () => {
  it('单父链条上的环被打破', () => {
    const nodes: BubbleNode[] = [makeNode('a', ['b']), makeNode('b', ['a'])]
    const removed = breakCycles(nodes)
    expect(removed).toBe(1)
    expect(nodes.some((n) => n.parentIds.length === 0)).toBe(true)
  })

  it('多父节点中的成环连接被剪除，正常父保留', () => {
    const nodes: BubbleNode[] = [makeNode('a', ['c']), makeNode('b', ['a']), makeNode('c', ['b'])]
    const removed = breakCycles(nodes)
    expect(removed).toBeGreaterThanOrEqual(1)
    // 修复后无环：从任一节点追父不应回到自身
    const byId = new Map(nodes.map((n) => [n.id, n]))
    for (const n of nodes) {
      const seen = new Set<string>()
      let cur: string | undefined = n.id
      let steps = 0
      while (cur && steps < 10) {
        expect(seen.has(cur)).toBe(false)
        seen.add(cur)
        cur = byId.get(cur)?.parentIds[0]
        steps++
      }
    }
  })

  it('parseDocument 会对成环文件做修复并给出警告', () => {
    const res = parseDocument(
      JSON.stringify({
        fileVersion: 1,
        nodes: [
          { id: 'a', text: '', importance: 50, parentIds: ['b'], bubblePos: { x: 0, y: 0 } },
          { id: 'b', text: '', importance: 50, parentIds: ['a'], bubblePos: { x: 10, y: 0 } }
        ]
      })
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.warnings.join()).toContain('环')
  })
})

describe('磁盘读写', () => {
  it('原子写入后可读回', async () => {
    const file = path.join(tmpDir, 'doc.insp')
    const doc = createEmptyDocument()
    doc.nodes = [makeNode('r')]
    await writeDocumentFile(file, doc)
    const res = await readDocumentFile(file)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.doc.nodes).toHaveLength(1)
    // 临时文件已清理
    const entries = await fs.readdir(tmpDir)
    expect(entries.filter((e) => e.endsWith('.tmp'))).toHaveLength(0)
  })

  it('读取不存在的文件返回错误', async () => {
    const res = await readDocumentFile(path.join(tmpDir, 'missing.insp'))
    expect(res.ok).toBe(false)
  })

  it('ensureExtension 补齐扩展名', () => {
    expect(ensureExtension('a')).toBe('a.insp')
    expect(ensureExtension('a.insp')).toBe('a.insp')
    expect(ensureExtension('a.INSP')).toBe('a.INSP')
  })
})
