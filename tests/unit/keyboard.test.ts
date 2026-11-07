import { describe, expect, it } from 'vitest'
import { requiresSelection, resolveKey, SHORTCUT_TABLE } from '@renderer/logic/keyboard'
import type { KeyContext } from '@renderer/logic/keyboard'

const canvas: KeyContext = {
  mode: 'canvas',
  hasSelection: true,
  canPaste: true,
  hasStyleClipboard: true,
  isIsolated: false
}
const editing: KeyContext = { ...canvas, mode: 'editing' }
const dialog: KeyContext = { ...canvas, mode: 'dialog' }

describe('画布态快捷键', () => {
  it('Tab / Enter 建子 / 建同级', () => {
    expect(resolveKey({ key: 'Tab' }, canvas)).toBe('addChild')
    expect(resolveKey({ key: 'Enter' }, canvas)).toBe('addSibling')
  })

  it('Delete 单删、Shift+Delete 级联删', () => {
    expect(resolveKey({ key: 'Delete' }, canvas)).toBe('deleteNode')
    expect(resolveKey({ key: 'Delete', shift: true }, canvas)).toBe('deleteCascade')
  })

  it('方向键导航', () => {
    expect(resolveKey({ key: 'ArrowUp' }, canvas)).toBe('navUp')
    expect(resolveKey({ key: 'ArrowDown' }, canvas)).toBe('navDown')
    expect(resolveKey({ key: 'ArrowLeft' }, canvas)).toBe('navLeft')
    expect(resolveKey({ key: 'ArrowRight' }, canvas)).toBe('navRight')
  })

  it('F2 编辑、F 隔离', () => {
    expect(resolveKey({ key: 'F2' }, canvas)).toBe('editText')
    expect(resolveKey({ key: 'f' }, canvas)).toBe('isolateToggle')
    expect(resolveKey({ key: 'F' }, canvas)).toBe('isolateToggle')
  })

  it('文件类组合键', () => {
    expect(resolveKey({ key: 'n', ctrl: true }, canvas)).toBe('newDoc')
    expect(resolveKey({ key: 'o', ctrl: true }, canvas)).toBe('open')
    expect(resolveKey({ key: 's', ctrl: true }, canvas)).toBe('save')
    expect(resolveKey({ key: 's', ctrl: true, shift: true }, canvas)).toBe('saveAs')
    expect(resolveKey({ key: 'n', ctrl: true, shift: true }, canvas)).toBe('newWindow')
    expect(resolveKey({ key: 'w', ctrl: true }, canvas)).toBe('closeWindow')
  })

  it('编辑类组合键', () => {
    expect(resolveKey({ key: 'z', ctrl: true }, canvas)).toBe('undo')
    expect(resolveKey({ key: 'y', ctrl: true }, canvas)).toBe('redo')
    expect(resolveKey({ key: 'x', ctrl: true }, canvas)).toBe('cut')
    expect(resolveKey({ key: 'c', ctrl: true }, canvas)).toBe('copy')
    expect(resolveKey({ key: 'v', ctrl: true }, canvas)).toBe('paste')
    expect(resolveKey({ key: 'a', ctrl: true }, canvas)).toBe('selectAll')
    expect(resolveKey({ key: 'f', ctrl: true }, canvas)).toBe('search')
  })

  it('样式与父连接（新增快捷键）', () => {
    expect(resolveKey({ key: 'c', ctrl: true, alt: true }, canvas)).toBe('copyStyle')
    expect(resolveKey({ key: 'v', ctrl: true, alt: true }, canvas)).toBe('pasteStyle')
    // D18：添加父连接
    expect(resolveKey({ key: 'l', ctrl: true, alt: true }, canvas)).toBe('addParentLink')
    expect(resolveKey({ key: 'L', ctrl: true, alt: true }, canvas)).toBe('addParentLink')
  })

  it('插入与专区、导出', () => {
    expect(resolveKey({ key: 'n', ctrl: true, alt: true }, canvas)).toBe('insertNote')
    expect(resolveKey({ key: 't', ctrl: true, alt: true }, canvas)).toBe('insertTask')
    expect(resolveKey({ key: 'a', ctrl: true, alt: true }, canvas)).toBe('insertAttachment')
    expect(resolveKey({ key: 'g', ctrl: true, shift: true }, canvas)).toBe('createZone')
    expect(resolveKey({ key: 'f', ctrl: true, shift: true }, canvas)).toBe('fitView')
    expect(resolveKey({ key: 'e', ctrl: true, shift: true }, canvas)).toBe('exportAs')
  })

  it('Esc 在画布上作为退出隔离/退回上层', () => {
    expect(resolveKey({ key: 'Escape' }, canvas)).toBe('escape')
  })

  it('未定义的组合返回 null（不吞键）', () => {
    expect(resolveKey({ key: 'q', ctrl: true }, canvas)).toBeNull()
    expect(resolveKey({ key: 'x', ctrl: true, alt: true }, canvas)).toBeNull()
  })
})

describe('编辑态快捷键', () => {
  it('Tab 提交并建子', () => {
    expect(resolveKey({ key: 'Tab' }, editing)).toBe('editSubmitAddChild')
  })

  it('Enter 换行，Ctrl+Enter 提交并建同级（D31）', () => {
    expect(resolveKey({ key: 'Enter' }, editing)).toBe('newline')
    expect(resolveKey({ key: 'Enter', ctrl: true }, editing)).toBe('editSubmitAddSibling')
  })

  it('Esc 提交并退出（不丢字）', () => {
    expect(resolveKey({ key: 'Escape' }, editing)).toBe('editSubmitExit')
  })

  it('普通字符不拦截', () => {
    expect(resolveKey({ key: 'a' }, editing)).toBeNull()
    expect(resolveKey({ key: 'Backspace' }, editing)).toBeNull()
  })
})

describe('弹窗态快捷键', () => {
  it('只有 Esc 生效，映射为取消', () => {
    expect(resolveKey({ key: 'Escape' }, dialog)).toBe('dialogCancel')
    expect(resolveKey({ key: 'Enter' }, dialog)).toBeNull()
    expect(resolveKey({ key: 'Tab' }, dialog)).toBeNull()
    expect(resolveKey({ key: 'z', ctrl: true }, dialog)).toBeNull()
  })
})

describe('快捷键与选中依赖', () => {
  it('结构性操作需要选中', () => {
    expect(requiresSelection('addChild')).toBe(true)
    expect(requiresSelection('deleteNode')).toBe(true)
    expect(requiresSelection('paste')).toBe(false)
    expect(requiresSelection('save')).toBe(false)
  })

  it('快捷键表与实现保持同源（新增快捷键已登记）', () => {
    const keys = SHORTCUT_TABLE.map((s) => s.keys)
    expect(keys).toContain('Ctrl+Alt+L')
    expect(keys).toContain('Ctrl+Shift+E')
  })
})
