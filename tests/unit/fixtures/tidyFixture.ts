import { makeNode } from '../../helpers'

/** 一组彼此重叠、且带一个其它层级节点的测试数据 */
export function knownNodes() {
  return [
    makeNode('r', [], { x: 0, y: 0 }),
    makeNode('a', ['r'], { x: 10, y: 6 }),
    makeNode('b', ['r'], { x: -8, y: 12 }),
    makeNode('c', ['a'], { x: 4, y: -9 }),
    makeNode('d', ['b'], { x: 14, y: 2 }),
    makeNode('zoned', [], { x: 5000, y: 5000 }, { zoneId: 'z1' })
  ]
}
