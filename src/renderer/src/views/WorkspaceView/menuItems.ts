import type { MenuNode } from './ContextMenu'
import { api } from '@renderer/services/bridge'
import { useDocStore } from '@renderer/store/docStore'
import { useSelectionStore } from '@renderer/store/selectionStore'
import { useUiStore } from '@renderer/store/uiStore'
import { useClipboardStore } from '@renderer/store/clipboardStore'
import { getCanvasController } from '@renderer/actions/commands'
import { copySelection, copyStyle, cutSelection, pasteBubbles, pasteStyle } from '@renderer/actions/clipboardActions'
import { setStyleMany } from '@renderer/actions/bubbleActions'
import { addInsert, pickAndAttach } from '@renderer/actions/insertActions'
import { applyThemePreset } from '@renderer/actions/themeActions'
import { buildViewEdges, entityGeometry } from '@renderer/logic/links'
import {
  applyEdgeStyle,
  deleteEdge,
  readEdgeStyle,
  setEdgeColor,
  setEdgeDashed,
  setEdgeLabel,
  setEdgeLength,
  setEdgeWidth
} from '@renderer/actions/edgeActions'
import { makeRadiusResolver } from '@renderer/logic/nodeVisual'
import { insertDisplayPos } from '@renderer/actions/insertActions'
import { LINK_GAP } from '@shared/constants'
import { enterZone, deleteZone } from '@renderer/actions/zoneActions'
import { exportAs } from '@renderer/actions/exportActions'
import { PALETTES } from '@renderer/logic/theme'
import {
  addChildBubble,
  addParentLink,
  addRootBubble,
  addSiblingBubble,
  countUniqueDescendants,
  deleteBubbleWithUniqueDescendants,
  deleteSingleBubble
} from '@renderer/actions/bubbleActions'

function soon(label: string): MenuNode {
  return { id: label, label, disabled: true }
}

function insertMenu(ownerId: string | null, world?: { x: number; y: number }): MenuNode[] {
  return [
    {
      id: 'insert-note',
      label: '📝 笔记',
      shortcut: 'Ctrl+Alt+N',
      onClick: () => addInsert('note', ownerId, world)
    },
    {
      id: 'insert-task',
      label: '☑ 任务',
      shortcut: 'Ctrl+Alt+T',
      onClick: () => addInsert('task', ownerId, world)
    },
    {
      id: 'insert-attachment',
      label: '📎 附件',
      shortcut: 'Ctrl+Alt+A',
      onClick: () => void pickAndAttach(ownerId, world)
    },
    {
      id: 'insert-panel',
      label: '更多插入选项…',
      onClick: () => useUiStore.getState().openDialog({ kind: 'insert' })
    }
  ]
}

function themeMenu(): MenuNode[] {
  const current = useDocStore.getState().doc.theme.presetId
  return [
    ...PALETTES.map((p) => ({
      id: `theme-${p.id}`,
      label: `${current === p.id ? '✓ ' : ''}${p.name}`,
      onClick: () => applyThemePreset(p.id)
    })),
    { id: 'theme-more', label: '更多设置…', onClick: () => useUiStore.getState().openDialog({ kind: 'theme' }) }
  ]
}

function exportMenu(): MenuNode[] {
  return [
    { id: 'export-png', label: 'PNG 图片', onClick: () => void exportAs('png') },
    { id: 'export-svg', label: 'SVG 矢量图', onClick: () => void exportAs('svg') },
    { id: 'export-pdf', label: 'PDF 文档', onClick: () => void exportAs('pdf') },
    { id: 'export-md', label: 'Markdown 大纲', onClick: () => void exportAs('md') },
    {
      id: 'export-more',
      label: '导出面板…',
      shortcut: 'Ctrl+Shift+E',
      onClick: () => useUiStore.getState().openDialog({ kind: 'export' })
    }
  ]
}

export function buildBlankMenu(position: { x: number; y: number; world?: { x: number; y: number } }): MenuNode[] {
  const docStore = useDocStore.getState()
  const ui = useUiStore.getState()
  const center = getCanvasController()?.worldCenter() ?? position
  return [
    {
      id: 'new-root',
      label: '＋ 新建主气泡',
      onClick: () => addRootBubble({ x: center.x, y: center.y })
    },
    {
      id: 'undo',
      label: '⟲ 撤销',
      shortcut: 'Ctrl+Z',
      disabled: !docStore.canUndo,
      onClick: () => docStore.undo()
    },
    {
      id: 'redo',
      label: '⟳ 重做',
      shortcut: 'Ctrl+Y',
      disabled: !docStore.canRedo,
      onClick: () => docStore.redo()
    },
    { id: 'sep1', label: '', separator: true },
    {
      id: 'create-zone',
      label: '▦ 创建专区…',
      shortcut: 'Ctrl+Shift+G',
      onClick: () => {
        useUiStore.getState().setZoneCreating(true)
        useUiStore.getState().showToast('在画布上拖出一个矩形来创建专区（Esc 取消）')
      }
    },
    { id: 'theme', label: '🎨 主题', children: themeMenu() },
    { id: 'insert', label: '⊕ 插入', children: insertMenu(null, position.world) },
    {
      id: 'select',
      label: '☑ 选择',
      children: [
        {
          id: 'select-panel',
          label: '打开选择面板…',
          onClick: () => ui.openDialog({ kind: 'select', bubbleId: null })
        }
      ]
    },
    { id: 'export', label: '⇩ 导出为…', children: exportMenu() },
    { id: 'sep2', label: '', separator: true },
    {
      id: 'show-all',
      label: '⛶ 显示全部',
      onClick: () => useSelectionStore.getState().setIsolate(null)
    },
    {
      id: 'start',
      label: '⌂ 前往开始窗口',
      onClick: () => api().showStartWindow()
    }
  ]
}

export function buildBubbleMenu(bubbleId: string, world?: { x: number; y: number }): MenuNode[] {
  const sel = useSelectionStore.getState()
  const ui = useUiStore.getState()
  const clip = useClipboardStore.getState()
  const count = countUniqueDescendants(bubbleId)
  return [
    {
      id: 'edit',
      label: '编辑文字',
      shortcut: 'F2',
      onClick: () => sel.startEdit(bubbleId)
    },
    { id: 'sep1', label: '', separator: true },
    { id: 'cut', label: '✂ 剪切', shortcut: 'Ctrl+X', onClick: () => cutSelection() },
    { id: 'copy', label: '⧉ 复制', shortcut: 'Ctrl+C', onClick: () => copySelection() },
    {
      id: 'paste',
      label: '📋 粘贴',
      shortcut: 'Ctrl+V',
      disabled: !clip.bubbles,
      onClick: () => pasteBubbles(bubbleId)
    },
    { id: 'copy-style', label: '🖌 拷贝样式', shortcut: 'Ctrl+Alt+C', onClick: () => copyStyle() },
    {
      id: 'paste-style',
      label: '🖌 粘贴样式',
      shortcut: 'Ctrl+Alt+V',
      disabled: !clip.style,
      onClick: () => pasteStyle()
    },
    { id: 'sep2', label: '', separator: true },
    {
      id: 'add-child',
      label: '＋ 新建子气泡',
      shortcut: 'Tab',
      onClick: () => addChildBubble(bubbleId)
    },
    {
      id: 'add-sibling',
      label: '＋ 新建同级气泡',
      shortcut: 'Enter',
      onClick: () => addSiblingBubble(bubbleId)
    },
    {
      id: 'add-parent',
      label: '⇢ 建立连接',
      shortcut: 'Ctrl+Alt+L',
      onClick: () => {
        useUiStore.getState().setLinkSource(bubbleId)
        ui.showToast('已选为子气泡，再点击目标气泡建立连接（Esc 取消）')
      }
    },
    { id: 'sep3', label: '', separator: true },
    { id: 'insert', label: '⊕ 插入', children: insertMenu(bubbleId, world) },
    {
      id: 'select',
      label: '☑ 选择',
      children: [
        {
          id: 'select-panel',
          label: '打开选择面板…',
          onClick: () => ui.openDialog({ kind: 'select', bubbleId })
        }
      ]
    },
    {
      id: 'isolate',
      label: '◐ 仅显示该分支',
      shortcut: 'F',
      onClick: () => sel.setIsolate(sel.isolateRootId === bubbleId ? null : bubbleId)
    },
    { id: 'sep4', label: '', separator: true },
    {
      id: 'shape',
      label: '形状',
      children: [
        { id: 'shape-circle', label: '圆形', onClick: () => setStyleMany([bubbleId], { shape: 'circle' }) },
        { id: 'shape-ellipse', label: '椭圆', onClick: () => setStyleMany([bubbleId], { shape: 'ellipse' }) },
        {
          id: 'shape-rect',
          label: '圆角矩形',
          onClick: () => setStyleMany([bubbleId], { shape: 'roundedRect' })
        }
      ]
    },
    { id: 'sep5', label: '', separator: true },
    {
      id: 'delete',
      label: '删除此气泡（子级保留）',
      shortcut: 'Del',
      danger: true,
      onClick: () => deleteSingleBubble(bubbleId)
    },
    {
      id: 'delete-cascade',
      label: '删除此气泡及其独有后代…',
      shortcut: 'Shift+Del',
      danger: true,
      onClick: () => {
        if (count === 0) deleteBubbleWithUniqueDescendants(bubbleId)
        else ui.openDialog({ kind: 'deleteCascade', bubbleId, count })
      }
    }
  ]
}

export function buildZoneMenu(zoneId: string): MenuNode[] {
  const zone = useDocStore.getState().doc.zones.find((z) => z.id === zoneId)
  return [
    {
      id: 'zone-enter',
      label: '进入专区',
      onClick: () => enterZone(zoneId)
    },
    {
      id: 'zone-rename',
      label: '重命名…',
      onClick: () => useUiStore.getState().openDialog({ kind: 'rename', zoneId })
    },
    { id: 'sep-zone', label: '', separator: true },
    {
      id: 'zone-delete',
      label: `删除专区「${zone?.title ?? ''}」及其内容…`,
      danger: true,
      onClick: () => {
        deleteZone(zoneId)
        useUiStore.getState().showToast('专区已删除')
      }
    }
  ]
}

const EDGE_COLORS = ['#b9c2df', '#5b6fd6', '#3f8f63', '#c9832f', '#6e4fa3', '#c0392b']

function edgeGeometryOf(edge: { from: string; to: string }) {
  const doc = useDocStore.getState().doc
  const radiusOf = makeRadiusResolver(doc.nodes, doc.viewMode)
  const from = entityGeometry(doc.nodes.length ? edge.from : edge.from, doc.nodes, doc.inserts, radiusOf, (i) =>
    insertDisplayPos(i, doc.nodes, doc.viewMode)
  )
  const to = entityGeometry(edge.to, doc.nodes, doc.inserts, radiusOf, (i) =>
    insertDisplayPos(i, doc.nodes, doc.viewMode)
  )
  return { from, to }
}

export function buildEdgeMenu(edgeId: string): MenuNode[] {
  const doc = useDocStore.getState().doc
  const edge = buildViewEdges(doc).find((e) => e.id === edgeId)
  if (!edge) return []
  const { from, to } = edgeGeometryOf(edge)
  const current =
    from && to ? Math.hypot(to.center.x - from.center.x, to.center.y - from.center.y) : 0
  const radiusOf = makeRadiusResolver(doc.nodes, doc.viewMode)
  const fromNode = doc.nodes.find((n) => n.id === edge.from)
  const toNode = doc.nodes.find((n) => n.id === edge.to)
  const defaultLength =
    fromNode && toNode ? radiusOf(fromNode) + radiusOf(toNode) + LINK_GAP : current
  const clip = useClipboardStore.getState()
  const style = readEdgeStyle(edge)

  return [
    {
      id: 'edge-label',
      label: '编辑文字（连线标签）',
      onClick: () => useUiStore.getState().openDialog({ kind: 'edgeLabel', edgeId })
    },
    { id: 'edge-sep0', label: '', separator: true },
    {
      id: 'edge-copy-style',
      label: '拷贝样式',
      onClick: () => {
        useClipboardStore.getState().setEdgeStyle(readEdgeStyle(edge))
        useUiStore.getState().showToast('已拷贝连线样式')
      }
    },
    {
      id: 'edge-paste-style',
      label: '粘贴样式',
      disabled: !clip.edgeStyle,
      onClick: () => {
        const payload = useClipboardStore.getState().edgeStyle
        if (payload) applyEdgeStyle(edge, payload)
      }
    },
    { id: 'edge-sep1', label: '', separator: true },
    {
      id: 'edge-type',
      label: edge.dashed ? '切换为实线（普通父子）' : '切换为虚线（关联线）',
      onClick: () => setEdgeDashed(edge, !edge.dashed)
    },
    {
      id: 'edge-color',
      label: '颜色',
      children: [
        ...EDGE_COLORS.map((color, index) => ({
          id: `edge-color-${index}`,
          label: color,
          onClick: () => setEdgeColor(edge, color)
        })),
        {
          id: 'edge-color-custom',
          label: '自定义…',
          colorInput: {
            value: style.color ?? '#5b6fd6',
            onChange: (value: string) => setEdgeColor(edge, value)
          }
        },
        {
          id: 'edge-color-reset',
          label: '恢复默认颜色',
          onClick: () => setEdgeColor(edge, undefined)
        }
      ]
    },
    {
      id: 'edge-length',
      label: '长度',
      children: [
        {
          id: 'edge-len-default',
          label: `恢复默认（${Math.round(defaultLength)}）`,
          onClick: () => setEdgeLength(edge, defaultLength)
        },
        { id: 'edge-len-120', label: '加长 20%', onClick: () => setEdgeLength(edge, current * 1.2) },
        { id: 'edge-len-80', label: '缩短 20%', onClick: () => setEdgeLength(edge, current * 0.8) },
        { id: 'edge-len-150', label: '设为 1.5 倍默认', onClick: () => setEdgeLength(edge, defaultLength * 1.5) }
      ]
    },
    {
      id: 'edge-width',
      label: '粗细',
      children: [1, 1.5, 2.5, 4].map((w) => ({
        id: `edge-width-${w}`,
        label: `${w}px`,
        onClick: () => setEdgeWidth(edge, w)
      }))
    },
    { id: 'edge-sep2', label: '', separator: true },
    { id: 'edge-delete', label: '删除', danger: true, onClick: () => deleteEdge(edge) }
  ]
}

export function buildInsertMenu(insertId: string): MenuNode[] {
  const ui = useUiStore.getState()
  return [
    {
      id: 'insert-connect',
      label: '⇢ 建立连接',
      onClick: () => {
        ui.setLinkSource(insertId)
        ui.showToast('已选为起点，再点击目标气泡建立连接（Esc 取消）')
      }
    },
    {
      id: 'insert-delete',
      label: '删除该对象',
      danger: true,
      onClick: () => {
        useDocStore.getState().commit('删除插入对象', (d) => {
          d.inserts = d.inserts.filter((i) => i.id !== insertId)
        })
      }
    }
  ]
}

export function menuFor(
  target: { bubbleId: string | null; zoneId?: string | null; edgeId?: string | null; insertId?: string | null },
  position: { x: number; y: number; world?: { x: number; y: number } }
): MenuNode[] {
  if (target.edgeId) return buildEdgeMenu(target.edgeId)
  if (target.insertId) return buildInsertMenu(target.insertId)
  if (target.zoneId) return buildZoneMenu(target.zoneId)
  return target.bubbleId
    ? buildBubbleMenu(target.bubbleId, position.world)
    : buildBlankMenu(position)
}
