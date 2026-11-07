import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { bubbleCount, closeApp, createRootBubble, launchApp, openWorkspace, resetCanvas } from './harness'

test.describe('v1.1 编辑增强', () => {
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

  test('复制粘贴：Ctrl+C / Ctrl+V 产生副本', async () => {
    await createRootBubble(page, '原始')
    await page.locator('[data-bubble-id]').first().click()
    await page.keyboard.press('Control+c')
    await page.keyboard.press('Control+v')
    await expect.poll(async () => bubbleCount(page)).toBe(2)
  })

  test('剪切：Ctrl+X 后画布清空', async () => {
    await createRootBubble(page, '要被剪走')
    await page.locator('[data-bubble-id]').first().click()
    await page.keyboard.press('Control+x')
    await expect.poll(async () => bubbleCount(page)).toBe(0)
  })

  test('多选后出现批量操作条，可批量删除', async () => {
    await createRootBubble(page, 'A')
    await createRootBubble(page, 'B')
    await createRootBubble(page, 'C')
    expect(await bubbleCount(page)).toBe(3)

    await page.locator('[data-bubble-id]').nth(0).click()
    await page.locator('[data-bubble-id]').nth(1).click({ modifiers: ['Shift'] })
    await expect(page.getByText(/已选中 2 个/)).toBeVisible()

    await page.getByRole('button', { name: '删除' }).click()
    await expect.poll(async () => bubbleCount(page)).toBe(1)
  })

  test('仅显示该分支：F 隔离与退出', async () => {
    await createRootBubble(page, '分支一')
    await createRootBubble(page, '分支二')
    expect(await bubbleCount(page)).toBe(2)

    await page.locator('[data-bubble-id]').first().click()
    await page.keyboard.press('f')
    await expect.poll(async () => bubbleCount(page)).toBe(1)
    await page.keyboard.press('f')
    await expect.poll(async () => bubbleCount(page)).toBe(2)
  })

  test('搜索：输入关键词并跳转到结果', async () => {
    await createRootBubble(page, '苹果')
    await createRootBubble(page, '香蕉')

    await page.keyboard.press('Control+f')
    const input = page.locator('input[placeholder*="搜索气泡文字"]')
    await input.waitFor({ state: 'visible' })
    await input.fill('香蕉')
    await expect(page.locator('.sl-menu-item', { hasText: '香蕉' }).first()).toBeVisible()
    await input.press('Enter')
    await expect(input).toBeHidden()
  })
})
