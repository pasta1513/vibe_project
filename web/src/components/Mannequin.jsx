import { useId } from 'react'
import headFemale from '../assets/mannequin/head-female.png'
import headMale from '../assets/mannequin/head-male.png'

// 마네킹과 기본 잠옷 (DESIGN §5.1, §5.2).
// 성별마다 기본 그림 하나를 두고, 키와 체형은 비율로 늘이거나 줄입니다. 머리는 그대로 둡니다.
// (2026-10-22 바꿈, P-38) 얼굴과 머리는 사람이 준 마네킹 그림에서 잘라 낸 PNG를 쓰고,
// 몸·잠옷·슬리퍼는 그 그림처럼 하늘색 바탕에 흰 물방울, 칼라와 소맷단, 가는 테두리로 다시 그렸습니다. (사람이 정함)
//
// outfit: 칸마다 옷의 2D 이미지 주소. { top, bottom, dress, shoes, outer }
//   비어 있으면 null, 아우터 "입지 않음"은 'none'. 원피스는 상의와 하의 칸을 함께 차지합니다. (PRD §6 마네킹)
// showEmpty: 빈 칸에 점선과 "하의를 골라 주세요"를 겹쳐 보입니다. (SCREEN-SPEC §2.5, DESIGN §4.1)
// fadedSlots: 지운 옷이 든 칸. 그 옷을 흐리게 보입니다. (SCREEN-SPEC §2.4)
//   지운 옷의 칸은 채운 것으로 보지 않아, 그 자리의 잠옷은 그대로 보입니다.
//   옷이 있는 칸(상의·원피스 / 하의·원피스)의 잠옷은 그리지 않고 팔다리를 살색으로 둡니다.

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
  const h = HEIGHT_RATIO[height] ?? 1
  const w = BODY_RATIO[body] ?? 1
  const base = BASE[gender] ?? BASE.female
  const head = HEAD[gender] ?? HEAD.female

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

  const worn = outfit ?? {}
  const hasDress = Boolean(worn.dress)
  // 옷을 입은 칸의 잠옷은 그리지 않고 팔다리를 살색으로 둡니다. 반팔이나 치마 아래로 잠옷이 보이지 않게 합니다.
  // 지운 옷의 칸은 채운 것으로 보지 않으므로 그 자리의 잠옷은 계속 보입니다. 아우터와 신발은 잠옷을 가리지 않습니다.
  const topValid = Boolean(worn.top) && !fadedSlots.includes('top')
  const bottomValid = Boolean(worn.bottom) && !fadedSlots.includes('bottom')
  const dressValid = Boolean(worn.dress) && !fadedSlots.includes('dress')
  const coversTop = dressValid || topValid
  const coversBottom = dressValid || bottomValid
  const pajamaFill = `url(#${patternId})`
  const slotImage = (slot) => (
    <ClothingImage box={boxes[slot]} url={worn[slot]} faded={fadedSlots.includes(slot)} />
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
        {worn.shoes && slotImage('shoes')}
        {hasDress ? (
          slotImage('dress')
        ) : (
          <>
            {worn.bottom && slotImage('bottom')}
            {worn.top && slotImage('top')}
          </>
        )}
        {worn.outer && worn.outer !== 'none' && slotImage('outer')}

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
