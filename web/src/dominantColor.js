import { useEffect, useState } from 'react'

// 옷 PNG의 대표 색을 화면에서 구합니다. (U-Q1 작업 2)
// 틀 정보가 없는 사진 옷(이전 데이터에서 옮긴 옷)을 뒷모습에서 그 구분의 기본 틀로 그릴 때, 앞면 사진은 쓰지 않고 색만 가져옵니다.
// 서버 imaging.main_color()와 같은 뜻입니다: 긴 변 256으로 줄이고 불투명한 칸(투명도 128 이상)만 세어, 비슷한 색으로 묶은 칸 중
// 가장 많은 묶음의 평균 색을 씁니다. 묶는 방법은 완전히 같지는 않습니다(서버는 PIL의 8색 양자화, 여기서는 색을 채널마다 16단계로 묶음).
// 이행한 옷 8벌로 서버 값과 비교해 이 방법이 가장 가까웠습니다(U-Q1). 저장 파일·DB·API는 바꾸지 않습니다. 읽지 못하면 null (기존 회색을 씁니다).
const ALPHA_MIN = 128 // 서버와 같음: 이 이상 불투명한 칸만 셉니다
const SCAN_SIDE = 256
const SHIFT = 4 // 채널마다 16단계

const cache = new Map() // 주소 → 결과(null 또는 '#RRGGBB'), 읽는 중이면 Promise

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

function hex(n) {
  return Math.round(n).toString(16).padStart(2, '0').toUpperCase()
}

// 픽셀 목록([r, g, b] 한 칸씩)에서 비슷한 색끼리 묶어 가장 많은 묶음의 평균 색('#RRGGBB')을 돌려줍니다. 비어 있으면 null.
export function dominantOf(pixels) {
  if (pixels.length === 0) return null
  const bins = new Map()
  for (const p of pixels) {
    const key = ((p[0] >> SHIFT) << 8) | ((p[1] >> SHIFT) << 4) | (p[2] >> SHIFT)
    const bin = bins.get(key)
    if (bin) {
      bin.n += 1
      bin.r += p[0]
      bin.g += p[1]
      bin.b += p[2]
    } else {
      bins.set(key, { n: 1, r: p[0], g: p[1], b: p[2] })
    }
  }
  let best = null
  for (const bin of bins.values()) if (!best || bin.n > best.n) best = bin
  return `#${hex(best.r / best.n)}${hex(best.g / best.n)}${hex(best.b / best.n)}`
}

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
    const pixels = []
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] >= ALPHA_MIN) pixels.push([data[i], data[i + 1], data[i + 2]])
    }
    return dominantOf(pixels)
  } catch {
    return null
  }
}

// 옷 이미지 주소 → 대표 색('#RRGGBB'). url이 없거나 아직 읽는 중이거나 읽지 못하면 null.
export function useDominantColor(url) {
  const [loaded, setLoaded] = useState(null) // { url, color }
  useEffect(() => {
    if (!url) return undefined
    const hit = cache.get(url)
    if (hit !== undefined && !(hit instanceof Promise)) return undefined
    let alive = true
    let job = hit
    if (job === undefined) {
      job = measure(url).then((color) => {
        cache.set(url, color)
        return color
      })
      cache.set(url, job)
    }
    Promise.resolve(job).then((color) => alive && setLoaded({ url, color }))
    return () => {
      alive = false
    }
  }, [url])
  if (!url) return null
  const hit = cache.get(url)
  if (hit !== undefined && !(hit instanceof Promise)) return hit
  return loaded && loaded.url === url ? loaded.color : null
}
