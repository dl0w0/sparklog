/** 应用内剪贴板：气泡子树载荷 + 样式载荷。 */

import { create } from 'zustand'
import type { BubbleStyle } from '@shared/types/document'
import type { ClipboardPayload } from '@renderer/logic/clipboard'

export type { ClipboardPayload }

export interface EdgeStyleClipboard {
  dashed?: boolean
  color?: string
  width?: number
  label?: string
}

export interface ClipboardStore {
  bubbles: ClipboardPayload | null
  style: BubbleStyle | null
  edgeStyle: EdgeStyleClipboard | null
  setBubbles: (payload: ClipboardPayload | null) => void
  setStyle: (style: BubbleStyle | null) => void
  setEdgeStyle: (style: EdgeStyleClipboard | null) => void
  clear: () => void
}

export const useClipboardStore = create<ClipboardStore>((set) => ({
  bubbles: null,
  style: null,
  edgeStyle: null,
  setBubbles: (payload) => set({ bubbles: payload }),
  setStyle: (style) => set({ style }),
  setEdgeStyle: (style) => set({ edgeStyle: style }),
  clear: () => set({ bubbles: null, style: null, edgeStyle: null })
}))
