import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export interface Harness {
  app: ElectronApplication
  dir: string
  savePath: string
  start: () => Promise<Page>
  workspace: () => Promise<Page>
  close: () => Promise<void>
}

function cleanEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue
    if (k === 'ELECTRON_RUN_AS_NODE') continue
    env[k] = v
  }
  return env
}

export async function launchApp(): Promise<Harness> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sparklog-e2e-'))
  const savePath = path.join(dir, 'test.insp')
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${path.join(dir, 'profile')}`],
    env: cleanEnv()
  })

  const proc = app.process()
  proc.stdout?.on('data', (d: Buffer) => process.stdout.write(`[main] ${String(d)}`))
  proc.stderr?.on('data', (d: Buffer) => process.stderr.write(`[main-err] ${String(d)}`))
  app.on('close', () => process.stdout.write('[app] closed\n'))

  // 原生对话框无法自动化，运行期在主进程内替换为固定路径（不修改产品代码）
  await app.evaluate(
    ({ dialog }, payload) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: payload.savePath })
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [payload.savePath] })
    },
    { savePath }
  )

  const start = async (): Promise<Page> => {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    return page
  }

  return {
    app,
    dir,
    savePath,
    start,
    workspace: async () => openWorkspace(app),
    close: async () => {
      await closeApp(app)
    }
  }
}

/** 结束应用：先强制销毁窗口，避免「有未保存变更」的关窗确认阻塞退出 */
export async function closeApp(app: ElectronApplication): Promise<void> {
  try {
    await app.evaluate(({ BrowserWindow }) => {
      for (const win of BrowserWindow.getAllWindows()) win.destroy()
    })
  } catch {
    // 应用可能已经退出
  }
  try {
    await app.close()
  } catch {
    // 已随窗口销毁而退出
  }
}

/** 从开始页点「新建空白画布」进入工作区窗口 */
export async function openWorkspace(app: ElectronApplication): Promise<Page> {
  const startPage = await app.firstWindow()
  await startPage.waitForLoadState('domcontentloaded')
  // 开始页：等左栏按钮可用（v0.2.0 排版，D87）
  const newCanvas = startPage.getByText('新建空白画布')
  await newCanvas.waitFor({ state: 'visible', timeout: 15000 })
  const nextWindow = app.waitForEvent('window')
  await newCanvas.click()
  const ws = await nextWindow
  ws.on('pageerror', (err) => process.stderr.write(`[pageerror] ${err.message}\n`))
  ws.on('console', (msg) => {
    if (msg.type() === 'error') process.stderr.write(`[console] ${msg.text()}\n`)
  })
  ws.on('close', () => process.stderr.write('[ws] window closed\n'))
  await ws.waitForLoadState('domcontentloaded')
  await ws.locator('.sl-canvas').waitFor({ state: 'visible' })
  return ws
}

/** 用例之间重置画布（Ctrl+N；有未保存变更时选择「不保存」） */
export async function resetCanvas(page: Page): Promise<void> {
  // 焦点若停在可编辑元素上，快捷键会被让给输入框，先主动失焦
  await page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null
    active?.blur?.()
  })
  await page.keyboard.press('Control+n')
  const dontSave = page.getByRole('button', { name: '不保存' })
  await dontSave.waitFor({ state: 'visible', timeout: 1500 }).catch(() => undefined)
  if (await dontSave.isVisible().catch(() => false)) {
    await dontSave.click()
  }
  // D61：新建画布自带一个起点气泡；测试里先清掉它，得到空画布
  await expect.poll(async () => page.locator('[data-bubble-id]').count(), { timeout: 8000 }).toBe(1)
  await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible', timeout: 2000 }).catch(() => undefined)
  await page.keyboard.press('Escape')
  await page.locator('[data-bubble-id]').first().click({ force: true })
  await page.keyboard.press('Delete')
  await expect.poll(async () => page.locator('[data-bubble-id]').count(), { timeout: 8000 }).toBe(0)
}

export function readSaved(dir: string): string {
  return readFileSync(path.join(dir, 'test.insp'), 'utf8')
}

/** 在画布空白处右键并等待菜单出现 */
export async function openCanvasMenu(page: Page): Promise<void> {
  const canvas = page.locator('.sl-canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('canvas not visible')
  // 靠左下角落点，避开画布中央已存在的气泡
  await canvas.click({ button: 'right', position: { x: 60, y: box.height - 60 } })
  await page.locator('.sl-context-menu').first().waitFor({ state: 'visible' })
}

export async function createRootBubble(page: Page, text: string): Promise<void> {
  await openCanvasMenu(page)
  await page.getByText('＋ 新建主气泡').click()
  await page.locator('.sl-inline-editor textarea').waitFor({ state: 'visible' })
  await page.keyboard.type(text)
  await page.keyboard.press('Escape')
  await page.locator('.sl-inline-editor').waitFor({ state: 'detached' }).catch(() => undefined)
}

export function bubbleCount(page: Page): Promise<number> {
  return page.locator('[data-bubble-id]').count()
}
