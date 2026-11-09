import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { bubbleCount, closeApp, launchApp, openWorkspace, resetCanvas } from './harness'

test.describe('v13 字号快捷键与窗口生命周期', () => {
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

  const fontSizes = async (): Promise<number[]> =>
    page
      .locator('.sl-bubble-text')
      .evaluateAll((nodes) => nodes.map((el) => parseFloat(getComputedStyle(el as HTMLElement).fontSize)))

  test('Ctrl+Shift+. 让每个选中气泡各自 +2，Ctrl+Shift+, 各自 −2（D92）', async () => {
    await resetCanvas(page)
    const canvas = page.locator('.sl-canvas')

    // 第一个气泡：设置字体面板改成 24
    await canvas.click({ button: 'right', position: { x: 260, y: 220 } })
    await page.getByText('＋ 新建主气泡').click()
    await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
    await page.keyboard.type('甲')
    await page.keyboard.press('Escape')

    // 第二个气泡用默认字号（20）
    await canvas.click({ button: 'right', position: { x: 640, y: 460 } })
    await page.getByText('＋ 新建主气泡').click()
    await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
    await page.keyboard.type('乙')
    await page.keyboard.press('Escape')
    await expect.poll(async () => bubbleCount(page)).toBe(2)

    // 第一个改成 24
    await page.locator('[data-bubble-id]').first().click({ force: true })
    await page.locator('.sl-formula-font').hover()
    const sizeInput = page.locator('.sl-size-input')
    await sizeInput.fill('24')
    await page.waitForTimeout(200)
    await page.keyboard.press('Escape')

    const before = await fontSizes()
    expect(before.sort((a, b) => a - b)).toEqual([20, 24])

    // 多选：Shift 点第二个
    await page.locator('[data-bubble-id]').first().click({ force: true })
    await page.locator('[data-bubble-id]').nth(1).click({ force: true, modifiers: ['Shift'] })
    await page.keyboard.press('Control+Shift+.')
    await page.waitForTimeout(200)

    const afterUp = await fontSizes()
    expect(afterUp.sort((a, b) => a - b)).toEqual([22, 26])

    await page.keyboard.press('Control+Shift+,')
    await page.waitForTimeout(200)
    const afterDown = await fontSizes()
    expect(afterDown.sort((a, b) => a - b)).toEqual([20, 24])
  })

  test('多选后颜色等文字属性同步应用到所有选中气泡（D92）', async () => {
    await page.locator('[data-bubble-id]').first().click({ force: true })
    await page.locator('[data-bubble-id]').nth(1).click({ force: true, modifiers: ['Shift'] })

    await page.locator('.sl-formula-font').hover()
    const color = page.locator('.sl-font-pop input[type="color"]').first()
    await color.evaluate((el) => {
      const input = el as HTMLInputElement
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, '#2f7d4f')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await page.waitForTimeout(250)

    const colors = await page
      .locator('.sl-bubble-text')
      .evaluateAll((nodes) => nodes.map((el) => getComputedStyle(el as HTMLElement).color))
    expect(colors.every((value) => value === 'rgb(47, 125, 79)')).toBe(true)
  })

  test('选中气泡后直接敲字符：进入编辑并追加到末尾（D93）', async () => {
    await resetCanvas(page)
    const canvas = page.locator('.sl-canvas')
    await canvas.click({ button: 'right', position: { x: 300, y: 240 } })
    await page.getByText('＋ 新建主气泡').click()
    await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
    await page.keyboard.type('原文')
    await page.keyboard.press('Escape')
    await expect.poll(async () => bubbleCount(page)).toBe(1)

    // 单击选中（非编辑态）后敲字符
    await page.locator('[data-bubble-id]').first().click({ force: true })
    await page.keyboard.press('X')
    const editor = page.locator('.sl-inline-editor textarea')
    await expect(editor).toBeVisible()
    await expect(editor).toHaveValue('原文X')
    // 光标在末尾
    const caret = await editor.evaluate((el) => (el as HTMLTextAreaElement).selectionStart)
    expect(caret).toBe(3)
    await page.keyboard.press('Escape')
    await expect
      .poll(async () => (await page.locator('[data-bubble-id]').first().textContent()) ?? '')
      .toContain('原文X')
  })

  test('连续撤销/重做按 Word 习惯逐步回退与前进（D94）', async () => {
    await resetCanvas(page)
    const canvas = page.locator('.sl-canvas')

    // 建立 3 个气泡：每次 Ctrl+Z 只回退一步
    for (const [index, text] of ['甲', '乙', '丙'].entries()) {
      await canvas.click({ button: 'right', position: { x: 200 + index * 220, y: 240 } })
      await page.getByText('＋ 新建主气泡').click()
      await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
      await page.keyboard.type(text)
      await page.keyboard.press('Escape')
    }
    await expect.poll(async () => bubbleCount(page)).toBe(3)

    await page.locator('.sl-canvas').click({ position: { x: 20, y: 20 } })
    await page.keyboard.press('Control+z')
    await expect.poll(async () => bubbleCount(page)).toBe(2)
    await page.keyboard.press('Control+z')
    await expect.poll(async () => bubbleCount(page)).toBe(1)
    await page.keyboard.press('Control+z')
    await expect.poll(async () => bubbleCount(page)).toBe(0)

    // 重做回到最新
    await page.keyboard.press('Control+y')
    await expect.poll(async () => bubbleCount(page)).toBe(1)
    await page.keyboard.press('Control+y')
    await expect.poll(async () => bubbleCount(page)).toBe(2)
    await page.keyboard.press('Control+y')
    await expect.poll(async () => bubbleCount(page)).toBe(3)

    // 撤销一步后新建：重做栈被清空
    await page.keyboard.press('Control+z')
    await expect.poll(async () => bubbleCount(page)).toBe(2)
    await canvas.click({ button: 'right', position: { x: 900, y: 600 } })
    await page.getByText('＋ 新建主气泡').click()
    await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
    await page.keyboard.type('丁')
    await page.keyboard.press('Escape')
    await expect.poll(async () => bubbleCount(page)).toBe(3)
    await page.keyboard.press('Control+y')
    await page.waitForTimeout(200)
    // 重做栈已清空，数量保持 3
    expect(await bubbleCount(page)).toBe(3)
  })

  test('关闭画布后复用同一个开始页，且最多一个实例（D97）', async () => {
    const countStarts = async (): Promise<number> => {
      let total = 0
      for (const candidate of app.windows()) {
        try {
          total += await candidate.locator('[data-start="root"]').count()
        } catch {
          // 窗口已关闭
        }
      }
      return total
    }
    const hasWorkspace = async (): Promise<boolean> =>
      app.windows().some((candidate) => candidate.url().includes('index.html'))
    const closeWorkspaces = async (): Promise<void> => {
      await app.evaluate(({ BrowserWindow }) => {
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed() && !win.webContents.getURL().includes('start.html')) win.destroy()
        }
      })
    }
    const openFromStart = async (): Promise<void> => {
      const startPage = app.windows().find((candidate) => candidate.url().includes('start.html'))
      expect(startPage).toBeTruthy()
      await startPage!.getByText('新建空白画布').click()
      const opened = await expect
        .poll(hasWorkspace, { timeout: 8000 })
        .toBe(true)
        .then(() => true)
        .catch(() => false)
      if (!opened) {
        // 首次点击可能被前一个窗口的关闭流程吞掉，重试一次
        const retry = app.windows().find((candidate) => candidate.url().includes('start.html'))
        await retry?.getByText('新建空白画布').click()
        await expect.poll(hasWorkspace, { timeout: 20000 }).toBe(true)
      }
    }

    // 1) 先确保有一个工作区，然后关闭它
    if (!(await hasWorkspace())) await openFromStart()
    await closeWorkspaces()
    await expect.poll(countStarts, { timeout: 15000 }).toBe(1)

    // 2) 再来一轮：从开始页打开画布再关闭，仍然只有一个开始页实例
    await openFromStart()
    await closeWorkspaces()
    await expect.poll(countStarts, { timeout: 15000 }).toBe(1)

    // 应用没有退出（仍有窗口）
    expect(app.windows().length).toBeGreaterThan(0)
  })
})
