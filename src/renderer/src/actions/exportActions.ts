/** 导出动作：把当前层级导出为 PNG / SVG / PDF / Markdown。 */

import { paletteOf } from '@renderer/logic/theme'
import { buildOutline, buildPdfHtml, buildSvgExport } from '@renderer/logic/export'
import { layoutMindmap } from '@renderer/logic/layout/mindmapLayout'
import { radiusOf } from '@renderer/logic/nodeVisual'
import { nodesInZone } from '@renderer/logic/graph'
import { defaultFileStem } from '@renderer/logic/title'
import { api } from '@renderer/services/bridge'
import { svgToPngBase64 } from '@renderer/services/pngExport'
import { useDocStore } from '@renderer/store/docStore'
import { useUiStore } from '@renderer/store/uiStore'
import { ROOT_LEVEL, useViewportStore } from '@renderer/store/viewportStore'

export type ExportFormat = 'png' | 'svg' | 'pdf' | 'md'

export interface ExportContext {
  svg: string
  markdown: string
  stem: string
}

function currentZoneId(): string | null {
  const levelId = useViewportStore.getState().levelId
  return levelId === ROOT_LEVEL ? null : levelId
}

function positionsFor(nodes: ReturnType<typeof nodesInZone>, mode: 'bubble' | 'mindmap') {
  if (mode === 'mindmap') {
    const res = layoutMindmap(nodes, { radiusOf: (n) => radiusOf(n, 'mindmap') })
    return res.positions
  }
  return new Map(nodes.map((n) => [n.id, n.bubblePos] as const))
}

export function buildExportContext(): ExportContext {
  const store = useDocStore.getState()
  const zoneId = currentZoneId()
  const nodes = nodesInZone(store.doc.nodes, zoneId)
  const mode = store.doc.viewMode
  const palette = paletteOf(store.doc.theme)
  const positions = positionsFor(nodes, mode)
  const svg = buildSvgExport({
    nodes,
    positions,
    mode,
    background: palette.background,
    bubbleFrom: palette.bubbleFrom,
    bubbleTo: palette.bubbleTo,
    rootStroke: store.doc.theme.overrides?.rootAccent ?? palette.rootStroke,
    childStroke: palette.childStroke,
    edgeColor: palette.edge,
    textColor: palette.text
  })
  return {
    svg,
    markdown: buildOutline(store.doc.nodes, zoneId),
    stem: defaultFileStem(store.doc, store.filePath)
  }
}

export async function exportAs(format: ExportFormat): Promise<boolean> {
  const ui = useUiStore.getState()
  const ctx = buildExportContext()
  try {
    if (format === 'svg') {
      const res = await api().exportDocument({
        defaultName: `${ctx.stem}.svg`,
        extension: 'svg',
        filterName: 'SVG 矢量图',
        data: ctx.svg,
        encoding: 'utf8'
      })
      return finish(res)
    }
    if (format === 'md') {
      const res = await api().exportDocument({
        defaultName: `${ctx.stem}.md`,
        extension: 'md',
        filterName: 'Markdown 大纲',
        data: ctx.markdown,
        encoding: 'utf8'
      })
      return finish(res)
    }
    if (format === 'pdf') {
      const res = await api().exportPdf(buildPdfHtml(ctx.svg), `${ctx.stem}.pdf`)
      return finish(res)
    }
    const base64 = await svgToPngBase64(ctx.svg, 2)
    const res = await api().exportDocument({
      defaultName: `${ctx.stem}.png`,
      extension: 'png',
      filterName: 'PNG 图片',
      data: base64,
      encoding: 'base64'
    })
    return finish(res)
  } catch (err) {
    ui.openDialog({ kind: 'error', message: `导出失败：${(err as Error).message}` })
    return false
  }

  function finish(res: { ok: boolean; canceled?: boolean; error?: string }): boolean {
    if (res.canceled) return false
    if (!res.ok) {
      ui.openDialog({ kind: 'error', message: res.error ?? '导出失败' })
      return false
    }
    ui.showToast('已导出')
    return true
  }
}
