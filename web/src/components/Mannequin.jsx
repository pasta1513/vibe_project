import { useId } from 'react'

// 마네킹과 기본 잠옷 (DESIGN §5.1, §5.2).
// 성별마다 기본 그림 하나를 두고, 키와 체형은 비율로 늘이거나 줄입니다. 머리는 그대로 둡니다.
//
// outfit: 칸마다 옷의 2D 이미지 주소. { top, bottom, dress, shoes, outer }
//   비어 있으면 null, 아우터 "입지 않음"은 'none'. 원피스는 상의와 하의 칸을 함께 차지합니다. (PRD §6 마네킹)
// showEmpty: 빈 칸에 점선과 "하의를 골라 주세요"를 겹쳐 보입니다. (SCREEN-SPEC §2.5, DESIGN §4.1)
//   잠옷은 그대로 보이고, 칸을 채운 것으로 보지 않습니다.

const HEIGHT_RATIO = { short: 0.92, medium: 1, tall: 1.08 }
const BODY_RATIO = { slim: 0.85, medium: 1, chubby: 1.2 }

const SKIN = '#F5C4B3'
const CHEEK = '#F0997B'
const HAIR = '#444441'
const FACE_LINE = '#2C2C2A'
const SHOE = '#5F5E5A'
const PAJAMA = '#B5D4F4'
const PAJAMA_DOT = '#2C2C2A'
const COLLAR = '#E6F1FB'
const COLLAR_LINE = '#185FA5'
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
  female: { shoulder: 30, waist: 22, hip: 32 },
  male: { shoulder: 38, waist: 33, hip: 32 },
}
const HEAD_R = 40
const HEAD_CY = 44
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

function Hair({ gender, back }) {
  if (gender === 'female') {
    // 단발: 머리 뒤로 보이는 부분과 앞머리
    return back ? (
      <path d="M -45 44 A 45 45 0 0 1 45 44 L 45 80 Q 45 86 39 86 L -39 86 Q -45 86 -45 80 Z" fill={HAIR} />
    ) : (
      <path d="M -42 46 A 42 42 0 0 1 42 46 Q 22 26 2 32 Q -18 24 -42 46 Z" fill={HAIR} />
    )
  }
  // 짧은 머리
  return back ? null : (
    <path d="M -42 44 A 42 42 0 0 1 42 44 Q 34 24 4 24 Q -30 22 -42 44 Z" fill={HAIR} />
  )
}

// 옷의 2D 이미지를 칸 상자에 비율을 지켜 얹습니다. (DESIGN §5.1)
function ClothingImage({ box, url }) {
  return (
    <image
      href={url}
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
  className,
  title,
}) {
  const patternId = `pj-dots-${useId().replace(/:/g, '')}`
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

  const worn = outfit ?? {}
  const hasDress = Boolean(worn.dress)
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
          <circle cx="3" cy="3" r="1.8" fill={PAJAMA_DOT} />
          <circle cx="9" cy="9" r="1.8" fill={PAJAMA_DOT} />
        </pattern>
      </defs>
      <g transform={`translate(0 ${shiftY})`}>
        {/* 발 (둥근 신발 모양) */}
        {[-1, 1].map((s) => (
          <ellipse key={`foot${s}`} cx={s * (legX + 3)} cy={ankleY + 8} rx={legW / 2 + 6} ry={9} fill={SHOE} />
        ))}

        {/* 잠옷 바지 */}
        <rect x={-hip} y={hipY - 4} width={hip * 2} height={26} rx={6} fill={`url(#${patternId})`} />
        {[-1, 1].map((s) => (
          <rect
            key={`leg${s}`}
            x={s * legX - pantW / 2}
            y={hipY + 4}
            width={pantW}
            height={ankleY - hipY}
            rx={pantW / 2}
            fill={`url(#${patternId})`}
          />
        ))}

        {/* 뒷머리는 목과 몸보다 뒤에 그립니다. */}
        <Hair gender={gender} back />

        {/* 목 */}
        <rect x={-8 * w} y={78} width={16 * w} height={16} fill={SKIN} />

        {/* 잠옷 윗옷 */}
        <path d={torsoPath(sh, wa, hip, SHOULDER_Y, waistY, hipY)} fill={`url(#${patternId})`} />

        {/* 소매와 손 (동그란 벙어리장갑 모양) */}
        {[-1, 1].map((s) => (
          <g key={`arm${s}`}>
            <rect
              x={s * armX - armW / 2}
              y={armTop}
              width={armW}
              height={wristY - armTop}
              rx={armW / 2}
              fill={`url(#${patternId})`}
            />
            <ellipse cx={s * armX} cy={wristY + 6} rx={armW / 2 + 1} ry={11} fill={SKIN} />
          </g>
        ))}

        {/* 칼라 */}
        {[-1, 1].map((s) => (
          <path
            key={`collar${s}`}
            d={`M ${s * 2} ${SHOULDER_Y - 2} L ${s * 18} ${SHOULDER_Y + 1} L ${s * 5} ${SHOULDER_Y + 15} Z`}
            fill={COLLAR}
            stroke={COLLAR_LINE}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        ))}

        {/* 옷: 신발 → 하의 → 상의(또는 원피스) → 아우터 순서로 겹칩니다. */}
        {worn.shoes && <ClothingImage box={boxes.shoes} url={worn.shoes} />}
        {hasDress ? (
          <ClothingImage box={boxes.dress} url={worn.dress} />
        ) : (
          <>
            {worn.bottom && <ClothingImage box={boxes.bottom} url={worn.bottom} />}
            {worn.top && <ClothingImage box={boxes.top} url={worn.top} />}
          </>
        )}
        {worn.outer && worn.outer !== 'none' && <ClothingImage box={boxes.outer} url={worn.outer} />}

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

        {/* 머리 */}
        <circle cx={0} cy={HEAD_CY} r={HEAD_R} fill={SKIN} />
        <Hair gender={gender} />

        {/* 웃는 얼굴: 눈웃음, 웃는 입, 볼 터치 */}
        <g fill="none" stroke={FACE_LINE} strokeWidth="3" strokeLinecap="round">
          <path d="M -19 55 Q -13.5 48 -8 55" />
          <path d="M 8 55 Q 13.5 48 19 55" />
          <path d="M -8 65 Q 0 73 8 65" />
        </g>
        <circle cx={-24} cy={64} r={6} fill={CHEEK} />
        <circle cx={24} cy={64} r={6} fill={CHEEK} />
      </g>
    </svg>
  )
}

export default Mannequin
