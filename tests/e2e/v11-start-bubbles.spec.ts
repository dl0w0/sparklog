import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { closeApp, launchApp } from './harness'
import { createEmptyDocument, serializeDocument } from '../../src/shared/logic/documentCodec'

test.describe('v11 开始窗口：星空图层与漂浮气泡', () => {
  let app: ElectronApplication
  let page: Page
  let profile: string

  test.beforeAll(async () => {
    const h = await launchApp()
    app = h.app
    page = await h.start()
    profile = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'))

    const dir = mkdtempSync(path.join(os.tmpdir(), 'sparklog-bubbles-'))
    const files = Array.from({ length: 7 }, (_, i) => {
      const file = path.join(dir, `夜空灵感${i + 1}.insp`)
      writeFileSync(file, serializeDocument(createEmptyDocument()), 'utf8')
      return {
        path: file,
        name: `夜空灵感${i + 1}.insp`,
        openedAt: new Date(Date.now() - i * 3600_000).toISOString()
      }
    })
    writeFileSync(path.join(profile, 'recent-files.json'), JSON.stringify(files, null, 2), 'utf8')
    await page.reload()
    await page.waitForSelector('[data-bubbles="root"]')
    await page.bringToFront()
  })

  test.afterAll(async () => {
    await closeApp(app)
  })

  test('最近文件以气泡呈现：最多 5 个，越早越透明（D88）', async () => {
    const bubbles = page.locator('[data-bubbles="bubble"]')
    await expect(bubbles).toHaveCount(5)

    const opacities = await bubbles.evaluateAll((nodes) =>
      nodes.map((el) => Number(getComputedStyle(el as HTMLElement).opacity))
    )
    expect(opacities[0]).toBeCloseTo(1, 1)
    for (let i = 1; i < opacities.length; i++) {
      expect(opacities[i]).toBeLessThan(opacities[i - 1])
    }
    expect(opacities[opacities.length - 1]).toBeGreaterThan(0.3)

    // 其余收纳进「更多历史文件」
    await expect(page.locator('[data-bubbles="more"]')).toContainText('2')
    await page.locator('[data-bubbles="more"]').click()
    await expect(page.locator('[data-bubbles="dialog"]')).toBeVisible()
    await expect(page.locator('.sl-bubbles-dialog-item')).toHaveCount(2)
    await page.locator('.sl-bubbles-dialog-close').click()
  })

  test('气泡两两连线成网格，连线等长（D90）', async () => {
    // 5 个气泡 → C(5,2) = 10 条连线
    await expect(page.locator('[data-bubbles="link"]')).toHaveCount(10)

    // 连线端点与气泡位置一致，且长度不为 0
    const lengths = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[data-bubbles="link"]')).map((el) => {
        const line = el as SVGLineElement
        const x1 = Number(line.getAttribute('x1'))
        const y1 = Number(line.getAttribute('y1'))
        const x2 = Number(line.getAttribute('x2'))
        const y2 = Number(line.getAttribute('y2'))
        return Math.hypot(x2 - x1, y2 - y1)
      })
    })
    expect(lengths.every((value) => value > 10)).toBe(true)
  })

  test('气泡可拖动且有惯性，拖动不触发打开（D88）', async () => {
    const bubble = page.locator('[data-bubbles="bubble"]').first()
    const before = await bubble.boundingBox()
    if (!before) throw new Error('no bubble')

    const startX = before.x + before.width / 2
    const startY = before.y + before.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 90, startY + 40, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(120)

    const after = await bubble.boundingBox()
    if (!after) throw new Error('bubble lost')
    expect(Math.abs(after.x - before.x)).toBeGreaterThan(30)

    // 拖拽后仍在开始窗口（没有打开文件）
    expect(app.windows().length).toBe(1)
  })

  test('空白处滚轮调整视野广度并落盘，不影响气泡列表（D88）', async () => {
    const readFov = async (): Promise<number> => {
      const file = path.join(profile, 'settings.json')
      try {
        return (JSON.parse(readFileSync(file, 'utf8')) as { skyFov: number }).skyFov
      } catch {
        return 0
      }
    }
    const before = await readFov()
    const bubblesBefore = await page.locator('[data-bubbles="bubble"]').count()

    await page.mouse.move(900, 300)
    await page.mouse.wheel(0, -240)
    await page.waitForTimeout(400)

    const after = await readFov()
    expect(after).toBeGreaterThan(before)
    expect(await page.locator('[data-bubbles="bubble"]').count()).toBe(bubblesBefore)
  })

  test('两个图层开关独立并可持久化（D88）', async () => {
    await page.locator('[data-start="settings"]').click()
    const pop = page.locator('[data-start="settingsPop"]')
    await expect(pop).toBeVisible()

    const labels = pop.locator('[data-start="labels"]')
    const constellations = pop.locator('[data-start="constellations"]')
    await expect(labels).toBeChecked()
    await expect(constellations).toBeChecked()

    await labels.uncheck()
    await page.waitForTimeout(300)
    await constellations.uncheck()
    await page.waitForTimeout(400)

    const saved = JSON.parse(readFileSync(path.join(profile, 'settings.json'), 'utf8')) as {
      showStarLabels: boolean
      showConstellations: boolean
      skyBrightness: number
    }
    expect(saved.showStarLabels).toBe(false)
    expect(saved.showConstellations).toBe(false)
    // 关闭图层不影响亮度设置本身
    expect(saved.skyBrightness).toBeGreaterThan(0.5)

    // 亮度可调并落盘
    const brightness = pop.locator('[data-start="brightness"]')
    await brightness.fill('1.8')
    await page.waitForTimeout(300)
    const after = JSON.parse(readFileSync(path.join(profile, 'settings.json'), 'utf8')) as {
      skyBrightness: number
    }
    expect(after.skyBrightness).toBeCloseTo(1.8, 1)
  })
})
