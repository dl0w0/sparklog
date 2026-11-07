import { describe, expect, it } from 'vitest'
import { copyPayload, cutPayload, pastePayload } from '@renderer/logic/clipboard'
import { makeNode } from '../helpers'

function chain(): ReturnType<typeof makeNode>[] {
  return [
    makeNode('r', [], { x: 0, y: 0 }),
    makeNode('a', ['r'], { x: 100, y: 0 }),
    makeNode('b', ['a'], { x: 200, y: 0 }),
    makeNode('other', [], { x: 500, y: 0 })
  ]
}

describe('复制', () => {
  it('打包选中节点及其全部后代', () => {
    const payload = copyPayload(chain(), ['a'])
    expect(payload?.nodes.map((n) => n.id).sort()).toEqual(['a', 'b'])
    expect(payload?.rootIds).toEqual(['a'])
    expect(payload?.cut).toBe(false)
  })

  it('多选父与子时根去重', () => {
    const payload = copyPayload(chain(), ['r', 'a'])
    expect(payload?.nodes).toHaveLength(3)
    expect(payload?.rootIds).toEqual(['r'])
  })

  it('选中不存在节点返回 null', () => {
    expect(copyPayload(chain(), ['ghost'])).toBeNull()
  })

  it('复制不修改原节点', () => {
    const nodes = chain()
    copyPayload(nodes, ['r'])
    expect(nodes).toHaveLength(4)
  })
})

describe('剪切（D17）', () => {
  it('剪走独有后代，保留共享子节点并记录连接', () => {
    const nodes = [
      makeNode('r1'),
      makeNode('r2'),
      makeNode('a', ['r1']),
      makeNode('shared', ['a', 'r2'])
    ]
    const res = cutPayload(nodes, ['r1'])
    expect(res).not.toBeNull()
    if (!res) return
    // 画布上只剩 r2 与 shared
    expect(res.nodes.map((n) => n.id).sort()).toEqual(['r2', 'shared'])
    // shared 与 r2 的连接保留，指向 a 的连接被记录下来
    expect(res.nodes.find((n) => n.id === 'shared')?.parentIds).toEqual(['r2'])
    expect(res.payload.externalLinks).toEqual([{ childId: 'shared', parentId: 'a' }])
    expect(res.payload.cut).toBe(true)
  })

  it('剪走整棵独有子树', () => {
    const res = cutPayload(chain(), ['r'])
    expect(res?.removedIds.sort()).toEqual(['a', 'b', 'r'])
    expect(res?.nodes.map((n) => n.id)).toEqual(['other'])
  })

  it('剪切后未粘贴不会产生悬挂引用', () => {
    const nodes = [makeNode('r1'), makeNode('r2'), makeNode('a', ['r1']), makeNode('shared', ['a', 'r2'])]
    const res = cutPayload(nodes, ['r1'])
    for (const n of res!.nodes) {
      for (const p of n.parentIds) {
        expect(res!.nodes.some((x) => x.id === p)).toBe(true)
      }
    }
  })
})

describe('粘贴', () => {
  it('重建 id 并接到目标父气泡', () => {
    const nodes = [makeNode('target', [], { x: 0, y: 0 })]
    const payload = copyPayload(chain(), ['a'])!
    const res = pastePayload(nodes, payload, {
      targetParentId: 'target',
      zoneId: null,
      offset: { x: 0, y: 0 },
      makeId: (() => {
        let i = 0
        return () => `n${i++}`
      })()
    })
    expect(res.nodes).toHaveLength(3) // target + a' + b'
    const newRoot = res.nodes.find((n) => n.id === res.newRootIds[0])!
    expect(newRoot.parentIds).toContain('target')
    const child = res.nodes.find((n) => n.parentIds.includes(newRoot.id))
    expect(child).toBeTruthy()
    // id 全部不同
    expect(res.nodes.filter((n) => n.id.startsWith('n')).length).toBe(2)
  })

  it('粘贴到空白处保留子树相对位置', () => {
    const payload = copyPayload(chain(), ['a'])!
    const res = pastePayload([], payload, {
      targetParentId: null,
      zoneId: null,
      offset: { x: 1000, y: 500 },
      makeId: (() => {
        let i = 0
        return () => `p${i++}`
      })()
    })
    const root = res.nodes.find((n) => n.id === res.newRootIds[0])!
    const child = res.nodes.find((n) => n.parentIds.includes(root.id))!
    expect(child.bubblePos.x - root.bubblePos.x).toBe(100)
  })

  it('剪切粘贴时重建共享子节点连接', () => {
    const nodes = [makeNode('r1'), makeNode('r2'), makeNode('a', ['r1']), makeNode('shared', ['a', 'r2'])]
    const cut = cutPayload(nodes, ['r1'])!
    const res = pastePayload(cut.nodes, cut.payload, {
      targetParentId: 'r2',
      zoneId: null,
      offset: { x: 0, y: 0 },
      makeId: (() => {
        let i = 0
        return () => `z${i++}`
      })()
    })
    // shared 原本连在被剪走的 a 上，粘贴后应重新连到新的 a'
    const newA = res.nodes.find((n) => n.text === 'a' && n.id.startsWith('z'))!
    const shared = res.nodes.find((n) => n.id === 'shared')!
    expect(shared.parentIds).toContain(newA.id)
    expect(shared.parentIds).toContain('r2')
    expect(res.relinked).toEqual([{ childId: 'shared', newParentId: newA.id }])
  })

  it('粘贴出的节点全部使用新 id', () => {
    const payload = copyPayload(chain(), ['r'])!
    const seen = new Set<string>()
    const res = pastePayload([], payload, {
      targetParentId: null,
      zoneId: null,
      offset: { x: 0, y: 0 },
      makeId: (() => {
        let i = 0
        return () => `k${i++}`
      })()
    })
    for (const n of res.nodes) {
      expect(seen.has(n.id)).toBe(false)
      seen.add(n.id)
    }
  })
})
