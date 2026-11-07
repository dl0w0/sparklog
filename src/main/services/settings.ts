/** 全局设置持久化：userData/settings.json（D84）。 */

import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { normalizeSettings, createDefaultSettings, type AppSettings } from '@shared/types/settings'

export function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

export async function readSettings(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8')
    return normalizeSettings(JSON.parse(raw))
  } catch {
    return createDefaultSettings()
  }
}

export async function writeSettings(value: unknown): Promise<boolean> {
  try {
    const normalized = normalizeSettings(value)
    await fs.mkdir(path.dirname(settingsPath()), { recursive: true })
    await fs.writeFile(settingsPath(), JSON.stringify(normalized, null, 2), 'utf8')
    return true
  } catch {
    return false
  }
}
