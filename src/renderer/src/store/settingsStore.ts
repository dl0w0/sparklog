/** 设置 store（D84）：全局设置写入 settings.json，画布级覆盖写入 .insp 的 settings 字段。 */

import { create } from 'zustand'
import {
  createDefaultSettings,
  mergeCanvasSettings,
  normalizeSettings,
  type AppSettings,
  type CanvasSettings
} from '@shared/types/settings'
import { api } from '@renderer/services/bridge'
import { setRuntimeSettings } from '@renderer/logic/runtimeSettings'
import { useDocStore } from './docStore'

export type SettingsScope = 'global' | 'canvas'

export interface SettingsStore {
  settings: AppSettings
  /** 生效设置（全局 + 画布覆盖） */
  effective: AppSettings
  loaded: boolean
  load: () => Promise<void>
  /** 修改全局设置并落盘 */
  patch: (recipe: (draft: AppSettings) => void) => void
  /** 修改画布级设置（写入 .insp） */
  patchCanvas: (recipe: (draft: CanvasSettings) => void) => void
  /** 重置某一分区 */
  resetSection: (section: 'typography' | 'shape' | 'physics' | 'shortcuts') => void
  /** 画布切换后重新计算生效设置 */
  refreshEffective: () => void
}

function canvasSettingsOf(): CanvasSettings | null {
  const doc = useDocStore.getState().doc
  return (doc.settings ?? null) as CanvasSettings | null
}

function apply(settings: AppSettings): AppSettings {
  const effective = mergeCanvasSettings(settings, canvasSettingsOf())
  setRuntimeSettings(effective)
  return effective
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: createDefaultSettings(),
  effective: createDefaultSettings(),
  loaded: false,

  load: async () => {
    let stored: unknown = null
    try {
      stored = await api().readSettings()
    } catch {
      stored = null
    }
    const settings = stored ? normalizeSettings(stored) : createDefaultSettings()
    const effective = apply(settings)
    set({ settings, effective, loaded: true })
  },

  patch: (recipe) => {
    const next = normalizeSettings(structuredClone(get().settings))
    recipe(next)
    const settings = normalizeSettings(next)
    const effective = apply(settings)
    set({ settings, effective })
    void api().writeSettings(settings)
  },

  patchCanvas: (recipe) => {
    const doc = useDocStore.getState().doc
    const current = (doc.settings ?? {}) as CanvasSettings
    const next = structuredClone(current)
    recipe(next)
    useDocStore.getState().commit('修改画布设置', (draft) => {
      ;(draft as { settings?: CanvasSettings }).settings = next
    })
    const effective = apply(get().settings)
    set({ effective })
  },

  resetSection: (section) => {
    const defaults = createDefaultSettings()
    const next = normalizeSettings(get().settings)
    if (section === 'shortcuts') next.shortcuts = { ...defaults.shortcuts }
    else if (section === 'typography') next.typography = defaults.typography
    else if (section === 'shape') next.shape = defaults.shape
    else next.physics = defaults.physics
    const settings = normalizeSettings(next)
    const effective = apply(settings)
    set({ settings, effective })
    void api().writeSettings(settings)
  },

  refreshEffective: () => {
    const effective = apply(get().settings)
    set({ effective })
  }
}))
