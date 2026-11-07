/** 检查更新：请求 GitHub Releases 并与当前版本比对（D84 ⑤）。 */

import { app, net } from 'electron'
import {
  LATEST_RELEASE_API,
  buildUpdateError,
  buildUpdateInfo,
  type UpdateInfo
} from '@shared/logic/version'

const TIMEOUT_MS = 8000

export async function checkForUpdates(): Promise<UpdateInfo> {
  const current = app.getVersion()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await net.fetch(LATEST_RELEASE_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `Sparklog/${current}`
      },
      signal: controller.signal
    })
    if (!response.ok) {
      return buildUpdateError(current, `GitHub 返回 ${response.status}`)
    }
    const payload = (await response.json()) as unknown
    return buildUpdateInfo(current, payload)
  } catch (error) {
    const message =
      error instanceof Error
        ? error.name === 'AbortError'
          ? '请求超时，请检查网络'
          : error.message
        : '网络请求失败'
    return buildUpdateError(current, message)
  } finally {
    clearTimeout(timer)
  }
}
