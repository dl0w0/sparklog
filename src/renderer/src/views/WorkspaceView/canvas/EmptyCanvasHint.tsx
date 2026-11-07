export interface EmptyCanvasHintProps {
  visible: boolean
}

export function EmptyCanvasHint({ visible }: EmptyCanvasHintProps): JSX.Element | null {
  if (!visible) return null
  return (
    <div className="sl-empty-hint">
      <div className="title">这是一张空白画布</div>
      <div>右键空白处 → 新建主气泡，或选中气泡后按 Tab 长出子气泡</div>
      <div style={{ marginTop: 6, fontSize: 11.5 }}>
        Tab 新建子气泡 · Enter 新建同级 · Delete 删除 · 滚轮调重要程度 · Ctrl+滚轮缩放
      </div>
    </div>
  )
}

export default EmptyCanvasHint
