import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { bubbleCount, closeApp, createRootBubble, launchApp, openWorkspace, resetCanvas } from './harness'

test.describe('v5 画布整体行为', () => {
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
    await page.keyboard.press('Control+Shift+f')
  })

  async function insertNoteAt(x: number, y: number): Promise<void> {
    const canvas = page.locator('.sl-canvas')
    await canvas.click({ button: 'right', position: { x, y } })
    await page.getByText('⊕ 插入').click()
    await page.getByText('📝 笔记').click()
    await page.locator('.sl-insert-card').first().waitFor({ state: 'visible' })
  }

  test('适应画布把插入对象也纳入视野（D56）', async () => {
    await createRootBubble(page, '气泡')
    const canvas = page.locator('.sl-canvas')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('no canvas')
    // 在画布左下角放一个笔记
    await insertNoteAt(120, box.height - 120)

    // 把视口平移到很远处，再用适应画布拉回来
    await page.mouse.move(box.x + 400, box.y + 300)
    await page.mouse.down()
    await page.mouse.move(box.x + 120, box.y + 80)
    await page.mouse.up()
    await page.keyboard.press('Control+Shift+f')

    const card = page.locator('.sl-insert-card').first()
    await expect(card).toBeVisible()
    const cardBox = await card.boundingBox()
    const canvasBox = await canvas.boundingBox()
    if (!cardBox || !canvasBox) throw new Error('missing box')
    expect(cardBox.x).toBeGreaterThanOrEqual(canvasBox.x - 4)
    expect(cardBox.y).toBeGreaterThanOrEqual(canvasBox.y - 4)
    expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(canvasBox.x + canvasBox.width + 4)
    expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(canvasBox.y + canvasBox.height + 4)
  })

  test('专区卡片渲染真实内容缩略图（D57）', async () => {
    const canvas = page.locator('.sl-canvas')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('no canvas')
    await page.keyboard.press('Control+Shift+g')
    await page.mouse.move(box.x + 120, box.y + 120)
    await page.mouse.down()
    await page.mouse.move(box.x + 520, box.y + 400, { steps: 8 })
    await page.mouse.up()
    const card = page.locator('[data-zone-id]').first()
    await card.waitFor({ state: 'visible' })
    // 空专区显示占位
    await expect(card.getByText('空专区')).toBeVisible()

    await card.dblclick()
    await createRootBubble(page, '专区内气泡')
    await page.mouse.dblclick(box.x + 40, box.y + box.height - 40)

    await card.waitFor({ state: 'visible' })
    // 缩略图：至少一个圆
    await expect.poll(async () => card.locator('svg circle').count()).toBeGreaterThan(0)
  })

  test('「选择」是内联二级菜单，不弹独立窗口（D58）', async () => {
    await createRootBubble(page, '父')
    await page.locator('[data-bubble-id]').first().click()
    await page.keyboard.press('Tab')
    await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
    await page.keyboard.type('子')
    await page.keyboard.press('Escape')

    await page.locator('[data-bubble-id]').first().click({ button: 'right', force: true })
    const root = page.locator('[data-context-menu="root"]').first()
    await root.waitFor({ state: 'visible' })
    await page.getByText('☑ 选择').hover()
    await expect(page.getByText(/所有并列气泡/)).toBeVisible()
    await expect(page.getByText(/所有子气泡（/)).toBeVisible()
    // 没有独立模态
    expect(await page.locator('.sl-modal-mask').count()).toBe(0)

    // 点击即生效
    await page.getByText(/所有子气泡（/).click()
    await expect(page.getByText(/已选中/)).toBeVisible()
  })

  test('视图切换做连续插值，切回平滑恢复（D59）', async () => {
    await createRootBubble(page, 'A')
    await page.locator('[data-bubble-id]').first().click()
    await page.keyboard.press('Tab')
    await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
    await page.keyboard.type('B')
    await page.keyboard.press('Escape')
    const bubble = page.locator('[data-bubble-id]').nth(1)
    const t0 = await bubble.getAttribute('transform')

    await page.evaluate(() => {
      ;(window as unknown as { __slAnimLog: string[] }).__slAnimLog = []
    })
    await page.getByTitle('思维导图').click()
    await page.waitForTimeout(700)

    const progress = await page.evaluate(
      () => (window as unknown as { __slAnimLog: string[] }).__slAnimLog
    )
    // 插值连续：多帧不同的进度值，首帧 0、末帧 1
    expect(progress.length).toBeGreaterThan(4)
    expect(new Set(progress).size).toBeGreaterThan(3)
    expect(progress[0]).toBe('0.000')
    expect(Number(progress[progress.length - 1])).toBeCloseTo(1, 2)

    const tEnd = await bubble.getAttribute('transform')
    expect(tEnd).not.toBe(t0)

    await page.getByTitle('气泡视图').click()
    await page.waitForTimeout(600)
    expect(await bubble.getAttribute('transform')).toBe(t0)
  })

  test('钉住插入项的连线不产生拉力（D60）', async () => {
    await createRootBubble(page, '宿主')
    const canvas = page.locator('.sl-canvas')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('no canvas')
    await insertNoteAt(200, 240)

    const card = page.locator('.sl-insert-card').first()
    await card.click({ button: 'right', force: true })
    await page.getByText('⇢ 建立连接').click()
    await page.locator('[data-bubble-id]').first().click({ force: true })
    await expect.poll(async () => page.locator('.sl-edge').count(), { timeout: 8000 }).toBe(1)

    // 钉住
    await card.click({ force: true })
    await card.locator('button[title="钉住/取消钉住"]').click({ force: true })
    const pinnedBefore = await card.boundingBox()

    // 拖气泡：钉住的卡片不动，连线仍在
    const bubbleBox = await page.locator('[data-bubble-id]').first().boundingBox()
    if (!bubbleBox || !pinnedBefore) throw new Error('missing')
    const bx = bubbleBox.x + bubbleBox.width / 2
    const by = bubbleBox.y + bubbleBox.height / 2
    await page.mouse.move(bx, by)
    await page.mouse.down()
    for (let i = 1; i <= 6; i++) await page.mouse.move(bx + i * 16, by + i * 7)
    await page.mouse.up()
    await page.waitForTimeout(1600)

    const pinnedAfter = await card.boundingBox()
    if (!pinnedAfter) throw new Error('card lost')
    expect(Math.abs(pinnedAfter.x - pinnedBefore.x)).toBeLessThan(3)
    expect(Math.abs(pinnedAfter.y - pinnedBefore.y)).toBeLessThan(3)
    expect(await page.locator('.sl-edge').count()).toBe(1)
    expect(await bubbleCount(page)).toBe(1)
  })
})
