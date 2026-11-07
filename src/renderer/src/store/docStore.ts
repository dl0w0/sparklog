/** 文档状态：唯一的文档副本 + 撤销栈 + 脏标记。 */

import { create } from 'zustand'
import { produce } from 'immer'
import { createEmptyDocument } from '@shared/logic/documentCodec'
import type { SparklogFile, ViewMode } from '@shared/types/document'
import { HistoryStack } from '@renderer/logic/commands/history'

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error'

export interface DocStore {
  doc: SparklogFile
  filePath: string | null
  dirty: boolean
  canUndo: boolean
  canRedo: boolean
  undoLabel: string | null
  redoLabel: string | null
  status: SaveStatus
  errorMessage: string | null

  newDocument: () => void
  loadDocument: (doc: SparklogFile, filePath: string | null) => void
  markSaved: (filePath: string) => void
  setStatus: (status: SaveStatus) => void
  setError: (message: string | null) => void

  /** 一次可撤销的修改 */
  commit: (label: string, recipe: (draft: SparklogFile) => void) => void
  /** 与上一条「新建气泡」合并的修改（用于首次输入文字） */
  commitMerged: (label: string, recipe: (draft: SparklogFile) => void) => void
  /** 连续手势中的瞬时修改（不入栈） */
  applyTransient: (recipe: (draft: SparklogFile) => void) => void
  /** 结束连续手势：把 begin→now 之间的变化一次性入栈 */
  pushTransient: (label: string) => void
  beginTransient: () => void
  undo: () => void
  redo: () => void
  setViewMode: (mode: ViewMode) => void
  /** 直接替换文档（不重算历史，仅用于 undo/redo 内部与测试） */
  replaceForTest: (doc: SparklogFile) => void
  resetHistory: () => void
}

const history = new HistoryStack<SparklogFile>()
let transientBefore: SparklogFile | null = null

function emptyFlags(): Pick<DocStore, 'canUndo' | 'canRedo' | 'undoLabel' | 'redoLabel'> {
  return {
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undoLabel: history.undoLabel,
    redoLabel: history.redoLabel
  }
}

export const useDocStore = create<DocStore>((set, get) => ({
  doc: createEmptyDocument(),
  filePath: null,
  dirty: false,
  canUndo: false,
  canRedo: false,
  undoLabel: null,
  redoLabel: null,
  status: 'saved',
  errorMessage: null,

  newDocument: () => {
    history.clear()
    transientBefore = null
    set({
      doc: createEmptyDocument(),
      filePath: null,
      dirty: false,
      status: 'saved',
      errorMessage: null,
      ...emptyFlags()
    })
  },

  loadDocument: (doc, filePath) => {
    history.clear()
    transientBefore = null
    set({
      doc,
      filePath,
      dirty: false,
      status: 'saved',
      errorMessage: null,
      ...emptyFlags()
    })
  },

  markSaved: (filePath) => {
    set((s) => ({
      filePath,
      dirty: false,
      status: 'saved',
      doc: produce(s.doc, (d) => {
        d.meta.updatedAt = new Date().toISOString()
      })
    }))
  },

  setStatus: (status) => set({ status }),
  setError: (message) => set({ errorMessage: message, status: message ? 'error' : get().status }),

  commit: (label, recipe) => {
    const before = get().doc
    const after = produce(before, recipe)
    if (after === before) return
    history.push(label, before, after)
    set({ doc: after, dirty: true, status: 'dirty', ...emptyFlags() })
  },

  /** 新建气泡后的首次文字输入并入上一条记录，使「新建 + 打字」只需一次撤销 */
  commitMerged: (label, recipe) => {
    const before = get().doc
    const after = produce(before, recipe)
    if (after === before) return
    const merged = history.undoLabel !== null && /^新建(子气泡|同级气泡|主气泡)$/.test(history.undoLabel)
    if (merged) history.amendTop(after)
    else history.push(label, before, after)
    set({ doc: after, dirty: true, status: 'dirty', ...emptyFlags() })
  },

  applyTransient: (recipe) => {
    const before = get().doc
    const after = produce(before, recipe)
    if (after === before) return
    set({ doc: after, dirty: true, status: 'dirty', ...emptyFlags() })
  },

  beginTransient: () => {
    if (transientBefore === null) transientBefore = get().doc
  },

  pushTransient: (label) => {
    if (transientBefore === null) return
    const before = transientBefore
    transientBefore = null
    const after = get().doc
    if (before === after) return
    history.push(label, before, after)
    set({ ...emptyFlags() })
  },

  undo: () => {
    const prev = history.undo()
    if (!prev) return
    set({ doc: prev, dirty: true, status: 'dirty', ...emptyFlags() })
  },

  redo: () => {
    const next = history.redo()
    if (!next) return
    set({ doc: next, dirty: true, status: 'dirty', ...emptyFlags() })
  },

  setViewMode: (mode) => {
    if (get().doc.viewMode === mode) return
    get().commit('切换视图', (d) => {
      d.viewMode = mode
    })
  },

  replaceForTest: (doc) => set({ doc }),

  resetHistory: () => {
    history.clear()
    set({ ...emptyFlags() })
  }
}))

/** 供测试与调试读取历史长度 */
export function historySize(): number {
  return history.size
}
