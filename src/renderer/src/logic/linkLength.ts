/**
 * 连线长度策略（D40 / D44 / D45）：
 * - 用户手动固定的长度（Ctrl 拖拽 / 建立连接）优先且永不自动改变；
 * - 其余连线使用默认长度（父半径 + 子半径 + 间隙）；
 * - 子节点密度过高时，自动把该父节点下所有子连线一起伸长到能稳定排布，
 *   密度回落时自动回到默认长度。
 */

import { DENSITY_MAX_FACTOR, LINK_GAP, SIBLING_GAP } from '@shared/constants'
import type { BubbleNode, ViewMode } from '@shared/types/document'
import { primaryParentOf } from './graph'
import { makeRadiusResolver } from './nodeVisual'

export interface LinkLengthOptions {
  gap?: number
  siblingGap?: number
  maxFactor?: number
}

/** 等距环上要排下 count 个子节点所需的最小半径 */
export function densityRingDistance(
  childCount: number,
  childRadiuss: number,
  siblingGap = SIBLING_GAP
): number {
  if (childCount <= 1) return 0
  return (childCount * (2 * childRadiuss + siblingGap)) / (2 * Math.PI)
}

export interface ResolvedLink {
  rest: number
  /** 用户手动固定（不再随密度变化） */
  manual: boolean
  /** 因密度被拉长 */
  stretched: boolean
}

/**
 * 计算每条「主父边」的目标长度，key 为 `parentId->childId`。
 */
export function resolveLinkLengths(
  nodes: readonly BubbleNode[],
  mode: ViewMode = 'bubble',
  options: LinkLengthOptions = {}
): Map<string, ResolvedLink> {
  const gap = options.gap ?? LINK_GAP
  const siblingGap = options.siblingGap ?? SIBLING_GAP
  const maxFactor = options.maxFactor ?? DENSITY_MAX_FACTOR
  const radiusOf = makeRadiusResolver(nodes, mode)

  // 每个父节点的子节点（按主父统计）与最大子半径
  const childrenOf = new Map<string, BubbleNode[]>()
  for (const n of nodes) {
    const pid = primaryParentOf(n)
    if (!pid) continue
    if (!nodes.some((x) => x.id === pid)) continue
    const arr = childrenOf.get(pid)
    if (arr) arr.push(n)
    else childrenOf.set(pid, [n])
  }

  const result = new Map<string, ResolvedLink>()
  for (const n of nodes) {
    const pid = primaryParentOf(n)
    if (!pid) continue
    const parent = nodes.find((x) => x.id === pid)
    if (!parent) continue
    const key = `${pid}->${n.id}`
    const defaultLength = radiusOf(parent) + radiusOf(n) + gap

    if (typeof n.linkLength === 'number' && Number.isFinite(n.linkLength)) {
      result.set(key, { rest: n.linkLength, manual: true, stretched: false })
      continue
    }

    const siblings = childrenOf.get(pid) ?? []
    const maxChildRadius = siblings.reduce((max, c) => Math.max(max, radiusOf(c)), 0)
    const required = densityRingDistance(siblings.length, maxChildRadius, siblingGap)
    const cap = defaultLength * maxFactor
    if (required > defaultLength) {
      result.set(key, {
        rest: Math.min(cap, Math.max(defaultLength, required)),
        manual: false,
        stretched: true
      })
      continue
    }
    result.set(key, { rest: defaultLength, manual: false, stretched: false })
  }
  return result
}

/** 便于渲染/调试：取某条边长度 */
export function linkLengthFor(
  nodes: readonly BubbleNode[],
  parentId: string,
  childId: string,
  mode: ViewMode = 'bubble'
): number {
  const map = resolveLinkLengths(nodes, mode)
  return map.get(`${parentId}->${childId}`)?.rest ?? 0
}
