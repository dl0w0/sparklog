import { useEffect } from 'react'
import { resolveKey, type KeyContext } from '@renderer/logic/keyboard'
import { windowTitle } from '@renderer/logic/title'
import { executeKeyAction } from '@renderer/actions/commands'
import { useDocStore } from '@renderer/store/docStore'
import { useSelectionStore } from '@renderer/store/selectionStore'
import { useUiStore } from '@renderer/store/uiStore'
import { useClipboardStore } from '@renderer/store/clipboardStore'

/** 全局键盘：画布态由 resolveKey 解析，编辑态由内联编辑器自行处理。 */
export function useShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }

      const sel = useSelectionStore.getState()
      const ui = useUiStore.getState()
      const clip = useClipboardStore.getState()

      const context: KeyContext = {
        mode: ui.dialog ? 'dialog' : sel.editingId ? 'editing' : 'canvas',
        hasSelection: sel.selectedIds.length > 0,
        canPaste: Boolean(clip.bubbles),
        hasStyleClipboard: Boolean(clip.style),
        isIsolated: Boolean(sel.isolateRootId)
      }

      const action = resolveKey(
        {
          key: event.key,
          ctrl: event.ctrlKey,
          shift: event.shiftKey,
          alt: event.altKey,
          meta: event.metaKey
        },
        context
      )
      if (action) {
        event.preventDefault()
        executeKeyAction(action)
        return
      }

      // 没有匹配到快捷键时，可打印字符才进入编辑（D93）
      if (
        context.mode === 'canvas' &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        event.key.length === 1 &&
        sel.selectedIds.length === 1
      ) {
        const id = sel.selectedIds[0]
        const node = useDocStore.getState().doc.nodes.find((n) => n.id === id)
        if (node) {
          event.preventDefault()
          window.dispatchEvent(
            new CustomEvent('sparklog:type-to-edit', { detail: { id, char: event.key } })
          )
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // 文档变化时同步窗口标题与脏标记
  useEffect(() => {
    const sync = (): void => {
      const { filePath, dirty } = useDocStore.getState()
      const title = windowTitle(filePath, dirty)
      // 页面标题决定窗口标题（Electron 会跟随 document.title）
      document.title = title
      window.sparklog?.setTitle(title)
      window.sparklog?.setDirty(dirty)
    }
    sync()
    return useDocStore.subscribe(sync)
  }, [])
}
