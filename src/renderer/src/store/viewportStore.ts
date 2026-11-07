/** 瑙嗗彛鐘舵€侊細鎸夊眰绾э紙涓荤敾甯?/ 涓撳尯锛夊垎鍒蹇嗙缉鏀句笌骞崇Щ銆?*/

import { create } from 'zustand'
import { DEFAULT_VIEWPORT, SCALE_MAX, SCALE_MIN } from '@shared/constants'
import type { Size, Vec2, Viewport } from '@shared/types/document'
import {
  clampScale,
  contentBounds,
  fitViewport,
  zoomAt as zoomViewportAt
} from '@renderer/logic/layout/fitView'
import type { CircleItem } from '@renderer/logic/layout/fitView'

export const ROOT_LEVEL = 'root'

export interface ViewportStore {
  levelId: string
  viewports: Record<string, Viewport>
  setLevel: (levelId: string, initial?: Viewport) => void
  current: () => Viewport
  set: (vp: Viewport) => void
  pan: (dx: number, dy: number) => void
  zoomAt: (anchor: Vec2, nextScale: number) => Viewport
  zoomBy: (anchor: Vec2, factor: number) => Viewport
  fit: (items: CircleItem[], viewSize: Size, padding?: number) => void
  resetLevel: (levelId: string, vp?: Viewport) => void
}

export const useViewportStore = create<ViewportStore>((set, get) => ({
  levelId: ROOT_LEVEL,
  viewports: { [ROOT_LEVEL]: { ...DEFAULT_VIEWPORT } },

  setLevel: (levelId, initial) =>
    set((s) => ({
      levelId,
      viewports: s.viewports[levelId]
        ? s.viewports
        : { ...s.viewports, [levelId]: initial ?? { ...DEFAULT_VIEWPORT } }
    })),

  current: () => get().viewports[get().levelId] ?? DEFAULT_VIEWPORT,

  set: (vp) =>
    set((s) => ({
      viewports: {
        ...s.viewports,
        [s.levelId]: {
          scale: clampScale(vp.scale),
          offsetX: vp.offsetX,
          offsetY: vp.offsetY
        }
      }
    })),

  pan: (dx, dy) => {
    const vp = get().current()
    get().set({ ...vp, offsetX: vp.offsetX + dx, offsetY: vp.offsetY + dy })
  },

  zoomAt: (anchor, nextScale) => {
    const next = zoomViewportAt(get().current(), anchor, nextScale)
    get().set(next)
    return next
  },

  zoomBy: (anchor, factor) => {
    const vp = get().current()
    return get().zoomAt(anchor, Math.min(SCALE_MAX, Math.max(SCALE_MIN, vp.scale * factor)))
  },

  fit: (items, viewSize, padding = 48) => {
    const bounds = contentBounds(items)
    if (!bounds) {
      get().set({ ...DEFAULT_VIEWPORT })
      return
    }
    get().set(fitViewport(bounds, viewSize, padding))
  },

  resetLevel: (levelId, vp) =>
    set((s) => ({ viewports: { ...s.viewports, [levelId]: vp ?? { ...DEFAULT_VIEWPORT } } }))
}))
/** 当前层级对应的 zoneId（主画布为 null） */
export function currentZoneLevelId(): string | null {
  const levelId = useViewportStore.getState().levelId
  return levelId === ROOT_LEVEL ? null : levelId
}
