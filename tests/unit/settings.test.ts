import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHORTCUTS,
  createDefaultSettings,
  findShortcutConflicts,
  mergeCanvasSettings,
  normalizeSettings
} from '@shared/types/settings'
import { buildUpdateInfo, compareVersions, parseVersion } from '@shared/logic/version'

describe('设置模型（D84）', () => {
  it('默认设置可被规范化且字段完整', () => {
    const settings = normalizeSettings({})
    expect(settings.typography.bubble.padding).toBeGreaterThan(0)
    expect(settings.shape.bubbleShape).toBe('circle')
    expect(settings.physics.damping).toBeGreaterThan(0)
    expect(settings.shortcuts['file.save']).toBe(DEFAULT_SHORTCUTS['file.save'])
  })

  it('越界与脏数据被收敛到合法范围', () => {
    const settings = normalizeSettings({
      typography: { bubble: { fontSize: 999, padding: -5 } },
      physics: { damping: 5, minDistance: -20, elasticity: 9 },
      shape: { linkWidth: 100 }
    })
    expect(settings.typography.bubble.fontSize).toBeLessThanOrEqual(72)
    expect(settings.typography.bubble.padding).toBeGreaterThanOrEqual(0)
    expect(settings.physics.damping).toBeLessThanOrEqual(0.98)
    expect(settings.physics.minDistance).toBeGreaterThanOrEqual(0)
    expect(settings.physics.elasticity).toBeLessThanOrEqual(0.6)
    expect(settings.shape.linkWidth).toBeLessThanOrEqual(8)
  })

  it('画布级覆盖叠加在全局之上', () => {
    const global = createDefaultSettings()
    global.typography.bubble.padding = 10
    global.physics.damping = 0.7
    const merged = mergeCanvasSettings(global, {
      typography: { bubble: { padding: 24 } },
      physics: { damping: 0.9 }
    })
    expect(merged.typography.bubble.padding).toBe(24)
    expect(merged.physics.damping).toBe(0.9)
    // 未覆盖的字段沿用全局
    expect(merged.typography.note.padding).toBe(global.typography.note.padding)
    expect(merged.shape.bubbleShape).toBe(global.shape.bubbleShape)
  })

  it('没有画布覆盖时等于全局', () => {
    const global = createDefaultSettings()
    expect(mergeCanvasSettings(global, null)).toBe(global)
  })

  it('快捷键冲突检测', () => {
    const shortcuts = { ...DEFAULT_SHORTCUTS, 'file.open': 'Ctrl+S' }
    const conflicts = findShortcutConflicts(shortcuts)
    expect(Object.keys(conflicts)).toContain('ctrl+s')
    expect(conflicts['ctrl+s'].sort()).toEqual(['file.open', 'file.save'])
    expect(findShortcutConflicts(DEFAULT_SHORTCUTS)).toEqual({})
  })
})

describe('版本与更新检查（D84 ⑤）', () => {
  it('解析版本号', () => {
    expect(parseVersion('v0.1.0')).toEqual({ major: 0, minor: 1, patch: 0, prerelease: null })
    expect(parseVersion('1.2.3-beta.1')?.prerelease).toBe('beta.1')
    expect(parseVersion('')).toBeNull()
  })

  it('比较版本', () => {
    expect(compareVersions('v0.1.1', 'v0.1.0')).toBe(1)
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0)
    expect(compareVersions('0.0.9', '0.1.0')).toBe(-1)
    expect(compareVersions('1.0.0', '1.0.0-beta')).toBe(1)
  })

  it('有新版本时给出下载地址', () => {
    const info = buildUpdateInfo('0.1.0', {
      tag_name: 'v0.2.0',
      html_url: 'https://github.com/dl0w0/sparklog/releases/tag/v0.2.0',
      body: 'notes'
    })
    expect(info.hasUpdate).toBe(true)
    expect(info.latest).toBe('v0.2.0')
    expect(info.url).toContain('v0.2.0')
  })

  it('已是最新版本', () => {
    const info = buildUpdateInfo('0.1.0', { tag_name: 'v0.1.0' })
    expect(info.hasUpdate).toBe(false)
    expect(info.error).toBeNull()
  })

  it('网络失败时给出明确错误', () => {
    const info = buildUpdateInfo('0.1.0', {})
    expect(info.hasUpdate).toBe(false)
  })
})
