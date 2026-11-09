/** 选择、编辑态与隔离查看。 */

import { create } from 'zustand'

export interface SelectionStore {
  selectedIds: string[]
  editingId: string | null
  /** 内联编辑中的选区（D93） */
  editingRange: { start: number; end: number } | null
  isolateRootId: string | null
  /** 选中的连线 id（D49） */
  selectedEdgeId: string | null
  selectEdge: (id: string | null) => void

  select: (id: string | null, additive?: boolean) => void
  selectMany: (ids: string[]) => void
  toggle: (id: string) => void
  clear: () => void
  setEditingRange: (range: { start: number; end: number } | null) => void
  startEdit: (id: string) => void
  stopEdit: () => void
  setIsolate: (id: string | null) => void
  primaryId: () => string | null
}

export const useSelectionStore = create<SelectionStore>((set, get) => ({
  selectedIds: [],
  editingId: null,
  editingRange: null,
  isolateRootId: null,
  selectedEdgeId: null,

  selectEdge: (id) => set({ selectedEdgeId: id, selectedIds: [], editingId: null }),

  select: (id, additive = false) => {
    if (id === null) {
      set({ selectedIds: [], editingId: null, selectedEdgeId: null })
      return
    }
    if (additive) {
      const cur = get().selectedIds
      set({
        selectedIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
        editingId: null
      })
      return
    }
    set({ selectedIds: [id], editingId: null, selectedEdgeId: null })
  },

  selectMany: (ids) => set({ selectedIds: [...new Set(ids)], editingId: null }),

  toggle: (id) => get().select(id, true),

  clear: () => set({ selectedIds: [], editingId: null, selectedEdgeId: null }),

  setEditingRange: (range) => set({ editingRange: range }),

  startEdit: (id) => set({ selectedIds: [id], editingId: id, editingRange: null }),

  stopEdit: () => set({ editingId: null, editingRange: null }),

  setIsolate: (id) => set({ isolateRootId: id }),

  primaryId: () => get().selectedIds[0] ?? null
}))
