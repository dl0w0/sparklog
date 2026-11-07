/** 命令分发：把菜单命令与键盘动作落到具体业务动作上。 */

import type { MenuCommand } from '@shared/channels'
import type { KeyAction } from '@renderer/logic/keyboard'
import { navigate } from '@renderer/logic/graph'
import { useDocStore } from '@renderer/store/docStore'
import { useSelectionStore } from '@renderer/store/selectionStore'
import { useUiStore } from '@renderer/store/uiStore'
import {
  addChildBubble,
  addParentLink,
  addSiblingBubble,
  countUniqueDescendants,
  deleteBubbleWithUniqueDescendants,
  deleteSingleBubble
} from './bubbleActions'
import { newDocument, openDocument, requestClose, saveAsDialog, saveDocument } from './fileActions'
import {
  copySelection,
  copyStyle,
  cutSelection,
  pasteBubbles,
  pasteStyle,
  selectAllInLevel
} from './clipboardActions'
import { addInsert, pickAndAttach } from './insertActions'
import { exitZone } from './zoneActions'
import { ROOT_LEVEL, useViewportStore } from '@renderer/store/viewportStore'

/** 由画布注册的视图级操作（适应画布、坐标换算等） */
export interface CanvasController {
  fit: () => void
  worldCenter: () => { x: number; y: number }
  centerOn: (id: string) => void
  /** 梳理气泡：均匀低重叠布局并动画过渡（D63） */
  tidy: () => void
}

let canvas: CanvasController | null = null
export function registerCanvasController(c: CanvasController | null): void {
  canvas = c
}
export function getCanvasController(): CanvasController | null {
  return canvas
}

function selection(): string[] {
  return useSelectionStore.getState().selectedIds
}

function primary(): string | null {
  return useSelectionStore.getState().primaryId()
}

export function executeKeyAction(action: KeyAction): void {
  const ui = useUiStore.getState()
  const sel = useSelectionStore.getState()
  switch (action) {
    case 'addChild': {
      const id = primary()
      if (id) addChildBubble(id)
      break
    }
    case 'addSibling': {
      const id = primary()
      if (id) addSiblingBubble(id)
      break
    }
    case 'deleteNode': {
      const id = primary()
      if (id) deleteSingleBubble(id)
      break
    }
    case 'deleteCascade': {
      const id = primary()
      if (!id) break
      const count = countUniqueDescendants(id)
      if (count === 0) {
        deleteBubbleWithUniqueDescendants(id)
      } else {
        ui.openDialog({ kind: 'deleteCascade', bubbleId: id, count })
      }
      break
    }
    case 'editText': {
      const id = primary()
      if (id) sel.startEdit(id)
      break
    }
    case 'navUp':
    case 'navDown':
    case 'navLeft':
    case 'navRight': {
      const id = primary()
      if (!id) break
      const dir =
        action === 'navUp' ? 'up' : action === 'navDown' ? 'down' : action === 'navLeft' ? 'left' : 'right'
      const next = navigate(useDocStore.getState().doc.nodes, id, dir)
      if (next) sel.select(next)
      break
    }
    case 'undo':
      useDocStore.getState().undo()
      break
    case 'redo':
      useDocStore.getState().redo()
      break
    case 'cut':
      if (!cutSelection()) ui.showToast('没有可剪切的气泡')
      break
    case 'copy':
      if (!copySelection()) ui.showToast('没有可复制的气泡')
      else ui.showToast('已复制')
      break
    case 'paste':
      if (!pasteBubbles(primary())) ui.showToast('剪贴板为空')
      break
    case 'copyStyle':
      if (!copyStyle()) ui.showToast('没有可拷贝的样式')
      else ui.showToast('已拷贝样式')
      break
    case 'pasteStyle':
      if (!pasteStyle()) ui.showToast('请先拷贝样式并选中目标气泡')
      break
    case 'selectAll':
      selectAllInLevel()
      break
    case 'search':
      ui.setSearchOpen(true)
      break
    case 'fitView':
      canvas?.fit()
      break
    case 'isolateToggle':
      sel.setIsolate(sel.isolateRootId ? null : primary())
      break
    case 'dialogCancel':
      ui.closeDialog()
      break
    case 'escape': {
      if (ui.dialog) {
        ui.closeDialog()
        break
      }
      if (ui.zoneCreating) {
        ui.setZoneCreating(false)
        break
      }
      if (ui.linkSource) {
        ui.setLinkSource(null)
        break
      }
      if (ui.contextMenu) {
        ui.closeContextMenu()
        break
      }
      if (ui.searchOpen) {
        ui.setSearchOpen(false)
        break
      }
      if (sel.editingId) {
        sel.stopEdit()
        break
      }
      if (sel.isolateRootId) {
        sel.setIsolate(null)
        break
      }
      if (useViewportStore.getState().levelId !== ROOT_LEVEL) {
        exitZone()
        break
      }
      sel.clear()
      break
    }
    case 'save':
      void saveDocument(false)
      break
    case 'saveAs':
      void saveAsDialog()
      break
    case 'open':
      void openDocument()
      break
    case 'newDoc':
      void newDocument()
      break
    case 'newWindow':
      // 主进程负责创建
      window.sparklog?.newWindow()
      break
    case 'closeWindow':
      void requestClose()
      break
    case 'addParentLink': {
      const id = primary()
      if (!id) break
      useUiStore.getState().setLinkSource(id)
      ui.showToast('已选为子气泡，再点击目标气泡建立连接（Esc 取消）')
      break
    }
    case 'insertNote': {
      const id = primary()
      if (!id) ui.showToast('请先选中一个气泡')
      else addInsert('note', id)
      break
    }
    case 'insertTask': {
      const id = primary()
      if (!id) ui.showToast('请先选中一个气泡')
      else addInsert('task', id)
      break
    }
    case 'insertAttachment': {
      const id = primary()
      void pickAndAttach(id)
      break
    }
    case 'exportAs':
      ui.openDialog({ kind: 'export' })
      break
    case 'createZone':
      ui.setZoneCreating(true)
      ui.showToast('在画布上拖出一个矩形来创建专区（Esc 取消）')
      break
    default:
      break
  }
}

export function executeMenuCommand(command: MenuCommand): void {
  if (command.startsWith('settings.')) {
    const tab =
      command === 'settings.shortcuts'
        ? 'shortcuts'
        : command === 'settings.text'
          ? 'text'
          : command === 'settings.shape'
            ? 'shape'
            : command === 'settings.physics'
              ? 'physics'
              : 'update'
    useUiStore.getState().openSettings(tab)
    return
  }
  const sel = useSelectionStore.getState()
  switch (command) {
    case 'file.new':
      void newDocument()
      break
    case 'file.open':
      void openDocument()
      break
    case 'file.save':
      void saveDocument(false)
      break
    case 'file.saveAs':
      void saveAsDialog()
      break
    case 'file.export':
      useUiStore.getState().openDialog({ kind: 'export' })
      break
    case 'insert.note':
      executeKeyAction('insertNote')
      break
    case 'insert.task':
      executeKeyAction('insertTask')
      break
    case 'insert.attachment':
      executeKeyAction('insertAttachment')
      break
    case 'zone.create':
      executeKeyAction('createZone')
      break
    case 'file.close':
      void requestClose()
      break
    case 'file.newWindow':
      window.sparklog?.newWindow()
      break
    case 'file.showStart':
      window.sparklog?.showStartWindow()
      break
    case 'edit.undo':
      useDocStore.getState().undo()
      break
    case 'edit.redo':
      useDocStore.getState().redo()
      break
    case 'edit.selectAll':
      sel.selectMany(useDocStore.getState().doc.nodes.map((n) => n.id))
      break
    case 'edit.search':
      useUiStore.getState().setSearchOpen(true)
      break
    case 'edit.addParentLink':
      executeKeyAction('addParentLink')
      break
    case 'view.bubble':
      useDocStore.getState().setViewMode('bubble')
      break
    case 'view.mindmap':
      useDocStore.getState().setViewMode('mindmap')
      break
    case 'view.fit':
      canvas?.fit()
      break
    case 'view.isolate':
      executeKeyAction('isolateToggle')
      break
    case 'help.shortcuts':
      useUiStore.getState().openDialog({ kind: 'shortcuts' })
      break
    default:
      break
  }
}
