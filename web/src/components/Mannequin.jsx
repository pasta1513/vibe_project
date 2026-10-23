import { useEffect, useId, useState } from 'react'
import headFemale from '../assets/mannequin/head-female.png'
import headMale from '../assets/mannequin/head-male.png'

// 마네킹과 기본 잠옷 (DESIGN §5.1, §5.2).
// 성별마다 기본 그림 하나를 두고, 키와 체형은 비율로 늘이거나 줄입니다. 머리는 그대로 둡니다.
// (2026-10-22 바꿈, P-38) 얼굴과 머리는 사람이 준 마네킹 그림에서 잘라 낸 PNG를 쓰고,
// 몸·잠옷·슬리퍼는 그 그림처럼 하늘색 바탕에 흰 물방울, 칼라와 소맷단, 가는 테두리로 다시 그렸습니다. (사람이 정함)
//
// outfit: 칸마다 옷 한 벌 정보 { image_url, outfit_template, main_color, pattern_url, fit }. { top, bottom, dress, shoes, outer }
//   의상 틀이 있으면 캐릭터 의상으로 그리고(D-016), 없으면 2D 이미지를 얹습니다. 2D 이미지 주소(문자열)도 받습니다.
//   비어 있으면 null, 아우터 "입지 않음"은 'none'. 원피스는 상의와 하의 칸을 함께 차지합니다. (PRD §6 마네킹)
// showEmpty: 빈 칸에 점선과 "하의를 골라 주세요"를 겹쳐 보입니다. (SCREEN-SPEC §2.5, DESIGN §4.1)
// fadedSlots: 지운 옷이 든 칸. 그 옷을 흐리게 보입니다. (SCREEN-SPEC §2.4)
//   잠옷은 그대로 보이고, 칸을 채운 것으로 보지 않습니다.

const HEIGHT_RATIO = { short: 0.92, medium: 1, tall: 1.08 }
const BODY_RATIO = { slim: 0.85, medium: 1, chubby: 1.2 }

const SKIN = '#FDE6D8'
const SKIN_LINE = '#EFA48A'
const PAJAMA = '#BCDCFA'
const PAJAMA_DOT = '#FFFFFF'
const PAJAMA_LINE = '#6FA6E6'
const COLLAR = '#D9EBFD'
const SLIPPER = '#B4D5F8'
const SLIPPER_LINE = '#5E97DE'
const DASHED = '#888780'
const EMPTY_TEXT = '#5F5E5A'

const EMPTY_LABEL = {
  top: '상의를 골라 주세요',
  bottom: '하의를 골라 주세요',
  shoes: '신발을 골라 주세요',
  outer: '아우터를 골라 주세요',
}

// 기본 그림의 몸 치수 (키 1배, 체형 1배일 때)
const BASE = {
  female: { shoulder: 34, waist: 28, hip: 32 },
  male: { shoulder: 38, waist: 33, hip: 32 },
}
// 머리 그림 (web/src/assets/mannequin). w, h: PNG 크기(px), cx: 얼굴 가운데, chin: 턱 아래 끝. 그림 1px를 0.4로 줄입니다.
const HEAD = {
  female: { href: headFemale, w: 312, h: 356, cx: 154, chin: 240 },
  male: { href: headMale, w: 206, h: 214, cx: 103, chin: 214 },
}
const HEAD_SCALE = 0.4
const CHIN_Y = 86
const SHOULDER_Y = 88
const BODY_LENGTH = 260 // 어깨부터 발바닥까지
const SOLE_TARGET_Y = 384 // 발바닥을 늘 같은 높이에 두어 키 차이가 위로 보이게 합니다.

// 몸통(잠옷 윗옷) 모양: 어깨 → 허리 → 엉덩이, 좌우 대칭
function torsoPath(sh, wa, hip, sy, wy, hy) {
  const hem = hy + 12
  return [
    `M ${-sh + 6} ${sy}`,
    `L ${sh - 6} ${sy}`,
    `Q ${sh} ${sy} ${sh} ${sy + 8}`,
    `Q ${sh} ${(sy + 8 + wy) / 2} ${wa} ${wy}`,
    `Q ${hip} ${(wy + hy) / 2} ${hip} ${hy}`,
    `L ${hip} ${hem}`,
    `L ${-hip} ${hem}`,
    `L ${-hip} ${hy}`,
    `Q ${-hip} ${(wy + hy) / 2} ${-wa} ${wy}`,
    `Q ${-sh} ${(sy + 8 + wy) / 2} ${-sh} ${sy + 8}`,
    `Q ${-sh} ${sy} ${-sh + 6} ${sy}`,
    'Z',
  ].join(' ')
}

// 대표 색을 조금 어둡게 한 테두리 색 (DESIGN §5.5)
function darker(hex, amount = 0.3) {
  const n = parseInt(hex.slice(1), 16)
  const ch = (shift) => Math.round(((n >> shift) & 255) * (1 - amount))
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`
}

// 캐릭터 의상 틀 9개 (D-016, DESIGN §5.5). 잠옷처럼 마네킹의 몸 치수로 그려서 18가지 모양에 저절로 맞습니다.
// 돌려주는 것: 틀을 이루는 path 목록
function outfitPaths(template, d) {
  const { sh, wa, hip, sy, waistY, hipY, armX, armW, armTop, wristY, legX, legW, pantW, ankleY } = d
  const legLen = ankleY - hipY
  const sleeve = (bottomY, extra = 0) =>
    [-1, 1].map((s) => {
      const x = s * armX - (armW + extra) / 2
      const w = armW + extra
      const r = w / 2
      return `M ${x} ${armTop + r} A ${r} ${r} 0 0 1 ${x + w} ${armTop + r} L ${x + w} ${bottomY} L ${x} ${bottomY} Z`
    })
  const legs = (bottomY) => [
    `M ${-hip} ${hipY - 10} L ${hip} ${hipY - 10} L ${hip} ${hipY + 16} L ${-hip} ${hipY + 16} Z`,
    ...[-1, 1].map((s) => {
      const x = s * legX - pantW / 2
      return `M ${x} ${hipY} L ${x + pantW} ${hipY} L ${x + pantW} ${bottomY} L ${x} ${bottomY} Z`
    }),
  ]
  // 앞이 열린 아우터의 한쪽 판. s = -1(왼쪽), 1(오른쪽)
  const outerHalf = (s, hemY) => {
    const p = (x, y) => `${s * x} ${y}`
    return [
      `M ${p(13, sy - 1)}`,
      `L ${p(sh + 3, sy + 1)}`,
      `Q ${p(sh + 5, sy + 2)} ${p(sh + 5, sy + 10)}`,
      `Q ${p(sh + 5, (sy + 10 + waistY) / 2)} ${p(wa + 5, waistY)}`,
      `Q ${p(hip + 6, (waistY + hipY) / 2)} ${p(hip + 6, hipY)}`,
      `L ${p(hip + 7, hemY)}`,
      `L ${p(3, hemY)}`,
      `L ${p(3, sy + 42)}`,
      'Z',
    ].join(' ')
  }
  switch (template) {
    case 'top_short':
      return [...sleeve(armTop + (wristY - armTop) * 0.38, 4), torsoPath(sh, wa, hip, sy, waistY, hipY)]
    case 'top_long':
      return [...sleeve(wristY), torsoPath(sh, wa, hip, sy, waistY, hipY)]
    case 'bottom_pants':
      return legs(ankleY)
    case 'bottom_shorts':
      return legs(hipY + legLen * 0.32)
    case 'bottom_skirt': {
      const hem = hipY + legLen * 0.5
      const flare = hip * 1.4
      return [
        `M ${-wa - 2} ${hipY - 12} L ${wa + 2} ${hipY - 12} L ${flare} ${hem - 4} Q ${flare} ${hem} ${flare - 4} ${hem} L ${-flare + 4} ${hem} Q ${-flare} ${hem} ${-flare} ${hem - 4} Z`,
      ]
    }
    case 'dress': {
      const hem = hipY + legLen * 0.62
      const flare = hip * 1.45
      return [
        ...sleeve(armTop + (wristY - armTop) * 0.3, 4),
        [
          `M ${-sh + 6} ${sy}`,
          `L ${sh - 6} ${sy}`,
          `Q ${sh} ${sy} ${sh} ${sy + 8}`,
          `Q ${sh} ${(sy + 8 + waistY) / 2} ${wa} ${waistY}`,
          `L ${flare} ${hem - 4}`,
          `Q ${flare} ${hem} ${flare - 4} ${hem}`,
          `L ${-flare + 4} ${hem}`,
          `Q ${-flare} ${hem} ${-flare} ${hem - 4}`,
          `L ${-wa} ${waistY}`,
          `Q ${-sh} ${(sy + 8 + waistY) / 2} ${-sh} ${sy + 8}`,
          `Q ${-sh} ${sy} ${-sh + 6} ${sy}`,
          'Z',
        ].join(' '),
      ]
    }
    case 'outer_short':
    case 'outer_long': {
      const hem = template === 'outer_long' ? hipY + legLen * 0.55 : hipY + 22
      return [...sleeve(wristY + 2, 5), outerHalf(-1, hem), outerHalf(1, hem)]
    }
    case 'shoes':
      return [-1, 1].map((s) => {
        const cx = s * (legX + 3)
        const rx = legW / 2 + 8
        const top = ankleY - 3
        const bottom = ankleY + 18
        return `M ${cx - rx} ${bottom - 6} Q ${cx - rx} ${top} ${cx} ${top} Q ${cx + rx} ${top} ${cx + rx} ${bottom - 6} Q ${cx + rx} ${bottom} ${cx + rx - 6} ${bottom} L ${cx - rx + 6} ${bottom} Q ${cx - rx} ${bottom} ${cx - rx} ${bottom - 6} Z`
      })
    default:
      return null
  }
}

// 틀이 차지하는 상자. 무늬를 이 크기에 맞춰 늘이거나 줄입니다. outfitPaths와 같은 치수를 씁니다. (DESIGN §5.5)
function outfitBox(template, d) {
  const { hip, sy, hipY, armX, armW, wristY, legX, legW, pantW, ankleY } = d
  const legLen = ankleY - hipY
  const sleeveOut = (extra = 0) => armX + (armW + extra) / 2
  const legOut = Math.max(hip, legX + pantW / 2)
  const box = (half, top, bottom) => ({ x: -half, y: top, w: half * 2, h: bottom - top })
  switch (template) {
    case 'top_short':
      return box(sleeveOut(4), sy, hipY + 12)
    case 'top_long':
      return box(sleeveOut(), sy, Math.max(hipY + 12, wristY))
    case 'bottom_pants':
      return box(legOut, hipY - 10, ankleY)
    case 'bottom_shorts':
      return box(legOut, hipY - 10, hipY + legLen * 0.32)
    case 'bottom_skirt':
      return box(hip * 1.4, hipY - 12, hipY + legLen * 0.5)
    case 'dress':
      return box(Math.max(hip * 1.45, sleeveOut(4)), sy, hipY + legLen * 0.62)
    case 'outer_short':
    case 'outer_long': {
      const hem = template === 'outer_long' ? hipY + legLen * 0.55 : hipY + 22
      return box(Math.max(sleeveOut(5), hip + 7), sy - 1, Math.max(hem, wristY + 2))
    }
    case 'shoes':
      return box(legX + 3 + legW / 2 + 8, ankleY - 3, ankleY + 18)
    default:
      return null
  }
}

// 무늬 그림 (D-016, P-32). 서버가 만든 SVG 파일에서 path의 모양·색·위치만 골라 씁니다.
// 파일에 다른 것이 들어 있어도 그대로 그리지 않습니다. 같은 주소는 한 번만 받습니다.
const patternCache = new Map() // 주소 → { w, h, paths } 또는 null (받는 중이면 Promise)

function parsePattern(text) {
  const root = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement
  const w = parseFloat(root?.getAttribute('width'))
  const h = parseFloat(root?.getAttribute('height'))
  if (root?.nodeName !== 'svg' || !(w > 0) || !(h > 0)) return null
  const paths = [...root.children]
    .filter((el) => el.nodeName === 'path' && el.getAttribute('d'))
    .map((el) => ({ d: el.getAttribute('d'), fill: el.getAttribute('fill'), transform: el.getAttribute('transform') }))
  return paths.length > 0 ? { w, h, paths } : null
}

function usePattern(url) {
  const cached = url ? patternCache.get(url) : null
  const [pattern, setPattern] = useState(cached instanceof Promise ? null : cached ?? null)
  useEffect(() => {
    if (!url) return undefined
    let alive = true
    let job = patternCache.get(url)
    if (job === undefined) {
      job = fetch(url)
        .then((res) => (res.ok ? res.text() : null))
        .then((text) => (text ? parsePattern(text) : null))
        .catch(() => null)
        .then((result) => {
          patternCache.set(url, result)
          return result
        })
      patternCache.set(url, job)
    }
    Promise.resolve(job).then((result) => alive && setPattern(result))
    return () => {
      alive = false
    }
  }, [url])
  return url ? pattern : null
}

// 칸 하나의 옷. 의상 틀이 있으면 틀을 대표 색으로 칠하고, 무늬가 있으면 틀 모양 안에만 겹칩니다(clipPath).
// 틀이 없으면 2D 이미지를 칸 상자에 얹습니다.
// item: 옷 한 벌 정보 { image_url, outfit_template, main_color, pattern_url } 또는 2D 이미지 주소(문자열)
function ClothingShape({ item, box, dims, faded }) {
  const clipId = `outfit-clip-${useId().replace(/:/g, '')}`
  const info = typeof item === 'object' ? item : null
  const pattern = usePattern(info?.pattern_url)
  const paths = info?.main_color ? outfitPaths(info.outfit_template, dims) : null
  if (!paths) {
    return <ClothingImage box={box} url={info ? info.image_url : item} faded={faded} />
  }
  const area = outfitBox(info.outfit_template, dims)
  const shapes = paths.map((d, i) => <path key={i} d={d} />)
  // 피팅값 (P-33, DESIGN §5.5): 옷은 틀 상자 가운데를 중심으로 옮기고 늘이고 기울입니다.
  // 무늬는 틀 모양 안에서만 따로 옮기고 늘입니다. 값은 틀 상자 크기에 대한 비율이라 18가지 모양에 같은 느낌입니다.
  const fit = { x: 0, y: 0, sx: 1, sy: 1, rotate: 0, px: 0, py: 0, ps: 1, ...(info.fit ?? {}) }
  const cx = area.x + area.w / 2
  const cy = area.y + area.h / 2
  const outfitTransform =
    `translate(${cx + fit.x * area.w} ${cy + fit.y * area.h}) rotate(${fit.rotate}) ` +
    `scale(${fit.sx} ${fit.sy}) translate(${-cx} ${-cy})`
  const patternTransform =
    `translate(${cx + fit.px * area.w} ${cy + fit.py * area.h}) scale(${fit.ps}) translate(${-cx} ${-cy}) ` +
    `translate(${area.x} ${area.y})` + (pattern ? ` scale(${area.w / pattern.w} ${area.h / pattern.h})` : '')
  return (
    <g opacity={faded ? 0.4 : 1} transform={outfitTransform} data-fit-box={`${area.w} ${area.h}`}>
      <defs>
        <clipPath id={clipId}>{shapes}</clipPath>
      </defs>
      <g fill={info.main_color}>{shapes}</g>
      {pattern && (
        <g clipPath={`url(#${clipId})`}>
          <g transform={patternTransform}>
            {pattern.paths.map((p, i) => (
              <path key={i} d={p.d} fill={p.fill ?? undefined} transform={p.transform ?? undefined} />
            ))}
          </g>
        </g>
      )}
      <g fill="none" stroke={darker(info.main_color)} strokeWidth={1.5} strokeLinejoin="round">
        {shapes}
      </g>
    </g>
  )
}

// 옷의 2D 이미지를 칸 상자에 비율을 지켜 얹습니다. (DESIGN §5.1)
function ClothingImage({ box, url, faded }) {
  return (
    <image
      href={url}
      opacity={faded ? 0.4 : 1}
      x={box.x}
      y={box.y}
      width={box.w}
      height={box.h}
      preserveAspectRatio="xMidYMid meet"
    />
  )
}

// 빈 칸: 2px 회색 점선, 모서리 8px, 안내 글 (DESIGN §4.1). labelY는 상자 안에서 글이 놓일 높이입니다.
function EmptySlot({ box, label, labelY }) {
  return (
    <g>
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        rx={8}
        fill="rgba(255, 255, 255, 0.35)"
        stroke={DASHED}
        strokeWidth={2}
        strokeDasharray="5 4"
      />
      <text
        x={box.x + box.w / 2}
        y={labelY ?? box.y + box.h / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={11}
        fill={EMPTY_TEXT}
        stroke="#FFFFFF"
        strokeWidth={3}
        paintOrder="stroke"
      >
        {label}
      </text>
    </g>
  )
}

// 마네킹 몸의 치수와 칸 상자. 마네킹과 옷만 그린 일러스트(GarmentIllustration)가 함께 씁니다.
function bodyGeometry(gender, height, body) {
  const h = HEIGHT_RATIO[height] ?? 1
  const w = BODY_RATIO[body] ?? 1
  const base = BASE[gender] ?? BASE.female

  const sh = base.shoulder * w
  const wa = base.waist * w
  const hip = base.hip * w
  const length = BODY_LENGTH * h
  const torsoLen = length * 0.4
  const waistY = SHOULDER_Y + torsoLen * 0.6
  const hipY = SHOULDER_Y + torsoLen
  const footH = 16
  const ankleY = SHOULDER_Y + length - footH
  const soleY = SHOULDER_Y + length

  const armW = 18 * w
  const armX = sh + armW / 2 - 8
  const armTop = SHOULDER_Y + 4
  const wristY = SHOULDER_Y + length * 0.38

  const legW = 22 * w
  const legX = hip - legW / 2 - 1
  const pantW = legW + 6

  const shiftY = SOLE_TARGET_Y - soleY

  // 칸 상자 (마네킹과 같은 비율로 늘고 줄어듭니다)
  const sleeve = armX + armW / 2
  const legOuter = legX + pantW / 2
  const boxes = {
    top: { x: -sleeve - 2, y: SHOULDER_Y - 6, w: (sleeve + 2) * 2, h: hipY + 14 - (SHOULDER_Y - 6) },
    bottom: { x: -legOuter - 2, y: hipY - 6, w: (legOuter + 2) * 2, h: ankleY + 2 - (hipY - 6) },
    shoes: { x: -legOuter - 10, y: ankleY - 6, w: (legOuter + 10) * 2, h: footH + 12 },
    outer: { x: -sleeve - 8, y: SHOULDER_Y - 10, w: (sleeve + 8) * 2, h: hipY + 34 - (SHOULDER_Y - 10) },
  }
  boxes.dress = { x: boxes.top.x, y: boxes.top.y, w: boxes.top.w, h: boxes.bottom.y + boxes.bottom.h - boxes.top.y }

  const dims = { sh, wa, hip, sy: SHOULDER_Y, waistY, hipY, armX, armW, armTop, wristY, legX, legW, pantW, ankleY }
  return { w, sh, wa, hip, waistY, hipY, ankleY, armW, armX, armTop, wristY, legW, legX, pantW, shiftY, boxes, dims }
}

// 옷만 그린 2D 일러스트 (P-39 뒤, 사람이 정함 2026-10-23): 마네킹에 입히는 캐릭터 의상(틀 + 대표 색 + 무늬)을 옷만 따로 그립니다.
// 옷장 목록의 그림과 옷 상세의 [2D 일러스트]에 씁니다. 틀이나 대표 색이 없는 옷은 배경을 지운 2D 이미지를 그대로 보입니다.
// item: 옷 한 벌 정보 { category, image_url, outfit_template, main_color, pattern_url, fit }
// mannequin: 몸 치수를 정할 마네킹 모양 (없으면 여성·보통·보통)
export function GarmentIllustration({ item, mannequin, className, title }) {
  const { gender = 'female', height = 'medium', body = 'medium' } = mannequin ?? {}
  const { boxes, dims } = bodyGeometry(gender, height, body)
  const area = item?.main_color ? outfitBox(item.outfit_template, dims) : null
  if (!area) {
    return <img className={className} src={item?.image_url} alt={title ?? '2D 이미지'} />
  }
  // 옷 상자 둘레에 여유를 두어 피팅값으로 옮기거나 기울여도 잘리지 않게 합니다.
  const pad = Math.max(area.w, area.h) * 0.12
  const viewBox = `${area.x - pad} ${area.y - pad} ${area.w + pad * 2} ${area.h + pad * 2}`
  return (
    <svg className={className} viewBox={viewBox} role="img" aria-label={title ?? '옷 일러스트'}>
      <ClothingShape item={item} box={boxes[item.category] ?? boxes.top} dims={dims} />
    </svg>
  )
}

function Mannequin({
  gender = 'female',
  height = 'medium',
  body = 'medium',
  outfit,
  showEmpty = false,
  fadedSlots = [],
  className,
  title,
}) {
  const patternId = `pj-dots-${useId().replace(/:/g, '')}`
  const head = HEAD[gender] ?? HEAD.female
  const { w, sh, wa, hip, waistY, hipY, ankleY, armW, armX, armTop, wristY, legW, legX, pantW, shiftY, boxes, dims } =
    bodyGeometry(gender, height, body)

  const worn = outfit ?? {}
  const hasDress = Boolean(worn.dress)
  // 옷을 입은 칸의 잠옷은 그리지 않고 팔다리를 살색으로 둡니다. 반팔이나 치마 아래로 잠옷이 보이지 않게 합니다.
  const coversTop = hasDress || Boolean(worn.top)
  const coversBottom = hasDress || Boolean(worn.bottom)
  const pajamaFill = `url(#${patternId})`
  const slotShape = (slot) => (
    <ClothingShape item={worn[slot]} box={boxes[slot]} dims={dims} faded={fadedSlots.includes(slot)} />
  )
  const emptySlots = showEmpty
    ? ['shoes', 'bottom', 'top', 'outer'].filter((slot) => {
        if ((slot === 'top' || slot === 'bottom') && hasDress) return false
        return !worn[slot]
      })
    : []

  return (
    <svg
      className={className}
      viewBox="-100 -12 200 400"
      role="img"
      aria-label={title ?? (outfit ? '옷을 입은 마네킹' : '잠옷을 입은 마네킹')}
    >
      <defs>
        <pattern id={patternId} width="12" height="12" patternUnits="userSpaceOnUse">
          <rect width="12" height="12" fill={PAJAMA} />
          <circle cx="3" cy="3" r="1.4" fill={PAJAMA_DOT} />
          <circle cx="9" cy="9" r="1.4" fill={PAJAMA_DOT} />
        </pattern>
      </defs>
      <g transform={`translate(0 ${shiftY})`}>
        {/* 발: 하늘색 슬리퍼 */}
        {[-1, 1].map((s) => (
          <ellipse
            key={`foot${s}`}
            cx={s * (legX + 3)}
            cy={ankleY + 8}
            rx={legW / 2 + 7}
            ry={9}
            fill={SLIPPER}
            stroke={SLIPPER_LINE}
            strokeWidth="1.5"
          />
        ))}

        {/* 잠옷 바지. 하의나 원피스를 입으면 다리만 살색으로 */}
        {!coversBottom && (
          <rect x={-hip} y={hipY - 4} width={hip * 2} height={26} rx={5} fill={pajamaFill} stroke={PAJAMA_LINE} strokeWidth="1.5" />
        )}
        {[-1, 1].map((s) => (
          <g key={`leg${s}`}>
            <rect
              x={s * legX - (coversBottom ? legW : pantW) / 2}
              y={hipY + 4}
              width={coversBottom ? legW : pantW}
              height={ankleY - hipY}
              rx={coversBottom ? legW / 2 : 4}
              fill={coversBottom ? SKIN : pajamaFill}
              stroke={coversBottom ? SKIN_LINE : PAJAMA_LINE}
              strokeWidth="1.5"
            />
            {/* 바짓단 */}
            {!coversBottom && (
              <rect
                x={s * legX - pantW / 2}
                y={ankleY - 8}
                width={pantW}
                height={8}
                rx={2}
                fill={COLLAR}
                stroke={PAJAMA_LINE}
                strokeWidth="1.5"
              />
            )}
          </g>
        ))}
        {/* 바지 가운데 선 */}
        {!coversBottom && <line x1={0} y1={hipY + 8} x2={0} y2={hipY + 20} stroke={PAJAMA_LINE} strokeWidth="1.2" />}

        {/* 목 */}
        <rect x={-8 * w} y={CHIN_Y - 8} width={16 * w} height={SHOULDER_Y - CHIN_Y + 14} fill={SKIN} />

        {/* 잠옷 윗옷 */}
        {!coversTop && (
          <>
            <path
              d={torsoPath(sh, wa, hip, SHOULDER_Y, waistY, hipY)}
              fill={pajamaFill}
              stroke={PAJAMA_LINE}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            {/* 앞섶과 단추 */}
            <line x1={0} y1={SHOULDER_Y + 14} x2={0} y2={hipY + 12} stroke={PAJAMA_LINE} strokeWidth="1.2" />
            {[0.2, 0.42, 0.64, 0.86].map((t) => (
              <circle
                key={t}
                cx={3}
                cy={SHOULDER_Y + 14 + (hipY - SHOULDER_Y - 6) * t}
                r={1.8}
                fill={COLLAR}
                stroke={PAJAMA_LINE}
                strokeWidth="0.8"
              />
            ))}
          </>
        )}

        {/* 소매와 손 (동그란 벙어리장갑 모양) */}
        {[-1, 1].map((s) => (
          <g key={`arm${s}`}>
            <rect
              x={s * armX - armW / 2}
              y={armTop}
              width={armW}
              height={wristY - armTop}
              rx={armW / 2}
              fill={coversTop ? SKIN : pajamaFill}
              stroke={coversTop ? SKIN_LINE : PAJAMA_LINE}
              strokeWidth="1.5"
            />
            {/* 소맷단 */}
            {!coversTop && (
              <rect
                x={s * armX - armW / 2 - 1}
                y={wristY - 8}
                width={armW + 2}
                height={8}
                rx={2}
                fill={COLLAR}
                stroke={PAJAMA_LINE}
                strokeWidth="1.5"
              />
            )}
            <ellipse
              cx={s * armX}
              cy={wristY + 6}
              rx={armW / 2}
              ry={10}
              fill={SKIN}
              stroke={SKIN_LINE}
              strokeWidth="1.2"
            />
          </g>
        ))}

        {/* 칼라 */}
        {!coversTop && [-1, 1].map((s) => (
          <path
            key={`collar${s}`}
            d={`M ${s * 1} ${SHOULDER_Y - 3} L ${s * 17} ${SHOULDER_Y - 1} L ${s * 14} ${SHOULDER_Y + 9} L ${s * 1} ${SHOULDER_Y + 16} Z`}
            fill={COLLAR}
            stroke={PAJAMA_LINE}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        ))}

        {/* 옷: 신발 → 하의 → 상의(또는 원피스) → 아우터 순서로 겹칩니다. */}
        {worn.shoes && slotShape('shoes')}
        {hasDress ? (
          slotShape('dress')
        ) : (
          <>
            {worn.bottom && slotShape('bottom')}
            {worn.top && slotShape('top')}
          </>
        )}
        {worn.outer && worn.outer !== 'none' && slotShape('outer')}

        {/* 빈 칸 표시. 아우터 안내는 어깨 쪽, 상의 안내는 허리 쪽에 두어 겹치지 않게 합니다. */}
        {emptySlots.map((slot) => (
          <EmptySlot
            key={slot}
            box={boxes[slot]}
            label={EMPTY_LABEL[slot]}
            labelY={
              slot === 'outer' ? SHOULDER_Y + 14 : slot === 'top' ? (waistY + hipY) / 2 : undefined
            }
          />
        ))}

        {/* 머리: 사람이 준 그림에서 잘라 낸 얼굴과 머리 (긴 머리는 어깨 위로 내려옴) */}
        <image
          href={head.href}
          x={-head.cx * HEAD_SCALE}
          y={CHIN_Y - head.chin * HEAD_SCALE}
          width={head.w * HEAD_SCALE}
          height={head.h * HEAD_SCALE}
        />
      </g>
    </svg>
  )
}

export default Mannequin
