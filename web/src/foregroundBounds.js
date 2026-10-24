import { useEffect, useState } from 'react'

// 옷 PNG의 "옷이 있는 부분"(투명하지 않은 부분)의 범위를 화면에서 구합니다. (U3, 사용자 결정 2)
// 서버는 2D 이미지를 옷 둘레로 자르지 않고 작업 크기 그대로 저장합니다(배경 고치기가 그 크기에 맞춰져 있음).
// 그래서 옷이 칸에 작게 보이지 않도록, 보여 줄 때만 이 범위를 칸에 맞춥니다. 저장 파일·DB·API는 바꾸지 않습니다.
// 투명한 칸이 없는 이미지(배경을 지우지 않은 사진)나 읽지 못한 이미지는 null이고, 그때는 이미지 전체를 그대로 씁니다.
const ALPHA_MIN = 8 // 이보다 투명한 칸은 옷이 아닌 것으로 봅니다
const MARGIN_RATIO = 0.03 // 옷 둘레 여백(긴 변 기준), 서버 정리 단계 D-017과 같은 값
const SCAN_SIDE = 256 // 범위를 구할 때 줄여서 읽는 긴 변 (빠르게)

const cache = new Map() // 주소 → 결과(null 또는 범위), 읽는 중이면 Promise

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

// 결과: { nw, nh, x, y, w, h } — 이미지 원래 크기(nw, nh)와 옷 범위(x, y, w, h), 모두 이미지 원래 칸 단위
async function measure(url) {
  try {
    const img = await loadImage(url)
    const nw = img.naturalWidth
    const nh = img.naturalHeight
    const scale = Math.min(1, SCAN_SIDE / Math.max(nw, nh))
    const cw = Math.max(1, Math.round(nw * scale))
    const ch = Math.max(1, Math.round(nh * scale))
    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0, cw, ch)
    const { data } = ctx.getImageData(0, 0, cw, ch)
    let x0 = cw
    let y0 = ch
    let x1 = -1
    let y1 = -1
    let transparent = false
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const a = data[(y * cw + x) * 4 + 3]
        if (a < ALPHA_MIN) {
          transparent = true
        } else {
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
        }
      }
    }
    if (!transparent || x1 < 0) return null
    const margin = Math.round(Math.max(nw, nh) * MARGIN_RATIO)
    const left = Math.max(0, Math.floor(x0 / scale) - margin)
    const top = Math.max(0, Math.floor(y0 / scale) - margin)
    const right = Math.min(nw, Math.ceil((x1 + 1) / scale) + margin)
    const bottom = Math.min(nh, Math.ceil((y1 + 1) / scale) + margin)
    return { nw, nh, x: left, y: top, w: right - left, h: bottom - top }
  } catch {
    return null
  }
}

// 옷 이미지 주소 → 옷 범위. 아직 읽는 중이거나 쓸 수 없으면 null (이미지 전체를 그대로 보입니다).
export function useForegroundBounds(url) {
  const [loaded, setLoaded] = useState(null) // { url, bounds }
  useEffect(() => {
    if (!url) return undefined
    const hit = cache.get(url)
    if (hit !== undefined && !(hit instanceof Promise)) return undefined
    let alive = true
    let job = hit
    if (job === undefined) {
      job = measure(url).then((bounds) => {
        cache.set(url, bounds)
        return bounds
      })
      cache.set(url, job)
    }
    Promise.resolve(job).then((bounds) => alive && setLoaded({ url, bounds }))
    return () => {
      alive = false
    }
  }, [url])
  if (!url) return null
  const hit = cache.get(url)
  if (hit !== undefined && !(hit instanceof Promise)) return hit
  return loaded && loaded.url === url ? loaded.bounds : null
}
