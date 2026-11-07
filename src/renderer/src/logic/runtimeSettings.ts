/** 设置运行时配置（D84）：物理/排版/图形参数从这里读取，改设置即时生效。 */

import {
  createDefaultSettings,
  normalizeSettings,
  type AppSettings,
  type PhysicsSettings,
  type ShapeSettings,
  type TypographySettings
} from '@shared/types/settings'

let current: AppSettings = createDefaultSettings()

export function setRuntimeSettings(value: unknown): AppSettings {
  current = normalizeSettings(value)
  return current
}

export function getRuntimeSettings(): AppSettings {
  return current
}

export function getPhysicsSettings(): PhysicsSettings {
  return current.physics
}

export function getShapeSettings(): ShapeSettings {
  return current.shape
}

export function getTypographySettings(): TypographySettings {
  return current.typography
}
