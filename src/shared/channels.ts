/** IPC 通道名常量，主/渲染共用，避免硬编码字符串漂移。 */

export const CH = {
  docOpenDialog: 'doc:openDialog',
  docRead: 'doc:read',
  docWrite: 'doc:write',
  docSaveAsDialog: 'doc:saveAsDialog',
  docExportDialog: 'doc:exportDialog',
  docExportWrite: 'doc:exportWrite',
  recentList: 'recent:list',
  recentAdd: 'recent:add',
  recentRemove: 'recent:remove',
  recentClear: 'recent:clear',
  appNewWindow: 'app:newWindow',
  appShowStart: 'app:showStart',
  appOpenWorkspace: 'app:openWorkspace',
  appOpenPath: 'app:openPath',
  appReveal: 'app:reveal',
  appPickFile: 'app:pickFile',
  winSetTitle: 'win:setTitle',
  winSetDirty: 'win:setDirty',
  winConfirmClose: 'win:confirmClose',
  winCloseCurrent: 'win:closeCurrent',
  winCloseRequested: 'win:closeRequested',
  winGetContext: 'win:getContext',
  winFocusByPath: 'win:focusByPath',
  docExportPdf: 'doc:exportPdf',
  appPathExists: 'app:pathExists',
  settingsRead: 'settings:read',
  settingsWrite: 'settings:write',
  appCheckUpdate: 'app:checkUpdate',
  appOpenExternal: 'app:openExternal',
  menuCommand: 'menu:command'
} as const

export type MenuCommand =
  | 'file.new'
  | 'file.open'
  | 'file.save'
  | 'file.saveAs'
  | 'file.export'
  | 'file.newWindow'
  | 'file.showStart'
  | 'file.close'
  | 'edit.undo'
  | 'edit.redo'
  | 'edit.cut'
  | 'edit.copy'
  | 'edit.paste'
  | 'edit.copyStyle'
  | 'edit.pasteStyle'
  | 'edit.addParentLink'
  | 'edit.selectAll'
  | 'edit.search'
  | 'view.bubble'
  | 'view.mindmap'
  | 'view.fit'
  | 'view.isolate'
  | 'insert.note'
  | 'insert.task'
  | 'insert.attachment'
  | 'zone.create'
  | 'help.shortcuts'
  | 'settings.shortcuts'
  | 'settings.text'
  | 'settings.shape'
  | 'settings.physics'
  | 'settings.update'
