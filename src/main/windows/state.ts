import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export interface WindowStateData {
  width: number
  height: number
  x?: number
  y?: number
  maximized?: boolean
}

export interface WindowBounds {
  width: number
  height: number
  x?: number
  y?: number
}

interface StateFile {
  startWindow?: WindowStateData
  workspaceWindow?: WindowStateData
}

function storeFile(): string {
  return path.join(app.getPath('userData'), 'window-state.json')
}

async function readStore(): Promise<StateFile> {
  try {
    const text = await fs.readFile(storeFile(), 'utf8')
    const parsed = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

async function writeStore(data: StateFile): Promise<void> {
  try {
    await fs.mkdir(path.dirname(storeFile()), { recursive: true })
    await fs.writeFile(storeFile(), JSON.stringify(data, null, 2), 'utf8')
  } catch {
    // 忽略：窗口状态不是关键数据
  }
}

export async function loadWindowState(kind: 'start' | 'workspace'): Promise<WindowStateData | null> {
  const store = await readStore()
  const v = kind === 'start' ? store.startWindow : store.workspaceWindow
  if (!v || typeof v.width !== 'number' || typeof v.height !== 'number') return null
  return v
}

export async function saveWindowState(
  kind: 'start' | 'workspace',
  bounds: WindowBounds,
  maximized: boolean
): Promise<void> {
  const store = await readStore()
  const data: WindowStateData = {
    width: Math.max(400, Math.round(bounds.width)),
    height: Math.max(300, Math.round(bounds.height)),
    x: bounds.x,
    y: bounds.y,
    maximized
  }
  if (kind === 'start') store.startWindow = data
  else store.workspaceWindow = data
  await writeStore(store)
}
