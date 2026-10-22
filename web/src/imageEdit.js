// 배경 고치기 계산 (D-015, P-34). 화면 부품(BackgroundEditor)과 떼어 둔 순수 함수들입니다.
// 지우는 규칙은 서버(server/app/external/imaging.py)와 같습니다:
// 가장자리에서 이어진, 기준 색과 가까운 칸만 지웁니다. 재귀 대신 큐를 씁니다.
//
// 마스크: 칸마다 1이면 지움(투명), 0이면 남김. 길이 = 가로 × 세로.

export const DEFAULT_TOLERANCE = 40 // 서버의 TOLERANCE와 같음

// 칸 i의 색과 기준 색의 차이: R, G, B 차이 중 가장 큰 값 (서버와 같음)
function colorDiff(data, i, [r, g, b]) {
  const p = i * 4
  return Math.max(Math.abs(data[p] - r), Math.abs(data[p + 1] - g), Math.abs(data[p + 2] - b))
}

function borderIndexes(width, height) {
  const list = []
  for (let x = 0; x < width; x++) list.push(x, (height - 1) * width + x)
  for (let y = 1; y < height - 1; y++) list.push(y * width, y * width + width - 1)
  return list
}

// 가장자리의 불투명한 칸으로 배경색(가운데 값)을 정합니다. 없으면 null.
export function borderColor(image) {
  const { data, width, height } = image
  const channels = [[], [], []]
  for (const i of borderIndexes(width, height)) {
    if (data[i * 4 + 3] === 0) continue
    for (let k = 0; k < 3; k++) channels[k].push(data[i * 4 + k])
  }
  if (channels[0].length === 0) return null
  return channels.map((list) => list.sort((a, b) => a - b)[Math.floor(list.length / 2)])
}

// seeds에서 위아래 양옆으로 이어진, color와 차이가 tolerance 이하인 칸을 마스크에 1로 칠합니다.
function flood(image, mask, seeds, color, tolerance) {
  const { data, width, height } = image
  const total = width * height
  const queue = new Int32Array(total)
  const seen = new Uint8Array(total)
  let head = 0
  let tail = 0
  const near = (i) => data[i * 4 + 3] === 0 || colorDiff(data, i, color) <= tolerance
  for (const i of seeds) {
    if (!seen[i] && near(i)) {
      seen[i] = 1
      queue[tail++] = i
    }
  }
  while (head < tail) {
    const i = queue[head++]
    mask[i] = 1
    const x = i % width
    const next = [i - width, i + width, x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1]
    for (const j of next) {
      if (j >= 0 && j < total && !seen[j] && near(j)) {
        seen[j] = 1
        queue[tail++] = j
      }
    }
  }
}

// 원래 사진에서 자동 마스크를 새로 계산합니다. 허용 오차를 바꿀 때마다 원래 사진 기준으로 다시 부릅니다.
// picks: 사용자가 "배경색 고르기"로 누른 칸 [{ index, color }]. 마지막으로 고른 색을 가장자리의 기준 색으로 쓰고,
//        누른 칸에서도 그 칸의 색으로 지웁니다 (팔과 몸 사이처럼 가장자리와 떨어진 배경).
export function autoMask(original, tolerance, picks = []) {
  const { width, height } = original
  const mask = new Uint8Array(width * height)
  const color = picks.length > 0 ? picks[picks.length - 1].color : borderColor(original)
  if (color) flood(original, mask, borderIndexes(width, height), color, tolerance)
  for (const pick of picks) flood(original, mask, [pick.index], pick.color, tolerance)
  return mask
}

// 서버가 만든 2D 이미지의 투명한 칸으로 마스크를 만듭니다 (처음 상태, [초기화]).
export function maskFromAlpha(image) {
  const mask = new Uint8Array(image.width * image.height)
  for (let i = 0; i < mask.length; i++) mask[i] = image.data[i * 4 + 3] === 0 ? 1 : 0
  return mask
}

// 브러시: 원 안의 칸을 brush 층에 칠합니다. value 1 = 지우기, 2 = 복원 (자동 마스크보다 앞섬).
export function paintCircle(brush, width, height, cx, cy, radius, value) {
  const r2 = radius * radius
  const x0 = Math.max(0, Math.floor(cx - radius))
  const x1 = Math.min(width - 1, Math.ceil(cx + radius))
  const y0 = Math.max(0, Math.floor(cy - radius))
  const y1 = Math.min(height - 1, Math.ceil(cy + radius))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) brush[y * width + x] = value
    }
  }
}

// 최종 마스크 = 자동 마스크에 브러시를 덮은 것
export function finalMask(auto, brush) {
  const mask = new Uint8Array(auto.length)
  for (let i = 0; i < auto.length; i++) mask[i] = brush[i] === 1 ? 1 : brush[i] === 2 ? 0 : auto[i]
  return mask
}

// 원래 사진에 마스크를 적용한 결과. 지운 칸은 흰색 + 투명 (서버와 같음)
export function applyMask(original, mask) {
  const out = new ImageData(new Uint8ClampedArray(original.data), original.width, original.height)
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) out.data.set([255, 255, 255, 0], i * 4)
  }
  return out
}

export function keptCount(mask) {
  let n = 0
  for (let i = 0; i < mask.length; i++) if (!mask[i]) n++
  return n
}
