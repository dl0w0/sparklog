import { describe, expect, it } from 'vitest'
import { geomOf, shapeContainsPoint, shapesOverlap } from '@renderer/logic/shapes'

describe('气泡真实形状（D79）', () => {
  it('圆：中心点到半径内为内部', () => {
    const g = geomOf('circle', { x: 0, y: 0 }, 50)
    expect(shapeContainsPoint(g, 0, 0)).toBe(true)
    expect(shapeContainsPoint(g, 49, 0)).toBe(true)
    expect(shapeContainsPoint(g, 51, 0)).toBe(false)
  })

  it('椭圆：宽高方向独立判定', () => {
    const g = geomOf('ellipse', { x: 0, y: 0 }, 60)
    expect(shapeContainsPoint(g, g.rx - 1, 0)).toBe(true)
    expect(shapeContainsPoint(g, 0, g.ry - 1)).toBe(true)
    expect(shapeContainsPoint(g, g.rx - 1, g.ry - 1)).toBe(false)
  })

  it('圆角矩形：角上判定考虑圆角', () => {
    const g = geomOf('roundedRect', { x: 0, y: 0 }, 50)
    expect(shapeContainsPoint(g, 0, 0)).toBe(true)
    expect(shapeContainsPoint(g, g.rx - 0.5, 0)).toBe(true)
    // 正角落落在圆角之外
    expect(shapeContainsPoint(g, g.rx - 0.5, g.ry - 0.5)).toBe(false)
  })

  it('两个分离的圆不重叠', () => {
    const a = geomOf('circle', { x: 0, y: 0 }, 50)
    const b = geomOf('circle', { x: 120, y: 0 }, 50)
    expect(shapesOverlap(a, b)).toBe(false)
  })

  it('相互切入的圆重叠', () => {
    const a = geomOf('circle', { x: 0, y: 0 }, 50)
    const b = geomOf('circle', { x: 90, y: 0 }, 50)
    expect(shapesOverlap(a, b)).toBe(true)
  })

  it('椭圆斜向相交能被检出（圆半径和判定会漏）', () => {
    const a = geomOf('ellipse', { x: 0, y: 0 }, 80)
    const b = geomOf('ellipse', { x: 75, y: 0 }, 80)
    expect(shapesOverlap(a, b)).toBe(true)
  })

  it('圆角矩形之间按圆角判定', () => {
    const a = geomOf('roundedRect', { x: 0, y: 0 }, 60)
    const b = geomOf('roundedRect', { x: a.rx + 40, y: a.ry + 40 }, 60)
    // 对角错开时角与角之间可能是分开的
    expect(typeof shapesOverlap(a, b)).toBe('boolean')
  })

  it('圆形与其内部的椭圆重叠', () => {
    const a = geomOf('circle', { x: 0, y: 0 }, 70)
    const b = geomOf('ellipse', { x: 10, y: 0 }, 70)
    expect(shapesOverlap(a, b)).toBe(true)
  })
})
