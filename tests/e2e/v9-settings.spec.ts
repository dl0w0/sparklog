import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { closeApp, launchApp, openWorkspace } from './harness'

test.describe('v9 设置菜单', () => {
  let app: ElectronApplication
  let page: Page
  let userData: string

  test.beforeAll(async () => {
    const h = await launchApp()
    app = h.app
    page = await openWorkspace(app)
    userData = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'))
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

  test('原生菜单有「设置」一级菜单与五项（D84）', async () => {
    const labels = await app.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu()
      const settings = menu?.items.find((i) => i.label === '设置')
      return settings?.submenu?.items.map((i) => i.label) ?? []
    })
    expect(labels.filter(Boolean)).toEqual([
      '快捷键设置…',
      '文本编辑器…',
      '图形编辑…',
      '物理性质…',
      '检查更新…'
    ])
  })

  test('文本编辑器：修改即时生效并写入 settings.json', async () => {
    await dispatch('settings.text')
    const dialog = page.locator('[data-settings="root"]')
    await expect(dialog).toBeVisible()

    // 切到文本编辑器面板并改字号
    await page.locator('.sl-settings-tabs button', { hasText: '文本编辑器' }).click()
    const fontSize = dialog.locator('[data-text="bubble"] input[data-field="fontSize"]')
    await fontSize.fill('26')
    await page.waitForTimeout(400)

    const file = path.join(userData, 'settings.json')
    expect(existsSync(file)).toBe(true)
    const saved = JSON.parse(readFileSync(file, 'utf8')) as {
      typography: { bubble: { fontSize: number } }
    }
    expect(saved.typography.bubble.fontSize).toBe(26)

    // 恢复默认字号，避免影响后续用例
    await fontSize.fill('16')
    await page.waitForTimeout(300)
    await dialog.getByRole('button', { name: '关闭' }).click()
    await expect(dialog).toHaveCount(0)
  })

  test('快捷键冲突检测与恢复默认（D84 ①）', async () => {
    await dispatch('settings.shortcuts')
    const dialog = page.locator('[data-settings="root"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.sl-conflict')).toHaveText('快捷键无冲突')

    // 把「打开」改成和「保存」一样 → 出现冲突
    const openRow = dialog.locator('[data-command="file.open"]')
    await openRow.locator('input').fill('Ctrl+S')
    await expect(dialog.locator('.sl-conflict')).toContainText('冲突')

    await dialog.getByRole('button', { name: '恢复默认' }).click()
    await expect(dialog.locator('.sl-conflict')).toHaveText('快捷键无冲突')
    await dialog.getByRole('button', { name: '关闭' }).click()
  })

  test('物理性质可调并有恢复默认（D84 ④）', async () => {
    await dispatch('settings.physics')
    const dialog = page.locator('[data-settings="root"]')
    await expect(dialog).toBeVisible()
    const damping = dialog.locator('[data-physics="damping"] input[type="number"]')
    await damping.fill('0.55')
    await page.waitForTimeout(300)

    const file = path.join(userData, 'settings.json')
    const saved = JSON.parse(readFileSync(file, 'utf8')) as { physics: { damping: number } }
    expect(saved.physics.damping).toBeCloseTo(0.55, 2)

    await dialog.getByRole('button', { name: '恢复默认' }).click()
    await page.waitForTimeout(300)
    const restored = JSON.parse(readFileSync(file, 'utf8')) as { physics: { damping: number } }
    expect(restored.physics.damping).toBeCloseTo(0.7, 2)
    await dialog.getByRole('button', { name: '关闭' }).click()
  })

  test('检查更新给出明确结果（D84 ⑤）', async () => {
    await dispatch('settings.update')
    const dialog = page.locator('[data-settings="root"]')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('[data-update="current"]')).toHaveText(/\d+\.\d+\.\d+/)
    await expect(dialog.locator('[data-update="result"]')).toBeVisible({ timeout: 15000 })
    const text = (await dialog.locator('[data-update="result"]').textContent()) ?? ''
    expect(text.length).toBeGreaterThan(0)
    expect(/已是最新版本|发现新版本|检查失败/.test(text)).toBe(true)
    await dialog.getByRole('button', { name: '关闭' }).click()
  })
})
