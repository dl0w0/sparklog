import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { bubbleCount, closeApp, launchApp, openWorkspace, resetCanvas } from './harness'

test.describe('v14 选择与连接快捷键语义', () => {
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

  const makeBubbles = async (count: number): Promise<void> => {
    await resetCanvas(page)
    const canvas = page.locator('.sl-canvas')
    for (let i = 0; i < count; i++) {
      await canvas.click({ button: 'right', position: { x: 220 + i * 220, y: 240 } })
      await page.getByText('＋ 新建主气泡').click()
      await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
      await page.keyboard.type(String.fromCharCode(65 + i))
      await page.keyboard.press('Escape')
    }
    await expect.poll(async () => bubbleCount(page)).toBe(count)
  }

  test('Ctrl+点击 加选/减选（D95）', async () => {
    await makeBubbles(2)
    const first = page.locator('[data-bubble-id]').first()
    const second = page.locator('[data-bubble-id]').nth(1)

    await first.click({ force: true })
    await second.click({ force: true, modifiers: ['Control'] })
    await expect(page.getByText(/已选中 2 个/)).toBeVisible()

    // 再 Ctrl+点击 取消其中一个
    await second.click({ force: true, modifiers: ['Control'] })
    await expect(page.getByText(/已选中 2 个/)).toHaveCount(0)
  })

  test('Ctrl+Alt+点击 连续两个节点建立连接（D95）', async () => {
    await makeBubbles(2)
    const first = page.locator('[data-bubble-id]').first()
    const second = page.locator('[data-bubble-id]').nth(1)

    expect(await page.locator('.sl-edge').count()).toBe(0)
    await first.click({ force: true, modifiers: ['Control', 'Alt'] })
    await second.click({ force: true, modifiers: ['Control', 'Alt'] })
    await expect.poll(async () => page.locator('.sl-edge').count(), { timeout: 6000 }).toBe(1)

    // 只是点两下，不应改变多选（不会出现批量条）
    await expect(page.getByText(/已选中 2 个/)).toHaveCount(0)
  })

  test('Ctrl+点击 不再触发建立连接（D95）', async () => {
    await makeBubbles(2)
    const first = page.locator('[data-bubble-id]').first()
    const second = page.locator('[data-bubble-id]').nth(1)

    await first.click({ force: true, modifiers: ['Control'] })
    await second.click({ force: true, modifiers: ['Control'] })
    await page.waitForTimeout(400)
    expect(await page.locator('.sl-edge').count()).toBe(0)
  })

  test('右键「建立连接」入口仍可用（D95 三种入口之一）', async () => {
    await makeBubbles(2)
    const first = page.locator('[data-bubble-id]').first()
    const second = page.locator('[data-bubble-id]').nth(1)

    await first.click({ button: 'right', force: true })
    await page.getByText('⇢ 建立连接').click()
    await second.click({ force: true })
    await expect.poll(async () => page.locator('.sl-edge').count(), { timeout: 6000 }).toBe(1)
  })
})
