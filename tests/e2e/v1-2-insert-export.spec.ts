import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { bubbleCount, closeApp, createRootBubble, launchApp, openWorkspace, resetCanvas } from './harness'

test.describe('v1.2 插入对象 / 主题 / 导出', () => {
  let app: ElectronApplication
  let page: Page
  let dir = ''

  test.beforeAll(async () => {
    const h = await launchApp()
    app = h.app
    dir = h.dir
    page = await openWorkspace(app)
  })

  test.afterAll(async () => {
    await closeApp(app)
  })

  test.beforeEach(async () => {
    await resetCanvas(page)
  })

  test('插入笔记：折叠为简笔图标，点击展开后编辑', async () => {
    await createRootBubble(page, '带笔记的想法')
    await page.locator('[data-bubble-id]').first().click()
    await page.keyboard.press('Control+Alt+n')
    const badge = page.locator('.sl-insert-badge').first()
    await expect(badge).toBeVisible()

    await badge.click()
    const textarea = page.locator('textarea[placeholder*="随手记"]')
    await textarea.waitFor({ state: 'visible' })
    await textarea.fill('这是一条笔记内容')
    await textarea.blur()
  })

  test('插入任务：展开后打勾', async () => {
    await createRootBubble(page, '带任务的想法')
    await page.locator('[data-bubble-id]').first().click()
    await page.keyboard.press('Control+Alt+t')
    await page.locator('.sl-insert-badge').first().click()
    const checkbox = page.locator('input[type="checkbox"]').first()
    await checkbox.waitFor({ state: 'visible' })
    await checkbox.check()
    await expect(checkbox).toBeChecked()
  })

  test('主题：切换预设后画布背景变量变化', async () => {
    await createRootBubble(page, '主题测试')
    const appEl = page.locator('.sl-app')
    const before = await appEl.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--sl-bg'))
    await page.locator('.sl-canvas').click({ button: 'right', position: { x: 40, y: 40 } })
    await page.getByText('🎨 主题').click()
    await page.getByText('暖沙').click()
    await expect
      .poll(async () => appEl.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--sl-bg')))
      .not.toBe(before)
  })

  test('导出 Markdown 大纲', async () => {
    await createRootBubble(page, '导出用例')
    await page.locator('.sl-canvas').click({ button: 'right', position: { x: 40, y: 40 } })
    await page.getByText('⇩ 导出为…').click()
    await page.getByText('Markdown 大纲').click()
    const target = path.join(dir, 'test.insp.md')
    await expect.poll(async () => existsSync(target), { timeout: 15000 }).toBe(true)
    const content = readFileSync(target, 'utf8')
    expect(content).toContain('# 导出用例')
  })

  test('导出 SVG 与 PNG 生成非空文件', async () => {
    await createRootBubble(page, '图形导出')
    await page.locator('.sl-canvas').click({ button: 'right', position: { x: 40, y: 40 } })
    await page.getByText('⇩ 导出为…').click()
    await page.getByText('SVG 矢量图').click()
    const svgPath = path.join(dir, 'test.insp.svg')
    await expect.poll(async () => existsSync(svgPath), { timeout: 15000 }).toBe(true)
    const svg = readFileSync(svgPath, 'utf8')
    expect(svg).toContain('<svg')
    expect(svg).toContain('图形导出')

    await page.locator('.sl-canvas').click({ button: 'right', position: { x: 40, y: 40 } })
    await page.getByText('⇩ 导出为…').click()
    await page.getByText('PNG 图片').click()
    const pngPath = path.join(dir, 'test.insp.png')
    await expect.poll(async () => existsSync(pngPath), { timeout: 20000 }).toBe(true)
    const png = readFileSync(pngPath)
    expect(png.length).toBeGreaterThan(1000)
    expect(png[0]).toBe(0x89)
    expect(png[1]).toBe(0x50)
  })

  test('气泡数量统计正确（插入对象不污染节点数）', async () => {
    await createRootBubble(page, '统计用例')
    await page.locator('[data-bubble-id]').first().click()
    await page.keyboard.press('Control+Alt+n')
    await expect.poll(async () => bubbleCount(page)).toBe(1)
  })
})
