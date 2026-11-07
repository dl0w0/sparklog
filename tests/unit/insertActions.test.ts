import { beforeEach, describe, expect, it } from 'vitest'
import {
  addAttachment,
  addImage,
  addInsert,
  insertDisplayPos,
  pickAndAttach,
  removeInsert,
  togglePin,
  toggleTask,
  updateNote,
  updateTaskLine,
  addTaskLine,
  removeTaskLine,
  moveInsert,
  setInsertExpanded
} from '@renderer/actions/insertActions'
import { applyThemePreset, setThemeOverride } from '@renderer/actions/themeActions'
import { addRootBubble, setStyleMany, commitText } from '@renderer/actions/bubbleActions'
import { toggleTaskLine } from '@renderer/actions/insertActions'
import { buildExportContext } from '@renderer/actions/exportActions'
import { useDocStore } from '@renderer/store/docStore'
import { useSelectionStore } from '@renderer/store/selectionStore'
import { useViewportStore } from '@renderer/store/viewportStore'

beforeEach(() => {
  useDocStore.getState().newDocument()
  useSelectionStore.getState().clear()
  useViewportStore.getState().setLevel('root')
})

function doc() {
  return useDocStore.getState().doc
}

describe('插入对象', () => {
  it('插入笔记附着在气泡上', () => {
    const bubble = addRootBubble({ x: 0, y: 0 }) as string
    const id = addInsert('note', bubble)
    const item = doc().inserts.find((i) => i.id === id)
    expect(item?.kind).toBe('note')
    expect(item?.ownerBubbleId).toBe(bubble)
    expect(item?.note).toEqual({ title: '笔记', content: '' })
  })

  it('附着未钉住的插入对象跟随宿主气泡', () => {
    const bubble = addRootBubble({ x: 100, y: 100 }) as string
    const id = addInsert('note', bubble)
    const item = doc().inserts.find((i) => i.id === id)!
    const p1 = insertDisplayPos(item, doc().nodes)
    // 移动气泡
    useDocStore.getState().commit('移动', (d) => {
      d.nodes[0].bubblePos = { x: 300, y: 300 }
    })
    const p2 = insertDisplayPos(doc().inserts[0], doc().nodes)
    expect(p2.x - p1.x).toBeCloseTo(200, 5)
    expect(p2.y - p1.y).toBeCloseTo(200, 5)
  })

  it('钉住后位置固定，不再跟随气泡', () => {
    const bubble = addRootBubble({ x: 0, y: 0 }) as string
    const id = addInsert('task', bubble)
    togglePin(id)
    const pinned = doc().inserts.find((i) => i.id === id)!
    const before = insertDisplayPos(pinned, doc().nodes)
    useDocStore.getState().commit('移动', (d) => {
      d.nodes[0].bubblePos = { x: 500, y: 500 }
    })
    const after = insertDisplayPos(doc().inserts[0], doc().nodes)
    expect(after).toEqual(before)
  })

  it('编辑笔记内容并入栈', () => {
    const bubble = addRootBubble({ x: 0, y: 0 }) as string
    const id = addInsert('note', bubble)
    updateNote(id, { content: '第一行' })
    expect(doc().inserts[0].note?.content).toBe('第一行')
    useDocStore.getState().undo()
    expect(doc().inserts[0].note?.content).toBe('')
  })

  it('任务可勾选与改文字', () => {
    const bubble = addRootBubble({ x: 0, y: 0 }) as string
    const id = addInsert('task', bubble)
    const first = doc().inserts[0].task!.items[0].id
    updateTaskLine(id, first, '写完文档')
    toggleTask(id)
    expect(doc().inserts[0].task?.items[0]).toMatchObject({ text: '写完文档', done: true })
    toggleTask(id)
    expect(doc().inserts[0].task?.items[0].done).toBe(false)
  })

  it('任务支持多行：新增一行并独立勾选', () => {
    const bubble = addRootBubble({ x: 0, y: 0 }) as string
    const id = addInsert('task', bubble)
    const first = doc().inserts[0].task!.items[0].id
    const secondId = addTaskLine(id, first) as string
    updateTaskLine(id, secondId, '第二行')
    expect(doc().inserts[0].task?.items).toHaveLength(2)
    toggleTaskLine(id, secondId)
    expect(doc().inserts[0].task?.items[1]).toMatchObject({ text: '第二行', done: true })
    expect(doc().inserts[0].task?.items[0].done).toBe(false)
  })

  it('任务删掉最后一行时保留一行空行', () => {
    const bubble = addRootBubble({ x: 0, y: 0 }) as string
    const id = addInsert('task', bubble)
    const first = doc().inserts[0].task!.items[0].id
    removeTaskLine(id, first)
    expect(doc().inserts[0].task?.items).toHaveLength(1)
  })

  it('插入对象可拖动：拖动后钉住并落到新位置', () => {
    const bubble = addRootBubble({ x: 0, y: 0 }) as string
    const id = addInsert('note', null, { x: 10, y: 10 })
    moveInsert(id, { x: 200, y: 150 })
    const item = doc().inserts[0]
    expect(item.pos).toEqual({ x: 200, y: 150 })
    expect(item.pinned).toBe(true)
    expect(item.expanded).toBe(true)
  })

  it('附着对象默认折叠，展开后成为卡片', () => {
    const bubble = addRootBubble({ x: 0, y: 0 }) as string
    const id = addInsert('note', bubble)
    expect(doc().inserts[0].expanded).toBe(false)
    setInsertExpanded(id, true)
    expect(doc().inserts[0].expanded).toBe(true)
    expect(doc().inserts[0].pinned).toBe(false)
  })

  it('插入在指定点击位置', () => {
    const id = addInsert('note', null, { x: 321, y: 654 })
    expect(doc().inserts.find((i) => i.id === id)?.pos).toEqual({ x: 321, y: 654 })
  })

  it('附件记录路径与扩展名', () => {
    const bubble = addRootBubble({ x: 0, y: 0 }) as string
    addAttachment(bubble, { path: 'C:/a/需求.docx', name: '需求.docx', ext: 'docx' })
    expect(doc().inserts[0].attachment).toEqual({
      path: 'C:/a/需求.docx',
      name: '需求.docx',
      ext: 'docx'
    })
  })

  it('图片记录尺寸', () => {
    const bubble = addRootBubble({ x: 0, y: 0 }) as string
    addImage(bubble, { path: 'C:/a/p.png', name: 'p.png', w: 200, h: 120 })
    expect(doc().inserts[0].image).toEqual({ path: 'C:/a/p.png', name: 'p.png', w: 200, h: 120 })
  })

  it('删除插入对象', () => {
    const bubble = addRootBubble({ x: 0, y: 0 }) as string
    const id = addInsert('note', bubble)
    removeInsert(id)
    expect(doc().inserts).toHaveLength(0)
  })

  it('独立摆放的插入对象使用自身坐标', () => {
    const id = addInsert('note', null, { x: 42, y: 84 })
    const item = doc().inserts.find((i) => i.id === id)!
    expect(insertDisplayPos(item, doc().nodes)).toEqual({ x: 42, y: 84 })
  })

  it('删除附着气泡时不留下孤儿插入对象（走删除动作）', async () => {
    const bubble = addRootBubble({ x: 0, y: 0 }) as string
    addInsert('note', bubble)
    const { deleteSingleBubble } = await import('@renderer/actions/bubbleActions')
    deleteSingleBubble(bubble)
    expect(doc().inserts).toHaveLength(0)
  })

  it('取消钉住保留用户设定的连线长度，且不瞬移对象（D55）', () => {
    const bubble = addRootBubble({ x: 0, y: 0 }) as string
    const insertId = addInsert('note', null, { x: 900, y: 0 })
    togglePin(insertId) // 先钉住
    useDocStore.getState().commit('加连线', (d) => {
      d.links = [
        { id: 'l1', from: bubble, to: insertId, fromKind: 'bubble', toKind: 'insert', length: 260 }
      ]
    })
    moveInsert(insertId, { x: 900, y: 0 })
    togglePin(insertId) // 取消钉住
    const item = doc().inserts.find((i) => i.id === insertId)!
    const link = doc().links.find((l) => l.id === 'l1')!
    expect(item.pinned).toBe(false)
    expect(link.length).toBe(260)
    // 不瞬移：位置保持用户拖到的位置，之后由弹簧平滑牵引
    expect(item.pos).toEqual({ x: 900, y: 0 })
  })

  it('取消钉住且从未设定长度时恢复为默认长度（D55）', () => {
    const bubble = addRootBubble({ x: 0, y: 0 }) as string
    const insertId = addInsert('note', null, { x: 900, y: 0 })
    togglePin(insertId)
    useDocStore.getState().commit('加连线', (d) => {
      d.links = [{ id: 'l1', from: bubble, to: insertId, fromKind: 'bubble', toKind: 'insert' }]
    })
    togglePin(insertId)
    const link = doc().links.find((l) => l.id === 'l1')!
    expect(typeof link.length).toBe('number')
    expect(link.length!).toBeGreaterThan(34)
  })

  it('选择文件取消时不插入', async () => {
    const bubble = addRootBubble({ x: 0, y: 0 }) as string
    const ok = await pickAndAttach(bubble)
    expect(ok).toBe(false)
    expect(doc().inserts).toHaveLength(0)
  })
})

describe('主题', () => {
  it('套用预设写入文件并标脏', () => {
    applyThemePreset('warm-sand')
    expect(doc().theme.presetId).toBe('warm-sand')
    expect(useDocStore.getState().dirty).toBe(true)
  })

  it('重复套用同一预设不产生新历史', () => {
    applyThemePreset('warm-sand')
    const size = useDocStore.getState().undoLabel
    applyThemePreset('warm-sand')
    expect(useDocStore.getState().undoLabel).toBe(size)
  })

  it('个性化覆盖与默认形状', () => {
    setThemeOverride({ defaultShape: 'ellipse', edgeWidth: 3 })
    expect(doc().theme.overrides?.defaultShape).toBe('ellipse')
    expect(doc().theme.overrides?.edgeWidth).toBe(3)
  })

  it('新建气泡采用主题默认形状', () => {
    setThemeOverride({ defaultShape: 'roundedRect' })
    addRootBubble({ x: 0, y: 0 })
    expect(doc().nodes[0].shape).toBe('roundedRect')
  })

  it('单气泡样式覆盖优先于主题', () => {
    const a = addRootBubble({ x: 0, y: 0 }) as string
    const b = addRootBubble({ x: 300, y: 0 }) as string
    setStyleMany([a], { shape: 'ellipse' })
    applyThemePreset('ink-purple')
    expect(doc().nodes.find((n) => n.id === a)?.shape).toBe('ellipse')
    expect(doc().nodes.find((n) => n.id === b)?.shape).toBe('circle')
  })
})

describe('导出上下文', () => {
  it('包含 SVG 与 Markdown，且只含当前层级', () => {
    const a = addRootBubble({ x: 0, y: 0 }) as string
    commitText(a, '主标题')
    useDocStore.getState().commit('加专区节点', (d) => {
      d.nodes.push({
        id: 'zoned',
        text: '专区内',
        importance: 50,
        shape: 'circle',
        colorKey: 'default',
        parentIds: [],
        zoneId: 'z1',
        bubblePos: { x: 0, y: 0 },
        createdAt: '',
        updatedAt: ''
      })
    })
    const ctx = buildExportContext()
    expect(ctx.svg).toContain('主标题')
    expect(ctx.svg).not.toContain('专区内')
    expect(ctx.markdown).toContain('# 主标题')
    expect(ctx.markdown).not.toContain('专区内')
  })
})
