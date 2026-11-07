/** 文件级动作：新建 / 打开 / 保存 / 另存为 / 关闭前确认（D8–D10）。 */

import { FILE_EXTENSION } from '@shared/constants'
import type { SparklogFile } from '@shared/types/document'
import { defaultFileStem, displayName } from '@renderer/logic/title'
import { useDocStore } from '@renderer/store/docStore'
import { useSelectionStore } from '@renderer/store/selectionStore'
import { useUiStore } from '@renderer/store/uiStore'
import { ROOT_LEVEL, useViewportStore } from '@renderer/store/viewportStore'
import { api } from '@renderer/services/bridge'

type UnsavedChoice = 'save' | 'dontSave' | 'cancel'
let unsavedResolver: ((choice: UnsavedChoice) => void) | null = null

/** 弹出未保存确认；返回用户选择 */
export function askUnsaved(fileName: string): Promise<UnsavedChoice> {
  useUiStore.getState().openDialog({ kind: 'unsaved', fileName })
  return new Promise<UnsavedChoice>((resolve) => {
    unsavedResolver = resolve
  })
}

export function resolveUnsaved(choice: UnsavedChoice): void {
  const resolver = unsavedResolver
  unsavedResolver = null
  useUiStore.getState().closeDialog()
  resolver?.(choice)
}

/** 视口同步进文档，保证保存时一并落盘 */
function withViewport(doc: SparklogFile): SparklogFile {
  const vp = useViewportStore.getState().current()
  return {
    ...doc,
    rootViewport: { ...vp },
    zones: doc.zones.map((z) =>
      z.id === useViewportStore.getState().levelId
        ? { ...z, viewport: { ...vp } }
        : z
    )
  }
}

export async function saveDocument(saveAs = false): Promise<boolean> {
  const store = useDocStore.getState()
  store.setStatus('saving')
  const res = await api().saveDocument(withViewport(store.doc), store.filePath, saveAs)
  if (res.canceled) {
    store.setStatus(store.dirty ? 'dirty' : 'saved')
    return false
  }
  if (!res.ok || !res.filePath) {
    store.setError(res.error ?? '保存失败')
    useUiStore.getState().openDialog({ kind: 'error', message: res.error ?? '保存失败' })
    return false
  }
  store.markSaved(res.filePath)
  useUiStore.getState().showToast('已保存')
  return true
}

/** 有未保存变更时返回 false 表示用户取消 */
export async function ensureSaved(): Promise<boolean> {
  const { dirty, filePath } = useDocStore.getState()
  if (!dirty) return true
  const choice = await askUnsaved(displayName(filePath))
  if (choice === 'cancel') return false
  if (choice === 'dontSave') return true
  return saveDocument(false)
}

export async function newDocument(): Promise<void> {
  if (!(await ensureSaved())) return
  useDocStore.getState().newDocument()
  useSelectionStore.getState().clear()
  useViewportStore.getState().setLevel(ROOT_LEVEL)
  useViewportStore.getState().resetLevel(ROOT_LEVEL)
}

export async function openDocument(): Promise<void> {
  if (!(await ensureSaved())) return
  const res = await api().openDialog()
  if (res.canceled) return
  if (res.error) {
    useUiStore.getState().openDialog({ kind: 'error', message: res.error })
    return
  }
  if (res.alreadyOpenWindowId) {
    useUiStore.getState().showToast('该文件已在另一个窗口打开')
    return
  }
  if (!res.doc || !res.filePath) return
  openIntoWorkspace(res.doc, res.filePath, res.warnings)
}

export async function openPath(filePath: string): Promise<void> {
  if (await api().focusWindowByPath(filePath)) {
    useUiStore.getState().showToast('该文件已在另一个窗口打开')
    return
  }
  const res = await api().readDocument(filePath)
  if (!res.ok || !res.doc) {
    useUiStore.getState().openDialog({ kind: 'error', message: res.error ?? '打开失败' })
    return
  }
  openIntoWorkspace(res.doc, filePath, res.warnings)
}

export function openIntoWorkspace(
  doc: SparklogFile,
  filePath: string,
  warnings?: string[]
): void {
  useDocStore.getState().loadDocument(doc, filePath)
  useSelectionStore.getState().clear()
  useViewportStore.getState().setLevel(ROOT_LEVEL)
  useViewportStore.getState().resetLevel(ROOT_LEVEL, doc.rootViewport)
  if (warnings && warnings.length > 0) {
    useUiStore.getState().showToast(`文件已修复：${warnings.length} 处问题`)
  }
}

/** 关窗流程：主进程拦截 → 渲染层确认 → 放行 */
export async function requestClose(): Promise<void> {
  const ok = await ensureSaved()
  if (!ok) return
  api().closeCurrent()
}

export async function saveAsDialog(): Promise<boolean> {
  return saveDocument(true)
}

export function suggestExportName(): string {
  const store = useDocStore.getState()
  return defaultFileStem(store.doc, store.filePath)
}

export const EXPORT_EXT = FILE_EXTENSION
