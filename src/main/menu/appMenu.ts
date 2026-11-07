/** 原生菜单：只负责派发语义命令，快捷键由渲染层统一处理（避免双触发）。 */

import { app, BrowserWindow, Menu, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { CH, type MenuCommand } from '@shared/channels'

function dispatch(command: MenuCommand): void {
  const win = BrowserWindow.getFocusedWindow()
  if (win && !win.isDestroyed()) win.webContents.send(CH.menuCommand, command)
}

function item(
  label: string,
  command: MenuCommand,
  accelerator?: string
): MenuItemConstructorOptions {
  return {
    label,
    accelerator,
    // 只展示快捷键提示，实际按键交给渲染层处理，避免主/渲染双触发
    registerAccelerator: false,
    click: () => dispatch(command)
  }
}

export function buildAppMenu(): Menu {
  const template: MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        item('新建画布', 'file.new', 'Ctrl+N'),
        item('打开…', 'file.open', 'Ctrl+O'),
        { type: 'separator' },
        item('保存', 'file.save', 'Ctrl+S'),
        item('另存为…', 'file.saveAs', 'Ctrl+Shift+S'),
        item('导出为…', 'file.export', 'Ctrl+Shift+E'),
        { type: 'separator' },
        item('新建窗口', 'file.newWindow', 'Ctrl+Shift+N'),
        item('开始页', 'file.showStart'),
        { type: 'separator' },
        item('关闭窗口', 'file.close', 'Ctrl+W'),
        { role: 'quit', label: '退出', accelerator: 'Alt+F4' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        item('撤销', 'edit.undo', 'Ctrl+Z'),
        item('重做', 'edit.redo', 'Ctrl+Y'),
        { type: 'separator' },
        item('剪切', 'edit.cut', 'Ctrl+X'),
        item('复制', 'edit.copy', 'Ctrl+C'),
        item('粘贴', 'edit.paste', 'Ctrl+V'),
        item('拷贝样式', 'edit.copyStyle', 'Ctrl+Alt+C'),
        item('粘贴样式', 'edit.pasteStyle', 'Ctrl+Alt+V'),
        item('添加父连接', 'edit.addParentLink', 'Ctrl+Alt+L'),
        { type: 'separator' },
        item('全选', 'edit.selectAll', 'Ctrl+A'),
        item('搜索', 'edit.search', 'Ctrl+F')
      ]
    },
    {
      label: '插入',
      submenu: [
        item('笔记', 'insert.note', 'Ctrl+Alt+N'),
        item('任务', 'insert.task', 'Ctrl+Alt+T'),
        item('附件', 'insert.attachment', 'Ctrl+Alt+A'),
        { type: 'separator' },
        item('创建专区', 'zone.create', 'Ctrl+Shift+G')
      ]
    },
    {
      label: '视图',
      submenu: [
        item('气泡视图', 'view.bubble'),
        item('思维导图', 'view.mindmap'),
        { type: 'separator' },
        item('适应画布', 'view.fit', 'Ctrl+Shift+F'),
        item('仅显示该分支', 'view.isolate', 'F'),
        { type: 'separator' },
        { role: 'reload', label: '重新加载界面' },
        { role: 'toggleDevTools', label: '开发者工具' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        item('新建窗口', 'file.newWindow', 'Ctrl+Shift+N'),
        item('开始页', 'file.showStart'),
        { role: 'minimize', label: '最小化' }
      ]
    },
    {
      label: '设置',
      submenu: [
        item('快捷键设置…', 'settings.shortcuts'),
        item('文本编辑器…', 'settings.text'),
        item('图形编辑…', 'settings.shape'),
        item('物理性质…', 'settings.physics'),
        { type: 'separator' },
        item('检查更新…', 'settings.update')
      ]
    },
    {
      label: '帮助',
      submenu: [
        item('快捷键一览', 'help.shortcuts'),
        {
          label: '关于 Sparklog',
          click: () => {
            void shell.openExternal('https://github.com/dl0w0')
          }
        },
        {
          label: `版本 ${app.getVersion()}`,
          enabled: false
        }
      ]
    }
  ]
  return Menu.buildFromTemplate(template)
}

export function applyAppMenu(): void {
  Menu.setApplicationMenu(buildAppMenu())
}
