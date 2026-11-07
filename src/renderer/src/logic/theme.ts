/** 主题与视觉令牌（CSS 变量由 tokens.css 提供，这里给出 TS 侧取值）。 */

import type { BubbleShape, ThemeConfig } from '@shared/types/document'

export interface ThemePalette {
  id: string
  name: string
  background: string
  bubbleFrom: string
  bubbleTo: string
  rootStroke: string
  childStroke: string
  text: string
  edge: string
  accent: string
}

export const PALETTES: ThemePalette[] = [
  {
    id: 'mist-blue',
    name: '雾蓝',
    background: '#F7F8FC',
    bubbleFrom: '#FFFFFF',
    bubbleTo: '#EEF2FF',
    rootStroke: '#5B6FD6',
    childStroke: '#B8C1E8',
    text: '#2A3050',
    edge: '#B9C2DF',
    accent: '#5B6FD6'
  },
  {
    id: 'morning-green',
    name: '晨绿',
    background: '#F6FBF7',
    bubbleFrom: '#FFFFFF',
    bubbleTo: '#E8F6EC',
    rootStroke: '#3F8F63',
    childStroke: '#B4D8C1',
    text: '#22402F',
    edge: '#B6D3C2',
    accent: '#3F8F63'
  },
  {
    id: 'warm-sand',
    name: '暖沙',
    background: '#FCF9F4',
    bubbleFrom: '#FFFFFF',
    bubbleTo: '#F7EEE0',
    rootStroke: '#B07A3C',
    childStroke: '#DEC9AA',
    text: '#43331F',
    edge: '#DCC7A8',
    accent: '#B07A3C'
  },
  {
    id: 'ink-purple',
    name: '墨紫',
    background: '#F9F7FC',
    bubbleFrom: '#FFFFFF',
    bubbleTo: '#F0EAF9',
    rootStroke: '#6E4FA3',
    childStroke: '#C9B9E4',
    text: '#2F2647',
    edge: '#C6B8DE',
    accent: '#6E4FA3'
  },
  {
    id: 'honey-apricot',
    name: '蜜杏',
    background: '#FFFBF3',
    bubbleFrom: '#FFFFFF',
    bubbleTo: '#FDEED6',
    rootStroke: '#C9832F',
    childStroke: '#E8CBA0',
    text: '#4A3318',
    edge: '#E5C9A2',
    accent: '#C9832F'
  },
  {
    id: 'paper-grey',
    name: '纸灰',
    background: '#F7F7F8',
    bubbleFrom: '#FFFFFF',
    bubbleTo: '#EFEFF2',
    rootStroke: '#5F646E',
    childStroke: '#C4C8D0',
    text: '#2B2E33',
    edge: '#C2C6CE',
    accent: '#5F646E'
  }
]

export function paletteOf(theme: ThemeConfig | undefined): ThemePalette {
  const id = theme?.presetId ?? 'mist-blue'
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]
}

export function defaultShapeOf(theme: ThemeConfig | undefined): BubbleShape {
  return theme?.overrides?.defaultShape ?? 'circle'
}

/** 生成 CSS 变量字符串，套到画布根节点 */
export function themeVars(theme: ThemeConfig | undefined): Record<string, string> {
  const p = paletteOf(theme)
  return {
    '--sl-bg': p.background,
    '--sl-bubble-from': p.bubbleFrom,
    '--sl-bubble-to': p.bubbleTo,
    '--sl-root-stroke': theme?.overrides?.rootAccent ?? p.rootStroke,
    '--sl-child-stroke': p.childStroke,
    '--sl-text': p.text,
    '--sl-edge': p.edge,
    '--sl-accent': p.accent,
    '--sl-edge-width': String(theme?.overrides?.edgeWidth ?? 1.5)
  }
}
