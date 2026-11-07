import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { bubbleCount, closeApp, createRootBubble, launchApp, openWorkspace, resetCanvas } from './harness'

test.describe('v1.3 专区', () => {
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

  async function drawZone(): Promise<void> {
    const canvas = page.locator('.sl-canvas')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('no canvas')
    await page.keyboard.press('Control+Shift+g')
    await page.mouse.move(box.x + 120, box.y + 120)
    await page.mouse.down()
    await page.mouse.move(box.x + 520, box.y + 400, { steps: 8 })
    await page.mouse.up()
    await page.locator('[data-zone-id]').first().waitFor({ state: 'visible' })
  }

  test('创建专区并进行/退出', async () => {
    await drawZone()
    const card = page.locator('[data-zone-id]').first()
    await expect(card).toBeVisible()

    await card.dblclick()
    await expect(page.getByText('主画布', { exact: true })).toBeVisible()

    const box = await page.locator('.sl-canvas').boundingBox()
    if (!box) throw new Error('no canvas')
    await page.mouse.dblclick(box.x + 60, box.y + box.height - 60)
    await expect(page.getByText('主画布', { exact: true })).toHaveCount(0)
  })

  test('专区内创建的气泡只在该专区出现', async () => {
    await drawZone()
    await page.locator('[data-zone-id]').first().dblclick()
    await createRootBubble(page, '专区内想法')
    expect(await bubbleCount(page)).toBe(1)

    const box = await page.locator('.sl-canvas').boundingBox()
    if (!box) throw new Error('no canvas')
    await page.mouse.dblclick(box.x + 40, box.y + box.height - 40)
    await expect.poll(async () => bubbleCount(page)).toBe(0)
    await expect(page.locator('[data-zone-id]').first()).toContainText('1 个气泡')
  })

  test('专区可嵌套（面包屑出现两级）', async () => {
    await drawZone()
    await page.locator('[data-zone-id]').first().dblclick()
    await drawZone()
    await page.locator('[data-zone-id]').first().dblclick()
    await expect(page.getByText('主画布', { exact: true })).toBeVisible()
    // 面包屑里应有两个「新专区」层级
    await expect(page.getByText('新专区', { exact: true })).toHaveCount(2)
  })

  test('搜索能命中专区内气泡', async () => {
    await drawZone()
    await page.locator('[data-zone-id]').first().dblclick()
    await createRootBubble(page, '孤岛灵感')
    const box = await page.locator('.sl-canvas').boundingBox()
    if (!box) throw new Error('no canvas')
    await page.mouse.dblclick(box.x + 40, box.y + box.height - 40)

    await page.keyboard.press('Control+f')
    const input = page.locator('input[placeholder*="搜索气泡文字"]')
    await input.fill('孤岛')
    await expect(page.locator('.sl-menu-item', { hasText: '孤岛灵感' }).first()).toBeVisible()
    await expect(page.getByText('在专区').first()).toBeVisible()
  })
})
