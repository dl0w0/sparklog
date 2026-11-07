import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { bubbleCount, closeApp, launchApp, openWorkspace, resetCanvas } from './harness'

test.describe('v7 字体栏 / 文字菜单 / tooltip', () => {
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

  async function makeBubble(text: string): Promise<void> {
    const canvas = page.locator('.sl-canvas')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('no canvas')
    await canvas.click({ button: 'right', position: { x: 260, y: 220 } })
    await page.getByText('＋ 新建主气泡').click()
    await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
    await page.keyboard.type(text)
    await page.keyboard.press('Escape')
  }

  test('字体区：悬停展开、移开收起、点击锁定（D70）', async () => {
    await makeBubble('锁')
    const host = page.locator('.sl-formula-font')
    const pop = page.locator('.sl-font-pop')

    await host.hover()
    await expect(pop).toBeVisible()
    await page.mouse.move(900, 700)
    await expect(pop).toHaveCount(0)

    // 点击标题锁定
    await host.hover()
    await page.locator('.sl-formula-font-title').click()
    await expect(page.locator('.sl-formula-font-title')).toHaveAttribute('data-locked', 'true')
    await page.mouse.move(900, 700)
    await expect(pop).toBeVisible()

    // 再次点击解除锁定 → 移开收起
    await page.locator('.sl-formula-font-title').click()
    await expect(page.locator('.sl-formula-font-title')).toHaveAttribute('data-locked', 'false')
    await page.mouse.move(900, 700)
    await expect(pop).toHaveCount(0)
  })

  test('字号三种改法都即时生效并落盘（D71）', async () => {
    await makeBubble('字号')
    await page.locator('[data-bubble-id]').first().click({ force: true })

    const host = page.locator('.sl-formula-font')
    await host.hover()
    const title = page.locator('.sl-formula-font-title')
    if ((await title.getAttribute('data-locked')) !== 'true') await title.click()

    const sizeInput = page.locator('.sl-size-input')
    const bubbleText = page.locator('.sl-bubble-text').first()

    // ① 滚轮
    await sizeInput.hover()
    await page.mouse.wheel(0, -120)
    await expect
      .poll(async () => parseFloat(await bubbleText.evaluate((el) => getComputedStyle(el).fontSize)))
      .toBeGreaterThan(14)

    // ② 手动输入
    await sizeInput.fill('22')
    await expect
      .poll(async () => parseFloat(await bubbleText.evaluate((el) => getComputedStyle(el).fontSize)))
      .toBe(22)

    // ③ 下拉选择预设
    await page.locator('.sl-size-caret').click()
    await page.locator('.sl-size-menu').getByText('16', { exact: true }).click()
    await expect
      .poll(async () => parseFloat(await bubbleText.evaluate((el) => getComputedStyle(el).fontSize)))
      .toBe(16)

    // 落盘：取消选中再选中，字号仍是 16
    await page.mouse.click(900, 700)
    await page.locator('[data-bubble-id]').first().click({ force: true })
    await expect
      .poll(async () => parseFloat(await bubbleText.evaluate((el) => getComputedStyle(el).fontSize)))
      .toBe(16)
  })

  test('内联编辑选中文字右键弹格式菜单，与画布菜单互不干扰（D72）', async () => {
    await makeBubble('一段文字')
    const bubble = page.locator('[data-bubble-id]').first()
    await bubble.dblclick()
    const editor = page.locator('.sl-inline-editor textarea')
    await editor.waitFor({ state: 'visible' })
    await page.keyboard.press('Control+a')

    await editor.click({ button: 'right', position: { x: 12, y: 10 } })
    const menu = page.locator('[data-context-menu="root"]').first()
    await expect(menu).toBeVisible()
    await expect(page.getByText('加粗', { exact: true })).toBeVisible()
    await expect(page.getByText('高亮', { exact: true })).toBeVisible()
    // 不是画布菜单
    await expect(page.getByText('＋ 新建主气泡')).toHaveCount(0)

    await page.getByText('加粗', { exact: true }).click()
    await page.keyboard.press('Escape')
    await expect
      .poll(async () =>
        parseFloat(await page.locator('.sl-bubble-text').first().evaluate((el) => getComputedStyle(el).fontWeight))
      )
      .toBeGreaterThanOrEqual(600)
  })

  test('字号不随 importance / 画布缩放变化（D74）', async () => {
    await makeBubble('字号不变')
    const bubble = page.locator('[data-bubble-id]').first()
    const bubbleText = page.locator('.sl-bubble-text').first()
    await bubble.click({ force: true })

    const readSize = async (): Promise<number> =>
      parseFloat(await bubbleText.evaluate((el) => getComputedStyle(el).fontSize))
    const readRadius = async (): Promise<number> =>
      parseFloat(
        await page
          .locator('[data-bubble-id] circle.bubble-fill, [data-bubble-id] ellipse.bubble-fill')
          .first()
          .evaluate((el) => (el as SVGCircleElement).getAttribute('r') ?? (el as SVGEllipseElement).getAttribute('rx') ?? '0')
      )

    const sizeBefore = await readSize()
    const radiusBefore = await readRadius()

    // 滚轮改重要程度（半径变化）
    await bubble.hover()
    await page.mouse.wheel(0, -240)
    await page.waitForTimeout(400)
    const radiusAfter = await readRadius()
    expect(radiusAfter).toBeGreaterThan(radiusBefore)
    expect(await readSize()).toBe(sizeBefore)

    // 缩放画布（Ctrl+滚轮或按钮）
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -240)
    await page.keyboard.up('Control')
    await page.waitForTimeout(300)
    expect(await readSize()).toBe(sizeBefore)
  })

  test('气泡文字有固定内边距，悬停显示完整文字 tooltip（D73）', async () => {
    await makeBubble('这是一段很长很长很长很长很长很长很长很长的文字用来触发截断显示')
    // 文字区 = 内接矩形，四角离圆弧仍有内边距（D73/D75）
    const geom = await page.evaluate(() => {
      const g = document.querySelector('[data-bubble-id]')!
      const fo = g.querySelector('foreignObject')!
      const circle = g.querySelector('circle.bubble-fill, circle')!
      const r = Number(circle.getAttribute('r') ?? 0)
      return {
        r,
        w: Number(fo.getAttribute('width') ?? 0),
        h: Number(fo.getAttribute('height') ?? 0)
      }
    })
    // 文字区比气泡直径窄，且四角仍在圆内
    expect(geom.w).toBeLessThan(geom.r * 2 - 12)
    expect(Math.hypot(geom.w / 2, geom.h / 2)).toBeLessThanOrEqual(geom.r)

    const bubble = page.locator('[data-bubble-id]').first()
    const tip = page.locator('.sl-bubble-tooltip')
    // 普通悬停不出现（D80）
    await bubble.hover()
    await page.waitForTimeout(200)
    await expect(tip).toHaveCount(0)
    // 长按后才出现
    await page.waitForTimeout(1100)
    await expect(tip).toBeVisible()
    await expect(tip).toContainText('很长')
    await page.mouse.move(900, 700)
    await expect(tip).toHaveCount(0)
  })
})
