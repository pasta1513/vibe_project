// 캐릭터 의상 틀 그림과 피팅 계산 (2026-10-23, 사람이 정함 — 확인 중)
// moire 프로젝트(moire-source-v15)의 코드를 그대로 가져왔습니다. 좌표는 몸(pajama.js)과 같은 viewBox `0 0 240 360`이라,
// Mannequin.jsx가 몸과 같은 transform 안에 그리면 위치가 저절로 맞습니다.
// - TEMPLATE_SVG, TEMPLATE_BOX: `public/garments/*.svg`와 `src/data/templates.json`의 상자. 우리 틀 9개에 하나씩 대응
//   (반바지는 그쪽에 없어 청바지 그림을 무릎 위에서 자름)
// - normalizeFit, transformText, fittedBox: `src/lib/fit.ts`
// - normalizeShoulderFit, shoulderPoint, shoulderMesh, triangleMatrix, sleeveMarkup: `src/lib/sleeve-fit.ts`
// - garmentMarkup: `src/lib/svg.ts`의 garmentContent·garmentMarkup (무늬는 우리 무늬 그림 형식으로 그림)
// TypeScript 형식 표시만 빼고 계산은 바꾸지 않았습니다.

const svgInner = (svg) => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')

// 우리 틀 코드 → 옷 그림 (사람이 정함)
const TEMPLATE_SVG = {
  top_short: svgInner(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 360"><path d="M98 109 L84 115 L62 149 L80 160 L90 145 L88 193 Q120 199 152 193 L150 145 L160 160 L178 149 L156 115 L142 109 Q120 124 98 109Z" fill="currentColor" stroke="#33352b" stroke-opacity=".14" stroke-width="1.2" stroke-linejoin="round"/><path d="M101 110 Q120 131 139 110 M91 188 Q120 193 149 188" fill="none" stroke="#303128" stroke-opacity=".18" stroke-width="1.2"/></svg>`),
  top_long: svgInner(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 360"><path d="M99 110 L83 116 Q78 120 75 132 L61 185 L78 190 L92 148 L89 196 Q120 200 151 196 L148 148 L162 190 L179 185 L165 132 Q162 120 157 116 L141 110 Q120 131 99 110Z" fill="currentColor" stroke="#33352b" stroke-opacity=".14" stroke-width="1.2" stroke-linejoin="round"/><path d="M99 110 Q120 131 141 110 M64 179 L79 184 M161 184 L176 179 M91 191 Q120 195 149 191" fill="none" stroke="#303128" stroke-opacity=".18" stroke-width="1.2"/></svg>`),
  bottom_pants: svgInner(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 360"><path d="M90 185 Q120 191 150 185 L153 223 L154 310 L128 310 L120 226 L112 310 L86 310 L87 223Z" fill="currentColor" stroke="#33352b" stroke-opacity=".14" stroke-width="1.2" stroke-linejoin="round"/><path d="M89 198 L151 198 M120 199 L120 225 M89 303 L112 303 M128 303 L153 303" fill="none" stroke="#303128" stroke-opacity=".18" stroke-width="1.2"/><path d="M91 200 Q96 218 109 214 M149 200 Q144 218 131 214 M116 200 L116 218 L120 222" fill="none" stroke="#303128" stroke-opacity=".18" stroke-width="1.2"/></svg>`),
  // 반바지: 청바지 그림을 y 245(무릎 위)에서 자른 모양
  bottom_shorts: svgInner(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 360"><path d="M90 185 Q120 191 150 185 L153 223 L153 245 L122 245 L120 226 L118 245 L87 245 L87 223Z" fill="currentColor" stroke="#33352b" stroke-opacity=".14" stroke-width="1.2" stroke-linejoin="round"/><path d="M89 198 L151 198 M120 199 L120 225 M88 239 L118 239 M122 239 L153 239" fill="none" stroke="#303128" stroke-opacity=".18" stroke-width="1.2"/><path d="M91 200 Q96 218 109 214 M149 200 Q144 218 131 214 M116 200 L116 218 L120 222" fill="none" stroke="#303128" stroke-opacity=".18" stroke-width="1.2"/></svg>`),
  bottom_skirt: svgInner(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 360"><path d="M91 187 Q120 192 149 187 L166 271 Q120 282 74 271Z" fill="currentColor" stroke="#33352b" stroke-opacity=".14" stroke-width="1.2" stroke-linejoin="round"/><path d="M89 198 L151 198 M99 201 L90 270 M112 201 L108 274 M128 201 L132 274 M141 201 L151 270" fill="none" stroke="#303128" stroke-opacity=".18" stroke-width="1.2"/></svg>`),
  dress: svgInner(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 360"><path d="M98 109 L84 115 L62 149 L80 160 L92 144 L94 183 L69 274 Q120 288 171 274 L146 183 L148 144 L160 160 L178 149 L156 115 L142 109 Q120 124 98 109Z" fill="currentColor" stroke="#33352b" stroke-opacity=".14" stroke-width="1.2" stroke-linejoin="round"/><path d="M101 110 Q120 131 139 110 M94 183 Q120 190 146 183 M104 194 L93 270 M136 194 L147 270 M73 269 Q120 281 167 269" fill="none" stroke="#303128" stroke-opacity=".18" stroke-width="1.2"/></svg>`),
  outer_short: svgInner(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 360"><path d="M99 109 L81 116 L59 191 L78 197 L92 151 L85 200 L115 202 L120 150 L125 202 L155 200 L148 151 L162 197 L181 191 L159 116 L141 109 L120 144Z" fill="currentColor" stroke="#33352b" stroke-opacity=".14" stroke-width="1.2" stroke-linejoin="round"/><path d="M101 109 L96 127 L105 132 L101 141 L120 162 L116 132Z" fill="currentColor" stroke="#33352b" stroke-opacity=".14" stroke-width="1.2" stroke-linejoin="round"/><path d="M139 109 L144 127 L135 132 L139 141 L120 162 L124 132Z" fill="currentColor" stroke="#33352b" stroke-opacity=".14" stroke-width="1.2" stroke-linejoin="round"/><path d="M91 180 L109 183 M132 183 L150 180 M127 170 L127 196" fill="none" stroke="#303128" stroke-opacity=".18" stroke-width="1.2"/><circle cx="129" cy="177" r="2" fill="#686453"/><circle cx="129" cy="195" r="2" fill="#686453"/></svg>`),
  outer_long: svgInner(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 360"><path d="M99 109 L81 116 L59 191 L78 197 L92 151 L85 253 L115 255 L120 150 L125 255 L155 253 L148 151 L162 197 L181 191 L159 116 L141 109 L120 144Z" fill="currentColor" stroke="#33352b" stroke-opacity=".14" stroke-width="1.2" stroke-linejoin="round"/><path d="M101 109 L96 127 L105 132 L101 141 L120 162 L116 132Z" fill="currentColor" stroke="#33352b" stroke-opacity=".14" stroke-width="1.2" stroke-linejoin="round"/><path d="M139 109 L144 127 L135 132 L139 141 L120 162 L124 132Z" fill="currentColor" stroke="#33352b" stroke-opacity=".14" stroke-width="1.2" stroke-linejoin="round"/><path d="M91 180 L109 183 M132 183 L150 180 M127 170 L127 249" fill="none" stroke="#303128" stroke-opacity=".18" stroke-width="1.2"/><circle cx="129" cy="177" r="2" fill="#686453"/><circle cx="129" cy="195" r="2" fill="#686453"/></svg>`),
  shoes: svgInner(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 360"><path d="M86 307 L109 307 L111 326 L78 326 Q73 318 86 313Z" fill="currentColor" stroke="#33352b" stroke-opacity=".14" stroke-width="1.2" stroke-linejoin="round"/><path d="M131 307 L154 307 L154 313 Q167 318 162 326 L129 326Z" fill="currentColor" stroke="#33352b" stroke-opacity=".14" stroke-width="1.2" stroke-linejoin="round"/><path d="M77 323 L111 323 L111 329 L77 329Z M129 323 L163 323 L163 329 L129 329Z" fill="#e9e7df" stroke="#5554"/><path d="M87 313 L102 315 M85 317 L101 319 M138 315 L153 313 M139 319 L155 317" fill="none" stroke="#303128" stroke-opacity=".18" stroke-width="1.2"/></svg>`),
}

// 틀 상자 [x, y, w, h] (templates.json). 무늬는 이 상자에 맞춰 늘이고, 피팅은 상자 가운데를 기준으로 합니다.
export const TEMPLATE_BOX = {
  top_short: [59, 108, 122, 98],
  top_long: [59, 108, 122, 98],
  bottom_pants: [85, 185, 70, 127],
  bottom_shorts: [85, 185, 70, 62],
  bottom_skirt: [73, 185, 94, 96],
  dress: [59, 108, 122, 175],
  outer_short: [59, 108, 122, 98],
  outer_long: [58, 108, 124, 149],
  shoes: [75, 306, 90, 24],
}
// 칸마다 기본 틀 (빈 칸 점선과 2D 이미지를 놓을 상자)
export const SLOT_TEMPLATE = { top: 'top_long', bottom: 'bottom_pants', dress: 'dress', outer: 'outer_short', shoes: 'shoes' }

export const hasTemplate = (code) => Boolean(TEMPLATE_SVG[code])

// ---- fit.ts ----
export const DEFAULT_FIT = { x: 0, y: 0, scaleX: 1, scaleY: 1 }
export function normalizeFit(value) {
  const limit = (v, f, min, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : f)
  return {
    x: limit(value?.x, 0, -100, 100),
    y: limit(value?.y, 0, -100, 100),
    scaleX: limit(value?.scaleX, 1, 0.5, 2),
    scaleY: limit(value?.scaleY, 1, 0.5, 2),
  }
}
export function transformText(value, cx, cy) {
  const f = normalizeFit(value)
  return `translate(${f.x} ${f.y}) translate(${cx} ${cy}) scale(${f.scaleX} ${f.scaleY}) translate(${-cx} ${-cy})`
}
export function fittedBox(code, look) {
  const [x, y, w, h] = TEMPLATE_BOX[code]
  const f = normalizeFit(look?.fit)
  if (supportsSleeves(code) && look?.shoulderFit) {
    const pts = shoulderMesh([x, y, w, h], look.shoulderFit).flatMap((m) => m.target)
    const xs = pts.map((p) => x + w / 2 + f.x + (p[0] - x - w / 2) * f.scaleX)
    const ys = pts.map((p) => y + h / 2 + f.y + (p[1] - y - h / 2) * f.scaleY)
    return [Math.min(...xs) - 4, Math.min(...ys) - 4, Math.max(...xs) - Math.min(...xs) + 8, Math.max(...ys) - Math.min(...ys) + 8]
  }
  return [x + w / 2 + f.x - (w * f.scaleX) / 2 - 4, y + h / 2 + f.y - (h * f.scaleY) / 2 - 4, w * f.scaleX + 8, h * f.scaleY + 8]
}

// ---- sleeve-fit.ts ----
export const supportsSleeves = (code) => ['top_short', 'top_long', 'outer_short', 'outer_long', 'dress'].includes(code)
const clamp = (v, d, min, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : d)
export function normalizeShoulderFit(v) {
  const sleeve = (s) => ({ angle: clamp(s?.angle, 0, -25, 25), length: clamp(s?.length, 1, 0.65, 1.35), width: clamp(s?.width, 1, 0.65, 1.4) })
  return { shoulder: clamp(v?.shoulder, 1, 0.8, 1.2), left: sleeve(v?.left), right: sleeve(v?.right) }
}
export function shoulderPoint([x, y], input) {
  const f = normalizeShoulderFit(input), side = x < 120 ? 'left' : 'right', sign = side === 'left' ? -1 : 1, anchor = 120 + sign * 28
  const shoulderWeight = Math.max(0, Math.min(1, (195 - y) / 60))
  let nx = 120 + (x - 120) * (1 + (f.shoulder - 1) * shoulderWeight), ny = y
  const blend = Math.max(0, Math.min(1, (sign * (x - anchor)) / 16)) * Math.max(0, Math.min(1, (245 - y) / 35))
  if (blend && (f[side].angle !== 0 || f[side].length !== 1 || f[side].width !== 1)) {
    const s = f[side], dx = x - anchor, dy = y - 117, ax = sign * 0.33, ay = Math.sqrt(1 - 0.33 * 0.33)
    const along = (dx * ax + dy * ay) * s.length, across = (dx * ay - dy * ax) * s.width
    const tx = along * ax + across * ay, ty = along * ay - across * ax, r = (sign * s.angle * Math.PI) / 180
    nx += (tx * Math.cos(r) - ty * Math.sin(r) - dx) * blend
    ny += (tx * Math.sin(r) + ty * Math.cos(r) - dy) * blend
  }
  return [nx, ny]
}
export function shoulderMesh(box, input) {
  const [x, y, w, h] = box
  const xs = [x - 2, ...[62, 78, 92, 120, 148, 162, 178].filter((n) => n > x - 2 && n < x + w + 2), x + w + 2]
  const ys = [y - 2, ...[117, 145, 175, 205, 230].filter((n) => n > y - 2 && n < y + h + 2), y + h + 2]
  const triangles = []
  for (let j = 0; j < ys.length - 1; j++)
    for (let i = 0; i < xs.length - 1; i++) {
      const a = [xs[i], ys[j]], b = [xs[i + 1], ys[j]], c = [xs[i + 1], ys[j + 1]], d = [xs[i], ys[j + 1]]
      for (const source of [[a, b, c], [a, c, d]]) triangles.push({ source, target: source.map((p) => shoulderPoint(p, input)) })
    }
  return triangles
}
export function triangleMatrix(s, t) {
  const [p, q, r] = s, [a, b, c] = t, ux = q[0] - p[0], uy = q[1] - p[1], vx = r[0] - p[0], vy = r[1] - p[1], det = ux * vy - vx * uy
  const A = ((b[0] - a[0]) * vy - (c[0] - a[0]) * uy) / det, B = ((b[1] - a[1]) * vy - (c[1] - a[1]) * uy) / det
  const C = ((c[0] - a[0]) * ux - (b[0] - a[0]) * vx) / det, D = ((c[1] - a[1]) * ux - (b[1] - a[1]) * vx) / det
  return [A, B, C, D, a[0] - A * p[0] - C * p[1], a[1] - B * p[0] - D * p[1]]
}
function expandedTriangle(points) {
  const cx = points.reduce((a, p) => a + p[0], 0) / 3, cy = points.reduce((a, p) => a + p[1], 0) / 3
  return points.map(([x, y]) => {
    const d = Math.hypot(x - cx, y - cy)
    return [x + ((x - cx) / d) * 0.65, y + ((y - cy) / d) * 0.65]
  })
}
export function sleeveMarkup(content, box, input, unique) {
  if (!input) return content
  const f = normalizeShoulderFit(input)
  if (f.shoulder === 1 && [f.left, f.right].every((s) => s.angle === 0 && s.length === 1 && s.width === 1)) return content
  const id = 'sleeve-' + unique.replace(/[^a-z0-9_-]/gi, ''), mesh = shoulderMesh(box, f)
  return (
    `<defs><g id="${id}">${content}</g>${mesh
      .map((m, i) => `<clipPath id="${id}-${i}" clipPathUnits="userSpaceOnUse"><path d="M${expandedTriangle(m.source).map((p) => p.join(' ')).join(' L')}Z"/></clipPath>`)
      .join('')}</defs>` +
    mesh.map((m, i) => `<g transform="matrix(${triangleMatrix(m.source, m.target).join(' ')})"><g clip-path="url(#${id}-${i})"><use href="#${id}"/></g></g>`).join('')
  )
}

// ---- 피팅값 (옷 한 벌의 fit 칸) ----
// { fit: {x, y, scaleX, scaleY}, patternFit: {x, y, scaleX, scaleY}, shoulderFit?: {shoulder, left, right} }
// 옛 모양(P-33의 x·y·sx·sy·rotate·px·py·ps 비율)은 읽지 않고 기본값으로 봅니다 (사람이 정함).
export function normalizeLook(raw) {
  if (!raw || typeof raw !== 'object' || !('fit' in raw || 'patternFit' in raw || 'shoulderFit' in raw)) {
    return { fit: { ...DEFAULT_FIT }, patternFit: { ...DEFAULT_FIT } }
  }
  const look = { fit: normalizeFit(raw.fit), patternFit: normalizeFit(raw.patternFit) }
  if (raw.shoulderFit) look.shoulderFit = normalizeShoulderFit(raw.shoulderFit)
  return look
}

// ---- svg.ts ----
const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c ?? '') ? c : '#a59bb9')
const attr = (v) => String(v).replace(/[&"<>]/g, (ch) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[ch])

// pattern: 우리 무늬 그림 { w, h, paths: [{ d, fill, transform }] } 또는 null
function garmentContent(code, color, pattern, look, unique) {
  const template = TEMPLATE_SVG[code]
  if (!pattern) return template.replaceAll('currentColor', safeColor(color))
  const base = template.replaceAll('currentColor', safeColor(color))
  const clip = (base.match(/<path\b[^>]*>/g) || [])
    .filter((p) => !p.includes('fill="none"'))
    .join('')
    .replace(/stroke="[^"]*"/g, 'stroke="none"')
    .replace(/fill="[^"]*"/g, 'fill="#fff"')
  const lines = base.replace(/fill="(?!none)[^"]*"/g, 'fill="none"')
  const b = TEMPLATE_BOX[code], id = 'clip-' + unique.replace(/[^a-z0-9_-]/gi, '')
  const paths = pattern.paths
    .map((p) => `<path d="${attr(p.d)}"${p.fill ? ` fill="${attr(p.fill)}"` : ''}${p.transform ? ` transform="${attr(p.transform)}"` : ''}/>`)
    .join('')
  return (
    `<defs><clipPath id="${id}">${clip}</clipPath></defs>${base}<g clip-path="url(#${id})"><g transform="translate(${b[0]} ${b[1]}) scale(${b[2] / 100} ${b[3] / 100})">` +
    `<g transform="${transformText(look.patternFit, 50, 50)}"><g transform="scale(${100 / pattern.w} ${100 / pattern.h})">${paths}</g></g></g></g>${lines}`
  )
}

export function garmentMarkup(code, color, pattern, rawLook, unique) {
  const look = normalizeLook(rawLook)
  const [x, y, w, h] = TEMPLATE_BOX[code]
  const content = garmentContent(code, color, pattern, look, unique)
  const inner = supportsSleeves(code) ? sleeveMarkup(content, TEMPLATE_BOX[code], look.shoulderFit, unique) : content
  return `<g transform="${transformText(look.fit, x + w / 2, y + h / 2)}">${inner}</g>`
}
