import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BUBBLE_PADDING, CULL_MARGIN, DEFAULT_VIEWPORT } from '@shared/constants'
import type { BubbleNode as BubbleNodeData, Edge, Vec2 } from '@shared/types/document'
import { ancestorsOf, deriveEdges, descendantsOf, nodesInZone, subtreeIds } from '@renderer/logic/graph'
import { cullVisible } from '@renderer/logic/layout/culling'
import { layoutMindmap } from '@renderer/logic/layout/mindmapLayout'
import { screenToWorld } from '@renderer/logic/layout/fitView'
import { bezierToPath, buildEdgeGeometry, pointOnShape } from '@renderer/logic/geometry'
import { computeDepths, makeRadiusResolver, shapeOf } from '@renderer/logic/nodeVisual'
import { buildSprings, isSettled, stepPhysics, type PhysicsBody, type Spring } from '@renderer/logic/physics'
import { resolveLinkLengths } from '@renderer/logic/linkLength'
import {
  buildViewEdges,
  entityGeometry,
  type EntityGeometry,
  type ViewEdge
} from '@renderer/logic/links'
import { createAssocLink, setEdgeLength } from '@renderer/actions/edgeActions'
import { useDocStore } from '@renderer/store/docStore'
import { ROOT_LEVEL, useViewportStore } from '@renderer/store/viewportStore'
import { useSelectionStore } from '@renderer/store/selectionStore'
import { useUiStore } from '@renderer/store/uiStore'
import {
  addChildBubble,
  addParentLink,
  addSiblingBubble,
  adjustImportance,
  commitPositionsAbsolute,
  commitText,
  endImportanceGesture,
  toggleCollapse
} from '@renderer/actions/bubbleActions'
import { registerCanvasController } from '@renderer/actions/commands'
import { recordFrame } from '@renderer/services/perfMeter'
import { createZoneAt, ensureValidLevel, exitZone, moveBubbleIntoZone } from '@renderer/actions/zoneActions'
import { insertDisplayPos } from '@renderer/actions/insertActions'
import { insertRadius } from '@renderer/logic/fitBounds'
import { tidyPositions } from '@renderer/logic/tidy'
import BubbleNode from './BubbleNode'
import EdgeLayer from './EdgeLayer'
import InlineEditor from './InlineEditor'
import BubbleTextTip from './BubbleTextTip'
import EmptyCanvasHint from './EmptyCanvasHint'
import InsertLayer from './InsertLayer'
import ZoneLayer from './ZoneLayer'

/** 物理拖拽：整张连通网络参与模拟，上限用于极端情况兜底（PRD D20/D34） */
const PHYSICS_CAP = 600
const INERTIA_MAX_MS = 1200

/** 与 nodeId 直接或间接相连的全部气泡（无向连通分量） */
export function connectedComponent(
  nodes: readonly BubbleNodeData[],
  nodeId: string,
  cap = PHYSICS_CAP
): Set<string> {
  const childrenOf = new Map<string, string[]>()
  for (const n of nodes) {
    for (const p of n.parentIds) {
      const arr = childrenOf.get(p)
      if (arr) arr.push(n.id)
      else childrenOf.set(p, [n.id])
    }
  }
  const byId = new Map(nodes.map((n) => [n.id, n]))
  if (!byId.has(nodeId)) return new Set<string>()
  const seen = new Set<string>()
  const stack = [nodeId]
  while (stack.length > 0 && seen.size < cap) {
    const id = stack.pop() as string
    if (seen.has(id)) continue
    seen.add(id)
    const node = byId.get(id)
    if (node) for (const p of node.parentIds) if (!seen.has(p)) stack.push(p)
    for (const c of childrenOf.get(id) ?? []) if (!seen.has(c)) stack.push(c)
  }
  return seen
}

interface DragSession {
  nodeId: string
  draggedIds: Set<string>
  startX: number
  startY: number
  scale: number
  origin: Map<string, Vec2>
  bodies: PhysicsBody[]
  springs: Spring[]
  els: Map<string, SVGGElement>
  edges: { el: SVGPathElement; from: string; to: string }[]
  moved: boolean
  raf: number | null
  lastDx: number
  lastDy: number
  vel: { x: number; y: number }
  alt: boolean
  /** Ctrl 拖拽：父级固定、连线长度随拖动（D38） */
  ctrl: boolean
  /** 附着在气泡上的插入对象元素（D41：随气泡一起移动） */
  insertEls: { el: HTMLElement; ownerId: string; rel: Vec2 }[]
  /** 参与物理的插入对象（非钉住的关联对象），按左/上定位 */
  insertBodyEls: Map<string, HTMLElement>
  /** 拖拽开始时的视口平移，用于把世界坐标换算成屏幕坐标 */
  vpOffset: Vec2
  /** 上一帧写过的坐标，用于跳过未变化的元素 */
  last: Map<string, Vec2>
}

let importanceTimer: ReturnType<typeof setTimeout> | null = null

export function CanvasStage(): JSX.Element {
  const doc = useDocStore((s) => s.doc)
  const viewMode = doc.viewMode
  const levelId = useViewportStore((s) => s.levelId)
  const vp = useViewportStore((s) => s.viewports[s.levelId] ?? DEFAULT_VIEWPORT)
  const selectedIds = useSelectionStore((s) => s.selectedIds)
  const selectedEdgeId = useSelectionStore((s) => s.selectedEdgeId)
  const editingId = useSelectionStore((s) => s.editingId)
  const isolateRootId = useSelectionStore((s) => s.isolateRootId)
  const zoneCreating = useUiStore((s) => s.zoneCreating)

  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const gRef = useRef<SVGGElement>(null)
  const dragRef = useRef<DragSession | null>(null)
  const snapshotRef = useRef<{
    mode: 'bubble' | 'mindmap'
    positions: Map<string, Vec2>
    radii: Map<string, number>
    styles: Map<string, BubbleNodeData['shape']>
  } | null>(null)
  const transitionRef = useRef<number | null>(null)
  const suppressContextRef = useRef(false)
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setHoverDelayed = useCallback((id: string | null) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    if (id) {
      setHoverNodeId(id)
      return
    }
    // 留出时间把鼠标移到上方文本框（D77）
    hoverTimerRef.current = setTimeout(() => setHoverNodeId(null), 260)
  }, [])
  const [tipEditingId, setTipEditingId] = useState<string | null>(null)
  const [tipNodeId, setTipNodeId] = useState<string | null>(null)
  const tipHoldRef = useRef(false)
  const tipHoverRef = useRef(false)

  /** D80：文本框只在 ①省略号悬停 ②长按气泡 ③双击进入编辑 时出现 */
  const showTipFromHover = useCallback((id: string | null) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    if (id) {
      tipHoldRef.current = false
      setTipNodeId(id)
      return
    }
    // 省略号通道：离开即收起（不占用长按的宽限）
    if (!tipHoldRef.current && !useSelectionStore.getState().editingId) {
      tipHoldRef.current = false
      setTipNodeId(null)
    }
  }, [])

  const showTipFromLongHover = useCallback((id: string | null) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    if (id) {
      tipHoldRef.current = true
      setTipNodeId(id)
      return
    }
    // 离开气泡后给 300ms 移到文本框上；没移过去就收起
    hoverTimerRef.current = setTimeout(() => {
      if (!tipHoverRef.current && !useSelectionStore.getState().editingId) {
        tipHoldRef.current = false
        setTipNodeId(null)
      }
    }, 300)
  }, [])
  const [size, setSize] = useState({ w: 1000, h: 700 })
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  const zoneId = levelId === ROOT_LEVEL ? null : levelId
  const radiusOfNode = useMemo(() => makeRadiusResolver(doc.nodes, viewMode), [doc.nodes, viewMode])
  const depthOf = useMemo(() => computeDepths(doc.nodes), [doc.nodes])

  // 层级失效守卫：当前专区被删除/撤销掉时退回主画布
  useEffect(() => {
    ensureValidLevel()
  }, [doc.zones, levelId])

  const levelNodes = useMemo(() => nodesInZone(doc.nodes, zoneId), [doc.nodes, zoneId])

  const branchIds = useMemo(() => {
    if (!isolateRootId) return null
    const ids = new Set<string>([isolateRootId])
    for (const id of ancestorsOf(doc.nodes, isolateRootId)) ids.add(id)
    for (const id of descendantsOf(doc.nodes, isolateRootId)) ids.add(id)
    return ids
  }, [isolateRootId, doc.nodes])

  /** 被折叠父节点藏起来的后代（D27） */
  const hiddenIds = useMemo(() => {
    const hidden = new Set<string>()
    for (const node of doc.nodes) {
      if (!node.collapsed) continue
      for (const id of descendantsOf(doc.nodes, node.id)) hidden.add(id)
    }
    return hidden
  }, [doc.nodes])

  const shownNodes = useMemo(
    () =>
      levelNodes.filter(
        (n) => !hiddenIds.has(n.id) && (!branchIds || branchIds.has(n.id))
      ),
    [levelNodes, branchIds, hiddenIds]
  )

  const layout = useMemo(() => {
    if (viewMode === 'mindmap') {
      const res = layoutMindmap(shownNodes, { radiusOf: (n) => radiusOfNode(n) })
      return { positions: res.positions, backEdges: res.backEdges }
    }
    const positions = new Map<string, Vec2>()
    for (const n of shownNodes) positions.set(n.id, n.bubblePos)
    return { positions, backEdges: [] as { from: string; to: string }[] }
  }, [shownNodes, viewMode])

  const nodesById = useMemo(() => {
    const map = new Map<string, BubbleNodeData>()
    for (const n of shownNodes) map.set(n.id, n)
    return map
  }, [shownNodes])

  const allNodesById = useMemo(() => {
    const map = new Map<string, BubbleNodeData>()
    for (const n of doc.nodes) map.set(n.id, n)
    return map
  }, [doc.nodes])

  const edges = useMemo<Edge[]>(() => {
    const allowed = new Set(shownNodes.map((n) => n.id))
    return deriveEdges(doc.nodes).filter((e) => allowed.has(e.from) && allowed.has(e.to))
  }, [doc.nodes, shownNodes])

  /** 渲染用连线：父子连线 + 关联线（D49 / D51） */
  const viewEdges = useMemo<ViewEdge[]>(() => {
    const allowed = new Set(shownNodes.map((n) => n.id))
    const insertIds = new Set(
      doc.inserts.filter((i) => i.zoneId === zoneId).map((i) => i.id)
    )
    const ok = (id: string): boolean => allowed.has(id) || insertIds.has(id)
    return buildViewEdges(doc).filter((e) => ok(e.from) && ok(e.to))
  }, [doc, shownNodes, zoneId])

  /** 连线端点几何：气泡用当前半径，插入对象用固定半径 */
  const entityGeom = useMemo(() => {
    const map = new Map<string, EntityGeometry>()
    for (const n of shownNodes) {
      map.set(n.id, {
        center: layout.positions.get(n.id) ?? n.bubblePos,
        radius: radiusOfNode(n),
        shape: shapeOf(n)
      })
    }
    for (const ins of doc.inserts.filter((i) => i.zoneId === zoneId)) {
      map.set(ins.id, {
        center: insertDisplayPos(ins, doc.nodes, doc.viewMode),
        radius: 34,
        shape: 'roundedRect'
      })
    }
    return map
  }, [shownNodes, layout, doc, zoneId, radiusOfNode])

  const selectedEdge = useMemo(
    () => viewEdges.find((e) => e.id === selectedEdgeId) ?? null,
    [viewEdges, selectedEdgeId]
  )

  const visibleIds = useMemo(() => {
    const items = shownNodes.map((n) => ({
      id: n.id,
      pos: layout.positions.get(n.id) ?? n.bubblePos,
      radius: radiusOfNode(n)
    }))
    return cullVisible(items, vp, size, CULL_MARGIN)
  }, [shownNodes, layout, vp, size, viewMode])

  const emphasized = useMemo(() => {
    const set = new Set<string>(selectedIds)
    for (const id of selectedIds) {
      const node = allNodesById.get(id)
      if (!node) continue
      for (const p of node.parentIds) set.add(p)
    }
    return set
  }, [selectedIds, allNodesById])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  /** 折叠按钮：相对气泡中心的偏移（D37 渲染在气泡自身 transform 内） */
  const toggleMap = useMemo(() => {
    const childrenByParent = new Map<string, BubbleNodeData[]>()
    for (const n of levelNodes) {
      for (const p of n.parentIds) {
        const arr = childrenByParent.get(p)
        if (arr) arr.push(n)
        else childrenByParent.set(p, [n])
      }
    }
    const map = new Map<string, { dx: number; dy: number; collapsed: boolean; count: number }>()
    for (const node of shownNodes) {
      const kids = childrenByParent.get(node.id) ?? []
      if (kids.length === 0) continue
      const center = layout.positions.get(node.id) ?? node.bubblePos
      const childPos = layout.positions.get(kids[0].id) ?? kids[0].bubblePos
      const p = pointOnShape(shapeOf(node), radiusOfNode(node) + 14, center, childPos)
      map.set(node.id, {
        dx: p.x - center.x,
        dy: p.y - center.y,
        collapsed: Boolean(node.collapsed),
        count: kids.length
      })
    }
    return map
  }, [levelNodes, shownNodes, layout, viewMode])

  // —— 视图切换插值动画（D59） ——
  useLayoutEffect(() => {
    const current = {
      mode: viewMode,
      positions: layout.positions,
      radii: new Map(shownNodes.map((n) => [n.id, radiusOfNode(n)] as const)),
      styles: new Map(shownNodes.map((n) => [n.id, shapeOf(n)] as const))
    }
    const prev = snapshotRef.current
    snapshotRef.current = current
    if (!prev || prev.mode === viewMode) return
    const svg = svgRef.current
    if (!svg) return

    if (transitionRef.current !== null) cancelAnimationFrame(transitionRef.current)
    const duration = 280
    const started = performance.now()
    const from = prev
    const to = current

    const apply = (t: number): void => {
      // 测试观测点：记录插值进度（生产环境无副作用）
      const probe = (globalThis as unknown as { __slAnimLog?: string[] }).__slAnimLog
      if (Array.isArray(probe)) probe.push(t.toFixed(3))
      for (const node of shownNodes) {
        const a = from.positions.get(node.id)
        const b = to.positions.get(node.id)
        const el = svg.querySelector<SVGGElement>(`[data-bubble-id="${cssEscape(node.id)}"]`)
        if (!a || !b || !el) continue
        const r1 = from.radii.get(node.id) ?? 1
        const r2 = to.radii.get(node.id) ?? r1
        const k = 1 + (r2 / r1 - 1) * t
        el.setAttribute(
          'transform',
          `translate(${a.x + (b.x - a.x) * t} ${a.y + (b.y - a.y) * t}) scale(${k})`
        )
      }
      for (const edge of viewEdges) {
        const el = svg.querySelector<SVGPathElement>(`[data-edge-id="${edge.id}"]`)
        if (!el) continue
        const fa = from.positions.get(edge.from)
        const fb = from.positions.get(edge.to)
        const ta = to.positions.get(edge.from)
        const tb = to.positions.get(edge.to)
        if (!fa || !fb || !ta || !tb) continue
        const pa = { x: fa.x + (ta.x - fa.x) * t, y: fa.y + (ta.y - fa.y) * t }
        const pb = { x: fb.x + (tb.x - fb.x) * t, y: fb.y + (tb.y - fb.y) * t }
        const ra1 = from.radii.get(edge.from) ?? 40
        const ra2 = to.radii.get(edge.from) ?? ra1
        const rb1 = from.radii.get(edge.to) ?? 40
        const rb2 = to.radii.get(edge.to) ?? rb1
        const geoA = buildEdgeGeometry(
          { center: pa, radius: ra1 + (ra2 - ra1) * t, shape: from.styles.get(edge.from) ?? 'circle' },
          { center: pb, radius: rb1 + (rb2 - rb1) * t, shape: from.styles.get(edge.to) ?? 'circle' },
          from.mode
        )
        const geoB = buildEdgeGeometry(
          { center: pa, radius: ra1 + (ra2 - ra1) * t, shape: to.styles.get(edge.from) ?? 'circle' },
          { center: pb, radius: rb1 + (rb2 - rb1) * t, shape: to.styles.get(edge.to) ?? 'circle' },
          to.mode
        )
        const mix = (p1: Vec2, p2: Vec2): Vec2 => ({
          x: p1.x + (p2.x - p1.x) * t,
          y: p1.y + (p2.y - p1.y) * t
        })
        el.setAttribute(
          'd',
          bezierToPath({
            p0: geoA.curve.p0,
            c1: mix(geoA.curve.c1, geoB.curve.c1),
            c2: mix(geoA.curve.c2, geoB.curve.c2),
            p1: geoA.curve.p1
          })
        )
      }
    }

    const tick = (): void => {
      const raw = Math.min(1, (performance.now() - started) / duration)
      const t = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2
      apply(t)
      if (raw < 1) {
        transitionRef.current = requestAnimationFrame(tick)
        return
      }
      transitionRef.current = null
      // 收尾：把 transform 还原成纯平移，交给 React 的最终渲染
      for (const node of shownNodes) {
        const el = svg.querySelector<SVGGElement>(`[data-bubble-id="${cssEscape(node.id)}"]`)
        const b = to.positions.get(node.id)
        if (el && b) el.setAttribute('transform', `translate(${b.x} ${b.y})`)
      }
    }
    apply(0)
    transitionRef.current = requestAnimationFrame(tick)
    return () => {
      if (transitionRef.current !== null) {
        cancelAnimationFrame(transitionRef.current)
        transitionRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode])

  // —— 尺寸感知 ——
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect) setSize({ w: Math.max(1, rect.width), h: Math.max(1, rect.height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // —— 视图控制器 ——
  useEffect(() => {
    registerCanvasController({
      fit: () => {
        // 读实时文档：插入对象/专区可能在闭包快照之后才创建
        const live = useDocStore.getState().doc
        const items: { pos: Vec2; radius: number }[] = shownNodes.map((n) => ({
          pos: layout.positions.get(n.id) ?? n.bubblePos,
          radius: radiusOfNode(n)
        }))
        for (const insert of live.inserts) {
          if (insert.zoneId !== zoneId) continue
          items.push({
            pos: insertDisplayPos(insert, live.nodes, live.viewMode),
            radius: insertRadius(insert)
          })
        }
        for (const zone of live.zones) {
          if (zone.parentZoneId !== zoneId) continue
          items.push({
            pos: { x: zone.pos.x + zone.size.w / 2, y: zone.pos.y + zone.size.h / 2 },
            radius: Math.hypot(zone.size.w, zone.size.h) / 2
          })
        }
        useViewportStore.getState().fit(items, size)
      },
      worldCenter: () =>
        screenToWorld({ x: size.w / 2, y: size.h / 2 }, useViewportStore.getState().current()),
      tidy: () => {
        const state = useDocStore.getState()
        const targets = tidyPositions(state.doc.nodes, zoneId)
        if (targets.size === 0) return
        const svg = svgRef.current
        const from = new Map<string, Vec2>()
        for (const node of shownNodes) {
          from.set(node.id, layout.positions.get(node.id) ?? node.bubblePos)
        }
        const edgesToUpdate = viewEdges
        const started = performance.now()
        const duration = 340
        const step = (): void => {
          const raw = Math.min(1, (performance.now() - started) / duration)
          const e = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2
          const current = new Map<string, Vec2>()
          for (const [id, a] of from) {
            const b = targets.get(id)
            if (!b) continue
            const p = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e }
            current.set(id, p)
            const el = svg?.querySelector<SVGGElement>(`[data-bubble-id="${cssEscape(id)}"]`)
            el?.setAttribute('transform', `translate(${p.x} ${p.y})`)
          }
          for (const edge of edgesToUpdate) {
            const el = svg?.querySelector<SVGPathElement>(`[data-edge-id="${edge.id}"]`)
            const a = current.get(edge.from) ?? layout.positions.get(edge.from)
            const b = current.get(edge.to) ?? layout.positions.get(edge.to)
            if (!el || !a || !b) continue
            const geo = buildEdgeGeometry(
              { center: a, radius: radiusOfNode(nodesById.get(edge.from) ?? shownNodes[0]), shape: 'circle' },
              { center: b, radius: radiusOfNode(nodesById.get(edge.to) ?? shownNodes[0]), shape: 'circle' },
              viewMode
            )
            el.setAttribute('d', geo.path)
          }
          if (raw < 1) {
            requestAnimationFrame(step)
            return
          }
          commitPositionsAbsolute(new Map([...targets].map(([id, p]) => [id, p])))
          useUiStore.getState().showToast('已梳理气泡')
        }
        requestAnimationFrame(step)
      },
      centerOn: (id: string) => {
        const node = allNodesById.get(id)
        if (!node) return
        const pos = layout.positions.get(id) ?? node.bubblePos
        const cur = useViewportStore.getState().current()
        useViewportStore.getState().set({
          scale: cur.scale,
          offsetX: size.w / 2 - pos.x * cur.scale,
          offsetY: size.h / 2 - pos.y * cur.scale
        })
      }
    })
    return () => registerCanvasController(null)
  }, [shownNodes, layout, size, viewMode, allNodesById])

  // —— 建立父连接 + 自动松弛（D35） ——
  const altLinkRef = useRef<string | null>(null)

  const relaxNetwork = useCallback(
    (seeds: string[], restOverrides?: Map<string, number>) => {
      const state = useDocStore.getState()
      const active = new Set<string>()
      for (const seed of seeds) {
        for (const id of connectedComponent(state.doc.nodes, seed)) active.add(id)
      }
      const posOf = (n: BubbleNodeData): Vec2 => layout.positions.get(n.id) ?? n.bubblePos
      const bodies: PhysicsBody[] = []
      const origin = new Map<string, Vec2>()
      for (const id of active) {
        const node = allNodesById.get(id)
        if (!node) continue
        const p = posOf(node)
        origin.set(id, { ...p })
        bodies.push({
          id,
          x: p.x,
          y: p.y,
          vx: 0,
          vy: 0,
          radius: radiusOfNode(node),
          fixed: false
        })
      }
      if (bodies.length === 0) return
      const idSet = new Set(bodies.map((b) => b.id))
      const allEdges = deriveEdges(state.doc.nodes).filter(
        (e) => idSet.has(e.from) && idSet.has(e.to)
      )
      const springs = buildSprings(bodies, allEdges)
      applyLinkRests(springs, state.doc.nodes, viewMode)
      if (restOverrides) {
        for (const spring of springs) {
          const v =
            restOverrides.get(`${spring.a}->${spring.b}`) ??
            restOverrides.get(`${spring.b}->${spring.a}`)
          if (v !== undefined) spring.rest = v
        }
      }
      const els = new Map<string, SVGGElement>()
      const edgeEls: DragSession['edges'] = []
      const root = svgRef.current
      if (root) {
        for (const id of idSet) {
          const el = root.querySelector<SVGGElement>(`[data-bubble-id="${cssEscape(id)}"]`)
          if (el) els.set(id, el)
        }
        root.querySelectorAll<SVGPathElement>('[data-edge-id]').forEach((el) => {
          const from = el.getAttribute('data-edge-from') ?? ''
          const to = el.getAttribute('data-edge-to') ?? ''
          if (idSet.has(from) || idSet.has(to)) edgeEls.push({ el, from, to })
        })
      }
      runInertia(
        {
          nodeId: seeds[0],
          draggedIds: new Set<string>(),
          startX: 0,
          startY: 0,
          scale: useViewportStore.getState().current().scale,
          origin,
          bodies,
          springs,
          els,
          edges: edgeEls,
          moved: true,
          raf: null,
          lastDx: 0,
          lastDy: 0,
          vel: { x: 0, y: 0 },
          alt: false,
          ctrl: false,
          insertEls: [],
          insertBodyEls: new Map(),
          vpOffset: { x: 0, y: 0 },
          last: new Map()
        },
        viewMode
      )
    },
    [allNodesById, layout, viewMode]
  )

  const linkBubbles = useCallback(
    (childId: string, parentId: string): boolean => {
      const ui = useUiStore.getState()
      const res = addParentLink(childId, parentId)
      if (!res.ok) {
        if (res.error) ui.openDialog({ kind: 'error', message: res.error })
        return false
      }
      const nodes = useDocStore.getState().doc.nodes
      const child = nodes.find((n) => n.id === childId)
      const parent = nodes.find((n) => n.id === parentId)
      const overrides = new Map<string, number>()
      // D40：连接后长度固定为建立时的初始距离
      if (child && parent) {
        overrides.set(
          `${parentId}->${childId}`,
          Math.hypot(child.bubblePos.x - parent.bubblePos.x, child.bubblePos.y - parent.bubblePos.y)
        )
      }
      relaxNetwork([parentId], overrides)
      return true
    },
    [relaxNetwork, viewMode]
  )

  const handleCtrlClick = useCallback(
    (nodeId: string): void => {
      const ui = useUiStore.getState()
      const source = altLinkRef.current
      if (!source) {
        altLinkRef.current = nodeId
        ui.showToast('已选为子气泡，再按住 Ctrl 点击目标气泡作为父级')
        return
      }
      if (source === nodeId) {
        altLinkRef.current = null
        ui.showToast('已取消连接')
        return
      }
      altLinkRef.current = null
      if (linkBubbles(source, nodeId)) ui.showToast('已建立父连接')
    },
    [linkBubbles]
  )

  // —— 物理拖拽 ——
  const beginDrag = useCallback(
    (event: React.PointerEvent<SVGGElement>, nodeId: string) => {
      if (event.button !== 0) return
      const sel = useSelectionStore.getState()
      if (sel.editingId === nodeId) return

      // 菜单「建立连接」已经选了起点：这一下点击就是目标（D40）
      const pendingLink = useUiStore.getState().linkSource
      if (pendingLink && pendingLink !== nodeId) {
        useUiStore.getState().setLinkSource(null)
        const isInsertSource = !useDocStore.getState().doc.nodes.some((n) => n.id === pendingLink)
        if (isInsertSource) {
          const id = createAssocLink(pendingLink, 'insert', nodeId, 'bubble')
          useUiStore.getState().showToast(id ? '已建立连接' : '该对象已与目标气泡连接')
        } else if (linkBubbles(pendingLink, nodeId)) {
          useUiStore.getState().showToast('已建立连接')
        }
        return
      }
      if (!sel.selectedIds.includes(nodeId)) {
        if (event.shiftKey) sel.select(nodeId, true)
        else sel.select(nodeId)
      }

      const draggedIds = new Set<string>()
      for (const id of useSelectionStore.getState().selectedIds) {
        for (const sid of subtreeIds(doc.nodes, id)) draggedIds.add(sid)
      }
      if (draggedIds.size === 0) for (const sid of subtreeIds(doc.nodes, nodeId)) draggedIds.add(sid)

      const posOf = (n: BubbleNodeData): Vec2 => layout.positions.get(n.id) ?? n.bubblePos
      const ctrl = event.ctrlKey || event.metaKey
      // Ctrl 拖拽：父级固定不动，只改这一条连线长度（D38）
      const pinnedParents = new Set<string>()
      if (ctrl) {
        for (const p of allNodesById.get(nodeId)?.parentIds ?? []) pinnedParents.add(p)
      }

      // D42：斥力覆盖当前层级全部气泡（不区分主父归属），避免不同组之间重叠
      const activeIds = new Set<string>()
      for (const n of levelNodes) {
        activeIds.add(n.id)
        if (activeIds.size >= PHYSICS_CAP) break
      }
      if (!activeIds.has(nodeId)) activeIds.add(nodeId)

      const bodies: PhysicsBody[] = []
      const origin = new Map<string, Vec2>()
      for (const id of activeIds) {
        const node = nodesById.get(id) ?? allNodesById.get(id)
        if (!node) continue
        const p = posOf(node)
        origin.set(id, { ...p })
        bodies.push({
          id,
          x: p.x,
          y: p.y,
          vx: 0,
          vy: 0,
          radius: radiusOfNode(node),
          // D36：只有被按住的气泡跟手，其余都是自由刚体
          fixed: id === nodeId || pinnedParents.has(id)
        })
      }

      const activeEdges = edges.filter((e) => activeIds.has(e.from) && activeIds.has(e.to))
      const springs = buildSprings(bodies, activeEdges)
      applyLinkRests(springs, doc.nodes, viewMode)

      // D55：关联的插入对象参与同一套物理——钉住的固定不动，未钉住的受弹簧牵引
      const bodyMap = new Map(bodies.map((b) => [b.id, b]))
      const insertBodyEls = new Map<string, HTMLElement>()
      // 注意：必须读当前 store（闭包里的 doc 可能是创建连线之前的快照）
      const liveDoc = useDocStore.getState().doc
      const pinnedInsertIds = new Set(liveDoc.inserts.filter((i) => i.pinned).map((i) => i.id))
      for (const link of liveDoc.links ?? []) {
        // D60：任一端钉住 → 这条连线不产生任何拉力
        if (pinnedInsertIds.has(link.from) || pinnedInsertIds.has(link.to)) continue
        const ids = [link.from, link.to]
        for (const id of ids) {
          if (bodyMap.has(id)) continue
          const ins = liveDoc.inserts.find((i) => i.id === id)
          if (!ins || ins.zoneId !== zoneId) continue
          if (ins.ownerBubbleId) continue // 附着在气泡上的对象仍刚性跟随
          const p = insertDisplayPos(ins, liveDoc.nodes, liveDoc.viewMode)
          if (ins.pinned) continue
          origin.set(ins.id, { ...p })
          const body: PhysicsBody = {
            id: ins.id,
            x: p.x,
            y: p.y,
            vx: 0,
            vy: 0,
            radius: 34,
            fixed: false
          }
          bodies.push(body)
          bodyMap.set(ins.id, body)
          const el = document.querySelector<HTMLElement>(`[data-insert-id="${cssEscape(ins.id)}"]`)
          if (el) insertBodyEls.set(ins.id, el)
        }
        const a = bodyMap.get(link.from)
        const b = bodyMap.get(link.to)
        if (!a || !b) continue
        springs.push({
          a: link.from,
          b: link.to,
          rest: typeof link.length === 'number' && link.length > 0 ? link.length : a.radius + b.radius + 84
        })
      }

      const els = new Map<string, SVGGElement>()
      const edgeEls: DragSession['edges'] = []
      const root = svgRef.current
      if (root) {
        for (const id of activeIds) {
          const el = root.querySelector<SVGGElement>(`[data-bubble-id="${cssEscape(id)}"]`)
          if (el) els.set(id, el)
        }
        root.querySelectorAll<SVGPathElement>('[data-edge-id]').forEach((el) => {
          const from = el.getAttribute('data-edge-from') ?? ''
          const to = el.getAttribute('data-edge-to') ?? ''
          if (activeIds.has(from) || activeIds.has(to)) edgeEls.push({ el, from, to })
        })
      }

      const session: DragSession = {
        nodeId,
        draggedIds,
        startX: event.clientX,
        startY: event.clientY,
        scale: useViewportStore.getState().current().scale,
        origin,
        bodies,
        springs,
        els,
        edges: edgeEls,
        moved: false,
        raf: null,
        lastDx: 0,
        lastDy: 0,
        vel: { x: 0, y: 0 },
        alt: event.altKey,
        ctrl,
        insertEls: collectInsertEls(activeIds),
        insertBodyEls,
        vpOffset: {
          x: useViewportStore.getState().current().offsetX,
          y: useViewportStore.getState().current().offsetY
        },
        last: new Map()
      }
      dragRef.current = session

      const bodyById = new Map(bodies.map((b) => [b.id, b]))

      const onMove = (ev: PointerEvent): void => {
        const s = dragRef.current
        if (!s) return
        const dx = (ev.clientX - s.startX) / s.scale
        const dy = (ev.clientY - s.startY) / s.scale
        s.vel = { x: dx - s.lastDx, y: dy - s.lastDy }
        s.lastDx = dx
        s.lastDy = dy
        if (Math.abs(dx) + Math.abs(dy) > 3) s.moved = true
        if (s.raf !== null) return
        s.raf = requestAnimationFrame(() => {
          const cur = dragRef.current
          if (!cur) return
          cur.raf = null
          applyPhysicsFrame(cur, bodyById, s.lastDx, s.lastDy, viewMode)
        })
      }

      const finish = (): void => {
        const s = dragRef.current
        dragRef.current = null
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        if (!s) return

        // D40：Ctrl + 点击（没拖动）= 先点子气泡，再点父气泡
        if (s.ctrl && !s.moved) {
          handleCtrlClick(s.nodeId)
          return
        }

        const zoneEl = document.elementFromPoint(pointerX, pointerY)?.closest('[data-zone-id]')
        const targetZone = zoneEl?.getAttribute('data-zone-id') ?? null
        if (targetZone && s.moved) {
          moveBubbleIntoZone(s.nodeId, targetZone, { x: 140, y: 140 })
          return
        }

        if (!s.moved) return

        // D38 / D48：Ctrl 拖拽是「调长度」模式，松手即定稿；长度写入 linkLength 持久锁定
        if (s.ctrl) {
          const changed = new Map<string, Vec2>()
          for (const b of s.bodies) {
            const base = s.origin.get(b.id)
            if (!base) continue
            if (Math.abs(b.x - base.x) > 0.6 || Math.abs(b.y - base.y) > 0.6) {
              changed.set(b.id, { x: b.x, y: b.y })
            }
          }
          const state = useDocStore.getState()
          const self = state.doc.nodes.find((n) => n.id === s.nodeId)
          const pid = self?.parentIds[0]
          const parent = pid ? state.doc.nodes.find((n) => n.id === pid) : null
          const grabbedBody = s.bodies.find((b) => b.id === s.nodeId)
          const lockedLength =
            parent && grabbedBody
              ? Math.max(
                  1,
                  Math.hypot(grabbedBody.x - parent.bubblePos.x, grabbedBody.y - parent.bubblePos.y)
                )
              : null
          state.commit('锁定连线长度', (d) => {
            for (const node of d.nodes) {
              const next = changed.get(node.id)
              if (next) {
                node.bubblePos = { x: next.x, y: next.y }
                node.updatedAt = new Date().toISOString()
              }
            }
            if (lockedLength !== null) {
              const target = d.nodes.find((n) => n.id === s.nodeId)
              if (target) target.linkLength = lockedLength
            }
          })
          return
        }

        // D36：松手后所有气泡转为自由刚体，被按住的那个继承鼠标速度，
        // 其余气泡保留模拟中累积的速度，整张网络一起滑行到共同静止
        for (const b of s.bodies) b.fixed = false
        const grabbed = s.bodies.find((b) => b.id === s.nodeId)
        if (grabbed) {
          grabbed.vx = s.vel.x * 0.85
          grabbed.vy = s.vel.y * 0.85
        }
        runInertia(s, viewMode)
      }

      let pointerX = event.clientX
      let pointerY = event.clientY
      const trackPointer = (ev: PointerEvent): void => {
        pointerX = ev.clientX
        pointerY = ev.clientY
      }
      window.addEventListener('pointermove', trackPointer)
      const onUp = (ev: PointerEvent): void => {
        pointerX = ev.clientX
        pointerY = ev.clientY
        window.removeEventListener('pointermove', trackPointer)
        finish()
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [allNodesById, doc.nodes, edges, layout, nodesById, shownNodes, viewMode]
  )

  // —— 画布平移 ——
  const beginPan = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const startX = event.clientX
    const startY = event.clientY
    const startVp = useViewportStore.getState().current()
    let moved = false
    let dx = 0
    let dy = 0
    let raf: number | null = null
    containerRef.current?.classList.add('panning')

    const onMove = (ev: PointerEvent): void => {
      dx = ev.clientX - startX
      dy = ev.clientY - startY
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
      if (raf !== null) return
      raf = requestAnimationFrame(() => {
        raf = null
        gRef.current?.setAttribute(
          'transform',
          `translate(${startVp.offsetX + dx} ${startVp.offsetY + dy}) scale(${startVp.scale})`
        )
      })
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      containerRef.current?.classList.remove('panning')
      if (raf !== null) cancelAnimationFrame(raf)
      if (moved) {
        useViewportStore.getState().set({
          scale: startVp.scale,
          offsetX: startVp.offsetX + dx,
          offsetY: startVp.offsetY + dy
        })
      } else {
        useSelectionStore.getState().clear()
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [])

  // —— 框选 ——
  const beginBoxSelect = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const startX = event.clientX - rect.left
      const startY = event.clientY - rect.top
      let current = { x: startX, y: startY, w: 0, h: 0 }
      setBox(current)
      const onMove = (ev: PointerEvent): void => {
        const x = ev.clientX - rect.left
        const y = ev.clientY - rect.top
        current = {
          x: Math.min(x, startX),
          y: Math.min(y, startY),
          w: Math.abs(x - startX),
          h: Math.abs(y - startY)
        }
        setBox(current)
      }
      const onUp = (): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        setBox(null)
        const vpCur = useViewportStore.getState().current()
        const wx = (current.x - vpCur.offsetX) / vpCur.scale
        const wy = (current.y - vpCur.offsetY) / vpCur.scale
        const ww = current.w / vpCur.scale
        const wh = current.h / vpCur.scale
        if (ww < 4 || wh < 4) return
        const ids = shownNodes
          .filter((n) => {
            const p = layout.positions.get(n.id) ?? n.bubblePos
            return p.x >= wx && p.x <= wx + ww && p.y >= wy && p.y <= wy + wh
          })
          .map((n) => n.id)
        useSelectionStore.getState().selectMany(ids)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [shownNodes, layout]
  )

  // —— 创建专区 ——
  const beginZoneRect = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const startX = event.clientX - rect.left
    const startY = event.clientY - rect.top
    let current = { x: startX, y: startY, w: 0, h: 0 }
    setBox(current)
    const onMove = (ev: PointerEvent): void => {
      const x = ev.clientX - rect.left
      const y = ev.clientY - rect.top
      current = {
        x: Math.min(x, startX),
        y: Math.min(y, startY),
        w: Math.abs(x - startX),
        h: Math.abs(y - startY)
      }
      setBox(current)
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setBox(null)
      useUiStore.getState().setZoneCreating(false)
      const vpCur = useViewportStore.getState().current()
      const world = {
        x: (current.x - vpCur.offsetX) / vpCur.scale,
        y: (current.y - vpCur.offsetY) / vpCur.scale,
        w: current.w / vpCur.scale,
        h: current.h / vpCur.scale
      }
      if (world.w < 120 || world.h < 80) {
        useUiStore.getState().showToast('拖出的区域太小，已取消')
        return
      }
      createZoneAt(world)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [])

  // —— 专区内空白双击退回 ——
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onDoubleClick = (event: MouseEvent): void => {
      const target = event.target as Element | null
      if (target?.closest('[data-bubble-id]') || target?.closest('[data-zone-id]')) return
      if (useViewportStore.getState().levelId !== ROOT_LEVEL) exitZone()
    }
    el.addEventListener('dblclick', onDoubleClick)
    return () => el.removeEventListener('dblclick', onDoubleClick)
  }, [])

  // —— 滚轮：空白缩放（D22）/ 气泡调重要程度 / Ctrl 缩放 ——
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (event: WheelEvent): void => {
      const rect = el.getBoundingClientRect()
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12

      if (event.ctrlKey) {
        event.preventDefault()
        useViewportStore.getState().zoomBy(anchor, factor)
        return
      }
      const bubbleEl = (event.target as Element | null)?.closest('[data-bubble-id]')
      if (bubbleEl) {
        event.preventDefault()
        const id = bubbleEl.getAttribute('data-bubble-id')
        if (!id) return
        adjustImportance(id, event.deltaY < 0 ? 2 : -2)
        if (importanceTimer) clearTimeout(importanceTimer)
        importanceTimer = setTimeout(() => {
          importanceTimer = null
          endImportanceGesture()
        }, 400)
        return
      }
      // 空白处：直接缩放整个画布
      event.preventDefault()
      useViewportStore.getState().zoomBy(anchor, factor)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // —— 连线交互（D49） ——
  const handleSelectEdge = useCallback((id: string) => {
    useSelectionStore.getState().selectEdge(id)
  }, [])

  const handleEdgeMenu = useCallback((event: React.MouseEvent, id: string) => {
    event.preventDefault()
    event.stopPropagation()
    useSelectionStore.getState().selectEdge(id)
    useUiStore.getState().openContextMenu({ x: event.clientX, y: event.clientY, bubbleId: null, edgeId: id })
  }, [])

  /** 拖动端点手柄改变连线长度：固定 from 端，移动 to 端 */
  const beginHandleDrag = useCallback(
    (event: React.PointerEvent<SVGCircleElement>, edge: ViewEdge) => {
      event.stopPropagation()
      const from = entityGeom.get(edge.from)
      const movable = entityGeom.get(edge.to)
      if (!from || !movable) return
      const rect = containerRef.current?.getBoundingClientRect()
      const vpNow = useViewportStore.getState().current()
      if (!rect) return
      const toWorld = (clientX: number, clientY: number): Vec2 => ({
        x: (clientX - rect.left - vpNow.offsetX) / vpNow.scale,
        y: (clientY - rect.top - vpNow.offsetY) / vpNow.scale
      })
      const el =
        svgRef.current?.querySelector<SVGGElement>(`[data-bubble-id="${cssEscape(edge.to)}"]`) ??
        document.querySelector<HTMLElement>(`[data-insert-id="${cssEscape(edge.to)}"]`)
      let finalPoint: Vec2 = movable.center

      const onMove = (ev: PointerEvent): void => {
        const point = toWorld(ev.clientX, ev.clientY)
        finalPoint = point
        const dist = Math.hypot(point.x - from.center.x, point.y - from.center.y) || 1
        const ux = (point.x - from.center.x) / dist
        const uy = (point.y - from.center.y) / dist
        const next = { x: from.center.x + ux * dist, y: from.center.y + uy * dist }
        if (el instanceof SVGGElement) {
          el.setAttribute('transform', `translate(${next.x} ${next.y})`)
        } else if (el instanceof HTMLElement) {
          el.style.left = `${next.x * vpNow.scale + vpNow.offsetX}px`
          el.style.top = `${next.y * vpNow.scale + vpNow.offsetY}px`
        }
      }
      const onUp = (): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        const dist = Math.hypot(finalPoint.x - from.center.x, finalPoint.y - from.center.y)
        setEdgeLength(edge, dist, finalPoint)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [entityGeom]
  )

  // —— 右键 ——
  const openMenuAt = useCallback(
    (clientX: number, clientY: number, targetEl: Element | null): void => {
      const rect = containerRef.current?.getBoundingClientRect()
      const vpNow = useViewportStore.getState().current()
      const world = rect
        ? screenToWorld({ x: clientX - rect.left, y: clientY - rect.top }, vpNow)
        : { x: 0, y: 0 }

      const bubbleEl = targetEl?.closest('[data-bubble-id]')
      const bubbleId = bubbleEl?.getAttribute('data-bubble-id') ?? null
      const scale = Math.max(0.05, vpNow.scale)
      const ui = useUiStore.getState()

      if (bubbleId) {
        useSelectionStore.getState().select(bubbleId)
        ui.openContextMenu({ x: clientX, y: clientY, bubbleId, world })
        return
      }

      // 插入对象：按世界坐标距离命中（与 DOM 层级无关）
      const insertHit = doc.inserts.find((ins) => {
        if (ins.zoneId !== zoneId) return false
        const p = insertDisplayPos(ins, doc.nodes, doc.viewMode)
        const r = (ins.kind === 'note' || ins.kind === 'task' ? 110 : 70) / scale
        return Math.hypot(world.x - p.x, world.y - p.y) <= r
      })
      if (insertHit) {
        ui.openContextMenu({
          x: clientX,
          y: clientY,
          bubbleId: null,
          insertId: insertHit.id
        })
        return
      }

      // 连线：点到线段的世界坐标距离
      const threshold = 12 / scale
      let hitEdge: ViewEdge | null = null
      let best = threshold
      for (const edge of viewEdges) {
        const from = entityGeom.get(edge.from)
        const to = entityGeom.get(edge.to)
        if (!from || !to) continue
        const d = distanceToSegment(world, from.center, to.center)
        if (d < best) {
          best = d
          hitEdge = edge
        }
      }
      if (hitEdge) {
        useSelectionStore.getState().selectEdge(hitEdge.id)
        ui.openContextMenu({
          x: clientX,
          y: clientY,
          bubbleId: null,
          edgeId: hitEdge.id
        })
        return
      }

      ui.openContextMenu({ x: clientX, y: clientY, bubbleId: null, world })
    },
    [doc, entityGeom, viewEdges, zoneId]
  )

  /** 右键：框选期间抑制菜单；未形成有效框选时再按原逻辑弹出（D64） */
  const onContextMenu = useCallback(
    (event: React.MouseEvent): void => {
      event.preventDefault()
      if (suppressContextRef.current) {
        suppressContextRef.current = false
        return
      }
      openMenuAt(event.clientX, event.clientY, event.target as Element | null)
    },
    [openMenuAt]
  )

  /** 空白处按住右键拖动 = 框选（D64） */
  const beginRightBox = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const container = containerRef.current
      if (!container) return
      suppressContextRef.current = true
      const rect = container.getBoundingClientRect()
      const startX = event.clientX - rect.left
      const startY = event.clientY - rect.top
      let current = { x: startX, y: startY, w: 0, h: 0 }
      let moved = false
      const onMove = (ev: PointerEvent): void => {
        const x = ev.clientX - rect.left
        const y = ev.clientY - rect.top
        if (Math.abs(x - startX) + Math.abs(y - startY) > 4) moved = true
        if (!moved) return
        current = {
          x: Math.min(x, startX),
          y: Math.min(y, startY),
          w: Math.abs(x - startX),
          h: Math.abs(y - startY)
        }
        setBox(current)
      }
      const onUp = (ev: PointerEvent): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        setBox(null)
        if (moved && current.w > 4 && current.h > 4) {
          const vpCur = useViewportStore.getState().current()
          const wx = (current.x - vpCur.offsetX) / vpCur.scale
          const wy = (current.y - vpCur.offsetY) / vpCur.scale
          const ww = current.w / vpCur.scale
          const wh = current.h / vpCur.scale
          const ids = shownNodes
            .filter((n) => {
              const p = layout.positions.get(n.id) ?? n.bubblePos
              return p.x >= wx && p.x <= wx + ww && p.y >= wy && p.y <= wy + wh
            })
            .map((n) => n.id)
          useSelectionStore.getState().selectMany(ids)
          if (ids.length > 0) useUiStore.getState().showToast(`框选中 ${ids.length} 个气泡`)
          return
        }
        // 没形成有效框选：按原逻辑弹菜单
        suppressContextRef.current = false
        openMenuAt(ev.clientX, ev.clientY, document.elementFromPoint(ev.clientX, ev.clientY))
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [layout, openMenuAt, shownNodes]
  )


  // 双击进入编辑时同步显示全文文本框（D80 ③）
  useEffect(() => {
    if (editingId) {
      tipHoldRef.current = true
      setTipNodeId(editingId)
      return
    }
    tipHoldRef.current = false
    setTipNodeId(null)
  }, [editingId])

  const editingNode = editingId ? allNodesById.get(editingId) : null
  const editingPos = editingId ? layout.positions.get(editingId) ?? editingNode?.bubblePos ?? null : null

  return (
    <div
      ref={containerRef}
      className="sl-canvas"
      onPointerDown={(e) => {
        const target = e.target as Element | null
        if (e.button === 2) {
          if (target?.closest('[data-bubble-id]') || target?.closest('[data-zone-id]')) return
          beginRightBox(e)
          return
        }
        if (target?.closest('[data-bubble-id]')) return
        if (target?.closest('[data-zone-id]')) return
        if (target?.closest('.sl-empty-hint')) return
        if (zoneCreating) {
          beginZoneRect(e)
          return
        }
        if (e.shiftKey) beginBoxSelect(e)
        else beginPan(e)
      }}
      onContextMenu={onContextMenu}
    >
      <svg ref={svgRef} className="sl-svg" width={size.w} height={size.h}>
        <defs>
          <linearGradient id="sl-bubble-gradient" x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor="var(--sl-bubble-from)" />
            <stop offset="100%" stopColor="var(--sl-bubble-to)" />
          </linearGradient>
          <radialGradient id="sl-bubble-gloss" cx="0.3" cy="0.24" r="0.62">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g ref={gRef} transform={`translate(${vp.offsetX} ${vp.offsetY}) scale(${vp.scale})`}>
          <EdgeLayer
            edges={viewEdges}
            geometry={entityGeom}
            mode={viewMode}
            selectedEdgeId={selectedEdgeId}
            onSelectEdge={handleSelectEdge}
            onEdgeContextMenu={handleEdgeMenu}
          />
          {selectedEdge &&
            (() => {
              const from = entityGeom.get(selectedEdge.from)
              const to = entityGeom.get(selectedEdge.to)
              if (!from || !to) return null
              const geo = buildEdgeGeometry(from, to, viewMode)
              return (
                <g className="sl-edge-handles">
                  <circle
                    className="sl-edge-handle"
                    data-handle="from"
                    cx={geo.from.x}
                    cy={geo.from.y}
                    r={7}
                    onPointerDown={(e) => beginHandleDrag(e, selectedEdge)}
                  />
                  <circle
                    className="sl-edge-handle"
                    data-handle="to"
                    cx={geo.to.x}
                    cy={geo.to.y}
                    r={7}
                    onPointerDown={(e) => beginHandleDrag(e, selectedEdge)}
                  />
                </g>
              )
            })()}

          {shownNodes.map((node) =>
            visibleIds.has(node.id) ? (
              <BubbleNode
                key={node.id}
                node={node}
                pos={layout.positions.get(node.id) ?? node.bubblePos}
                radius={radiusOfNode(node)}
                selected={selectedSet.has(node.id)}
                mode={viewMode}
                onPointerDown={beginDrag}
                onDoubleClick={(_e, id) => useSelectionStore.getState().startEdit(id)}
                onContextMenu={() => undefined}
                toggleDx={toggleMap.get(node.id)?.dx}
                toggleDy={toggleMap.get(node.id)?.dy}
                toggleCollapsed={toggleMap.get(node.id)?.collapsed}
                toggleCount={toggleMap.get(node.id)?.count}
                onToggle={toggleCollapse}
                editing={editingId === node.id}
                depth={depthOf.get(node.id) ?? 0}
                onHover={setHoverDelayed}
                onEllipsisHover={showTipFromHover}
                onLongHover={showTipFromLongHover}
              />
            ) : null
          )}
        </g>
      </svg>

      <ZoneLayer />
      <InsertLayer />

      {tipNodeId &&
        (() => {
          const node = nodesById.get(tipNodeId ?? '')
          if (!node) return null
          const p = layout.positions.get(node.id) ?? node.bubblePos
          const vpNow = useViewportStore.getState().current()
          const screenPos = {
            x: p.x * vpNow.scale + vpNow.offsetX,
            y: p.y * vpNow.scale + vpNow.offsetY
          }
          const r = radiusOfNode(node) * vpNow.scale
          return (
            <BubbleTextTip
              node={node}
              depth={depthOf.get(node.id) ?? 0}
              x={screenPos.x}
              y={Math.max(8, screenPos.y - r - 10)}
              editing={tipEditingId === node.id && !editingId}
              onStartEdit={() => {
                // 同一时刻只允许一处激活：先结束内联编辑（D77）
                if (editingId) {
                  const current = nodesById.get(editingId)
                  if (current) commitText(current.id, current.text)
                  useSelectionStore.getState().stopEdit()
                }
                setTipEditingId(node.id)
              }}
              onHoverChange={(hovering) => {
                tipHoverRef.current = hovering
                if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
                if (hovering) return
                // 鼠标离开文本框：没有在编辑就收起（D80）
                hoverTimerRef.current = setTimeout(() => {
                  if (!useSelectionStore.getState().editingId && !tipHoverRef.current) {
                    tipHoldRef.current = false
                    setTipNodeId(null)
                  }
                }, 250)
              }}
              onClose={() => {
                if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
                setTipEditingId(null)
                if (!editingId) setTipNodeId(null)
              }}
            />
          )
        })()}

      {editingNode && editingPos && (
        <InlineEditor
          key={editingNode.id}
          node={editingNode}
          pos={editingPos}
          mode={viewMode}
          viewport={vp}
          depth={depthOf.get(editingNode.id) ?? 0}
          radius={radiusOfNode(editingNode)}
          onCommit={(text) => {
            commitText(editingNode.id, text)
            useSelectionStore.getState().stopEdit()
          }}
          onCommitAndAddChild={(text) => {
            commitText(editingNode.id, text)
            useSelectionStore.getState().stopEdit()
            addChildBubble(editingNode.id)
          }}
          onCommitAndAddSibling={(text) => {
            commitText(editingNode.id, text)
            useSelectionStore.getState().stopEdit()
            addSiblingBubble(editingNode.id)
          }}
          onExit={(text) => {
            commitText(editingNode.id, text)
            useSelectionStore.getState().stopEdit()
          }}
        />
      )}

      <EmptyCanvasHint visible={shownNodes.length === 0} />

      {box && (
        <div
          style={{
            position: 'absolute',
            left: box.x,
            top: box.y,
            width: box.w,
            height: box.h,
            border: '1px dashed var(--sl-accent)',
            background: 'rgba(91,111,214,0.08)',
            pointerEvents: 'none',
            zIndex: 15
          }}
        />
      )}
    </div>
  )
}

/** 按 D40/D44 策略把每条连线的目标长度写进弹簧 */
function applyLinkRests(springs: Spring[], nodes: readonly BubbleNodeData[], mode: 'bubble' | 'mindmap'): void {
  const resolved = resolveLinkLengths(nodes, mode)
  for (const spring of springs) {
    const target = resolved.get(`${spring.a}->${spring.b}`)
    if (target) spring.rest = target.rest
  }
}

/** 收集附着在当前层级气泡上的插入对象 DOM，用于拖拽时同步移动（D41） */
function collectInsertEls(activeIds: Set<string>): DragSession['insertEls'] {
  const state = useDocStore.getState()
  const out: DragSession['insertEls'] = []

  for (const ins of state.doc.inserts) {
    if (!ins.ownerBubbleId || ins.pinned) continue
    if (!activeIds.has(ins.ownerBubbleId)) continue
    const owner = state.doc.nodes.find((n) => n.id === ins.ownerBubbleId)
    if (!owner) continue
    const el = document.querySelector<HTMLElement>(`[data-insert-id="${cssEscape(ins.id)}"]`)
    if (!el) continue
    const display = insertDisplayPos(ins, state.doc.nodes, state.doc.viewMode)
    out.push({
      el,
      ownerId: ins.ownerBubbleId,
      rel: { x: display.x - owner.bubblePos.x, y: display.y - owner.bubblePos.y }
    })
  }
  return out
}

/** 点到线段距离（用于连线命中测试） */
function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const lengthSq = abx * abx + aby * aby
  if (lengthSq < 1e-6) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t))
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value)
  return value.replace(/["\\]/g, '\\$&')
}

/** 拖动中的物理帧：直接写 DOM，避免 React 全树重渲染（PRD 15.3） */
function applyPhysicsFrame(
  session: DragSession,
  bodyById: Map<string, PhysicsBody>,
  dx: number,
  dy: number,
  mode: 'bubble' | 'mindmap'
): void {
  const started = typeof performance !== 'undefined' ? performance.now() : 0

  const grabbed = bodyById.get(session.nodeId)
  const grabbedBase = session.origin.get(session.nodeId)
  if (grabbed && grabbedBase) {
    grabbed.x = grabbedBase.x + dx
    grabbed.y = grabbedBase.y + dy
  }
  if (session.ctrl) {
    // 连线长度跟随拖出的距离：把这条边的静止长度设成当前长度
    for (const spring of session.springs) {
      if (spring.a !== session.nodeId && spring.b !== session.nodeId) continue
      const a = bodyById.get(spring.a)
      const b = bodyById.get(spring.b)
      if (!a || !b) continue
      spring.rest = Math.hypot(b.x - a.x, b.y - a.y)
    }
  }
  stepPhysics(session.bodies, session.springs, { padding: BUBBLE_PADDING })
  writeBodies(session, mode)

  if (typeof performance !== 'undefined') recordFrame(performance.now() - started)
}

function writeBodies(session: DragSession, mode: 'bubble' | 'mindmap'): void {
  const bodyById = new Map(session.bodies.map((b) => [b.id, b]))
  const dirty = new Set<string>()
  for (const [id, el] of session.els) {
    const b = bodyById.get(id)
    if (!b) continue
    const prev = session.last.get(id)
    if (prev && Math.abs(prev.x - b.x) < 0.05 && Math.abs(prev.y - b.y) < 0.05) continue
    el.setAttribute('transform', `translate(${b.x} ${b.y})`)
    session.last.set(id, { x: b.x, y: b.y })
    dirty.add(id)
  }
  // D41：附着对象跟随宿主气泡（同一帧内一起移动，不滞后）
  for (const item of session.insertEls) {
    const owner = bodyById.get(item.ownerId)
    if (!owner) continue
    if (dirty.size > 0 && !dirty.has(item.ownerId)) continue
    const sx = (owner.x + item.rel.x) * session.scale + session.vpOffset.x
    const sy = (owner.y + item.rel.y) * session.scale + session.vpOffset.y
    item.el.style.left = `${sx}px`
    item.el.style.top = `${sy}px`
  }

  for (const [id, el] of session.insertBodyEls) {
    const b = bodyById.get(id)
    if (!b) continue
    el.style.left = `${b.x * session.scale + session.vpOffset.x}px`
    el.style.top = `${b.y * session.scale + session.vpOffset.y}px`
  }

  if (dirty.size === 0) {
    // 没有位移也要保证首帧把连线画对
    if (session.last.size > 0) return
  }
  for (const edge of session.edges) {
    if (dirty.size > 0 && !dirty.has(edge.from) && !dirty.has(edge.to)) continue
    const from = bodyById.get(edge.from)
    const to = bodyById.get(edge.to)
    if (!from || !to) continue
    const geo = buildEdgeGeometry(
      { center: { x: from.x, y: from.y }, radius: from.radius, shape: 'circle' },
      { center: { x: to.x, y: to.y }, radius: to.radius, shape: 'circle' },
      mode
    )
    edge.el.setAttribute('d', geo.path)
  }
}

/** 松手后的惯性衰减，直到静止再一次性提交 */
function runInertia(session: DragSession, mode: 'bubble' | 'mindmap'): void {
  const started = typeof performance !== 'undefined' ? performance.now() : 0
  const tick = (): void => {
    const kinetic = stepPhysics(session.bodies, session.springs, { padding: BUBBLE_PADDING })
    writeBodies(session, mode)
    const elapsed = (typeof performance !== 'undefined' ? performance.now() : 0) - started
    if (isSettled(kinetic, session.bodies) || elapsed > INERTIA_MAX_MS) {
      const changed = new Map<string, Vec2>()
      for (const b of session.bodies) {
        const base = session.origin.get(b.id)
        if (!base) continue
        if (Math.abs(b.x - base.x) > 0.6 || Math.abs(b.y - base.y) > 0.6) {
          changed.set(b.id, { x: b.x, y: b.y })
        }
      }
      commitPositionsAbsolute(changed)
      return
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

export default CanvasStage
