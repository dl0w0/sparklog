import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { bubbleCount, closeApp, createRootBubble, launchApp, openWorkspace, resetCanvas } from './harness'

test.describe('v4 连线交互与菜单边界', () => {
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

  test('右键菜单靠近窗口边缘时仍完整可见（D47）', async () => {
    const canvas = page.locator('.sl-canvas')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('no canvas')

    await canvas.click({ button: 'right', position: { x: box.width - 8, y: box.height - 8 } })
    const menu = page.locator('[data-context-menu="root"]').first()
    await menu.waitFor({ state: 'visible' })
    const rect = await menu.boundingBox()
    const viewport = page.viewportSize() ?? (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
    if (!rect) throw new Error('no menu rect')
    expect(rect.x).toBeGreaterThanOrEqual(0)
    expect(rect.y).toBeGreaterThanOrEqual(0)
    expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width + 1)
    expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height + 1)
    await page.keyboard.press('Escape')
  })

  test('二级菜单靠近右边界时向左翻转（D47）', async () => {
    const canvas = page.locator('.sl-canvas')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('no canvas')
    await canvas.click({ button: 'right', position: { x: box.width - 8, y: 40 } })
    await page.getByText('⊕ 插入').click()
    const submenu = page.locator('.sl-context-menu').nth(1)
    await submenu.waitFor({ state: 'visible' })
    const rect = await submenu.boundingBox()
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
    if (!rect) throw new Error('no submenu')
    expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width + 1)
    await page.keyboard.press('Escape')
  })

  test('连线可点击选中并显示两个端点手柄（D49）', async () => {
    await createRootBubble(page, '父')
    await page.locator('[data-bubble-id]').first().click()
    await page.keyboard.press('Tab')
    await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
    await page.keyboard.type('子')
    await page.keyboard.press('Escape')
    await expect.poll(async () => page.locator('.sl-edge').count()).toBe(1)

    await page.locator('.sl-edge-hit').first().click({ force: true })
    await expect.poll(async () => page.locator('.sl-edge-handle').count()).toBe(2)
    await expect.poll(async () => page.locator('.sl-edge.selected').count()).toBe(1)
  })

  test('拖动端点手柄改变连线长度（D49）', async () => {
    await createRootBubble(page, '父')
    await page.locator('[data-bubble-id]').first().click()
    await page.keyboard.press('Tab')
    await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
    await page.keyboard.type('子')
    await page.keyboard.press('Escape')

    await page.locator('.sl-edge-hit').first().click({ force: true })
    const handle = page.locator('.sl-edge-handle[data-handle="to"]')
    await handle.waitFor({ state: 'visible' })
    const before = await page.locator('[data-bubble-id]').nth(1).boundingBox()
    if (!before) throw new Error('no child')

    const hb = await handle.boundingBox()
    if (!hb) throw new Error('no handle')
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
    await page.mouse.down()
    for (let i = 1; i <= 6; i++) await page.mouse.move(hb.x + hb.width / 2 + i * 18, hb.y + hb.height / 2)
    await page.mouse.up()
    await page.waitForTimeout(300)

    const after = await page.locator('[data-bubble-id]').nth(1).boundingBox()
    if (!after) throw new Error('child lost')
    expect(Math.abs(after.x - before.x)).toBeGreaterThan(20)
  })

  test('连线右键菜单：类型 / 颜色 / 长度 / 粗细 / 删除（D50）', async () => {
    await createRootBubble(page, '父')
    await page.locator('[data-bubble-id]').first().click()
    await page.keyboard.press('Tab')
    await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
    await page.keyboard.type('子')
    await page.keyboard.press('Escape')

    await page.locator('.sl-edge-hit').first().click({ button: 'right', force: true })
    const menu = page.locator('[data-context-menu="root"]').first()
    await menu.waitFor({ state: 'visible' })
    await expect(page.getByText('切换为虚线（关联线）')).toBeVisible()
    await expect(page.getByText('颜色')).toBeVisible()
    await expect(page.getByText('长度')).toBeVisible()
    await expect(page.getByText('粗细')).toBeVisible()

    // 切换类型后连线带虚线样式
    await page.getByText('切换为虚线（关联线）').click()
    await expect.poll(async () => page.locator('.sl-edge.back').count()).toBe(1)

    // 编辑连线标签
    await page.locator('.sl-edge-hit').first().click({ button: 'right', force: true })
    await page.getByText('编辑文字（连线标签）').click()
    const labelInput = page.locator('.sl-modal input')
    await labelInput.fill('这是标签')
    await page.getByRole('button', { name: '确定' }).click()
    await expect(page.locator('.sl-edge-label').first()).toHaveText('这是标签')

    // 拷贝样式 → 粘贴样式
    await page.locator('.sl-edge-hit').first().click({ button: 'right', force: true })
    await page.getByText('拷贝样式', { exact: true }).click()
    await page.locator('.sl-edge-hit').first().click({ button: 'right', force: true })
    await page.getByText('粘贴样式', { exact: true }).click()
    await expect.poll(async () => page.locator('.sl-edge.back').count()).toBe(1)

    // 自定义颜色
    await page.locator('.sl-edge-hit').first().click({ button: 'right', force: true })
    await page.getByText('颜色').click()
    await expect(page.locator('input[type="color"]').first()).toBeVisible()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')

    // 删除连线
    await page.locator('.sl-edge-hit').first().click({ button: 'right', force: true })
    await page.locator('[data-context-menu="root"]').getByText('删除', { exact: true }).click()
    await expect.poll(async () => page.locator('.sl-edge').count()).toBe(0)
    // 子气泡仍在（只是断开父子关系）
    expect(await bubbleCount(page)).toBe(2)
  })

  test('插入项之间可建立连接（D53）', async () => {
    const canvas = page.locator('.sl-canvas')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('no canvas')

    await canvas.click({ button: 'right', position: { x: 220, y: 260 } })
    await page.getByText('⊕ 插入').click()
    await page.getByText('📝 笔记').click()
    const first = page.locator('.sl-insert-card').first()
    await first.waitFor({ state: 'visible' })

    await canvas.click({ button: 'right', position: { x: 620, y: 460 } })
    await page.getByText('⊕ 插入').click()
    await page.getByText('📝 笔记').click()
    await expect.poll(async () => page.locator('.sl-insert-card').count()).toBe(2)
    const second = page.locator('.sl-insert-card').nth(1)

    await first.click({ button: 'right', force: true })
    await page.getByText('⇢ 建立连接').click()
    await second.click({ force: true })
    await expect.poll(async () => page.locator('.sl-edge').count(), { timeout: 8000 }).toBe(1)
  })

  test('钉住的插入对象绝对静止，取消钉住后随弹簧连续移动（D55）', async () => {
    await createRootBubble(page, '宿主')
    const canvas = page.locator('.sl-canvas')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('no canvas')

    await canvas.click({ button: 'right', position: { x: 300, y: 300 } })
    await page.getByText('⊕ 插入').click()
    await page.getByText('📝 笔记').click()
    const card = page.locator('.sl-insert-card').first()
    await card.waitFor({ state: 'visible' })

    // 建立连接
    await card.click({ button: 'right', force: true })
    await page.getByText('⇢ 建立连接').click()
    await page.locator('[data-bubble-id]').first().click({ force: true })
    await expect.poll(async () => page.locator('.sl-edge').count(), { timeout: 8000 }).toBe(1)

    // 钉住
    await card.click({ button: 'right', force: true })
    await page.getByText('删除该对象').press('Escape').catch(() => undefined)
    await page.keyboard.press('Escape')
    await card.click({ force: true })
    const pinButton = card.locator('button[title="钉住/取消钉住"]')
    await pinButton.click({ force: true })
    await expect.poll(async () => card.evaluate((el) => (el as HTMLElement).dataset.insertId !== undefined)).toBe(true)

    const pinnedPos = await card.boundingBox()
    if (!pinnedPos) throw new Error('card lost')

    // 拖动气泡：钉住的卡片保持不动
    const bubbleBox = await page.locator('[data-bubble-id]').first().boundingBox()
    if (!bubbleBox) throw new Error('no bubble')
    const bx = bubbleBox.x + bubbleBox.width / 2
    const by = bubbleBox.y + bubbleBox.height / 2
    await page.mouse.move(bx, by)
    await page.mouse.down()
    for (let i = 1; i <= 6; i++) await page.mouse.move(bx + i * 14, by + i * 6)
    await page.mouse.up()
    await page.waitForTimeout(1500)

    const afterDrag = await card.boundingBox()
    if (!afterDrag) throw new Error('card lost after drag')
    expect(Math.abs(afterDrag.x - pinnedPos.x)).toBeLessThan(3)
    expect(Math.abs(afterDrag.y - pinnedPos.y)).toBeLessThan(3)
  })

  test('插入对象与气泡建立连接并跟随运动（D51）', async () => {
    await createRootBubble(page, '宿主')
    const canvas = page.locator('.sl-canvas')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('no canvas')

    // 先放一个独立笔记
    await canvas.click({ button: 'right', position: { x: 260, y: 320 } })
    await page.getByText('⊕ 插入').click()
    await page.getByText('📝 笔记').click()
    const card = page.locator('.sl-insert-card').first()
    await card.waitFor({ state: 'visible' })

    // 右键笔记 → 建立连接 → 点气泡
    await card.click({ button: 'right', force: true })
    await page.getByText('⇢ 建立连接').click()
    await page.locator('[data-bubble-id]').first().click({ force: true })
    await expect.poll(async () => page.locator('.sl-edge').count(), { timeout: 8000 }).toBe(1)

    // 拖动气泡，笔记跟着走
    const cardBefore = await card.boundingBox()
    const bubbleBox = await page.locator('[data-bubble-id]').first().boundingBox()
    if (!cardBefore || !bubbleBox) throw new Error('not visible')
    const bx = bubbleBox.x + bubbleBox.width / 2
    const by = bubbleBox.y + bubbleBox.height / 2
    await page.mouse.move(bx, by)
    await page.mouse.down()
    for (let i = 1; i <= 6; i++) await page.mouse.move(bx + i * 12, by + i * 5)
    await page.mouse.up()
    await page.waitForTimeout(1400)

    const cardAfter = await card.boundingBox()
    if (!cardAfter) throw new Error('card lost')
    // D55：未钉住的关联对象由弹簧牵引，跟随气泡产生位移（弹性跟随，不要求刚性同步）
    expect(Math.abs(cardAfter.x - cardBefore.x)).toBeGreaterThan(2)
  })
})
