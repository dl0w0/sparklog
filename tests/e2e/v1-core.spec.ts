import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { parseDocument } from '../../src/shared/logic/documentCodec'
import {
  bubbleCount,
  closeApp,
  createRootBubble,
  launchApp,
  openCanvasMenu,
  openWorkspace,
  readSaved,
  resetCanvas
} from './harness'

test.describe('v1.0 核心闭环', () => {
  test('开始页 → 新建空白画布 → 建气泡 → 保存', async () => {
    const h = await launchApp()
    try {
      const start = await h.start()
      await expect(start.locator('.sl-brand')).toBeVisible()
      await expect(start.getByText('新建空白画布')).toBeVisible()

      const ws = await openWorkspace(h.app)
      await expect(ws.locator('.sl-empty-hint')).toBeVisible()

      await createRootBubble(ws, '第一个想法')
      expect(await bubbleCount(ws)).toBe(1)
      await expect(ws.locator('[data-bubble-id]').first()).toContainText('第一个想法')

      await ws.locator('[data-bubble-id]').first().click()
      await ws.keyboard.press('Tab')
      await ws.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
      await ws.keyboard.type('子想法')
      await ws.keyboard.press('Escape')
      expect(await bubbleCount(ws)).toBe(2)

      await ws.locator('[data-bubble-id]').nth(1).click()
      await ws.keyboard.press('Enter')
      await ws.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
      await ws.keyboard.type('兄弟想法')
      await ws.keyboard.press('Escape')
      expect(await bubbleCount(ws)).toBe(3)

      await ws.keyboard.press('Control+s')
      await expect
        .poll(async () => {
          try {
            return parseDocument(readSaved(h.dir)).ok
          } catch {
            return false
          }
        })
        .toBe(true)

      const parsed = parseDocument(readSaved(h.dir))
      expect(parsed.ok).toBe(true)
      if (parsed.ok) {
        expect(parsed.doc.nodes).toHaveLength(3)
        expect(parsed.doc.nodes.map((n) => n.text).sort()).toEqual(
          ['子想法', '兄弟想法', '第一个想法'].sort()
        )
        const child = parsed.doc.nodes.find((n) => n.text === '子想法')
        expect(child?.parentIds).toHaveLength(1)
      }

      await expect.poll(async () => ws.title()).toContain('test.insp')
    } finally {
      await h.close()
    }
  })

  test.describe('同一窗口内连续用例', () => {
    let app: ElectronApplication
    let page: Page

    test.beforeAll(async () => {
      const h = await launchApp()
      app = h.app
      page = await openWorkspace(app)
    })

    test.afterAll(async () => {
      await closeApp(app)
    })

    test.beforeEach(async () => {
      await resetCanvas(page)
    })

    test('删除语义：Delete 只删自身，子级升根', async () => {
      await createRootBubble(page, '根')
      await page.locator('[data-bubble-id]').first().click()
      await page.keyboard.press('Tab')
      await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
      await page.keyboard.type('子')
      await page.keyboard.press('Escape')
      expect(await bubbleCount(page)).toBe(2)

      await page.locator('[data-bubble-id]').first().click()
      await page.keyboard.press('Delete')
      expect(await bubbleCount(page)).toBe(1)
      await expect(page.locator('[data-bubble-id]').first()).toContainText('子')
      await expect(page.locator('[data-bubble-id]').first()).toHaveClass(/is-root/)
    })

    test('视图切换不丢失气泡视图坐标', async () => {
      await createRootBubble(page, 'A')
      const bubble = page.locator('[data-bubble-id]').first()
      const before = await bubble.getAttribute('transform')

      await page.getByTitle('思维导图').click()
      await expect.poll(async () => bubble.getAttribute('transform')).not.toBe(before)

      await page.getByTitle('气泡视图').click()
      await expect.poll(async () => bubble.getAttribute('transform')).toBe(before)
    })

    test('撤销：新建气泡后 Ctrl+Z 回到空画布', async () => {
      await createRootBubble(page, '会被撤销')
      expect(await bubbleCount(page)).toBe(1)
      await page.keyboard.press('Control+z')
      expect(await bubbleCount(page)).toBe(0)
      await page.keyboard.press('Control+y')
      expect(await bubbleCount(page)).toBe(1)
    })

    test('右键菜单：空白菜单与气泡菜单内容不同', async () => {
      await openCanvasMenu(page)
      await expect(page.getByText('⇩ 导出为…')).toBeVisible()
      await expect(page.getByText('＋ 新建主气泡')).toBeVisible()
      await page.keyboard.press('Escape')

      await createRootBubble(page, 'X')
      await page.locator('[data-bubble-id]').first().click({ button: 'right', force: true })
      await page.locator('.sl-context-menu').first().waitFor({ state: 'visible' })
      await expect(page.getByText('⇢ 建立连接').first()).toBeVisible()
      await expect(page.getByText('删除此气泡（子级保留）')).toBeVisible()
    })
  })
})
