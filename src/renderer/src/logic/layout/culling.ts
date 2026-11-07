/** 视口裁剪：只渲染视野内（含留白）的对象，是 500 节点性能的关键。 */

import { CULL_MARGIN } from '@shared/constants'
import type { Rect, Size, Vec2, Viewport } from '@shared/types/document'
import { viewportWorldRect } from './fitView'

export interface CullableItem {
  id: string
  pos: Vec2
  radius: number
}

export function cullVisible(
  items: readonly CullableItem[],
  viewport: Viewport,
  viewSize: Size,
  margin = CULL_MARGIN
): Set<string> {
  const world = viewportWorldRect(viewport, viewSize)
  const area: Rect = {
    x: world.x - margin,
    y: world.y - margin,
    w: world.w + margin * 2,
    h: world.h + margin * 2
  }
  const out = new Set<string>()
  for (const it of items) {
    const r = it.radius
    if (
      it.pos.x + r < area.x ||
      it.pos.x - r > area.x + area.w ||
      it.pos.y + r < area.y ||
      it.pos.y - r > area.y + area.h
    ) {
      continue
    }
    out.add(it.id)
  }
  return out
}

/** 连线可见性：任一端可见即渲染（保证连线不突然消失） */
export function filterVisibleEdges<E extends { from: string; to: string }>(
  edges: readonly E[],
  visible: Set<string>
): E[] {
  return edges.filter((e) => visible.has(e.from) || visible.has(e.to))
}
