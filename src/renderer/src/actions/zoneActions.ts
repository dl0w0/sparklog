/** 专区动作：创建、进入、退出、重命名、删除、迁移气泡。 */

import type { Rect, Vec2, Zone } from '@shared/types/document'
import { newId } from '@renderer/logic/ids'
import { zonePath } from '@renderer/logic/zones'
import { deleteZoneCascade as deleteZoneCascadePure, moveBubbleToLevel } from '@renderer/logic/zones'
import { useDocStore } from '@renderer/store/docStore'
import { useSelectionStore } from '@renderer/store/selectionStore'
import { useUiStore } from '@renderer/store/uiStore'
import { ROOT_LEVEL, useViewportStore } from '@renderer/store/viewportStore'

export function currentZoneId(): string | null {
  const levelId = useViewportStore.getState().levelId
  return levelId === ROOT_LEVEL ? null : levelId
}

export function createZoneAt(rect: Rect): string {
  const store = useDocStore.getState()
  const parentZoneId = currentZoneId()
  const id = newId('z')
  const zone: Zone = {
    id,
    title: '新专区',
    colorKey: 'default',
    parentZoneId,
    pos: { x: rect.x, y: rect.y },
    size: { w: Math.max(200, rect.w), h: Math.max(140, rect.h) },
    viewport: { scale: 1, offsetX: 0, offsetY: 0 }
  }
  store.commit('创建专区', (d) => {
    d.zones = [...d.zones, zone]
  })
  useSelectionStore.getState().clear()
  return id
}

export function renameZone(id: string, title: string): void {
  const store = useDocStore.getState()
  const zone = store.doc.zones.find((z) => z.id === id)
  if (!zone || zone.title === title) return
  store.commit('重命名专区', (d) => {
    const target = d.zones.find((z) => z.id === id)
    if (target) target.title = title
  })
}

export function enterZone(id: string): boolean {
  const store = useDocStore.getState()
  const zone = store.doc.zones.find((z) => z.id === id)
  if (!zone) return false
  // 保存当前层级视口
  const current = useViewportStore.getState()
  const curLevel = current.levelId
  const curVp = current.current()
  if (curLevel === ROOT_LEVEL) {
    useDocStore.getState().applyTransient((d) => {
      d.rootViewport = { ...curVp }
    })
  } else {
    useDocStore.getState().applyTransient((d) => {
      const z = d.zones.find((x) => x.id === curLevel)
      if (z) z.viewport = { ...curVp }
    })
  }
  useViewportStore.getState().setLevel(id, zone.viewport)
  useSelectionStore.getState().clear()
  return true
}

export function exitZone(): void {
  const current = useViewportStore.getState()
  const levelId = current.levelId
  if (levelId === ROOT_LEVEL) return
  const store = useDocStore.getState()
  const zone = store.doc.zones.find((z) => z.id === levelId)
  const curVp = current.current()
  if (zone) {
    store.applyTransient((d) => {
      const z = d.zones.find((x) => x.id === zone.id)
      if (z) z.viewport = { ...curVp }
    })
  }
  const parentId = zone?.parentZoneId ?? null
  const parentZone = parentId ? store.doc.zones.find((z) => z.id === parentId) : null
  useViewportStore.getState().setLevel(
    parentId ?? ROOT_LEVEL,
    parentZone?.viewport ?? store.doc.rootViewport
  )
  useSelectionStore.getState().clear()
}

export function currentBreadcrumb(): { id: string | null; title: string }[] {
  const levelId = useViewportStore.getState().levelId
  const zones = useDocStore.getState().doc.zones
  const crumbs: { id: string | null; title: string }[] = [{ id: null, title: '主画布' }]
  if (levelId === ROOT_LEVEL) return crumbs
  for (const zone of zonePath(zones, levelId)) crumbs.push({ id: zone.id, title: zone.title })
  return crumbs
}

export function deleteZone(id: string): void {
  const store = useDocStore.getState()
  const res = deleteZoneCascadePure(store.doc.zones, store.doc.nodes, store.doc.inserts, id)
  if (res.removedZoneIds.length === 0) return
  store.commit('删除专区', (d) => {
    d.zones = res.zones
    d.nodes = res.nodes
    d.inserts = res.inserts
  })
  const levelId = useViewportStore.getState().levelId
  if (levelId !== ROOT_LEVEL && res.removedZoneIds.includes(levelId)) {
    useViewportStore.getState().setLevel(ROOT_LEVEL, store.doc.rootViewport)
  }
  useSelectionStore.getState().clear()
}

export function moveZoneCard(id: string, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return
  useDocStore.getState().commit('移动专区', (d) => {
    const zone = d.zones.find((z) => z.id === id)
    if (!zone) return
    zone.pos = { x: zone.pos.x + dx, y: zone.pos.y + dy }
  })
}

/** 把气泡拖入专区 */
export function moveBubbleIntoZone(bubbleId: string, zoneId: string | null, pos?: Vec2): void {
  const store = useDocStore.getState()
  const node = store.doc.nodes.find((n) => n.id === bubbleId)
  if (!node || node.zoneId === zoneId) return
  store.commit('移动气泡到专区', (d) => {
    d.nodes = moveBubbleToLevel(d.nodes, bubbleId, zoneId, pos)
  })
}

/** 层级失效守卫：当前专区被删/撤销掉时退回主画布 */
export function ensureValidLevel(): void {
  const levelId = useViewportStore.getState().levelId
  if (levelId === ROOT_LEVEL) return
  const exists = useDocStore.getState().doc.zones.some((z) => z.id === levelId)
  if (!exists) useViewportStore.getState().setLevel(ROOT_LEVEL, useDocStore.getState().doc.rootViewport)
}

export function toastInvalid(message: string): void {
  useUiStore.getState().showToast(message)
}
