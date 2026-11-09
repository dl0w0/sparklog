/** 设置模型（D84）：全局写入 settings.json，仅本画布写入 .insp 的 settings 字段。 */

import type { BubbleShape } from './document'

export interface TextSettings {
  fontFamily?: string
  fontSize?: number
  color?: string
  /** 文字与气泡/卡片边缘的内边距（px） */
  padding: number
}

export interface TypographySettings {
  bubble: TextSettings
  note: TextSettings
  task: TextSettings
  attachment: TextSettings
  image: TextSettings
}

export interface ShapeSettings {
  bubbleShape: BubbleShape
  gradient: boolean
  strokeWidth: number
  strokeColor?: string
  linkColor?: string
  linkWidth: number
  linkDashed: boolean
}

export interface PhysicsSettings {
  /** 阻尼：越小收敛越快 */
  damping: number
  /** 气泡之间的最小间距 */
  minDistance: number
  /** 连线弹性（弹簧刚度） */
  elasticity: number
}

export interface ShortcutBinding {
  command: string
  accelerator: string
}

export interface AppSettings {
  version: 1
  typography: TypographySettings
  shape: ShapeSettings
  physics: PhysicsSettings
  /** command → 加速键 */
  shortcuts: Record<string, string>
  /** 开始窗口山谷视图单屏可见文件数（1–8，默认 2） */
  startValleyVisibleCount: number
  /** 星空亮度倍率（0.6–2.2，默认 1.3） */
  skyBrightness: number
  /** 星图视野（度，90–240，默认 170） */
  skyFov: number
  /** 星星光点大小（0.5–2，默认 0.75） */
  starSize: number
  /** 重要恒星名称标签 */
  showStarLabels: boolean
  /** 星座连线 */
  showConstellations: boolean
}

/** 画布级覆盖：只允许覆盖部分字段 */
export type CanvasSettings = {
  typography?: Partial<Record<keyof TypographySettings, Partial<TextSettings>>>
  shape?: Partial<ShapeSettings>
  physics?: Partial<PhysicsSettings>
}

/** 字号上下限（文本编辑器与快捷键共用，D92） */
export const FONT_SIZE_MIN = 8
export const FONT_SIZE_MAX = 72
/** 快捷键每次增减的步长 */
export const FONT_SIZE_STEP = 2

export function clampFontSize(value: number): number {
  if (!Number.isFinite(value)) return 14
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(value)))
}

export const FONT_FAMILIES: { label: string; value: string }[] = [
  { label: '系统默认', value: '' },
  { label: '微软雅黑', value: '"Microsoft YaHei UI", sans-serif' },
  { label: '宋体', value: 'SimSun, serif' },
  { label: '黑体', value: 'SimHei, sans-serif' },
  { label: '楷体', value: 'KaiTi, serif' },
  { label: 'Segoe UI', value: '"Segoe UI", sans-serif' }
]

export const DEFAULT_SHORTCUTS: Record<string, string> = {
  'file.new': 'Ctrl+N',
  'file.open': 'Ctrl+O',
  'file.save': 'Ctrl+S',
  'file.saveAs': 'Ctrl+Shift+S',
  'file.close': 'Ctrl+W',
  'edit.undo': 'Ctrl+Z',
  'edit.redo': 'Ctrl+Y',
  'edit.cut': 'Ctrl+X',
  'edit.copy': 'Ctrl+C',
  'edit.paste': 'Ctrl+V',
  'edit.selectAll': 'Ctrl+A',
  'edit.search': 'Ctrl+F',
  'edit.copyStyle': 'Ctrl+Alt+C',
  'edit.pasteStyle': 'Ctrl+Alt+V',
  'edit.addParentLink': 'Ctrl+Alt+L',
  'insert.note': 'Ctrl+Alt+N',
  'insert.task': 'Ctrl+Alt+T',
  'insert.attachment': 'Ctrl+Alt+A',
  'zone.create': 'Ctrl+Shift+G',
  'view.fit': 'Ctrl+Shift+F',
  'view.isolate': 'F'
}

export const SHORTCUT_LABELS: Record<string, string> = {
  'file.new': '新建画布',
  'file.open': '打开',
  'file.save': '保存',
  'file.saveAs': '另存为',
  'file.close': '关闭窗口',
  'edit.undo': '撤销',
  'edit.redo': '重做',
  'edit.cut': '剪切',
  'edit.copy': '复制',
  'edit.paste': '粘贴',
  'edit.selectAll': '全选',
  'edit.search': '搜索',
  'edit.copyStyle': '拷贝样式',
  'edit.pasteStyle': '粘贴样式',
  'edit.addParentLink': '添加父连接',
  'insert.note': '插入笔记',
  'insert.task': '插入任务',
  'insert.attachment': '插入附件',
  'zone.create': '创建专区',
  'view.fit': '适应画布',
  'view.isolate': '仅显示该分支'
}

const text = (patch: Partial<TextSettings> = {}): TextSettings => ({
  padding: 10,
  ...patch
})

export function createDefaultSettings(): AppSettings {
  return {
    version: 1,
    typography: {
      bubble: text({ fontSize: 20 }),
      note: text({ fontSize: 13 }),
      task: text({ fontSize: 13 }),
      attachment: text({ fontSize: 12 }),
      image: text({ fontSize: 12 })
    },
    shape: {
      bubbleShape: 'circle',
      gradient: true,
      strokeWidth: 1.5,
      linkColor: '#9aa4c8',
      linkWidth: 1.5,
      linkDashed: false
    },
    physics: {
      damping: 0.7,
      minDistance: 18,
      elasticity: 0.08
    },
    shortcuts: { ...DEFAULT_SHORTCUTS },
    startValleyVisibleCount: 2,
    skyBrightness: 1.3,
    skyFov: 170,
    starSize: 0.75,
    showStarLabels: true,
    showConstellations: true
  }
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function str(value: unknown, fallback: string | undefined): string | undefined {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed.length > 0 ? value : fallback
}

function normalizeText(value: unknown, base: TextSettings): TextSettings {
  const raw = (value ?? {}) as Partial<TextSettings>
  return {
    fontFamily: str(raw.fontFamily, base.fontFamily),
    fontSize: num(raw.fontSize, base.fontSize ?? 14, 8, 72),
    color: str(raw.color, base.color),
    padding: num(raw.padding, base.padding, 0, 40)
  }
}

/** 把任意来源（磁盘 JSON / 画布字段）收敛成合法设置 */
export function normalizeSettings(value: unknown, base: AppSettings = createDefaultSettings()): AppSettings {
  const raw = (value ?? {}) as Partial<AppSettings>
  const typo = (raw.typography ?? {}) as Partial<TypographySettings>
  const keys: (keyof TypographySettings)[] = ['bubble', 'note', 'task', 'attachment', 'image']
  const typography = {} as TypographySettings
  for (const key of keys) typography[key] = normalizeText(typo[key], base.typography[key])

  const shape = (raw.shape ?? {}) as Partial<ShapeSettings>
  const physics = (raw.physics ?? {}) as Partial<PhysicsSettings>
  const shortcuts: Record<string, string> = { ...base.shortcuts }
  if (raw.shortcuts && typeof raw.shortcuts === 'object') {
    for (const [command, accelerator] of Object.entries(raw.shortcuts)) {
      if (typeof accelerator === 'string' && accelerator.trim().length > 0) {
        shortcuts[command] = accelerator.trim()
      }
    }
  }

  return {
    version: 1,
    typography,
    shape: {
      bubbleShape: (['circle', 'ellipse', 'roundedRect'] as const).includes(
        shape.bubbleShape as BubbleShape
      )
        ? (shape.bubbleShape as BubbleShape)
        : base.shape.bubbleShape,
      gradient: typeof shape.gradient === 'boolean' ? shape.gradient : base.shape.gradient,
      strokeWidth: num(shape.strokeWidth, base.shape.strokeWidth, 0, 8),
      strokeColor: str(shape.strokeColor, base.shape.strokeColor),
      linkColor: str(shape.linkColor, base.shape.linkColor),
      linkWidth: num(shape.linkWidth, base.shape.linkWidth, 0.5, 8),
      linkDashed: typeof shape.linkDashed === 'boolean' ? shape.linkDashed : base.shape.linkDashed
    },
    physics: {
      damping: num(physics.damping, base.physics.damping, 0.2, 0.98),
      minDistance: num(physics.minDistance, base.physics.minDistance, 0, 200),
      elasticity: num(physics.elasticity, base.physics.elasticity, 0.01, 0.6)
    },
    shortcuts,
    startValleyVisibleCount: Math.min(
      8,
      Math.max(1, Math.round(num(raw.startValleyVisibleCount, 2, 1, 8)))
    ),
    skyBrightness: num(raw.skyBrightness, base.skyBrightness ?? 1.3, 0.6, 2.2),
    skyFov: num(raw.skyFov, base.skyFov ?? 170, 90, 240),
    starSize: num(raw.starSize, base.starSize ?? 0.75, 0.5, 2),
    showStarLabels:
      typeof raw.showStarLabels === 'boolean' ? raw.showStarLabels : (base.showStarLabels ?? true),
    showConstellations:
      typeof raw.showConstellations === 'boolean'
        ? raw.showConstellations
        : (base.showConstellations ?? true)
  }
}

/** 把画布级覆盖合并到全局设置之上 */
export function mergeCanvasSettings(
  global: AppSettings,
  canvas?: CanvasSettings | null
): AppSettings {
  if (!canvas) return global
  const merged = {
    ...global,
    typography: { ...global.typography },
    shape: { ...global.shape, ...(canvas.shape ?? {}) },
    physics: { ...global.physics, ...(canvas.physics ?? {}) }
  }
  if (canvas.typography) {
    for (const key of Object.keys(canvas.typography) as (keyof TypographySettings)[]) {
      merged.typography[key] = { ...global.typography[key], ...(canvas.typography[key] ?? {}) }
    }
  }
  return normalizeSettings(merged, global)
}

/** 快捷键冲突检测：返回冲突的加速键 → 命令列表 */
export function findShortcutConflicts(shortcuts: Record<string, string>): Record<string, string[]> {
  const byKey = new Map<string, string[]>()
  for (const [command, accelerator] of Object.entries(shortcuts)) {
    const key = accelerator.trim().toLowerCase()
    if (!key) continue
    const list = byKey.get(key)
    if (list) list.push(command)
    else byKey.set(key, [command])
  }
  const conflicts: Record<string, string[]> = {}
  for (const [key, commands] of byKey) {
    if (commands.length > 1) conflicts[key] = commands
  }
  return conflicts
}
