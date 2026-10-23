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
// 줄이 바뀐 것으로 셀 색 차이 (2026-10-23 더함). 흰 옷처럼 거의 같은 색들로 나뉜 무늬에서
// 줄마다 미세하게 바뀌는 대표 색을 줄무늬로 잘못 보지 않게, 눈에 띄게 다른 색으로 바뀔 때만 셉니다.
const STRIPE_MIN_DIFF = 24
const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

function detectStripes(labels, w, h, palette) {
  const rgb = palette.map(hexRgb)
  const differs = (a, b) => Math.hypot(rgb[a][0] - rgb[b][0], rgb[a][1] - rgb[b][1], rgb[a][2] - rgb[b][2]) >= STRIPE_MIN_DIFF
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
      if (prior >= 0 && best[0] !== prior && differs(prior, best[0])) changes++
      prior = best[0]
    }
  }
  return { detected: total > 0 && agree / total > 0.48 && changes >= 14, rows }
}

// rgba: 픽셀 값 (w×h×4). 무늬가 없으면(옷 부분이 비어 있으면) null
export function vectorize(rgba, w, h, mode = 'auto', colorCount = 7) {
  const q = quantize(rgba, w, h, colorCount)
  if (!q) return null
  const stripe = detectStripes(q.labels, w, h, q.palette)
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

// 남은 배경 빼기 (2026-10-23, 사람이 정함). 흰 옷을 흰 배경에서 찍은 사진처럼 배경이 지워지지 않은 2D 이미지는
// 사진 배경까지 무늬에 들어가, 옷 틀 가장자리(어깨, 소매 끝)에 배경색이 띠처럼 깔립니다.
// 그래서 투명한 칸이 거의 없는 이미지에서만, 테두리에 가장 많은 색을 배경으로 보고 테두리와 이어진 비슷한 색 칸을 투명하게 합니다.
// 옷 안쪽의 같은 색(로고 바탕 등)은 테두리와 이어지지 않아 남습니다.
// 배경을 지운 이미지는 옷이 잘린 테두리에 닿아 있어 이 처리를 하면 옷이 지워지므로 하지 않습니다.
const BG_TRANSPARENT_MAX = 0.02 // 투명한 칸이 이보다 많으면 배경이 지워진 이미지로 봄
const BG_BORDER_MIN = 0.6 // 테두리 칸 중 배경색에 가까운 칸이 이보다 적으면 배경이 복잡한 사진으로 보고 하지 않음
const BG_TOLERANCE = 16 // 배경색과의 RGB 거리. 흰 배경 #f5f5f5와 흰 옷 #e6e5ea의 거리(약 24)보다 작게

function clearEdgeBackground(rgba, w, h) {
  let transparent = 0
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] <= 100) transparent++
  if (transparent / (w * h) > BG_TRANSPARENT_MAX) return
  const border = []
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x)
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1)
  // 테두리 색을 4단계씩 묶어 가장 많은 묶음의 평균을 배경색으로
  const buckets = new Map()
  for (const i of border) {
    const o = i * 4
    if (rgba[o + 3] <= 100) continue
    const key = ((rgba[o] >> 2) << 12) | ((rgba[o + 1] >> 2) << 6) | (rgba[o + 2] >> 2)
    const b = buckets.get(key) ?? [0, 0, 0, 0]
    b[0] += rgba[o]
    b[1] += rgba[o + 1]
    b[2] += rgba[o + 2]
    b[3]++
    buckets.set(key, b)
  }
  let top = null
  for (const b of buckets.values()) if (!top || b[3] > top[3]) top = b
  if (!top) return
  const bg = [top[0] / top[3], top[1] / top[3], top[2] / top[3]]
  const near = (i) => {
    const o = i * 4
    return rgba[o + 3] > 100 && Math.hypot(rgba[o] - bg[0], rgba[o + 1] - bg[1], rgba[o + 2] - bg[2]) <= BG_TOLERANCE
  }
  if (border.filter(near).length / border.length < BG_BORDER_MIN) return
  // 테두리에서 시작해 이어진 배경색 칸을 모두 투명하게 (4방향)
  const seen = new Uint8Array(w * h)
  const queue = border.filter((i) => near(i))
  for (const i of queue) seen[i] = 1
  while (queue.length) {
    const i = queue.pop()
    rgba[i * 4 + 3] = 0
    const x = i % w
    const y = (i - x) / w
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (j >= 0 && !seen[j] && near(j)) {
        seen[j] = 1
        queue.push(j)
      }
    }
  }
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
  const pixels = sctx.getImageData(0, 0, PATTERN_W, PATTERN_H).data
  clearEdgeBackground(pixels, PATTERN_W, PATTERN_H)
  return vectorize(pixels, PATTERN_W, PATTERN_H, mode, colorCount)
}
