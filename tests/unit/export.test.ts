import { describe, expect, it } from 'vitest'
import {
  buildOutline,
  buildPdfHtml,
  buildSvgExport,
  escapeXml,
  wrapText
} from '@renderer/logic/export'
import { makeNode } from '../helpers'

const nodes = [
  makeNode('r', [], { x: 0, y: 0 }, { text: '主想法', importance: 70 }),
  makeNode('a', ['r'], { x: 100, y: 0 }, { text: '子想法A', importance: 50 }),
  makeNode('b', ['a'], { x: 200, y: 0 }, { text: '孙想法' }),
  makeNode('c', ['r'], { x: 100, y: 80 }, { text: '子想法B' })
]

const positions = new Map(nodes.map((n) => [n.id, n.bubblePos]))

describe('Markdown 大纲', () => {
  it('主气泡为一级标题，后代为缩进列表', () => {
    const md = buildOutline(nodes)
    const lines = md.split('\n')
    expect(lines[0].startsWith('# 主想法')).toBe(true)
    expect(lines[1]).toContain('- 子想法A')
    expect(lines[2]).toContain('  - 孙想法')
    expect(lines[3]).toContain('- 子想法B')
  })

  it('附带重要程度注释', () => {
    expect(buildOutline(nodes)).toContain('importance:70')
  })

  it('空文档返回空字符串', () => {
    expect(buildOutline([])).toBe('')
  })

  it('空文字用占位符', () => {
    const empty = [makeNode('x', [], { x: 0, y: 0 }, { text: '' })]
    expect(buildOutline(empty)).toContain('（空）')
  })

  it('按层级过滤（专区）', () => {
    const zoned = [
      makeNode('root', [], { x: 0, y: 0 }, { text: '主画布' }),
      makeNode('z1', [], { x: 0, y: 0 }, { text: '专区内', zoneId: 'zone' })
    ]
    const md = buildOutline(zoned, 'zone')
    expect(md).toContain('专区内')
    expect(md).not.toContain('主画布')
  })
})

describe('SVG 导出', () => {
  it('包含 viewBox 与每个气泡的形状', () => {
    const svg = buildSvgExport({ nodes, positions, mode: 'bubble' })
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).toContain('viewBox=')
    expect((svg.match(/<circle/g) ?? []).length).toBeGreaterThanOrEqual(nodes.length)
    expect(svg.endsWith('</svg>')).toBe(true)
  })

  it('包含连线路径与虚线回边', () => {
    const withBack = [
      makeNode('p', [], { x: 0, y: 0 }, { text: 'P' }),
      makeNode('q', [], { x: 300, y: 0 }, { text: 'Q' }),
      makeNode('c', ['p', 'q'], { x: 150, y: 120 }, { text: 'C' })
    ]
    const svg = buildSvgExport({
      nodes: withBack,
      positions: new Map(withBack.map((n) => [n.id, n.bubblePos])),
      mode: 'bubble'
    })
    expect(svg).toContain('<path')
    expect(svg).toContain('stroke-dasharray="4 4"')
  })

  it('XML 特殊字符被转义', () => {
    const special = [makeNode('s', [], { x: 0, y: 0 }, { text: '<a & "b">' })]
    const svg = buildSvgExport({
      nodes: special,
      positions: new Map([['s', { x: 0, y: 0 }]]),
      mode: 'bubble'
    })
    expect(svg).toContain('&lt;a &amp; &quot;b&quot;&gt;')
    expect(svg).not.toContain('<a & "b">')
  })

  it('空文档也能生成合法 SVG', () => {
    const svg = buildSvgExport({ nodes: [], positions: new Map(), mode: 'bubble' })
    expect(svg).toContain('viewBox')
    expect(svg.endsWith('</svg>')).toBe(true)
  })

  it('导图模式使用导图坐标', () => {
    const pos = new Map([
      ['r', { x: 0, y: 0 }],
      ['a', { x: 300, y: 0 }]
    ])
    const two = [makeNode('r', [], { x: 0, y: 0 }, { text: 'R' }), makeNode('a', ['r'], { x: 0, y: 0 }, { text: 'A' })]
    const svg = buildSvgExport({ nodes: two, positions: pos, mode: 'mindmap' })
    expect(svg).toContain('cx="300"')
  })

  it('圆角矩形与椭圆分别输出 rect / ellipse', () => {
    const shapes = [
      makeNode('c1', [], { x: 0, y: 0 }, { text: 'a', shape: 'roundedRect' }),
      makeNode('c2', [], { x: 200, y: 0 }, { text: 'b', shape: 'ellipse' })
    ]
    const svg = buildSvgExport({
      nodes: shapes,
      positions: new Map(shapes.map((n) => [n.id, n.bubblePos])),
      mode: 'bubble'
    })
    expect(svg).toContain('<rect')
    expect(svg).toContain('<ellipse')
  })
})

describe('文本换行与转义', () => {
  it('空文本不产生行', () => {
    expect(wrapText('', 50)).toEqual([])
  })

  it('长文本截断并加省略号', () => {
    const lines = wrapText('很长'.repeat(40), 40, 3)
    expect(lines).toHaveLength(3)
    expect(lines[2].endsWith('…')).toBe(true)
  })

  it('escapeXml 转义五种字符', () => {
    expect(escapeXml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&apos;')
  })
})

describe('PDF HTML', () => {
  it('包裹 SVG 并设置横向页面', () => {
    const html = buildPdfHtml('<svg></svg>')
    expect(html).toContain('A4 landscape')
    expect(html).toContain('<svg></svg>')
    expect(html.startsWith('<!doctype html>')).toBe(true)
  })
})
