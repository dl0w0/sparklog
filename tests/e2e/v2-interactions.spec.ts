import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { bubbleCount, closeApp, createRootBubble, launchApp, openWorkspace, resetCanvas } from './harness'

test.describe('v2 交互修订', () => {
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
    // 复位缩放，避免用例间互相影响
    await page.keyboard.press('Control+Shift+f')
  })

  test('空白处滚轮缩放画布（D22）', async () => {
    await createRootBubble(page, '缩放对象')
    const canvas = page.locator('.sl-canvas')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('no canvas')

    const scaleText = async (): Promise<string> => {
      const text = await page.locator('.sl-status').innerText()
      const match = text.match(/(\d+)%/)
      return match ? match[1] : ''
    }

    const before = await scaleText()
    await page.mouse.move(box.x + 60, box.y + 60)
    await page.mouse.wheel(0, -120)
    await expect.poll(scaleText, { timeout: 5000 }).not.toBe(before)
    const zoomedIn = Number(await scaleText())
    await page.mouse.wheel(0, 120)
    await expect.poll(async () => Number(await scaleText()), { timeout: 5000 }).toBeLessThan(zoomedIn)
  })

  test('父节点可折叠子节点（D27）', async () => {
    await createRootBubble(page, '父')
    await page.locator('[data-bubble-id]').first().click()
    await page.keyboard.press('Tab')
    await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
    await page.keyboard.type('子')
    await page.keyboard.press('Escape')
    await expect.poll(async () => bubbleCount(page)).toBe(2)

    const toggle = page.locator('.sl-collapse-toggle').first()
    await expect(toggle).toBeVisible()
    await toggle.click()
    await expect.poll(async () => bubbleCount(page)).toBe(1)
    await toggle.click()
    await expect.poll(async () => bubbleCount(page)).toBe(2)
  })

  test('任务支持多行（D28）', async () => {
    await createRootBubble(page, '任务宿主')
    await page.locator('[data-bubble-id]').first().click()
    await page.keyboard.press('Control+Alt+t')
    await page.locator('.sl-insert-badge').first().click()

    const rowsBefore = await page.locator('.sl-task-row').count()
    await page.getByRole('button', { name: '＋ 新建一行' }).click()
    await expect.poll(async () => page.locator('.sl-task-row').count()).toBe(rowsBefore + 1)

    const lastCheckbox = page.locator('.sl-task-row input[type="checkbox"]').last()
    await lastCheckbox.check()
    await expect(lastCheckbox).toBeChecked()
  })

  test('插入对象落在鼠标点击处（D29）', async () => {
    const canvas = page.locator('.sl-canvas')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('no canvas')
    const clickX = box.x + box.width - 220
    const clickY = box.y + 160

    await canvas.click({ button: 'right', position: { x: box.width - 220, y: 160 } })
    await page.getByText('⊕ 插入').click()
    await page.getByText('📝 笔记').click()

    const card = page.locator('.sl-insert-card').first()
    await card.waitFor({ state: 'visible' })
    const cardBox = await card.boundingBox()
    if (!cardBox) throw new Error('no card')
    expect(Math.abs(cardBox.x + cardBox.width / 2 - clickX)).toBeLessThan(90)
    expect(Math.abs(cardBox.y + cardBox.height / 2 - clickY)).toBeLessThan(90)
  })

  test('编辑气泡时不显示方框（D25）', async () => {
    await createRootBubble(page, '编辑态')
    await page.locator('[data-bubble-id]').first().dblclick()
    const editor = page.locator('.sl-inline-editor')
    await editor.waitFor({ state: 'visible' })
    const style = await editor.evaluate((el) => {
      const cs = getComputedStyle(el as HTMLElement)
      return { border: cs.borderTopWidth, shadow: cs.boxShadow, background: cs.backgroundColor }
    })
    expect(style.border).toBe('0px')
    expect(style.shadow).toBe('none')
    expect(style.background).toContain('rgba(0, 0, 0, 0)')
    await page.keyboard.press('Escape')
  })
})
