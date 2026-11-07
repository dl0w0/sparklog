/**
 * 性能基准（PRD 15.2）。阈值全部为硬性验收项，不允许放宽。
 */

import { describe, expect, it } from 'vitest'
import { buildPerfScene } from '@renderer/logic/perf/fixture'
import { layoutMindmap } from '@renderer/logic/layout/mindmapLayout'
import { buildEdgeGeometry } from '@renderer/logic/geometry'
import { cullVisible } from '@renderer/logic/layout/culling'
import { radiusOf, shapeOf } from '@renderer/logic/nodeVisual'
import { deriveEdges, subtreeIds } from '@renderer/logic/graph'
import { parseDocument, serializeDocument } from '@shared/logic/documentCodec'

const scene = buildPerfScene()
const nodes = scene.doc.nodes
const nodesById = new Map(nodes.map((n) => [n.id, n]))

function p95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length))]
}

function timeIt(fn: () => void, rounds = 5): number[] {
  const times: number[] = []
  for (let i = 0; i < rounds; i++) {
    const start = performance.now()
    fn()
    times.push(performance.now() - start)
  }
  return times
}

describe('基线场景', () => {
  it('生成 500 个气泡，拖拽分支约 120 个节点', () => {
    expect(scene.totalNodes).toBe(500)
    expect(scene.subtreeSize).toBe(121)
    expect(subtreeIds(nodes, scene.dragRootId)).toHaveLength(121)
    // 网状交叉连接存在
    expect(nodes.some((n) => n.parentIds.length > 1)).toBe(true)
    // 确定性
    expect(buildPerfScene().doc.nodes.map((n) => n.bubblePos.x)).toEqual(nodes.map((n) => n.bubblePos.x))
  })
})

describe('布局性能', () => {
  it('500 节点思维导图布局 ≤ 20ms', () => {
    const times = timeIt(() => {
      layoutMindmap(nodes, { radiusOf: (n) => radiusOf(n, 'mindmap') })
    })
    console.log(`[perf] 导图布局 P95 = ${p95(times).toFixed(2)}ms（上限 20ms）`)
    expect(p95(times)).toBeLessThanOrEqual(20)
  })

  it('500 节点适应画布包围盒计算 ≤ 5ms', () => {
    const times = timeIt(() => {
      let minX = Number.POSITIVE_INFINITY
      let maxX = Number.NEGATIVE_INFINITY
      for (const n of nodes) {
        const r = radiusOf(n, 'bubble')
        minX = Math.min(minX, n.bubblePos.x - r)
        maxX = Math.max(maxX, n.bubblePos.x + r)
      }
      void minX
      void maxX
    })
    expect(p95(times)).toBeLessThanOrEqual(5)
  })
})

describe('几何性能', () => {
  it('单条连线几何计算 ≤ 5μs', () => {
    const edges = deriveEdges(nodes)
    const pairs = edges.map((e) => ({
      from: nodesById.get(e.from)!,
      to: nodesById.get(e.to)!
    }))
    const rounds = 20
    const start = performance.now()
    for (let r = 0; r < rounds; r++) {
      for (const pair of pairs) {
        buildEdgeGeometry(
          { center: pair.from.bubblePos, radius: radiusOf(pair.from, 'bubble'), shape: shapeOf(pair.from) },
          { center: pair.to.bubblePos, radius: radiusOf(pair.to, 'bubble'), shape: shapeOf(pair.to) },
          'bubble'
        )
      }
    }
    const perEdge = (performance.now() - start) / (rounds * pairs.length)
    console.log(
      `[perf] 单条连线几何 = ${(perEdge * 1000).toFixed(2)}μs（上限 5μs），共 ${pairs.length} 条`
    )
    expect(perEdge).toBeLessThanOrEqual(0.005)
  })

  it('拖拽 121 节点子树的单帧几何耗時 ≤ 6.94ms（等效 144fps）', () => {
    const subtree = new Set(subtreeIds(nodes, scene.dragRootId))
    const affected = deriveEdges(nodes).filter((e) => subtree.has(e.from) || subtree.has(e.to))
    expect(affected.length).toBeGreaterThan(100)

    const times = timeIt(() => {
      const positions = new Map<string, { x: number; y: number }>()
      for (const id of subtree) {
        const n = nodesById.get(id)!
        positions.set(id, { x: n.bubblePos.x + 40, y: n.bubblePos.y + 25 })
      }
      for (const edge of affected) {
        const from = nodesById.get(edge.from)!
        const to = nodesById.get(edge.to)!
        buildEdgeGeometry(
          {
            center: positions.get(edge.from) ?? from.bubblePos,
            radius: radiusOf(from, 'bubble'),
            shape: shapeOf(from)
          },
          {
            center: positions.get(edge.to) ?? to.bubblePos,
            radius: radiusOf(to, 'bubble'),
            shape: shapeOf(to)
          },
          'bubble'
        )
      }
    }, 20)
    console.log(
      `[perf] 拖拽 121 节点单帧 P95 = ${p95(times).toFixed(2)}ms（上限 6.94ms），影响连线 ${affected.length} 条`
    )
    expect(p95(times)).toBeLessThanOrEqual(6.94)
  })
})

describe('裁剪与反序列化', () => {
  it('500 节点视口裁剪 ≤ 8ms', () => {
    const items = nodes.map((n) => ({ id: n.id, pos: n.bubblePos, radius: radiusOf(n, 'bubble') }))
    const times = timeIt(
      () => {
        cullVisible(items, { scale: 1, offsetX: 0, offsetY: 0 }, { w: 1440, h: 900 })
      },
      20
    )
    expect(p95(times)).toBeLessThanOrEqual(8)
  })

  it('打开 500 节点文件（序列化 + 解析）≤ 500ms', () => {
    const text = serializeDocument(scene.doc)
    const start = performance.now()
    const parsed = parseDocument(text)
    const elapsed = performance.now() - start
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.doc.nodes).toHaveLength(500)
    expect(elapsed).toBeLessThanOrEqual(500)
  })
})
