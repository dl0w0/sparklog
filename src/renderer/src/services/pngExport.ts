/** SVG → PNG（渲染层专属，依赖 canvas）。 */

export async function svgToPngBase64(svg: string, scale = 2): Promise<string> {
  const size = readSvgSize(svg)
  const img = new Image()
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('SVG 渲染失败'))
    img.src = url
  })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(size.w * scale))
  canvas.height = Math.max(1, Math.round(size.h * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布上下文')
  ctx.scale(scale, scale)
  ctx.drawImage(img, 0, 0, size.w, size.h)
  const dataUrl = canvas.toDataURL('image/png')
  return dataUrl.replace(/^data:image\/png;base64,/, '')
}

export function readSvgSize(svg: string): { w: number; h: number } {
  const w = /width="([\d.]+)"/.exec(svg)
  const h = /height="([\d.]+)"/.exec(svg)
  return {
    w: w ? Number(w[1]) : 800,
    h: h ? Number(h[1]) : 600
  }
}
