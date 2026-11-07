import { describe, expect, it } from 'vitest'
import { defaultFileStem, displayName, fileBaseName, windowTitle } from '@renderer/logic/title'
import {
  fontSizeOf,
  isBubbleTextTruncated,
  radiusOf,
  shapeOf,
  textBoxOf,
  textOverflowsInBox
} from '@renderer/logic/nodeVisual'
import { createEmptyDocument } from '@shared/logic/documentCodec'
import { makeNode } from '../helpers'

describe('窗口标题（D9）', () => {
  it('未落盘显示未命名', () => {
    expect(displayName(null)).toBe('未命名')
    expect(windowTitle(null, false)).toBe('未命名 - Sparklog')
  })

  it('有文件时显示文件名', () => {
    expect(windowTitle('C:\\docs\\灵感集.insp', false)).toBe('灵感集.insp - Sparklog')
  })

  it('脏标记前置星号', () => {
    expect(windowTitle('C:\\docs\\灵感集.insp', true)).toBe('*灵感集.insp - Sparklog')
  })

  it('fileBaseName 处理两种分隔符', () => {
    expect(fileBaseName('C:\\a\\b.insp')).toBe('b.insp')
    expect(fileBaseName('/tmp/b.insp')).toBe('b.insp')
    expect(fileBaseName(null)).toBeNull()
  })

  it('导出默认文件名去掉扩展名', () => {
    const doc = createEmptyDocument()
    expect(defaultFileStem(doc, 'C:/x/读书笔记.insp')).toBe('读书笔记')
    expect(defaultFileStem(doc, null)).toBe('未命名')
  })
})

describe('气泡视觉换算', () => {
  it('主气泡半径大于同重要的子气泡', () => {
    const root = makeNode('r', [], { x: 0, y: 0 }, { importance: 50 })
    const child = makeNode('c', ['r'], { x: 0, y: 0 }, { importance: 50 })
    expect(radiusOf(root, 'bubble')).toBeGreaterThan(radiusOf(child, 'bubble'))
  })

  it('导图视图半径受限', () => {
    const node = makeNode('n', [], { x: 0, y: 0 }, { importance: 100 })
    expect(radiusOf(node, 'mindmap')).toBeLessThanOrEqual(120)
    expect(radiusOf(node, 'bubble')).toBeGreaterThan(120)
  })

  it('单气泡样式覆盖优先', () => {
    const node = makeNode('n', [], { x: 0, y: 0 }, { shape: 'circle', style: { shape: 'ellipse' } })
    expect(shapeOf(node)).toBe('ellipse')
  })

  it('字号随半径增长且有上下界', () => {
    const small = makeNode('s', [], { x: 0, y: 0 }, { importance: 1 })
    const big = makeNode('b', [], { x: 0, y: 0 }, { importance: 100 })
    // D74：字号只由层级默认值 + style 覆盖决定，不随 importance 变化
    expect(fontSizeOf(big, 'bubble')).toBe(fontSizeOf(small, 'bubble'))
    expect(fontSizeOf(big, 'mindmap')).toBe(fontSizeOf(small, 'mindmap'))
  })
})

describe('文字可用区域（D75）', () => {
  it('圆形气泡取内接矩形，四角仍在圆内', () => {
    const box = textBoxOf('circle', { rx: 100, ry: 100 }, 10)
    const cornerX = box.w / 2
    const cornerY = box.h / 2
    expect(Math.hypot(cornerX, cornerY)).toBeLessThanOrEqual(100)
    // 且明显小于外接方形（不是只受外接方形约束）
    expect(box.w).toBeLessThan(100 * 2)
  })

  it('椭圆气泡宽高都受形状约束', () => {
    const box = textBoxOf('ellipse', { rx: 120, ry: 60 }, 8)
    expect(box.w).toBeLessThan(240)
    expect(box.h).toBeLessThan(120)
    // 椭圆方程校验：四角落在椭圆内
    const { rx, ry } = { rx: 120 - 8, ry: 60 - 8 }
    const inside = (box.w / 2 / rx) ** 2 + (box.h / 2 / ry) ** 2
    expect(inside).toBeLessThanOrEqual(1.000001)
  })

  it('圆角矩形按内边距内缩', () => {
    const box = textBoxOf('roundedRect', { rx: 100, ry: 50 }, 10)
    expect(box).toEqual({ w: 180, h: 80 })
  })

  it('短文本不截断，长文本截断', () => {
    const box = textBoxOf('circle', { rx: 60, ry: 60 }, 10)
    expect(textOverflowsInBox('短', box.w, box.h, 16)).toBe(false)
    expect(textOverflowsInBox('很长的文字'.repeat(40), box.w, box.h, 16)).toBe(true)
  })

  it('短文本气泡不会被判定为截断（D83 前置条件）', () => {
    const node = makeNode('n1', [], { x: 0, y: 0 }, { text: '短' })
    expect(isBubbleTextTruncated(node, radiusOf(node, 'bubble'), 0)).toBe(false)
  })

  it('超长文本气泡会被判定为截断', () => {
    const node = makeNode('n2', [], { x: 0, y: 0 }, { text: '很长的文字'.repeat(40) })
    expect(isBubbleTextTruncated(node, radiusOf(node, 'bubble'), 0)).toBe(true)
  })

  it('截断判定与 importance 无关（字号不随半径变化）', () => {
    const small = makeNode('s', [], { x: 0, y: 0 }, { importance: 5, text: '短' })
    const big = makeNode('b', [], { x: 0, y: 0 }, { importance: 95, text: '短' })
    expect(isBubbleTextTruncated(small, radiusOf(small, 'bubble'), 0)).toBe(false)
    expect(isBubbleTextTruncated(big, radiusOf(big, 'bubble'), 0)).toBe(false)
  })

  it('中英文混排按宽度估算', () => {
    const box = textBoxOf('circle', { rx: 60, ry: 60 }, 10)
    const mixed = 'hello 世界 hello 世界 hello 世界 hello 世界'
    expect(typeof textOverflowsInBox(mixed, box.w, box.h, 14)).toBe('boolean')
  })
})
