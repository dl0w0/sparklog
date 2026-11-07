import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { bubbleCount, closeApp, launchApp, openWorkspace, resetCanvas } from './harness'

test.describe('v6 起点气泡 / 梳理 / 公式栏', () => {
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

  test('新建画布自带一个主气泡并处于编辑态（D61）', async () => {
    await resetCanvas(page)
    await page.keyboard.press('Control+n')
    const dontSave = page.getByRole('button', { name: '不保存' })
    await dontSave.waitFor({ state: 'visible', timeout: 1500 }).catch(() => undefined)
    if (await dontSave.isVisible().catch(() => false)) await dontSave.click()

    await expect.poll(async () => bubbleCount(page), { timeout: 8000 }).toBe(1)
    await expect(page.locator('.sl-inline-editor textarea')).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('梳理气泡：主气泡拉开、子节点均匀分布、连线长度不变（D67）', async () => {
    await resetCanvas(page)
    const canvas = page.locator('.sl-canvas')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('no canvas')

    // 建一个父气泡 + 3 个子气泡
    await canvas.click({ button: 'right', position: { x: 220, y: 220 } })
    await page.getByText('＋ 新建主气泡').click()
    await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
    await page.keyboard.type('父')
    await page.keyboard.press('Escape')
    for (const text of ['子一', '子二', '子三']) {
      await page.locator('[data-bubble-id]').first().click({ force: true })
      await page.keyboard.press('Tab')
      await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
      await page.keyboard.type(text)
      await page.keyboard.press('Escape')
    }
    await expect.poll(async () => bubbleCount(page)).toBe(4)

    // 记录每条父子连线的长度（SVG 路径长度）
    const lengthsBefore = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.sl-edge'))
        .map((el) => (el as SVGPathElement).getTotalLength())
        .sort((a, b) => a - b)
    )

    await page.getByTitle('梳理气泡（均匀铺开）').click()
    await page.waitForTimeout(900)

    const lengthsAfter = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.sl-edge'))
        .map((el) => (el as SVGPathElement).getTotalLength())
        .sort((a, b) => a - b)
    )
    expect(lengthsAfter).toHaveLength(lengthsBefore.length)
    for (let i = 0; i < lengthsBefore.length; i++) {
      expect(Math.abs(lengthsAfter[i] - lengthsBefore[i])).toBeLessThan(3)
    }

    await expect(page.getByText('未保存更改')).toBeVisible()

  })

  test('右键拖拽框选多选，不弹菜单（D64）', async () => {
    await resetCanvas(page)
    const canvas = page.locator('.sl-canvas')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('no canvas')
    const spots = [
      { x: 140, y: 160 },
      { x: 620, y: 460 }
    ]
    for (const [index, text] of ['甲', '乙'].entries()) {
      await canvas.click({ button: 'right', position: spots[index] })
      await page.getByText('＋ 新建主气泡').click()
      await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
      await page.keyboard.type(text)
      await page.keyboard.press('Escape')
    }
    await page.keyboard.press('Control+Shift+f')
    await expect.poll(async () => bubbleCount(page)).toBe(2)

    await page.mouse.move(box.x + 40, box.y + 40)
    await page.mouse.down({ button: 'right' })
    await page.mouse.move(box.x + box.width - 40, box.y + box.height - 40, { steps: 10 })
    await page.mouse.up({ button: 'right' })
    await page.waitForTimeout(200)

    // 期间不应出现右键菜单，且出现批量操作条
    expect(await page.locator('[data-context-menu="root"]').count()).toBe(0)
    await expect(page.getByText(/已选中 2 个/)).toBeVisible()
  })

  test('右键点击（不拖）仍然弹出空白菜单（D64）', async () => {
    await resetCanvas(page)
    const canvas = page.locator('.sl-canvas')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('no canvas')
    await canvas.click({ button: 'right', position: { x: 120, y: 120 } })
    await expect(page.locator('[data-context-menu="root"]').first()).toBeVisible()
    await expect(page.getByText('＋ 新建主气泡')).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('公式栏回显并同步气泡文字（D66）', async () => {
    await resetCanvas(page)
    const canvas = page.locator('.sl-canvas')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('no canvas')
    await canvas.click({ button: 'right', position: { x: 240, y: 220 } })
    await page.getByText('＋ 新建主气泡').click()
    await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
    await page.keyboard.type('原始文字')
    await page.keyboard.press('Escape')

    const input = page.locator('.sl-formula-input')
    await expect(input).toBeEnabled()
    await expect(input).toHaveValue('原始文字')

    await input.fill('公式栏改的字')
    await expect
      .poll(async () => (await page.locator('[data-bubble-id]').first().textContent()) ?? '')
      .toContain('公式栏改的字')

    // 未选中 → 置空禁用
    await page.locator('.sl-canvas').click({ position: { x: 30, y: box.height - 30 } })
    await expect(input).toBeDisabled()
    await expect(input).toHaveValue('')
  })

  test('字号随层级递减（D65）', async () => {
    await resetCanvas(page)
    const canvas = page.locator('.sl-canvas')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('no canvas')
    await canvas.click({ button: 'right', position: { x: 240, y: 220 } })
    await page.getByText('＋ 新建主气泡').click()
    await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
    await page.keyboard.type('根')
    await page.keyboard.press('Escape')

    await page.locator('[data-bubble-id]').first().click()
    await page.keyboard.press('Tab')
    await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
    await page.keyboard.type('子')
    await page.keyboard.press('Escape')
    await page.locator('[data-bubble-id]').nth(1).click()
    await page.keyboard.press('Tab')
    await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
    await page.keyboard.type('孙')
    await page.keyboard.press('Escape')

    const sizes = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.sl-bubble-text')).map((el) =>
        parseFloat(getComputedStyle(el as HTMLElement).fontSize)
      )
    )
    expect(sizes.length).toBe(3)
    const sorted = [...sizes].sort((a, b) => b - a)
    expect(sorted[0]).toBeGreaterThan(sorted[1])
    expect(sorted[1]).toBeGreaterThan(sorted[2])
    expect(sorted[2]).toBeGreaterThanOrEqual(11)
  })
})
