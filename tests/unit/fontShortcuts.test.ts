import { beforeEach, describe, expect, it } from 'vitest'
import { resolveKey } from '@renderer/logic/keyboard'
import { changeFontSize, currentBubbleFontSize } from '@renderer/actions/fontActions'
import { useDocStore } from '@renderer/store/docStore'
import { useSelectionStore } from '@renderer/store/selectionStore'
import { createDefaultSettings, clampFontSize, FONT_SIZE_MAX, FONT_SIZE_MIN } from '@shared/types/settings'
import { setRuntimeSettings } from '@renderer/logic/runtimeSettings'
import { makeNode } from '../helpers'
import type { SparklogFile } from '@shared/types/document'
import { createEmptyDocument } from '@shared/logic/documentCodec'

const ctxBase = {
  mode: 'canvas' as const,
  hasSelection: true,
  canPaste: true,
  hasStyleClipboard: false,
  isIsolated: false
}

describe('字号快捷键（D92）', () => {
  beforeEach(() => {
    setRuntimeSettings(createDefaultSettings())
  })

  it('Ctrl+Shift+. / > 放大，Ctrl+Shift+, / < 缩小', () => {
    expect(resolveKey({ key: '.', ctrl: true, shift: true }, ctxBase)).toBe('fontUp')
    expect(resolveKey({ key: '>', ctrl: true, shift: true }, ctxBase)).toBe('fontUp')
    expect(resolveKey({ key: ',', ctrl: true, shift: true }, ctxBase)).toBe('fontDown')
    expect(resolveKey({ key: '<', ctrl: true, shift: true }, ctxBase)).toBe('fontDown')
    // 编辑态同样生效
    expect(
      resolveKey(
        { key: '.', ctrl: true, shift: true },
        { ...ctxBase, mode: 'editing' as const }
      )
    ).toBe('fontUp')
    // 没有 Shift 不触发
    expect(resolveKey({ key: '.', ctrl: true }, ctxBase)).toBeNull()
  })

  it('夹紧规则在上下限内', () => {
    expect(clampFontSize(FONT_SIZE_MIN - 5)).toBe(FONT_SIZE_MIN)
    expect(clampFontSize(FONT_SIZE_MAX + 50)).toBe(FONT_SIZE_MAX)
    expect(clampFontSize(Number.NaN)).toBe(14)
  })

  it('每个选中气泡在各自字号基础上 ±2', () => {
    const root = makeNode('r', [], { x: 0, y: 0 }, { style: { fontSize: 20 } })
    const child = makeNode('c', ['r'], { x: 100, y: 0 }, { style: { fontSize: 16 } })
    const doc: SparklogFile = {
      ...createEmptyDocument(),
      nodes: [root, child]
    }
    useDocStore.setState({ doc })
    useSelectionStore.getState().selectMany(['r', 'c'])

    changeFontSize(1)
    const after = useDocStore.getState().doc.nodes
    expect(after.find((n) => n.id === 'r')!.style?.fontSize).toBe(22)
    expect(after.find((n) => n.id === 'c')!.style?.fontSize).toBe(18)

    changeFontSize(-1)
    const back = useDocStore.getState().doc.nodes
    expect(back.find((n) => n.id === 'r')!.style?.fontSize).toBe(20)
    expect(back.find((n) => n.id === 'c')!.style?.fontSize).toBe(16)
  })

  it('到达上限后不再增长', () => {
    const node = makeNode('max', [], { x: 0, y: 0 }, { style: { fontSize: FONT_SIZE_MAX } })
    useDocStore.setState({ doc: { ...createEmptyDocument(), nodes: [node] } })
    useSelectionStore.getState().selectMany(['max'])
    changeFontSize(1)
    expect(useDocStore.getState().doc.nodes[0].style?.fontSize).toBe(FONT_SIZE_MAX)
  })

  it('当前字号：有 style 用 style，否则按层级默认', () => {
    const node = makeNode('n', [], { x: 0, y: 0 })
    expect(currentBubbleFontSize(node, 0)).toBe(20)
    expect(currentBubbleFontSize({ ...node, style: { fontSize: 30 } }, 2)).toBe(30)
  })
})
