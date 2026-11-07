/**
 * 性能基线场景（PRD 15.1）：确定性生成 500 个气泡的文档。
 * 结构：1 个主气泡 → 4 个分支 → 每个分支 24 个子节点 → 每个子节点 4 个孙节点，
 * 外加 2 条网状交叉父连接。拖拽其中一个分支（121 个节点）作为基准动作。
 */

import { IMPORTANCE_MAX, IMPORTANCE_MIN } from '../../../../shared/constants'
import type { BubbleNode, SparklogFile } from '../../../../shared/types/document'

export interface PerfScene {
  doc: SparklogFile
  /** 被拖拽的分支根节点（其子树 ≈ 121 个节点） */
  dragRootId: string
  totalNodes: number
  subtreeSize: number
}

/** 固定种子的伪随机，保证每次生成完全一致 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function buildPerfScene(seed = 20260101): PerfScene {
  const rnd = mulberry32(seed)
  const now = '2026-01-01T00:00:00.000Z'
  const nodes: BubbleNode[] = []
  let seq = 0

  const make = (
    id: string,
    parentIds: string[],
    pos: { x: number; y: number },
    depth: number
  ): BubbleNode => {
    const node: BubbleNode = {
      id,
      text: `气泡 ${id}`,
      importance: Math.round(IMPORTANCE_MIN + rnd() * (IMPORTANCE_MAX - IMPORTANCE_MIN)),
      shape: 'circle',
      colorKey: 'default',
      parentIds,
      zoneId: null,
      bubblePos: pos,
      createdAt: now,
      updatedAt: now
    }
    nodes.push(node)
    void depth
    return node
  }

  make('root', [], { x: 0, y: 0 }, 0)

  let firstChildId = ''
  for (let b = 0; b < 4; b++) {
    const branchId = `b${b}`
    const branchY = (b - 1.5) * 900
    make(branchId, ['root'], { x: 700, y: branchY }, 1)
    if (b === 0) firstChildId = branchId

    for (let c = 0; c < 24; c++) {
      const childId = `${branchId}c${c}`
      const childY = branchY + (c - 11.5) * 320
      make(childId, [branchId], { x: 1500, y: childY }, 2)

      for (let g = 0; g < 4; g++) {
        const grandId = `${childId}g${g}`
        make(grandId, [childId], { x: 2300 + g * 60, y: childY + (g - 1.5) * 84 }, 3)
      }
    }
  }

  while (nodes.length < 500) {
    const id = `x${nodes.length}`
    make(id, ['root'], { x: 400 + (nodes.length % 7) * 40, y: 1600 + (nodes.length % 5) * 60 }, 1)
  }

  // 2 条网状交叉父连接（次要父）；刻意避开被拖拽的分支 b0，保证基准子树规模稳定
  const crossA = nodes.find((n) => n.id === 'b2c0')
  if (crossA && !crossA.parentIds.includes('b1')) crossA.parentIds = [...crossA.parentIds, 'b1']
  const crossB = nodes.find((n) => n.id === 'b3c1')
  if (crossB && !crossB.parentIds.includes('b2')) crossB.parentIds = [...crossB.parentIds, 'b2']

  void seq

  const doc: SparklogFile = {
    fileVersion: 1,
    meta: { title: '性能基线', createdAt: now, updatedAt: now, appVersion: '0.1.0' },
    viewMode: 'bubble',
    theme: { presetId: 'mist-blue' },
    rootViewport: { scale: 1, offsetX: 0, offsetY: 0 },
    nodes: nodes.slice(0, 500),
    zones: [],
    inserts: [],
    links: [],
    edgeStyles: {}
  }

  const dragRootId = firstChildId
  return {
    doc,
    dragRootId,
    totalNodes: doc.nodes.length,
    subtreeSize: 1 + 24 + 24 * 4
  }
}
