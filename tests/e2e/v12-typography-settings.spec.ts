import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { bubbleCount, closeApp, launchApp, openWorkspace, resetCanvas } from './harness'

test.describe('v12 文本编辑器设置对新建对象生效', () => {
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

  const dispatch = async (command: string): Promise<void> => {
    await app.evaluate(({ BrowserWindow }, cmd) => {
      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
      win?.webContents.send('menu:command', cmd)
    }, command)
  }

  const setBubbleTypography = async (size: number, color: string): Promise<void> => {
    await dispatch('settings.text')
    const dialog = page.locator('[data-settings="root"]')
    await expect(dialog).toBeVisible()
    await page.locator('.sl-settings-tabs button', { hasText: '文本编辑器' }).click()
    const row = dialog.locator('[data-text="bubble"]')
    await row.locator('input[data-field="fontSize"]').fill(String(size))
    await row.locator('input[data-field="color"]').evaluate((el, value) => {
      const input = el as HTMLInputElement
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }, color)
    await page.waitForTimeout(300)
    await dialog.getByRole('button', { name: '关闭' }).click()
  }

  test('新建气泡使用文本编辑器设置，已有气泡不受影响（D91）', async () => {
    await resetCanvas(page)
    // 先在默认设置下建一个气泡（旧对象）
    await page.locator('.sl-canvas').click({ button: 'right', position: { x: 240, y: 220 } })
    await page.getByText('＋ 新建主气泡').click()
    await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
    await page.keyboard.type('旧气泡')
    await page.keyboard.press('Escape')
    await expect.poll(async () => bubbleCount(page)).toBe(1)

    const before = await page
      .locator('.sl-bubble-text')
      .first()
      .evaluate((el) => getComputedStyle(el).fontSize)

    // 改设置为 30px + 红色
    await setBubbleTypography(30, '#d64545')

    // 新建一个气泡：应立刻使用 30px / 红色
    await page.locator('.sl-canvas').click({ button: 'right', position: { x: 620, y: 460 } })
    await page.getByText('＋ 新建主气泡').click()
    await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
    await page.keyboard.type('新气泡')
    await page.keyboard.press('Escape')
    await expect.poll(async () => bubbleCount(page)).toBe(2)

    const sizes = await page.locator('.sl-bubble-text').evaluateAll((nodes) =>
      nodes.map((el) => getComputedStyle(el as HTMLElement).fontSize)
    )
    const numeric = sizes.map((value) => parseFloat(value))
    // 新建的主气泡取设置值
    expect(numeric).toContain(30)
    // 旧气泡仍保持原字号（未被设置回溯修改）
    expect(numeric).toContain(parseFloat(before))

    const colors = await page.locator('.sl-bubble-text').evaluateAll((nodes) =>
      nodes.map((el) => getComputedStyle(el as HTMLElement).color)
    )
    expect(colors.some((color) => color === 'rgb(214, 69, 69)')).toBe(true)
  })

  test('子气泡字号按 ×0.88 递减，字体与颜色与主气泡一致（D91）', async () => {
    await resetCanvas(page)
    await setBubbleTypography(20, '#3a63c8')

    await page.locator('.sl-canvas').click({ button: 'right', position: { x: 240, y: 220 } })
    await page.getByText('＋ 新建主气泡').click()
    await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
    await page.keyboard.type('根')
    await page.keyboard.press('Escape')

    await page.locator('[data-bubble-id]').first().click()
    await page.keyboard.press('Tab')
    await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
    await page.keyboard.type('子')
    await page.keyboard.press('Escape')

    const styles = await page.locator('.sl-bubble-text').evaluateAll((nodes) =>
      nodes.map((el) => {
        const cs = getComputedStyle(el as HTMLElement)
        return { size: parseFloat(cs.fontSize), color: cs.color, family: cs.fontFamily }
      })
    )
    expect(styles.length).toBe(2)
    const root = styles[0]
    const child = styles[1]
    expect(root.size).toBe(20)
    expect(child.size).toBe(Math.round(20 * 0.88))
    expect(child.size).toBeLessThan(root.size)
    // 字体族与颜色不随层级变化
    expect(child.color).toBe(root.color)
    expect(child.family).toBe(root.family)
  })
})
