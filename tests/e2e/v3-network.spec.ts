import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { bubbleCount, closeApp, createRootBubble, launchApp, openWorkspace, resetCanvas } from './harness'

test.describe('v3 网络跟随与连接', () => {
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

  async function transformOf(index: number): Promise<string | null> {
    return page.locator('[data-bubble-id]').nth(index).getAttribute('transform')
  }

  async function dragBy(index: number, dx: number, dy: number): Promise<void> {
    const box = await page.locator('[data-bubble-id]').nth(index).boundingBox()
    if (!box) throw new Error('bubble not visible')
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y + (dy * i) / 8)
    await page.mouse.up()
    // 等待惯性衰减完成（提交位置后 transform 稳定）
    await page.waitForTimeout(1400)
  }

  test('拖动子气泡时父气泡也随之移动（D34）', async () => {
    await createRootBubble(page, '父')
    await page.locator('[data-bubble-id]').first().click()
    await page.keyboard.press('Tab')
    await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
    await page.keyboard.type('子')
    await page.keyboard.press('Escape')
    await expect.poll(async () => bubbleCount(page)).toBe(2)

    // 索引 0 是父（先创建），1 是子
    const parentBefore = await transformOf(0)
    await dragBy(1, 120, 60)
    const parentAfter = await transformOf(0)
    expect(parentAfter).not.toBe(parentBefore)
    // 连线仍在
    expect(await page.locator('.sl-edge').count()).toBe(1)
  })

  test('Ctrl 连续点击两个气泡建立连接（D40 / D35）', async () => {
    await createRootBubble(page, '甲')
    await createRootBubble(page, '乙')
    await expect.poll(async () => bubbleCount(page)).toBe(2)
    expect(await page.locator('.sl-edge').count()).toBe(0)

    // 第一下：作为子；第二下：作为父
    // D95：建立连接改为 Ctrl+Alt+点击
    await page.locator('[data-bubble-id]').first().click({ modifiers: ['Control', 'Alt'] })
    await page.locator('[data-bubble-id]').nth(1).click({ modifiers: ['Control', 'Alt'] })

    await expect.poll(async () => page.locator('.sl-edge').count(), { timeout: 8000 }).toBe(1)
  })

  test('折叠按钮锚定气泡，随拖拽一起移动（D37）', async () => {
    await createRootBubble(page, '父')
    await page.locator('[data-bubble-id]').first().click()
    await page.keyboard.press('Tab')
    await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
    await page.keyboard.type('子')
    await page.keyboard.press('Escape')
    await expect.poll(async () => bubbleCount(page)).toBe(2)

    const toggle = page.locator('.sl-collapse-toggle').first()
    const before = await toggle.boundingBox()
    if (!before) throw new Error('no toggle')
    await dragBy(0, 140, 80)
    const after = await toggle.boundingBox()
    if (!after) throw new Error('toggle lost')
    expect(Math.abs(after.x - before.x)).toBeGreaterThan(60)
    expect(Math.abs(after.y - before.y)).toBeGreaterThan(30)
  })

  test('Ctrl 拖拽：父级不动，只改这条连线长度（D38）', async () => {
    await createRootBubble(page, '父')
    await page.locator('[data-bubble-id]').first().click()
    await page.keyboard.press('Tab')
    await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
    await page.keyboard.type('子')
    await page.keyboard.press('Escape')
    await expect.poll(async () => bubbleCount(page)).toBe(2)

    const parentBefore = await transformOf(0)
    const childBefore = await transformOf(1)
    const box = await page.locator('[data-bubble-id]').nth(1).boundingBox()
    if (!box) throw new Error('child not visible')
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.keyboard.down('Control')
    await page.mouse.down()
    for (let i = 1; i <= 6; i++) await page.mouse.move(x + i * 30, y)
    await page.mouse.up()
    await page.keyboard.up('Control')
    await page.waitForTimeout(1500)

    expect(await transformOf(0)).toBe(parentBefore)
    expect(await transformOf(1)).not.toBe(childBefore)
  })

  test('拖动插入对象 1:1 跟手，不受缩放影响（D39）', async () => {
    await createRootBubble(page, '占位')
    const canvas = page.locator('.sl-canvas')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('no canvas')

    // 先缩小画布，验证 1:1 与缩放无关
    await page.mouse.move(box.x + 60, box.y + 60)
    await page.mouse.wheel(0, 120)
    await page.mouse.wheel(0, 120)

    await canvas.click({ button: 'right', position: { x: 200, y: 300 } })
    await page.getByText('⊕ 插入').click()
    await page.getByText('📝 笔记').click()
    const card = page.locator('.sl-insert-card').first()
    await card.waitFor({ state: 'visible' })
    const before = await card.boundingBox()
    if (!before) throw new Error('no card')

    const sx = before.x + before.width / 2
    const sy = before.y + before.height / 2
    await page.mouse.move(sx + 10, sy + 10)
    await page.mouse.down()
    for (let i = 1; i <= 6; i++) await page.mouse.move(sx + 10 + i * 10, sy + 10 + i * 5)
    await page.mouse.up()

    const after = await card.boundingBox()
    if (!after) throw new Error('card lost')
    expect(Math.abs(after.x - before.x - 60)).toBeLessThan(12)
    expect(Math.abs(after.y - before.y - 30)).toBeLessThan(12)
  })

  test('插入对象随画布缩放同步变化（D32）', async () => {
    const canvas = page.locator('.sl-canvas')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('no canvas')
    await canvas.click({ button: 'right', position: { x: 120, y: 120 } })
    await page.getByText('⊕ 插入').click()
    await page.getByText('📝 笔记').click()

    const card = page.locator('.sl-insert-card').first()
    await card.waitFor({ state: 'visible' })
    const before = await card.boundingBox()
    if (!before) throw new Error('no card')

    await page.mouse.move(box.x + 40, box.y + 40)
    await page.mouse.wheel(0, 120)
    await page.mouse.wheel(0, 120)
    await expect.poll(async () => (await card.boundingBox())?.width ?? 0, { timeout: 5000 }).toBeLessThan(
      before.width
    )
  })

  test('右键「建立连接」再点目标气泡（D40）', async () => {
    await createRootBubble(page, '甲')
    await createRootBubble(page, '乙')
    await expect.poll(async () => bubbleCount(page)).toBe(2)

    await page.locator('[data-bubble-id]').first().click({ button: 'right', force: true })
    await page.getByText('⇢ 建立连接').click()
    await page.locator('[data-bubble-id]').nth(1).click()
    await expect.poll(async () => page.locator('.sl-edge').count(), { timeout: 8000 }).toBe(1)
  })

  test('附着对象随宿主气泡拖动保持相对位置（D41）', async () => {
    await createRootBubble(page, '宿主')
    await page.locator('[data-bubble-id]').first().click()
    await page.keyboard.press('Control+Alt+n')
    const badge = page.locator('.sl-insert-badge').first()
    await badge.waitFor({ state: 'visible' })

    const bubbleBefore = await page.locator('[data-bubble-id]').first().boundingBox()
    const badgeBefore = await badge.boundingBox()
    if (!bubbleBefore || !badgeBefore) throw new Error('not visible')
    const relBefore = {
      x: badgeBefore.x - bubbleBefore.x,
      y: badgeBefore.y - bubbleBefore.y
    }

    await dragBy(0, 120, 70)
    // 惯性滑行结束后再采样：轮询相对位置是否稳定
    await expect
      .poll(
        async () => {
          const bubbleAfter = await page.locator('[data-bubble-id]').first().boundingBox()
          const badgeAfter = await badge.boundingBox()
          if (!bubbleAfter || !badgeAfter) return 999
          return (
            Math.abs(badgeAfter.x - bubbleAfter.x - relBefore.x) +
            Math.abs(badgeAfter.y - bubbleAfter.y - relBefore.y)
          )
        },
        { timeout: 10000 }
      )
      .toBeLessThan(8)
  })

  test('编辑时不渲染原文字层，避免重影（D43）', async () => {
    await createRootBubble(page, '原文内容')
    await page.locator('[data-bubble-id]').first().dblclick()
    await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
    expect(await page.locator('[data-bubble-id] foreignObject').count()).toBe(0)
    expect(await page.locator('.sl-bubble-text').count()).toBe(0)
    await page.keyboard.press('Escape')
    await expect.poll(async () => page.locator('.sl-bubble-text').count()).toBe(1)
  })

  test('气泡内编辑 Enter 换行而不是新建同级（D31）', async () => {
    await createRootBubble(page, '第一行')
    await page.locator('[data-bubble-id]').first().dblclick()
    const textarea = page.locator('.sl-inline-editor textarea')
    await textarea.waitFor({ state: 'visible' })
    await page.keyboard.press('End')
    await page.keyboard.type('内容')
    await page.keyboard.press('Enter')
    await page.keyboard.type('第二行')
    // 仍在编辑态，且没有新建气泡
    await expect(textarea).toBeVisible()
    expect(await bubbleCount(page)).toBe(1)
    await page.keyboard.press('Escape')
    await expect
      .poll(async () => (await page.locator('[data-bubble-id]').first().textContent())?.includes('第二行') ?? false)
      .toBe(true)
  })
})
