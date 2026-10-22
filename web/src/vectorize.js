// 무늬 만들기 (D-019 제안, P-39). 같은 팀의 moire-closet `src/lib/vectorize.js`를 옮겼습니다.
// 배경을 지운 2D 이미지의 옷 부분을 128×160으로 줄이고, 색을 N개로 묶은 뒤(k-평균),
// 같은 색이 이어진 가로 구간을 위아래로 이어 붙인 직사각형들로 무늬 그림(SVG path)을 만듭니다.
// mode: 'auto' 자동 감지(줄무늬로 보이면 줄무늬 정리, 아니면 디테일 살리기), 'detail' 디테일 살리기, 'stripes' 줄무늬 정리
// 결과 SVG는 서버의 검사(path만, d는 M·h·v·Z와 숫자, fill은 #RRGGBB)를 통과하는 모양입니다.

export const PATTERN_W = 128
export const PATTERN_H = 160

// 색 묶기 (k-평균): 밝기 순으로 고르게 처음 중심을 고르고 9번 고칩니다.
function quantize(rgba, w, h, colorCount) {
  const samples = []
  for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3] > 100) samples.push([rgba[i], rgba[i + 1], rgba[i + 2]])
  if (!samples.length) return null
  const sorted = [...samples].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]))
  const centers = Array.from({ length: colorCount }, (_, i) => [
    ...sorted[Math.min(sorted.length - 1, Math.floor(((i + 0.5) * sorted.length) / colorCount))],
  ])
  for (let iter = 0; iter < 9; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0])
    for (const p of samples) {
      const k = nearest(p, centers)
      for (let c = 0; c < 3; c++) sums[k][c] += p[c]
      sums[k][3]++
    }
    for (let k = 0; k < centers.length; k++) if (sums[k][3]) centers[k] = sums[k].slice(0, 3).map((v) => v / sums[k][3])
  }
  const palette = centers.map((p) => '#' + p.map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''))
  const labels = new Int16Array(w * h).fill(-1)
  const counts = new Int32Array(colorCount)
  for (let i = 0; i < w * h; i++) {
    if (rgba[i * 4 + 3] > 100) {
      const k = nearest([rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]], centers)
      labels[i] = k
      counts[k]++
    }
  }
  return { palette, labels, counts, base: palette[counts.indexOf(Math.max(...counts))] }
}

function nearest(p, centers) {
  let best = 0
  let dist = Infinity
  for (let k = 0; k < centers.length; k++) {
    const c = centers[k]
    const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2
    if (d < dist) {
      dist = d
      best = k
    }
  }
  return best
}

// 줄무늬 찾기: 줄마다 가운데(30~70%)에서 가장 많은 색이 48%를 넘고, 위에서 아래로 그 색이 14번 넘게 바뀌면 줄무늬
function detectStripes(labels, w, h) {
  let agree = 0
  let total = 0
  let changes = 0
  let prior = -1
  const rows = []
  for (let y = 0; y < h; y++) {
    const counts = new Map()
    for (let x = Math.floor(w * 0.3); x < Math.ceil(w * 0.7); x++) {
      const k = labels[y * w + x]
      if (k >= 0) counts.set(k, (counts.get(k) || 0) + 1)
    }
    const best = [...counts].sort((a, b) => b[1] - a[1])[0]
    rows.push(best?.[0] ?? -1)
    if (best) {
      agree += best[1]
      total += [...counts.values()].reduce((a, b) => a + b, 0)
      if (prior >= 0 && best[0] !== prior) changes++
      prior = best[0]
    }
  }
  return { detected: total > 0 && agree / total > 0.48 && changes >= 14, rows }
}

// rgba: 픽셀 값 (w×h×4). 무늬가 없으면(옷 부분이 비어 있으면) null
export function vectorize(rgba, w, h, mode = 'auto', colorCount = 7) {
  const q = quantize(rgba, w, h, colorCount)
  if (!q) return null
  const stripe = detectStripes(q.labels, w, h)
  const useStripe = mode === 'stripes' || (mode === 'auto' && stripe.detected)
  const labels = q.labels
  if (useStripe) {
    // 줄마다 한 색으로 칠합니다. 투명한 칸(-1)도 그 줄 색이 되지만, 마네킹에서는 옷 틀 안만 보입니다.
    let prev = labels.find((k) => k >= 0) || 0
    for (let y = 0; y < h; y++) {
      const k = stripe.rows[y] >= 0 ? stripe.rows[y] : prev
      for (let x = 0; x < w; x++) labels[y * w + x] = k
      prev = k
    }
  }
  const paths = q.palette.map(() => [])
  const f = (n) => Math.round(n * 1000) / 1000
  let active = new Map()
  // 사이 틈이 보이지 않게 직사각형을 아주 조금 크게 그립니다.
  function flush(r) {
    paths[r.k].push(`M${r.x} ${r.y}h${f(r.w + 0.02)}v${f(r.h + 0.02)}h-${f(r.w + 0.02)}Z`)
  }
  for (let y = 0; y < h; y++) {
    const next = new Map()
    let x = 0
    while (x < w) {
      const k = labels[y * w + x]
      const start = x
      while (x < w && labels[y * w + x] === k) x++
      if (k < 0) continue
      const key = `${start}:${x - start}:${k}`
      const r = active.get(key)
      if (r) {
        r.h++
        next.set(key, r)
        active.delete(key)
      } else next.set(key, { x: start, y, w: x - start, h: 1, k })
    }
    for (const r of active.values()) flush(r)
    active = next
  }
  for (const r of active.values()) flush(r)
  return {
    palette: q.palette,
    paths: paths.map((p) => p.join('')),
    base: q.base,
    mode: useStripe ? 'stripes' : 'detail',
    width: w,
    height: h,
  }
}

// 무늬 그림(SVG 글자). 쓰지 않은 색은 넣지 않습니다.
export function toSvg(v) {
  const body = v.palette.map((fill, i) => (v.paths[i] ? `<path d="${v.paths[i]}" fill="${fill}"/>` : '')).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${v.width}" height="${v.height}">${body}</svg>`
}

// 2D 이미지 주소에서 옷 부분(투명하지 않은 곳)을 잘라 128×160으로 줄여 무늬를 만듭니다.
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('2D 이미지를 불러오지 못했어요.'))
    img.src = url
  })
}

export function patternFromImage(img, mode = 'auto', colorCount = 7) {
  const full = document.createElement('canvas')
  full.width = img.naturalWidth
  full.height = img.naturalHeight
  const fctx = full.getContext('2d', { willReadFrequently: true })
  fctx.drawImage(img, 0, 0)
  const { data } = fctx.getImageData(0, 0, full.width, full.height)
  let x0 = full.width
  let y0 = full.height
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < full.height; y++) {
    for (let x = 0; x < full.width; x++) {
      if (data[(y * full.width + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) return null
  const small = document.createElement('canvas')
  small.width = PATTERN_W
  small.height = PATTERN_H
  const sctx = small.getContext('2d', { willReadFrequently: true })
  sctx.drawImage(full, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, PATTERN_W, PATTERN_H)
  return vectorize(sctx.getImageData(0, 0, PATTERN_W, PATTERN_H).data, PATTERN_W, PATTERN_H, mode, colorCount)
}
