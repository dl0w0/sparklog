import { describe, expect, it } from 'vitest'
import { defaultFileStem, displayName, fileBaseName, windowTitle } from '@renderer/logic/title'
import { fittedFontSize, fontSizeOf, radiusOf, shapeOf, textOverflows } from '@renderer/logic/nodeVisual'
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
    expect(fontSizeOf(big, 'bubble')).toBeGreaterThan(fontSizeOf(small, 'bubble'))
  })
})

describe('文字自适应（PRD 9.2）', () => {
  it('短文本不缩小', () => {
    expect(fittedFontSize('短', 60, 16)).toBe(16)
  })

  it('长文本缩小字号但不低于 11', () => {
    const long = '这是一段很长很长的文字'.repeat(12)
    const size = fittedFontSize(long, 50, 20)
    expect(size).toBeGreaterThanOrEqual(11)
    expect(size).toBeLessThan(20)
  })

  it('空文本使用基础字号', () => {
    expect(fittedFontSize('  ', 50, 18)).toBe(18)
  })

  it('溢出判定与省略号类一致', () => {
    expect(textOverflows('短', 60, 14)).toBe(false)
    expect(textOverflows('很长'.repeat(60), 40, 14)).toBe(true)
  })
})
