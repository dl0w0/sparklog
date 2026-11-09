import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEPTH_FONT_MIN,
  DEPTH_FONT_RATIO,
  bubbleTextStyle,
  depthFontSize,
  fontSizeOf
} from '@renderer/logic/nodeVisual'
import { createDefaultSettings, normalizeSettings } from '@shared/types/settings'
import { setRuntimeSettings } from '@renderer/logic/runtimeSettings'
import { makeNode } from '../helpers'

const applyTypography = (patch: Record<string, unknown>): void => {
  const base = createDefaultSettings()
  base.typography.bubble = { ...base.typography.bubble, ...patch }
  setRuntimeSettings(normalizeSettings(base))
}

describe('文本编辑器设置 → 字号层级（D91）', () => {
  beforeEach(() => {
    setRuntimeSettings(createDefaultSettings())
  })

  it('设置里的字号对应主气泡，逐级 ×0.88', () => {
    applyTypography({ fontSize: 24 })
    expect(depthFontSize(0)).toBe(24)
    expect(depthFontSize(1)).toBe(Math.round(24 * DEPTH_FONT_RATIO))
    expect(depthFontSize(2)).toBe(Math.round(24 * DEPTH_FONT_RATIO ** 2))
    expect(depthFontSize(3)).toBe(Math.round(24 * DEPTH_FONT_RATIO ** 3))
    // 逐级递减
    expect(depthFontSize(0)).toBeGreaterThan(depthFontSize(1))
    expect(depthFontSize(1)).toBeGreaterThan(depthFontSize(2))
  })

  it('有下限，且极深层级不会变成 0', () => {
    applyTypography({ fontSize: 20 })
    expect(depthFontSize(20)).toBe(DEPTH_FONT_MIN)
    expect(depthFontSize(50)).toBeGreaterThanOrEqual(DEPTH_FONT_MIN)
  })

  it('节点 style.fontSize 覆盖层级规则', () => {
    applyTypography({ fontSize: 24 })
    const node = makeNode('n', [], { x: 0, y: 0 }, { style: { fontSize: 40 } })
    expect(fontSizeOf(node, 'bubble', 2)).toBe(40)
  })

  it('字体族与颜色不随层级变化', () => {
    const base = createDefaultSettings()
    base.typography.bubble = {
      ...base.typography.bubble,
      fontFamily: '"Microsoft YaHei UI", sans-serif',
      color: '#d64545'
    }
    setRuntimeSettings(normalizeSettings(base))
    const root = bubbleTextStyle(makeNode('a', [], { x: 0, y: 0 }), 0)
    const deep = bubbleTextStyle(makeNode('b', [], { x: 0, y: 0 }), 4)
    expect(deep.fontFamily).toBe(root.fontFamily)
    expect(deep.color).toBe(root.color)
    expect(Number(deep.fontSize)).toBeLessThan(Number(root.fontSize))
  })
})
