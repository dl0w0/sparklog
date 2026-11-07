/** 文档数据模型：`.insp` 文件格式的类型契约。 */

export type ViewMode = 'bubble' | 'mindmap'
export type BubbleShape = 'circle' | 'ellipse' | 'roundedRect'
export type InsertKind = 'note' | 'task' | 'attachment' | 'image'

export interface Vec2 {
  x: number
  y: number
}

export interface Size {
  w: number
  h: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Viewport {
  scale: number
  offsetX: number
  offsetY: number
}

export interface BubbleStyle {
  shape?: BubbleShape
  colorKey?: string
  fontSize?: number
  strokeWidth?: number
  /** 字体族（D66） */
  fontFamily?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  /** 文字颜色 */
  textColor?: string
  /** 文字高亮底色 */
  highlight?: string
}

export interface BubbleNode {
  id: string
  text: string
  /** 1–100 连续值，决定半径 */
  importance: number
  shape: BubbleShape
  colorKey: string
  /** 多父：第一个元素为主父，决定导图归属与左方向键 */
  parentIds: string[]
  /** null = 主画布 */
  zoneId: string | null
  /** 相对所属层级的坐标（气泡中心） */
  bubblePos: Vec2
  /** 单气泡样式覆盖，供「粘贴样式」使用 */
  style?: BubbleStyle
  /** 折叠其全部后代（D27） */
  collapsed?: boolean
  /** 用户手动调过重要程度（滚轮/批量），此时不再应用层级半径缩放（D46） */
  importanceOverride?: boolean
  /** 到主父的连线长度被手动固定（Ctrl 拖拽 / 建立连接，D40/D44） */
  linkLength?: number
  createdAt: string
  updatedAt: string
}

export interface Zone {
  id: string
  title: string
  colorKey: string
  parentZoneId: string | null
  pos: Vec2
  size: Size
  /** 进入该专区时的视口记忆 */
  viewport: Viewport
}

export interface NotePayload {
  title: string
  content: string
}

export interface TaskItem {
  id: string
  text: string
  done: boolean
}

/** 任务卡支持多行条目（D28） */
export interface TaskPayload {
  items: TaskItem[]
}

export interface AttachmentPayload {
  path: string
  name: string
  ext: string
}

export interface ImagePayload {
  path: string
  name: string
  w: number
  h: number
}

export interface InsertObject {
  id: string
  kind: InsertKind
  zoneId: string | null
  /** null = 独立摆在画布上；否则附着于该气泡 */
  ownerBubbleId: string | null
  pos: Vec2
  /** 钉住后不随所属气泡及其子树移动 */
  pinned: boolean
  /** 附着对象是否已展开为卡片（D26）；false = 折叠成简笔小图标 */
  expanded?: boolean
  note?: NotePayload
  task?: TaskPayload
  attachment?: AttachmentPayload
  image?: ImagePayload
  createdAt: string
  updatedAt: string
}

export interface EdgeStyle {
  dashed?: boolean
  color?: string
  width?: number
  /** 连线标签文字（D52） */
  label?: string
}

export type EdgeEndpointKind = 'bubble' | 'insert'

/** 关联连线（虚线）：气泡↔气泡 或 气泡↔插入对象（D50 / D51） */
export interface Link {
  id: string
  from: string
  to: string
  fromKind: EdgeEndpointKind
  toKind: EdgeEndpointKind
  /** 用户设定的长度（D48 / D49），未设定时按两端几何计算 */
  length?: number
  /** 连线标签 */
  label?: string
  style?: EdgeStyle
}

export interface ThemeConfig {
  presetId: string
  overrides?: {
    defaultShape?: BubbleShape
    fontSize?: number
    edgeWidth?: number
    backgroundTexture?: string
    rootAccent?: string
  }
}

export interface SparklogFile {
  fileVersion: number
  meta: {
    title: string
    createdAt: string
    updatedAt: string
    appVersion: string
  }
  viewMode: ViewMode
  theme: ThemeConfig
  rootViewport: Viewport
  nodes: BubbleNode[]
  zones: Zone[]
  inserts: InsertObject[]
  /** 关联连线 */
  links: Link[]
  /** 父子连线的样式覆盖，key = parentId->childId */
  edgeStyles: Record<string, EdgeStyle>
  /** 画布级设置覆盖（D84，仅本画布） */
  settings?: CanvasSettings | null
}

/** 由 parentIds 推导出的连线 */
export interface Edge {
  id: string
  from: string
  to: string
  /** true = 跨树回边（网状结构里的次要父连接） */
  backEdge: boolean
}

/** 选区 */
export interface Selection {
  bubbleIds: string[]
  insertIds: string[]
  zoneIds: string[]
}
