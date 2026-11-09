import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { closeApp, launchApp } from './harness'
import { createEmptyDocument, serializeDocument } from '../../src/shared/logic/documentCodec'

test.describe('v10 开始窗口：v0.2.0 排版 + 星空背景', () => {
  let app: ElectronApplication
  let page: Page
  let profile: string

  test.beforeAll(async () => {
    const h = await launchApp()
    app = h.app
    page = await h.start()
    profile = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'))

    const dir = mkdtempSync(path.join(os.tmpdir(), 'sparklog-start-'))
    const files = [0, 1, 2].map((i) => {
      const file = path.join(dir, `星图灵感${i + 1}.insp`)
      writeFileSync(file, serializeDocument(createEmptyDocument()), 'utf8')
      return {
        path: file,
        name: `星图灵感${i + 1}.insp`,
        openedAt: new Date(Date.now() - i * 60000).toISOString()
      }
    })
    writeFileSync(path.join(profile, 'recent-files.json'), JSON.stringify(files, null, 2), 'utf8')
    await page.reload()
    await page.waitForSelector('[data-sky="canvas"]')
    await page.bringToFront()
  })

  test.afterAll(async () => {
    await closeApp(app)
  })

  test('布局回到 v0.2.0：左栏品牌与按钮、底部版本与设置（D87）', async () => {
    await expect(page.locator('.sl-brand')).toContainText('Sparklog')
    await expect(page.getByText('新建空白画布')).toBeVisible()
    await expect(page.getByText('打开文件…')).toBeVisible()
    await expect(page.locator('[data-start="version"]')).toContainText(/v\d+\.\d+\.\d+/)
    await expect(page.locator('[data-start="settings"]')).toBeVisible()
    await expect(page.locator('[data-bubbles="bubble"]')).toHaveCount(3)
  })

  test('背景是星空画布，且既有暗底也有亮点（D87）', async () => {
    const canvas = page.locator('[data-sky="canvas"]')
    await expect(canvas).toBeVisible()
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const el = document.querySelector('[data-sky="canvas"]') as HTMLCanvasElement | null
            const ctx = el?.getContext('2d')
            if (!el || !ctx) return 0
            const { data } = ctx.getImageData(0, 0, el.width, el.height)
            let bright = 0
            for (let i = 0; i < data.length; i += 4 * 37) {
              if (data[i] + data[i + 1] + data[i + 2] > 240) bright += 1
            }
            return bright
          }),
        { timeout: 8000 }
      )
      .toBeGreaterThan(0)
  })

  test('设置里不再有「保存观测点」入口（D90）', async () => {
    if ((await page.locator('[data-start="settingsPop"]').count()) === 0) {
      await page.locator('[data-start="settings"]').click()
    }
    const pop = page.locator('[data-start="settingsPop"]')
    await expect(pop).toBeVisible()
    await expect(pop.getByText('保存观测点')).toHaveCount(0)
    await expect(pop.locator('[data-start="latitude"]')).toHaveCount(0)
    await expect(pop.locator('[data-start="longitude"]')).toHaveCount(0)
    await page.locator('[data-start="settings"]').click()
  })

  test('滚轮缩放星图时画面连续不闪屏（D89）', async () => {
    const readFov = async (): Promise<number> => {
      try {
        return (JSON.parse(readFileSync(path.join(profile, 'settings.json'), 'utf8')) as { skyFov: number })
          .skyFov
      } catch {
        return 0
      }
    }
    const before = await readFov()
    await page.mouse.move(900, 300)
    await page.mouse.wheel(0, -240)

    const samples: number[] = []
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(80)
      const lit = await page.evaluate(() => {
        const el = document.querySelector('[data-sky="canvas"]') as HTMLCanvasElement | null
        const ctx = el?.getContext('2d')
        if (!el || !ctx) return 0
        const { data } = ctx.getImageData(0, 0, el.width, el.height)
        let lit = 0
        for (let i = 0; i < data.length; i += 4 * 97) {
          if (data[i] + data[i + 1] + data[i + 2] > 120) lit += 1
        }
        return lit
      })
      samples.push(lit)
    }
    expect(samples.every((n) => n > 0)).toBe(true)
    expect(await readFov()).toBeGreaterThan(before)
  })

  test('点击气泡打开历史文件（既有契约不变）', async () => {
    await page.bringToFront()
    if ((await page.locator('[data-start="settingsPop"]').count()) > 0) {
      await page.locator('[data-start="settings"]').click()
    }

    const bubble = page.locator('[data-bubbles="bubble"]').first()
    await bubble.click({ force: true })

    await expect
      .poll(
        async () => {
          for (const candidate of app.windows()) {
            try {
              if ((await candidate.locator('.sl-canvas').count()) > 0) return true
            } catch {
              // 窗口已关闭
            }
          }
          return false
        },
        { timeout: 20000 }
      )
      .toBe(true)
  })
})
