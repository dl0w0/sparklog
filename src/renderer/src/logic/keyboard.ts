/** 键盘映射：把按键 + 上下文解析为语义动作（不含任何副作用）。 */

export type KeyboardMode = 'canvas' | 'editing' | 'dialog'

export interface KeyInput {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  meta?: boolean
}

export interface KeyContext {
  mode: KeyboardMode
  hasSelection: boolean
  /** 剪贴板里有气泡 */
  canPaste: boolean
  /** 剪贴板里有样式 */
  hasStyleClipboard: boolean
  isIsolated: boolean
}

export type KeyAction =
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'copyStyle'
  | 'pasteStyle'
  | 'selectAll'
  | 'search'
  | 'save'
  | 'saveAs'
  | 'open'
  | 'newDoc'
  | 'newWindow'
  | 'closeWindow'
  | 'exportAs'
  | 'fitView'
  | 'addParentLink'
  | 'insertNote'
  | 'insertTask'
  | 'insertAttachment'
  | 'createZone'
  | 'isolateToggle'
  | 'escape'
  | 'addChild'
  | 'addSibling'
  | 'deleteNode'
  | 'deleteCascade'
  | 'editText'
  | 'navUp'
  | 'navDown'
  | 'navLeft'
  | 'navRight'
  | 'editSubmitAddChild'
  | 'editSubmitAddSibling'
  | 'newline'
  | 'editSubmitExit'
  | 'dialogCancel'

function isKey(input: KeyInput, key: string): boolean {
  return input.key.toLowerCase() === key.toLowerCase()
}

/** 解析键盘输入；返回 null 表示不拦截（例如编辑态里的普通输入） */
export function resolveKey(input: KeyInput, ctx: KeyContext): KeyAction | null {
  const ctrl = Boolean(input.ctrl || input.meta)
  const shift = Boolean(input.shift)
  const alt = Boolean(input.alt)

  if (ctx.mode === 'dialog') {
    return isKey(input, 'Escape') ? 'dialogCancel' : null
  }

  if (ctx.mode === 'editing') {
    // D31：编辑态 Enter 换行，Ctrl+Enter 才提交并建同级
    if (isKey(input, 'Tab') && !ctrl && !alt) return 'editSubmitAddChild'
    if (isKey(input, 'Enter') && ctrl) return 'editSubmitAddSibling'
    if (isKey(input, 'Enter')) return 'newline'
    if (isKey(input, 'Escape')) return 'editSubmitExit'
    return null
  }

  // —— 画布态 ——

  // 带 Ctrl 的组合键优先
  if (ctrl && alt) {
    if (isKey(input, 'c')) return 'copyStyle'
    if (isKey(input, 'v')) return 'pasteStyle'
    if (isKey(input, 'l')) return 'addParentLink'
    if (isKey(input, 'n')) return 'insertNote'
    if (isKey(input, 't')) return 'insertTask'
    if (isKey(input, 'a')) return 'insertAttachment'
    return null
  }
  if (ctrl) {
    if (shift) {
      if (isKey(input, 's')) return 'saveAs'
      if (isKey(input, 'n')) return 'newWindow'
      if (isKey(input, 'f')) return 'fitView'
      if (isKey(input, 'g')) return 'createZone'
      if (isKey(input, 'e')) return 'exportAs'
      return null
    }
    if (isKey(input, 'z')) return 'undo'
    if (isKey(input, 'y')) return 'redo'
    if (isKey(input, 'x')) return 'cut'
    if (isKey(input, 'c')) return 'copy'
    if (isKey(input, 'v')) return 'paste'
    if (isKey(input, 'a')) return 'selectAll'
    if (isKey(input, 'f')) return 'search'
    if (isKey(input, 's')) return 'save'
    if (isKey(input, 'o')) return 'open'
    if (isKey(input, 'n')) return 'newDoc'
    if (isKey(input, 'w')) return 'closeWindow'
    return null
  }

  if (isKey(input, 'Tab')) return 'addChild'
  if (isKey(input, 'Enter')) return 'addSibling'
  if (isKey(input, 'Delete') || isKey(input, 'Backspace')) {
    return shift ? 'deleteCascade' : 'deleteNode'
  }
  if (isKey(input, 'F2')) return 'editText'
  if (isKey(input, 'ArrowUp')) return 'navUp'
  if (isKey(input, 'ArrowDown')) return 'navDown'
  if (isKey(input, 'ArrowLeft')) return 'navLeft'
  if (isKey(input, 'ArrowRight')) return 'navRight'
  if (isKey(input, 'f')) return 'isolateToggle'
  if (isKey(input, 'Escape')) return 'escape'
  return null
}

/** 该动作是否要求先有选中对象 */
export function requiresSelection(action: KeyAction): boolean {
  return (
    action === 'addChild' ||
    action === 'addSibling' ||
    action === 'deleteNode' ||
    action === 'deleteCascade' ||
    action === 'editText' ||
    action === 'copy' ||
    action === 'cut' ||
    action === 'copyStyle' ||
    action === 'isolateToggle' ||
    action === 'addParentLink' ||
    action === 'insertNote' ||
    action === 'insertTask' ||
    action === 'insertAttachment'
  )
}

/** 供 UI 展示的快捷键一览（与实现同源，避免文档漂移） */
export const SHORTCUT_TABLE: { keys: string; action: string }[] = [
  { keys: 'Ctrl+N', action: '新建画布' },
  { keys: 'Ctrl+O', action: '打开文件' },
  { keys: 'Ctrl+S', action: '保存' },
  { keys: 'Ctrl+Shift+S', action: '另存为' },
  { keys: 'Ctrl+Shift+E', action: '导出为…' },
  { keys: 'Ctrl+Shift+N', action: '新建窗口' },
  { keys: 'Ctrl+W', action: '关闭窗口' },
  { keys: 'Ctrl+Z', action: '撤销' },
  { keys: 'Ctrl+Y', action: '重做' },
  { keys: 'Ctrl+X', action: '剪切' },
  { keys: 'Ctrl+C', action: '复制' },
  { keys: 'Ctrl+V', action: '粘贴' },
  { keys: 'Ctrl+Alt+C', action: '拷贝样式' },
  { keys: 'Ctrl+Alt+V', action: '粘贴样式' },
  { keys: 'Ctrl+A', action: '全选' },
  { keys: 'Tab', action: '新建子气泡' },
  { keys: 'Enter', action: '新建同级气泡' },
  { keys: 'Delete', action: '删除当前气泡' },
  { keys: 'Shift+Delete', action: '删除当前气泡及其独有后代' },
  { keys: 'F2', action: '编辑文字' },
  { keys: 'Ctrl+Alt+L', action: '添加父连接' },
  { keys: '← → ↑ ↓', action: '在父/子/兄弟间移动' },
  { keys: 'Ctrl+F', action: '搜索' },
  { keys: 'F', action: '仅显示该分支 / 退出隔离' },
  { keys: 'Ctrl+Shift+F', action: '适应画布' },
  { keys: 'Ctrl+滚轮', action: '缩放画布' },
  { keys: '悬停气泡 + 滚轮', action: '调节重要程度' },
  { keys: 'Ctrl+Alt+N', action: '插入笔记' },
  { keys: 'Ctrl+Alt+T', action: '插入任务' },
  { keys: 'Ctrl+Alt+A', action: '插入附件' },
  { keys: 'Ctrl+Shift+G', action: '创建专区' },
  { keys: 'Esc', action: '关闭菜单 / 退出编辑 / 退回上层' }
]
