import { useEffect, useId, useState } from 'react'
import headFemale from '../assets/mannequin/head-female.png'
import headMale from '../assets/mannequin/head-male.png'
import { BODY_MARKUP, pajamaMarkup } from './pajama.js'
import { SLOT_TEMPLATE, TEMPLATE_BOX, fittedBox, garmentMarkup, hasTemplate, normalizeLook } from './garments.js'

// 마네킹과 기본 잠옷 (DESIGN §5.1, §5.2).
// 성별마다 기본 그림 하나를 두고, 키와 체형은 비율로 늘이거나 줄입니다. 머리는 그대로 둡니다.
// (2026-10-22 바꿈, P-38) 얼굴과 머리는 사람이 준 마네킹 그림에서 잘라 낸 PNG를 씁니다. (사람이 정함)
// (2026-10-23 바꿈) 목 아래 몸과 잠옷은 moire 프로젝트의 코드(pajama.js)를 그대로 쓰고,
// 얼굴 폭에 맞춰 1.25배 한 뒤 체형은 가로, 키는 세로 비율로 늘이거나 줄입니다. (사람이 정함)
//
// outfit: 칸마다 옷 한 벌 정보 { image_url, outfit_template, main_color, pattern_url, fit }. { top, bottom, dress, shoes, outer }
//   의상 틀이 있으면 캐릭터 의상으로 그리고(D-016), 없으면 2D 이미지를 얹습니다. 2D 이미지 주소(문자열)도 받습니다.
//   비어 있으면 null, 아우터 "입지 않음"은 'none'. 원피스는 상의와 하의 칸을 함께 차지합니다. (PRD §6 마네킹)
// showEmpty: 빈 칸에 점선과 "하의를 골라 주세요"를 겹쳐 보입니다. (SCREEN-SPEC §2.5, DESIGN §4.1)
// fadedSlots: 지운 옷이 든 칸. 그 옷을 흐리게 보입니다. (SCREEN-SPEC §2.4)
//   잠옷은 그대로 보이고, 칸을 채운 것으로 보지 않습니다.

const HEIGHT_RATIO = { short: 0.92, medium: 1, tall: 1.08 }
const BODY_RATIO = { slim: 0.85, medium: 1, chubby: 1.2 }

const MALE_WIDTH = 1.07 // 남성은 같은 몸을 가로로 조금 넓힘 (moire 프로젝트와 같음)
const DASHED = '#888780'
const EMPTY_TEXT = '#5F5E5A'

const EMPTY_LABEL = {
  top: '상의를 골라 주세요',
  bottom: '하의를 골라 주세요',
  shoes: '신발을 골라 주세요',
  outer: '아우터를 골라 주세요',
}

// 머리 그림 (web/src/assets/mannequin). w, h: PNG 크기(px), cx: 얼굴 가운데, chin: 턱 아래 끝. 그림 1px를 0.4로 줄입니다.
const HEAD = {
  female: { href: headFemale, w: 312, h: 356, cx: 154, chin: 240 },
  male: { href: headMale, w: 206, h: 214, cx: 103, chin: 214 },
}
const HEAD_SCALE = 0.4
const SOLE_TARGET_Y = 384 // 발바닥을 늘 같은 높이에 두어 키 차이가 위로 보이게 합니다.

// 몸(pajama.js)의 좌표. x는 가운데(120)를 0으로 옮긴 값입니다.
const BODY_SCALE = 1.25 // 몸 좌표 1 = 마네킹 좌표 1.25 (얼굴 폭으로 맞춤)
const BODY_CENTER_X = 120
const BODY_CHIN_Y = 105 // 얼굴 아래 끝. 머리 그림의 턱을 여기에 둡니다.
const BODY_SOLE_Y = 324 // 발바닥

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
// 칸 하나의 옷 (2026-10-23 바꿈, 확인 중). 의상 틀과 대표 색이 있으면 moire 프로젝트의 방식(garments.js)으로
// 틀 그림 + 대표 색 + 무늬(틀 안에만) + 피팅값(옷 전체, 내부 무늬, 어깨·소매)을 그립니다. 좌표는 몸과 같습니다.
// 틀이 없으면 2D 이미지를 칸 상자에 얹습니다.
// item: 옷 한 벌 정보 { image_url, outfit_template, main_color, pattern_url, fit } 또는 2D 이미지 주소(문자열)
function ClothingShape({ item, slot, faded }) {
  const unique = `g${useId().replace(/[^a-z0-9]/gi, '')}`
  const info = typeof item === 'object' ? item : null
  const pattern = usePattern(info?.pattern_url)
  const code = info?.outfit_template
  if (!info?.main_color || !hasTemplate(code)) {
    return <ClothingImage box={TEMPLATE_BOX[SLOT_TEMPLATE[slot]]} url={info ? info.image_url : item} faded={faded} />
  }
  return (
    <g
      opacity={faded ? 0.4 : 1}
      data-fit-group={slot}
      dangerouslySetInnerHTML={{ __html: garmentMarkup(code, info.main_color, pattern, info.fit, unique) }}
    />
  )
}

// 옷의 2D 이미지를 칸 상자에 비율을 지켜 얹습니다. (DESIGN §5.1) 상자는 몸 좌표 [x, y, w, h]
function ClothingImage({ box, url, faded }) {
  const [x, y, w, h] = box
  return (
    <image href={url} opacity={faded ? 0.4 : 1} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid meet" />
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

// 마네킹 몸을 놓는 자리와 빈 칸 상자. 몸·잠옷·옷은 몸 좌표 그대로 bodyTransform 안에 그립니다.
function bodyGeometry(gender, height, body) {
  const w = BODY_RATIO[body] ?? 1
  const h = HEIGHT_RATIO[height] ?? 1
  // 몸 좌표 → 마네킹 좌표: x는 가로 배율, y는 세로 배율을 곱하고 발바닥을 SOLE_TARGET_Y에 맞춤
  const scaleX = BODY_SCALE * w * (gender === 'male' ? MALE_WIDTH : 1)
  const scaleY = BODY_SCALE * h
  const originY = SOLE_TARGET_Y - BODY_SOLE_Y * scaleY
  const toBox = ([x, y, bw, bh]) => ({
    x: (x - BODY_CENTER_X) * scaleX,
    y: originY + y * scaleY,
    w: bw * scaleX,
    h: bh * scaleY,
  })
  const bodyTransform = `translate(0 ${originY}) scale(${scaleX} ${scaleY}) translate(${-BODY_CENTER_X} 0)`
  // 빈 칸 상자 (마네킹 좌표): 칸의 기본 틀 상자
  const boxes = Object.fromEntries(Object.entries(SLOT_TEMPLATE).map(([slot, code]) => [slot, toBox(TEMPLATE_BOX[code])]))
  return { chinY: originY + BODY_CHIN_Y * scaleY, bodyTransform, boxes }
}

// 옷만 그린 2D 일러스트 (P-39 뒤, 사람이 정함 2026-10-23): 마네킹에 입히는 캐릭터 의상(틀 + 대표 색 + 무늬)을 옷만 따로 그립니다.
// 옷장 목록의 그림과 옷 상세의 [2D 일러스트]에 씁니다. 틀이나 대표 색이 없는 옷은 배경을 지운 2D 이미지를 그대로 보입니다.
// item: 옷 한 벌 정보 { category, image_url, outfit_template, main_color, pattern_url, fit }
// mannequin: 받지만 쓰지 않습니다 (옷 그림은 몸 기본 좌표로 그림)
export function GarmentIllustration({ item, className, title }) {
  if (!item?.main_color || !hasTemplate(item.outfit_template)) {
    return <img className={className} src={item?.image_url} alt={title ?? '2D 이미지'} />
  }
  // fittedBox: 피팅값까지 들어간 옷 상자에 여유를 둡니다.
  const [x, y, w, h] = fittedBox(item.outfit_template, normalizeLook(item.fit))
  const pad = Math.max(w, h) * 0.08
  return (
    <svg className={className} viewBox={`${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}`} role="img" aria-label={title ?? '옷 일러스트'}>
      <ClothingShape item={item} slot={item.category} />
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
  const uid = useId()
  const head = HEAD[gender] ?? HEAD.female
  const { chinY, bodyTransform, boxes } = bodyGeometry(gender, height, body)

  const worn = outfit ?? {}
  const hasDress = Boolean(worn.dress)
  const slotShape = (slot) => <ClothingShape item={worn[slot]} slot={slot} faded={fadedSlots.includes(slot)} />
  // 기본 잠옷: 옷을 입은 칸은 그리지 않아서 반팔이나 치마 아래로 잠옷이 보이지 않습니다.
  const pajama = (part) => (
    <g dangerouslySetInnerHTML={{ __html: pajamaMarkup(part, `${uid}-${part === '상의' ? 'top' : 'bottom'}`) }} />
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
      overflow="visible" // 크게 조절한 옷도 칸 밖에서 잘리지 않게
      role="img"
      aria-label={title ?? (outfit ? '옷을 입은 마네킹' : '잠옷을 입은 마네킹')}
    >
      {/* 발밑 그림자 */}
      <ellipse cx={0} cy={SOLE_TARGET_Y - 1} rx={76} ry={5} fill="#8c829d" opacity=".13" />

      {/* 몸(목, 팔과 손, 다리, 맨발)과 옷. 옷은 이 순서대로 하의(또는 잠옷 바지) → 상의(또는 잠옷 윗옷), 원피스 → 아우터 → 신발 */}
      <g transform={bodyTransform} data-body="">
        <g dangerouslySetInnerHTML={{ __html: BODY_MARKUP }} />
        {hasDress ? (
          slotShape('dress')
        ) : (
          <>
            {worn.bottom ? slotShape('bottom') : pajama('하의')}
            {worn.top ? slotShape('top') : pajama('상의')}
          </>
        )}
        {worn.outer && worn.outer !== 'none' && slotShape('outer')}
        {worn.shoes && slotShape('shoes')}
      </g>

      {/* 빈 칸 표시. 아우터 안내는 어깨 쪽, 상의 안내는 허리 쪽에 두어 겹치지 않게 합니다. */}
      {emptySlots.map((slot) => (
        <EmptySlot
          key={slot}
          box={boxes[slot]}
          label={EMPTY_LABEL[slot]}
          labelY={slot === 'outer' ? boxes.outer.y + 16 : slot === 'top' ? boxes.top.y + boxes.top.h * 0.7 : undefined}
        />
      ))}

      {/* 머리: 사람이 준 그림에서 잘라 낸 얼굴과 머리 (긴 머리는 어깨 위로 내려옴) */}
      <image
        href={head.href}
        x={-head.cx * HEAD_SCALE}
        y={chinY - head.chin * HEAD_SCALE}
        width={head.w * HEAD_SCALE}
        height={head.h * HEAD_SCALE}
      />
    </svg>
  )
}

export default Mannequin
