/** 版本比较与更新检查结果（D84 ⑤）。 */

export interface ParsedVersion {
  major: number
  minor: number
  patch: number
  prerelease: string | null
}

export function parseVersion(input: string): ParsedVersion | null {
  const match = /^\s*v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(input ?? '')
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null
  }
}

/** 返回 1 表示 a 更新，-1 表示 a 更旧，0 表示相同 */
export function compareVersions(a: string, b: string): number {
  const va = parseVersion(a)
  const vb = parseVersion(b)
  if (!va || !vb) return 0
  if (va.major !== vb.major) return va.major > vb.major ? 1 : -1
  if (va.minor !== vb.minor) return va.minor > vb.minor ? 1 : -1
  if (va.patch !== vb.patch) return va.patch > vb.patch ? 1 : -1
  // 稳定版高于同号预发布版
  if (va.prerelease === vb.prerelease) return 0
  if (!va.prerelease) return 1
  if (!vb.prerelease) return -1
  return va.prerelease > vb.prerelease ? 1 : -1
}

export interface UpdateInfo {
  current: string
  latest: string | null
  hasUpdate: boolean
  url: string | null
  notes?: string | null
  error?: string | null
  checkedAt: string
}

export const REPO_SLUG = 'dl0w0/sparklog'
export const RELEASES_URL = `https://github.com/${REPO_SLUG}/releases`
export const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO_SLUG}/releases/latest`

/** 由 GitHub Releases 响应构造检查结果 */
export function buildUpdateInfo(
  current: string,
  payload: unknown,
  now: string = new Date().toISOString()
): UpdateInfo {
  const release = (payload ?? {}) as {
    tag_name?: string
    html_url?: string
    body?: string
  }
  const latest = release.tag_name ?? null
  if (!latest) {
    return {
      current,
      latest: null,
      hasUpdate: false,
      url: RELEASES_URL,
      notes: null,
      error: null,
      checkedAt: now
    }
  }
  return {
    current,
    latest,
    hasUpdate: compareVersions(latest, current) > 0,
    url: release.html_url ?? RELEASES_URL,
    notes: release.body ?? null,
    error: null,
    checkedAt: now
  }
}

export function buildUpdateError(
  current: string,
  message: string,
  now: string = new Date().toISOString()
): UpdateInfo {
  return {
    current,
    latest: null,
    hasUpdate: false,
    url: RELEASES_URL,
    notes: null,
    error: message,
    checkedAt: now
  }
}
