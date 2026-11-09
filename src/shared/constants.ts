/** 全局常量：文件格式、尺寸映射、性能与交互边界。 */

export const APP_NAME = 'Sparklog'
export const FILE_VERSION = 1
export const FILE_EXTENSION = 'insp'
export const FILE_FILTER_NAME = 'Sparklog 灵感画布'
export const UNTITLED_NAME = '未命名'

/** 重要程度取值范围（连续值） */
export const IMPORTANCE_MIN = 1
export const IMPORTANCE_MAX = 100
export const IMPORTANCE_DEFAULT = 50

/** importance -> 半径：r = BASE + SPAN * ((i-1)/99)^EXP（D33：整体收小） */
export const RADIUS_MIN = 22
export const RADIUS_MAX = 132
export const RADIUS_BASE = 26
export const RADIUS_SPAN = 84
export const RADIUS_EXP = 0.85
export const ROOT_RADIUS_FACTOR = 1.12

/** 思维导图视图下半径上限，避免破坏自动布局 */
export const MINDMAP_RADIUS_MIN = 20
export const MINDMAP_RADIUS_MAX = 92

/** 字号映射与缩字下限 */
export const FONT_BASE = 13
export const FONT_MAX = 20
export const FONT_MIN = 11

/** 画布缩放范围 */
export const SCALE_MIN = 0.05
export const SCALE_MAX = 4

/** 撤销栈深度上限 */
export const HISTORY_LIMIT = 500

/** 形状比例 */
export const ELLIPSE_RX = 1.15
export const ELLIPSE_RY = 0.85
export const CORNER_RATIO = 0.22

/** 连线与布局 */
export const EDGE_WIDTH = 1.5
export const EDGE_CURVATURE = 0.12
export const EDGE_MINDMAP_TANGENT = 0.5
export const SIBLING_GAP = 28
export const LEVEL_GAP = 90
export const TREE_GAP = 120
/** 新建子气泡与父气泡的默认间隙（D33：连线更有呼吸感） */
export const SPAWN_GAP = 84
/** 建立连接后自动松弛到的默认连线长度 = 两端半径 + 该间隙 */
export const LINK_GAP = 84

/** 气泡间最小呼吸空隙（D45）：物理斥力的 padding */
export const BUBBLE_PADDING = 30

/** 半径随层级递减（D46） */
export const DEPTH_SCALE = 0.88
export const MIN_DEPTH_SCALE = 0.55

/** 同一父节点下的子节点密度超过等距环容量时，连线自动伸长的上限倍数 */
export const DENSITY_MAX_FACTOR = 2.6

/** 视口裁剪留白（世界坐标） */
export const CULL_MARGIN = 200

/** 默认视口 */
export const DEFAULT_VIEWPORT = { scale: 1, offsetX: 0, offsetY: 0 }

/** 主题预设 */
export const THEME_PRESETS = [
  { id: 'mist-blue', name: '雾蓝' },
  { id: 'morning-green', name: '晨绿' },
  { id: 'warm-sand', name: '暖沙' },
  { id: 'ink-purple', name: '墨紫' },
  { id: 'honey-apricot', name: '蜜杏' },
  { id: 'paper-grey', name: '纸灰' }
] as const

/** 气泡文字与气泡边缘的固定内边距（D73） */
export const BUBBLE_TEXT_PADDING = 10
