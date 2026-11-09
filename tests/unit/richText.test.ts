import { describe, expect, it } from 'vitest'
import { applyRunStyle, splitRuns } from '@renderer/logic/richText'

describe('选区文本样式（D93）', () => {
  it('无 runs 时整段为默认样式', () => {
    expect(splitRuns('你好', undefined)).toEqual([{ text: '你好', style: {} }])
  })

  it('按区间切段，未覆盖部分无样式', () => {
    const runs = [{ start: 2, end: 4, style: { color: '#d64545', bold: true } }]
    const segments = splitRuns('零一二三四五', runs)
    expect(segments.map((s) => s.text)).toEqual(['零一', '二三', '四五'])
    expect(segments[1].style).toMatchObject({ color: '#d64545', bold: true })
  })

  it('区间两端被裁剪到文字长度内', () => {
    const segments = splitRuns('abc', [{ start: -5, end: 99, style: { italic: true } }])
    expect(segments).toHaveLength(1)
    expect(segments[0].text).toBe('abc')
  })

  it('对选区应用样式：与已有区间求并后不重叠', () => {
    let runs = applyRunStyle(undefined, 2, 4, { color: '#111111' })
    runs = applyRunStyle(runs, 3, 6, { bold: true })
    // 不重叠且按 start 排序
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i].start).toBeGreaterThanOrEqual(runs[i - 1].end)
    }
    const segments = splitRuns('0123456789', runs)
    const text = segments.map((s) => s.text).join('')
    expect(text).toBe('0123456789')
    // 从下标 3 开始的片段同时具备颜色与加粗
    const middle = segments.find((segment) => segment.text.startsWith('3'))
    expect(middle?.text).toBe('345')
    expect(middle?.style).toMatchObject({ color: '#111111', bold: true })
  })

  it('空选区不改变 runs', () => {
    const runs = [{ start: 0, end: 1, style: { bold: true } }]
    expect(applyRunStyle(runs, 1, 1, { italic: true })).toEqual(runs)
  })
})
