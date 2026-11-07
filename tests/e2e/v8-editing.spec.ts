import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { closeApp, launchApp, openWorkspace, resetCanvas } from './harness'

const LONG = '这是一段会换行的长文字，用来检查编辑态与展示态的排版是否完全一致，包含中英文混排 mixed text 与标点符号。'

test.describe('v8 编辑态排版一致 / 全文文本框可编辑', () => {
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
    await canvas.click({ button: 'right', position: { x: 300, y: 260 } })
    await page.getByText('＋ 新建主气泡').click()
    await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
    await page.keyboard.type(text)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(120)
  }

  test('双击进入编辑时字号/行距/对齐/盒子与展示态一致（D76）', async () => {
    await makeBubble(LONG)

    const display = await page.locator('.sl-bubble-text').first().evaluate((el) => {
      const cs = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      return {
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
        textAlign: cs.textAlign,
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100
      }
    })

    await page.locator('[data-bubble-id]').first().dblclick()
    const editorBox = page.locator('.sl-inline-editor textarea')
    await editorBox.waitFor({ state: 'visible' })

    const editor = await editorBox.evaluate((el) => {
      const cs = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      return {
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
        textAlign: cs.textAlign,
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100
      }
    })
    expect(editor.fontSize).toBe(display.fontSize)
    expect(editor.lineHeight).toBe(display.lineHeight)
    expect(editor.textAlign).toBe(display.textAlign)
    expect(Math.abs(editor.width - display.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(editor.height - display.height)).toBeLessThanOrEqual(1)
    await page.keyboard.press('Escape')
  })

  test('全文文本框可直接编辑并实时同步（D77）', async () => {
    await makeBubble(LONG)
    const bubble = page.locator('[data-bubble-id]').first()
    await bubble.hover()
    await page.waitForTimeout(800)

    const tip = page.locator('.sl-bubble-tooltip')
    await expect(tip).toBeVisible()
    await tip.click()

    const tipInput = page.locator('.sl-tip-text')
    await expect(tipInput).toBeVisible()

    await tipInput.fill('文本框改的文字')
    await expect
      .poll(async () => (await page.locator('[data-bubble-id]').first().textContent()) ?? '')
      .toContain('文本框改的文字')

    // 失焦提交并关闭
    await page.mouse.click(900, 700)
    await expect(page.locator('.sl-tip-text')).toHaveCount(0)
    await expect(page.locator('.sl-bubble-text').first()).toHaveText('文本框改的文字')
  })

  test('文本框编辑态字号/字体/颜色与尺寸不变（D78）', async () => {
    await makeBubble(LONG)
    const bubble = page.locator('[data-bubble-id]').first()
    await bubble.hover()
    await page.waitForTimeout(800)

    const tip = page.locator('.sl-bubble-tooltip')
    await expect(tip).toBeVisible()
    const before = await tip.evaluate((el) => {
      const cs = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      return {
        fontSize: cs.fontSize,
        fontFamily: cs.fontFamily,
        color: cs.color,
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    })

    await tip.click()
    const tipInput = page.locator('.sl-tip-text')
    await expect(tipInput).toBeVisible()
    const during = await tipInput.evaluate((el) => {
      const cs = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      return {
        fontSize: cs.fontSize,
        fontFamily: cs.fontFamily,
        color: cs.color,
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    })

    expect(during.fontSize).toBe(before.fontSize)
    expect(during.fontFamily).toBe(before.fontFamily)
    expect(during.color).toBe(before.color)

    // 文本框自身尺寸在进入编辑前后保持不变
    const boxDuring = await page.locator('.sl-bubble-tooltip').evaluate((el) => {
      const rect = el.getBoundingClientRect()
      return { width: Math.round(rect.width), height: Math.round(rect.height) }
    })
    expect(boxDuring.width).toBe(before.width)
    expect(boxDuring.height).toBe(before.height)

    // 输入长内容也不缩放
    await tipInput.fill('很长的内容'.repeat(30))
    const boxAfter = await page.locator('.sl-bubble-tooltip').evaluate((el) => {
      const rect = el.getBoundingClientRect()
      return { width: Math.round(rect.width), height: Math.round(rect.height) }
    })
    expect(boxAfter.width).toBe(before.width)
    expect(boxAfter.height).toBe(before.height)
    await page.keyboard.press('Escape')
  })

  test('悬停在省略号上立即出现文本框（D80 ①）', async () => {
    await makeBubble(LONG)
    const hit = page.locator('[data-bubble-id] .sl-ellipsis-hit').first()
    await expect(hit).toHaveCount(1)

    await hit.hover()
    const tip = page.locator('.sl-bubble-tooltip')
    await expect(tip).toBeVisible({ timeout: 1500 })
    await expect(tip).toContainText('长文字')

    await page.mouse.move(900, 700)
    await expect
      .poll(async () => page.locator('.sl-bubble-tooltip').count(), { timeout: 4000 })
      .toBe(0)
  })

  test('点击文本框在点击处落光标，框内拖动只选文字不穿透（D81）', async () => {
    await makeBubble(LONG)
    const bubble = page.locator('[data-bubble-id]').first()
    const transformBefore = await bubble.getAttribute('transform')
    await bubble.hover()
    await page.waitForTimeout(800)

    const tip = page.locator('.sl-bubble-tooltip')
    await expect(tip).toBeVisible()
    const box = await tip.boundingBox()
    if (!box) throw new Error('no tip box')

    // 点击靠左的位置：光标应落在开头附近而不是末尾
    await page.mouse.click(box.x + 16, box.y + 16)
    const offset = await page.evaluate(() => window.getSelection()?.anchorOffset ?? -1)
    expect(offset).toBeGreaterThanOrEqual(0)
    expect(offset).toBeLessThan(12)

    // 框内按住拖动：产生文本选择
    await page.mouse.move(box.x + 12, box.y + 14)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width - 16, box.y + 44, { steps: 10 })
    await page.mouse.up()
    const selectedLength = await page.evaluate(
      () => window.getSelection()?.toString().length ?? 0
    )
    expect(selectedLength).toBeGreaterThan(0)

    // 画布/气泡没被拖动
    expect(await bubble.getAttribute('transform')).toBe(transformBefore)
    await page.keyboard.press('Escape')
  })

  test('点击文本框不关闭，只在外部点击 / Esc 时关闭（D82）', async () => {
    await makeBubble(LONG)
    const bubble = page.locator('[data-bubble-id]').first()
    await bubble.hover()
    await page.waitForTimeout(800)

    const tip = page.locator('.sl-bubble-tooltip')
    await expect(tip).toBeVisible()
    const box = await tip.boundingBox()
    if (!box) throw new Error('no tip box')

    // 连续点击不同位置：文本框必须一直在，且光标随之定位
    await page.mouse.click(box.x + 24, box.y + 20)
    await expect(tip).toBeVisible()
    const leftOffset = await page.evaluate(() => window.getSelection()?.anchorOffset ?? -1)
    await page.mouse.click(box.x + box.width - 24, box.y + 20)
    await expect(tip).toBeVisible()
    const rightOffset = await page.evaluate(() => window.getSelection()?.anchorOffset ?? -1)

    expect(leftOffset).toBeGreaterThanOrEqual(0)
    expect(rightOffset).toBeGreaterThan(leftOffset)

    // 仍在编辑：输入会写回气泡
    await page.keyboard.type('X')
    await expect
      .poll(async () => (await page.locator('[data-bubble-id]').first().textContent()) ?? '')
      .toContain('X')

    // Esc 关闭
    await page.keyboard.press('Escape')
    await expect.poll(async () => page.locator('.sl-bubble-tooltip').count()).toBe(0)

    // 再次打开后，点击外部才关闭
    await bubble.hover()
    await page.waitForTimeout(800)
    await expect(page.locator('.sl-bubble-tooltip')).toBeVisible()
    await page.mouse.click(900, 700)
    await expect.poll(async () => page.locator('.sl-bubble-tooltip').count()).toBe(0)
  })

  test('未截断的气泡三种时机都不弹文本框（D83）', async () => {
    await makeBubble('短文本')
    const bubble = page.locator('[data-bubble-id]').first()
    const tip = page.locator('.sl-bubble-tooltip')

    // ① 没有省略号命中区
    expect(await page.locator('.sl-ellipsis-hit').count()).toBe(0)

    // ② 长按也不出现
    await bubble.hover()
    await page.waitForTimeout(900)
    await expect(tip).toHaveCount(0)

    // ③ 双击进入编辑也不出现
    await bubble.dblclick()
    await expect(page.locator('.sl-inline-editor textarea')).toBeVisible()
    await expect(tip).toHaveCount(0)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
    await expect(tip).toHaveCount(0)
  })

  test('内联编辑与全文文本框互斥（D77）', async () => {
    await makeBubble(LONG)
    const bubble = page.locator('[data-bubble-id]').first()

    // 打开文本框编辑（长按后出现）
    await bubble.hover()
    await page.waitForTimeout(800)
    await page.locator('.sl-bubble-tooltip').click()
    await expect(page.locator('.sl-tip-text')).toBeVisible()

    // 双击气泡进入内联编辑 → 文本框切回只读（D80 ③）
    await bubble.dblclick()
    await expect(page.locator('.sl-inline-editor textarea')).toBeVisible()
    await expect(page.locator('.sl-bubble-tooltip')).toBeVisible()
    // 文本框保持只读：没有进入编辑态
    expect(await page.locator('.sl-bubble-tooltip.editing').count()).toBe(0)
    await page.keyboard.press('Escape')
  })
})
