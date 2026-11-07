/** 主题：预设批量套用与个性化覆盖。 */

import type { BubbleShape, ThemeConfig } from '@shared/types/document'
import { useDocStore } from '@renderer/store/docStore'

export function applyThemePreset(presetId: string): void {
  const store = useDocStore.getState()
  if (store.doc.theme.presetId === presetId) return
  store.commit('套用主题', (d) => {
    d.theme = { ...d.theme, presetId }
  })
}

export function setThemeOverride(
  patch: Partial<NonNullable<ThemeConfig['overrides']>>
): void {
  useDocStore.getState().commit('修改主题设置', (d) => {
    d.theme = {
      ...d.theme,
      overrides: { ...(d.theme.overrides ?? {}), ...patch }
    }
  })
}

export function setDefaultShape(shape: BubbleShape): void {
  setThemeOverride({ defaultShape: shape })
}

export function currentTheme(): ThemeConfig {
  return useDocStore.getState().doc.theme
}
