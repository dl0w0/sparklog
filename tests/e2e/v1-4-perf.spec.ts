import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { serializeDocument } from '../../src/shared/logic/documentCodec'
import { buildPerfScene } from '../../src/renderer/src/logic/perf/fixture'
import { closeApp, launchApp } from './harness'

/**
 * 性能验收（PRD 15.2 / 15.4）：在真实应用里加载 500 气泡文档，
 * 拖拽 121 节点子树，读取拖拽帧耗时（应用内仪器记录）。
 */
test.describe('v1.4 性能基线', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async () => {
    const h = await launchApp()
    app = h.app
    const scene = buildPerfScene()
    writeFileSync(h.savePath, serializeDocument(scene.doc), 'utf8')

    const startPage = await app.firstWindow()
    await startPage.waitForLoadState('domcontentloaded')
    const nextWindow = app.waitForEvent('window')
    await startPage.getByText('打开文件…').click()
    page = await nextWindow
    page.on('pageerror', (err) => process.stderr.write(`[pageerror] ${err.message}\n`))
    await page.waitForLoadState('domcontentloaded')
    await page.locator('.sl-canvas').waitFor({ state: 'visible' })
  })

  test.afterAll(async () => {
    await closeApp(app)
  })

  test('打开 500 气泡文档并能渲染', async () => {
    await expect(page.getByText(/节点 500/)).toBeVisible({ timeout: 20000 })
  })

  test('拖拽 121 节点子树：单帧耗时 P95 ≤ 6.94ms（等效 144fps）', async () => {
    await page.keyboard.press('Control+Shift+f')
    await expect(page.locator('[data-bubble-id="b0"]')).toBeVisible({ timeout: 20000 })

    await page.evaluate(() => {
      const w = window as unknown as { __slPerfEnabled?: boolean; __slPerfFrames?: number[] }
      w.__slPerfEnabled = true
      w.__slPerfFrames = []
    })

    const bubble = page.locator('[data-bubble-id="b0"]')
    const box = await bubble.boundingBox()
    if (!box) throw new Error('bubble not visible')
    const startX = box.x + box.width / 2
    const startY = box.y + box.height / 2

    await page.mouse.move(startX, startY)
    await page.mouse.down()
    for (let i = 1; i <= 25; i++) {
      await page.mouse.move(startX + i * 4, startY + i * 2)
    }
    await page.mouse.up()

    const stats = await page.evaluate(() => {
      const w = window as unknown as { __slPerfFrames?: number[] }
      const frames = [...(w.__slPerfFrames ?? [])]
      const sorted = frames.sort((a, b) => a - b)
      const at = (q: number): number =>
        sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0
      return { count: sorted.length, p95: at(0.95), max: sorted[sorted.length - 1] ?? 0 }
    })

    expect(stats.count).toBeGreaterThanOrEqual(10)
    expect(stats.p95).toBeLessThanOrEqual(6.94)
    await expect(page.getByText('未保存更改')).toBeVisible()
  })
})
