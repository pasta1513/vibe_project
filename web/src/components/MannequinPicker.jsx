import '@fontsource/gamja-flower/400.css'
import { useEffect, useState } from 'react'
import '../styles/onboarding.css'
import step1Image from '../assets/onboarding/step1-gender.png'
import step2Image from '../assets/onboarding/step2-height.png'
import step3Image from '../assets/onboarding/step3-body.png'
import step4Image from '../assets/onboarding/step4-confirm.png'
import { useFitScale } from '../useFitScale.js'
import Mannequin from './Mannequin.jsx'

// 첫 실행: 마네킹 고르기 (SCREEN-SPEC §3). 닫기 버튼은 없습니다.
// 시안 style/html의 01(성별), 02(키), 03(체형), 04_2(확인)를 그대로 옮겼습니다. 위치와 크기는 1536×1024 캔버스 기준입니다. (P-38)
// 문장은 앱의 실제 동작에 맞게 고쳤습니다: 마네킹 모양은 보이는 모습에만 쓰고, 키 숫자는 쓰지 않습니다 (PRD §6, 사람이 정함 2026-10-22).
// 시안의 키·체형 그림은 여자 그림뿐이라, 남성을 고르면 그 카드에는 앱 마네킹을 그립니다 (사람이 정함 2026-10-22).

// crop: 시안 PNG에서 잘라 쓸 위치 (--x, --y: 카드 안 위치, --sx, --sy: PNG 안 위치)
const STEPS = [
  {
    key: 'gender',
    label: '성별',
    image: step1Image,
    intro: {
      box: { left: 112, top: 92, width: 330, height: 456 },
      title: ['나만의 스타일을', '기록하고,', '매일 새로운 코디를', '만나보세요.'],
      text: ['아늑한 공간에서', '나의 스타일을 발견하고', '오늘의 코디를 기록해요.'],
    },
    panel: { left: 805, top: 72, width: 690, height: 882 },
    stepTop: 78,
    stepXs: [163, 290, 417, 543],
    q: {
      top: 190,
      title: '어떤 성별로 시작할까요?',
      text: ['고른 성별에 맞춰', '마네킹의 모습이 바뀌어요.'],
    },
    opts: { left: 84, top: 347, gap: 24, width: 250, height: 392, labelTop: 336 },
    options: [
      { value: 'female', label: '여성', crop: { x: 50, y: 18, sx: 941, sy: 439, w: 146, h: 312 } },
      { value: 'male', label: '남성', crop: { x: 58, y: 30, sx: 1223, sy: 451, w: 130, h: 296 } },
    ],
    // 시안 01은 [다음] 하나만 둥근 알약 모양으로 넓게 둡니다.
    next: { left: 84, top: 770, width: 522, height: 62, radius: 31 },
  },
  {
    key: 'height',
    label: '키',
    image: step2Image,
    intro: {
      box: { left: 114, top: 124, width: 362, height: 356 },
      title: ['나에게 딱 맞는', '마네킹을 골라요'],
      text: ['몇 가지만 고르면', '나와 닮은 마네킹에', '옷을 입혀 볼 수 있어요.'],
    },
    panel: { left: 759, top: 73, width: 742, height: 870 },
    stepTop: 62,
    stepXs: [172, 305, 439, 572],
    q: {
      top: 176,
      title: '키를 골라 주세요',
      text: ['고른 키에 맞춰', '마네킹의 비율이 바뀌어요.'],
    },
    opts: { left: 46, top: 326, gap: 18, width: 204, height: 405, labelTop: 320 },
    options: [
      { value: 'short', label: '작은 편', crop: { x: 30, y: 54, sx: 835, sy: 453, w: 140, h: 262 } },
      { value: 'medium', label: '보통', crop: { x: 32, y: 42, sx: 1057, sy: 441, w: 140, h: 274 } },
      { value: 'tall', label: '큰 편', crop: { x: 32, y: 12, sx: 1282, sy: 411, w: 140, h: 304 } },
    ],
    prev: { left: 34, top: 770, width: 322, height: 62, radius: 18 },
    next: { left: 374, top: 770, width: 334, height: 62, radius: 18 },
  },
  {
    key: 'body',
    label: '체형',
    image: step3Image,
    intro: {
      box: { left: 118, top: 150, width: 370, height: 330 },
      title: ['나와 닮은', '마네킹을 찾아볼까요?'],
      text: ['체형을 고르면 마네킹이', '나와 비슷한 모습이 돼요.'],
    },
    panel: { left: 761, top: 80, width: 740, height: 862 },
    stepTop: 62,
    stepXs: [169, 302, 435, 569],
    q: {
      top: 178,
      title: '체형을 골라 주세요',
      text: ['고른 체형에 맞춰', '마네킹의 모습이 바뀌어요.'],
    },
    opts: { left: 40, top: 309, gap: 16, width: 208, height: 416, labelTop: 334 },
    options: [
      { value: 'slim', label: '마른 편', crop: { x: 36, y: 30, sx: 839, sy: 421, w: 132, h: 296 } },
      { value: 'medium', label: '보통', crop: { x: 36, y: 30, sx: 1061, sy: 421, w: 132, h: 296 } },
      { value: 'chubby', label: '통통한 편', crop: { x: 30, y: 30, sx: 1281, sy: 421, w: 144, h: 296 } },
    ],
    prev: { left: 36, top: 760, width: 310, height: 65, radius: 18 },
    next: { left: 364, top: 760, width: 342, height: 65, radius: 18 },
  },
]
const STEP_LABELS = [...STEPS.map((s) => s.label), '완료']
const DONE_STEP = STEPS.length

// 아직 고르지 않은 항목은 그림에서만 이 값으로 그립니다.
const PREVIEW_DEFAULT = { gender: 'female', height: 'medium', body: 'medium' }

// 확인 화면의 줄마다 아이콘 (시안 04_2의 SVG)
const ROW_ICONS = {
  gender: (
    <>
      <circle cx="19" cy="12" r="7" />
      <path d="M6 34v-3c0-6 5-10 13-10s13 4 13 10v3z" />
    </>
  ),
  height: (
    <>
      <rect x="11" y="3" width="16" height="32" rx="3" />
      <path d="M17 9h5M17 14h5M17 19h5M17 24h5M17 29h5" />
    </>
  ),
  body: <path d="M13 4c0 3 3 5 6 5s6-2 6-5l8 5-3 9h-4v15h-5V22h-4v11H12V18H8L5 9z" />,
}

function px(box) {
  const style = {}
  for (const [k, v] of Object.entries(box)) style[k === 'radius' ? 'borderRadius' : k] = `${v}px`
  return style
}

function Logo() {
  return (
    <>
      <div className="ob__logo">
        mo<span className="ob__logo-i">i</span>re
      </div>
      <div className="ob__logo-sub">나의 작은 옷장</div>
    </>
  )
}

function Crop({ crop }) {
  const style = { '--x': crop.x, '--y': crop.y, '--sx': crop.sx, '--sy': crop.sy, '--w': crop.w, '--h': crop.h }
  return <div className="ob__crop" style={style} aria-hidden="true" />
}

function lines(texts) {
  return texts.map((t, i) => (
    <span key={t}>
      {i > 0 && <br />}
      {t}
    </span>
  ))
}

function ChoiceStep({ step, index, choice, onPick, onPrev, onNext }) {
  const preview = {
    gender: choice.gender ?? PREVIEW_DEFAULT.gender,
    height: choice.height ?? PREVIEW_DEFAULT.height,
    body: choice.body ?? PREVIEW_DEFAULT.body,
  }
  // 시안의 그림은 여자 그림이라, 키·체형에서 남성을 고르면 앱 마네킹으로 그립니다.
  const useMannequin = step.key !== 'gender' && choice.gender === 'male'
  const lineY = step.stepTop + 15
  const firstX = step.stepXs[0]
  const nowX = step.stepXs[index]
  const lastX = step.stepXs[step.stepXs.length - 1]

  return (
    <>
      <div className="ob__intro" style={px(step.intro.box)}>
        <Logo />
        <h2>{lines(step.intro.title)}</h2>
        <p>{lines(step.intro.text)}</p>
      </div>

      <div className="ob__panel ob__card-panel" style={px(step.panel)}>
        {index > 0 && <div className="ob__line ob__line--on" style={px({ left: firstX, top: lineY, width: nowX - firstX })} />}
        <div className="ob__line" style={px({ left: nowX, top: lineY, width: lastX - nowX })} />
        <ol aria-label="마네킹 고르기 단계" style={{ margin: 0, padding: 0 }}>
          {STEP_LABELS.map((label, i) => {
            const state = i < index ? 'done' : i === index ? 'on' : 'todo'
            return (
              <li
                key={label}
                className={`ob__step ob__step--${state}`}
                style={px({ left: step.stepXs[i], top: step.stepTop })}
                aria-current={state === 'on' ? 'step' : undefined}
              >
                <b>{state === 'done' ? '' : i + 1}</b>
                <span>{label}</span>
              </li>
            )
          })}
        </ol>

        <div className="ob__q" style={{ top: `${step.q.top}px` }}>
          <h1 id="picker-title">{step.q.title}</h1>
          <p>{lines(step.q.text)}</p>
        </div>

        <div
          className="ob__opts"
          role="radiogroup"
          aria-label={step.label}
          style={{ left: `${step.opts.left}px`, top: `${step.opts.top}px`, gap: `${step.opts.gap}px` }}
        >
          {step.options.map((option) => {
            const selected = choice[step.key] === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`ob__opt${selected ? ' ob__opt--selected' : ''}`}
                style={px({ width: step.opts.width, height: step.opts.height })}
                onClick={() => onPick(step.key, option.value)}
              >
                {useMannequin ? (
                  <Mannequin className="ob__mannequin" {...preview} {...{ [step.key]: option.value }} title={option.label} />
                ) : (
                  <Crop crop={option.crop} />
                )}
                <span className="ob__chk" aria-hidden="true" />
                <span className="ob__lbl" style={{ top: `${step.opts.labelTop}px` }}>
                  {option.label}
                </span>
              </button>
            )
          })}
        </div>

        {step.prev && (
          <button type="button" className="ob__btn ob__btn--ghost ob__nav" style={px(step.prev)} onClick={onPrev}>
            ← 이전
          </button>
        )}
        <button
          type="button"
          className="ob__btn ob__btn--primary ob__nav"
          style={px(step.next)}
          disabled={!choice[step.key]}
          onClick={onNext}
        >
          다음 →
        </button>
      </div>
    </>
  )
}

function ConfirmStep({ choice, saving, error, onEdit, onPrev, onStart }) {
  return (
    <>
      <div className="ob__brand">
        <Logo />
      </div>
      <div className="ob__glow" />
      <ol className="ob__steps4" aria-label="마네킹 고르기 단계">
        <li className="ob__steps4-line" aria-hidden="true" />
        {STEP_LABELS.map((label, i) => (
          <li
            key={label}
            className={`ob__step4${i === DONE_STEP ? ' ob__step4--now' : ''}`}
            style={{ left: `${22 + i * 126}px` }}
            aria-current={i === DONE_STEP ? 'step' : undefined}
          >
            <i>{i === DONE_STEP ? i + 1 : '✓'}</i>
            {label}
          </li>
        ))}
      </ol>

      <div className="ob__title">
        <h1 id="picker-title">고른 모양을 확인해 주세요</h1>
        <p>
          고른 모양은 마네킹 모습에만 쓰여요.
          <br />
          나중에 설정에서 바꿀 수 있어요.
        </p>
      </div>

      <div className="ob__panel ob__card">
        <h2>고른 모양</h2>
        <button type="button" className="ob__edit" onClick={() => onEdit(0)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f2564b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 20l1-5L16 4l4 4L9 19z" />
            <path d="M13.5 6.5l4 4" />
          </svg>
          수정하기
        </button>
        <div className="ob__table">
          {STEPS.map((step, i) => (
            <button key={step.key} type="button" className="ob__row" onClick={() => onEdit(i)} aria-label={`${step.label} 바꾸기`}>
              <svg viewBox="0 0 38 38" aria-hidden="true">
                {ROW_ICONS[step.key]}
              </svg>
              <span className="ob__row-k">{step.label}</span>
              <span className="ob__row-bar" />
              <span className="ob__row-v">{step.options.find((o) => o.value === choice[step.key])?.label}</span>
            </button>
          ))}
        </div>
        {error && (
          <p className="ob__error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="ob__btn ob__card-btn ob__card-prev" disabled={saving} onClick={onPrev}>
          ← 이전으로
        </button>
        <button type="button" className="ob__btn ob__card-btn ob__card-start" disabled={saving} onClick={onStart}>
          {saving ? '저장하는 중…' : '시작하기 →'}
        </button>
      </div>

      <div className="ob__say" aria-hidden="true">
        이대로
        <br />
        시작할까요?
        <br />
        :)
      </div>
    </>
  )
}

function MannequinPicker({ onStart, saving, error }) {
  // 배경 PNG(한 장에 약 2MB)를 처음에 모두 불러 두어, 단계를 넘길 때 비어 보이지 않게 합니다.
  useEffect(() => {
    for (const src of [step1Image, step2Image, step3Image, step4Image]) new Image().src = src
  }, [])
  const [step, setStep] = useState(0)
  const [choice, setChoice] = useState({ gender: null, height: null, body: null })
  const scale = useFitScale()
  const image = step < DONE_STEP ? STEPS[step].image : step4Image
  const allChosen = STEPS.every((s) => choice[s.key])

  return (
    <div className="ob" role="dialog" aria-modal="true" aria-labelledby="picker-title">
      <div className="ob__stage" style={{ '--src': `url(${image})`, transform: `scale(${scale})` }}>
        {step < DONE_STEP ? (
          <ChoiceStep
            key={step}
            step={STEPS[step]}
            index={step}
            choice={choice}
            onPick={(key, value) => setChoice((prev) => ({ ...prev, [key]: value }))}
            onPrev={() => setStep(step - 1)}
            onNext={() => setStep(step + 1)}
          />
        ) : (
          <ConfirmStep
            choice={choice}
            saving={saving}
            error={error}
            onEdit={setStep}
            onPrev={() => setStep(step - 1)}
            onStart={() => allChosen && onStart(choice)}
          />
        )}
      </div>
    </div>
  )
}

export default MannequinPicker
