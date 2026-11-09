import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { bubbleCount, closeApp, launchApp, openWorkspace, resetCanvas } from './harness'

test.describe('v15 Ctrl 拖拽只锁定父连线', () => {
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

  /** 每条连线两端气泡的中心距（按 data-edge-from/to 匹配） */
  const edgeInfo = async (): Promise<{ from: string; to: string; length: number }[]> =>
    page.evaluate(() => {
      const centers = new Map<string, { x: number; y: number }>()
      document.querySelectorAll('[data-bubble-id]').forEach((el) => {
        const rect = el.getBoundingClientRect()
        centers.set(el.getAttribute('data-bubble-id') ?? '', {
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2
        })
      })
      return Array.from(document.querySelectorAll('.sl-edge')).map((el) => {
        const from = el.getAttribute('data-edge-from') ?? ''
        const to = el.getAttribute('data-edge-to') ?? ''
        const a = centers.get(from)
        const b = centers.get(to)
        return { from, to, length: a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0 }
      })
    })

  test('Ctrl 拖拽子气泡：只改它到父级那条连线，孙级连线不变（D96）', async () => {
    await resetCanvas(page)
    const canvas = page.locator('.sl-canvas')

    // A（父）
    await canvas.click({ button: 'right', position: { x: 260, y: 300 } })
    await page.getByText('＋ 新建主气泡').click()
    await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
    await page.keyboard.type('A')
    await page.keyboard.press('Escape')

    // B（A 的子）
    await page.locator('[data-bubble-id]').first().click()
    await page.keyboard.press('Tab')
    await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
    await page.keyboard.type('B')
    await page.keyboard.press('Escape')

    // C（B 的子）
    await page.locator('[data-bubble-id]').nth(1).click()
    await page.keyboard.press('Tab')
    await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
    await page.keyboard.type('C')
    await page.keyboard.press('Escape')
    await expect.poll(async () => bubbleCount(page)).toBe(3)
    await expect.poll(async () => page.locator('.sl-edge').count()).toBe(2)

    const bId = (await page.locator('[data-bubble-id]').nth(1).getAttribute('data-bubble-id')) ?? ''
    const before = await edgeInfo()
    // B 的父连线：A -> B；B 的子连线：B -> C
    const parentBefore = before.find((edge) => edge.to === bId)!
    const childBefore = before.find((edge) => edge.from === bId)!
    expect(parentBefore).toBeTruthy()
    expect(childBefore).toBeTruthy()

    const aBefore = await page.locator('[data-bubble-id]').first().boundingBox()

    // Ctrl 拖拽 B
    const bBox = await page.locator('[data-bubble-id]').nth(1).boundingBox()
    if (!bBox) throw new Error('no B')
    const bx = bBox.x + bBox.width / 2
    const by = bBox.y + bBox.height / 2
    await page.keyboard.down('Control')
    await page.mouse.move(bx, by)
    await page.mouse.down()
    for (let i = 1; i <= 8; i++) await page.mouse.move(bx + i * 16, by + i * 6)
    await page.mouse.up()
    await page.keyboard.up('Control')
    await page.waitForTimeout(1200)

    const after = await edgeInfo()
    const parentAfter = after.find((edge) => edge.to === bId)!
    const childAfter = after.find((edge) => edge.from === bId)!
    const aAfter = await page.locator('[data-bubble-id]').first().boundingBox()

    // 父气泡被固定，位置基本不变
    expect(Math.abs((aAfter?.x ?? 0) - (aBefore?.x ?? 0))).toBeLessThan(14)

    const parentDelta = Math.abs(parentAfter.length - parentBefore.length)
    const childDelta = Math.abs(childAfter.length - childBefore.length)
    // 到父级的那条连线被拉长
    expect(parentDelta).toBeGreaterThan(20)
    // 子级连线长度基本保持不变（按默认弹簧跟随，不被锁定拉伸）
    // 子级连线按默认弹簧收敛，不会被拉成和父级一样长
    expect(childDelta).toBeLessThan(parentDelta * 0.75)
  })
})
