/** UI 状态：右键菜单、弹窗、Toast、搜索、快捷键面板。 */

import { create } from 'zustand'

export type DialogState =
  | { kind: 'unsaved'; fileName: string }
  | { kind: 'deleteCascade'; bubbleId: string; count: number }
  | { kind: 'error'; message: string }
  | { kind: 'shortcuts' }
  | { kind: 'export' }
  | { kind: 'select'; bubbleId: string | null }
  | { kind: 'theme' }
  | { kind: 'insert' }
  | { kind: 'rename'; zoneId: string }
  | { kind: 'edgeLabel'; edgeId: string }
  | null

export interface ContextMenuState {
  x: number
  y: number
  /** null = 空白处菜单 */
  bubbleId: string | null
  zoneId?: string | null
  /** 选中的连线（D49） */
  edgeId?: string | null
  /** 右键的插入对象 id（D51） */
  insertId?: string | null
  /** 右键位置的世界坐标（插入对象落点，D29） */
  world?: { x: number; y: number }
}

export interface UiStore {
  contextMenu: ContextMenuState | null
  dialog: DialogState
  toast: string | null
  searchOpen: boolean
  exporting: boolean
  /** 创建专区：等待在画布上拖出矩形 */
  zoneCreating: boolean
  setZoneCreating: (v: boolean) => void
  /** 已选中的「建立连接」起点（子气泡），等待点击目标气泡（D40） */
  linkSource: string | null
  setLinkSource: (id: string | null) => void

  openContextMenu: (menu: ContextMenuState) => void
  closeContextMenu: () => void
  openDialog: (dialog: NonNullable<DialogState>) => void
  closeDialog: () => void
  showToast: (message: string) => void
  hideToast: () => void
  setSearchOpen: (open: boolean) => void
  setExporting: (v: boolean) => void
}

let toastTimer: ReturnType<typeof setTimeout> | null = null

export const useUiStore = create<UiStore>((set) => ({
  contextMenu: null,
  dialog: null,
  toast: null,
  searchOpen: false,
  exporting: false,
  zoneCreating: false,
  linkSource: null,

  openContextMenu: (menu) => set({ contextMenu: menu }),
  closeContextMenu: () => set({ contextMenu: null }),
  openDialog: (dialog) => set({ dialog, contextMenu: null }),
  closeDialog: () => set({ dialog: null }),

  showToast: (message) => {
    if (toastTimer) clearTimeout(toastTimer)
    set({ toast: message })
    toastTimer = setTimeout(() => set({ toast: null }), 1600)
  },
  hideToast: () => set({ toast: null }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setExporting: (v) => set({ exporting: v }),
  setZoneCreating: (v) => set({ zoneCreating: v }),
  setLinkSource: (id) => set({ linkSource: id })
}))
