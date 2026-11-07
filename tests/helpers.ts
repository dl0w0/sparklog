import type { BubbleNode, Vec2 } from '@shared/types/document'

let counter = 0

export function makeNode(
  id: string,
  parentIds: string[] = [],
  pos: Vec2 = { x: 0, y: 0 },
  extra: Partial<BubbleNode> = {}
): BubbleNode {
  counter += 1
  return {
    id,
    text: id,
    importance: 50,
    shape: 'circle',
    colorKey: 'default',
    parentIds,
    zoneId: null,
    bubblePos: pos,
    createdAt: `2026-01-01T00:00:${String(counter % 60).padStart(2, '0')}.000Z`,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra
  }
}

export function idsOf(nodes: readonly BubbleNode[]): string[] {
  return nodes.map((n) => n.id).sort()
}
