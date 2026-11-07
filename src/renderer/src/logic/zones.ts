/** 专区（独立子画布）的层级运算：嵌套、级联删除、归属迁移。 */

import type { BubbleNode, InsertObject, Vec2, Zone } from '@shared/types/document'

export function zonesInLevel(zones: readonly Zone[], parentZoneId: string | null): Zone[] {
  return zones.filter((z) => z.parentZoneId === parentZoneId)
}

/** 从根到指定专区的路径（面包屑用） */
export function zonePath(zones: readonly Zone[], zoneId: string): Zone[] {
  const byId = new Map(zones.map((z) => [z.id, z]))
  const path: Zone[] = []
  let cur = byId.get(zoneId)
  let guard = 0
  while (cur && guard < 100) {
    path.unshift(cur)
    cur = cur.parentZoneId ? byId.get(cur.parentZoneId) : undefined
    guard += 1
  }
  return path
}

/** 某专区的全部子孙专区 id（不含自身） */
export function descendantZoneIds(zones: readonly Zone[], zoneId: string): string[] {
  const out: string[] = []
  const stack = zones.filter((z) => z.parentZoneId === zoneId).map((z) => z.id)
  while (stack.length > 0) {
    const id = stack.pop() as string
    if (out.includes(id)) continue
    out.push(id)
    for (const z of zones) if (z.parentZoneId === id) stack.push(z.id)
  }
  return out
}

export function bubbleCountInZone(nodes: readonly BubbleNode[], zoneId: string): number {
  return nodes.filter((n) => n.zoneId === zoneId).length
}

export interface DeleteZoneResult {
  zones: Zone[]
  nodes: BubbleNode[]
  inserts: InsertObject[]
  removedZoneIds: string[]
  removedNodeIds: string[]
}

/** 删除专区：连同内部气泡、插入对象与子孙专区一起删除 */
export function deleteZoneCascade(
  zones: readonly Zone[],
  nodes: readonly BubbleNode[],
  inserts: readonly InsertObject[],
  zoneId: string
): DeleteZoneResult {
  const removedZoneIds = [zoneId, ...descendantZoneIds(zones, zoneId)]
  const removedSet = new Set(removedZoneIds)
  const removedNodeIds = nodes.filter((n) => n.zoneId && removedSet.has(n.zoneId)).map((n) => n.id)
  return {
    zones: zones.filter((z) => !removedSet.has(z.id)),
    nodes: nodes.filter((n) => !(n.zoneId && removedSet.has(n.zoneId))),
    inserts: inserts.filter((i) => !(i.zoneId && removedSet.has(i.zoneId))),
    removedZoneIds,
    removedNodeIds
  }
}

/** 把气泡迁移到某个层级并换算坐标（目标层级坐标独立，这里保持相对位置） */
export function moveBubbleToLevel(
  nodes: readonly BubbleNode[],
  bubbleId: string,
  zoneId: string | null,
  pos?: Vec2
): BubbleNode[] {
  return nodes.map((n) =>
    n.id === bubbleId
      ? { ...n, zoneId, bubblePos: pos ?? n.bubblePos, updatedAt: new Date().toISOString() }
      : n
  )
}

/** 专区卡片的命中测试（世界坐标） */
export function hitTestZone(zones: readonly Zone[], point: Vec2): Zone | null {
  for (let i = zones.length - 1; i >= 0; i--) {
    const z = zones[i]
    if (
      point.x >= z.pos.x &&
      point.x <= z.pos.x + z.size.w &&
      point.y >= z.pos.y &&
      point.y <= z.pos.y + z.size.h
    ) {
      return z
    }
  }
  return null
}
