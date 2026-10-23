import { useRef, useState } from 'react'
import Button from './Button.jsx'
import Mannequin from './Mannequin.jsx'
import { DEFAULT_FIT, normalizeFit, normalizeLook, normalizeShoulderFit, supportsSleeves, TEMPLATE_BOX } from './garments.js'

// 마네킹 모습 조절 (SCREEN-SPEC §6.2, §6.3, DESIGN §5.5, P-33).
// 등록 화면과 옷 상세가 같이 씁니다. 미리보기 마네킹, 틀 고르기, 슬라이더, 끌기, 초기화를 보입니다.
// (2026-10-23 바꿈, 확인 중) ChatGPT 프로젝트(moire-source-v15)의 FitControls·SleeveControls를 그대로 옮겼습니다:
// 옷 전체와 내부 무늬의 좌우·상하 위치, 가로·세로 크기, 그리고 소매가 있는 옷의 "어깨 · 소매 맞추기". 틀 고르기(모양)는 우리 것을 남깁니다.
//
// item: 옷 한 벌 정보 { category, image_url, main_color, pattern_url, outfit_template, fit }
//       fit: { fit, patternFit, shoulderFit } (garments.js normalizeLook)
// templates: 이 옷의 구분에 속한 틀 목록 [{ code, name }]
// onChange({ outfit_template, fit }): 조절할 때마다 부름. 저장은 부르는 쪽이 합니다.
// layout: 'panel'이면 등록 화면 [캐릭터에 맞추기] 탭의 시안 배치. 없으면 세로 배치 (옷 상세).

const SLIDERS = [
  { key: 'x', label: '좌우 위치', min: -100, max: 100, step: 1 },
  { key: 'y', label: '상하 위치', min: -100, max: 100, step: 1 },
  { key: 'scaleX', label: '가로 크기', min: 0.5, max: 2, step: 0.01 },
  { key: 'scaleY', label: '세로 크기', min: 0.5, max: 2, step: 0.01 },
]
const SLEEVE_SLIDERS = [
  { key: 'angle', label: '각도', min: -25, max: 25, step: 1, show: (v) => `${v}°` },
  { key: 'length', label: '길이', min: 0.65, max: 1.35, step: 0.01, show: (v) => `${Math.round(v * 100)}%` },
  { key: 'width', label: '폭', min: 0.65, max: 1.4, step: 0.01, show: (v) => `${Math.round(v * 100)}%` },
]
const showFit = (key, v) => (key.startsWith('scale') ? `${Math.round(v * 100)}%` : Math.round(v))

function Slider({ label, min, max, step, value, show, onChange, ariaLabel }) {
  return (
    <label className="fitter__row">
      <span>{label}</span>
      <input
        type="range"
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--p': `${((value - min) / (max - min)) * 100}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="fitter__value">{show(value)}</span>
    </label>
  )
}

function OutfitFitter({ mannequin, item, templates, onChange, layout }) {
  const look = normalizeLook(item.fit)
  const [target, setTarget] = useState('fit') // 'fit' 옷 전체, 'patternFit' 내부 무늬
  const drag = useRef(null)
  const slot = item.category
  const code = item.outfit_template
  const current = look[target]
  const sleeves = supportsSleeves(code)
  const shoulder = normalizeShoulderFit(look.shoulderFit)

  function emit(next) {
    onChange({ outfit_template: code, fit: next })
  }
  function update(patch) {
    emit({ ...look, [target]: normalizeFit({ ...current, ...patch }) })
  }
  function changeSleeve(side, key, value) {
    emit({ ...look, shoulderFit: normalizeShoulderFit({ ...shoulder, [side]: { ...shoulder[side], [key]: value } }) })
  }

  // 끌기 (ChatGPT FitControls): 화면 좌표를 몸 좌표로 바꿔 옮긴 만큼 더합니다. 내부 무늬는 틀 상자 크기에 대한 값으로 바꿉니다.
  function point(event) {
    const group = event.currentTarget.querySelector('[data-body]')
    const matrix = group?.getScreenCTM()
    return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null
  }
  function handlePointerDown(event) {
    if (event.button !== 0 || (target === 'patternFit' && !item.pattern_url)) return
    const p = point(event)
    if (!p) return
    event.preventDefault()
    drag.current = { id: event.pointerId, x: p.x, y: p.y, start: current, key: target }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function handlePointerMove(event) {
    const d = drag.current
    if (!d || d.id !== event.pointerId) return
    const p = point(event)
    if (!p) return
    let dx = p.x - d.x
    let dy = p.y - d.y
    if (d.key === 'patternFit') {
      const box = TEMPLATE_BOX[code]
      dx = ((dx / look.fit.scaleX) * 100) / box[2]
      dy = ((dy / look.fit.scaleY) * 100) / box[3]
    }
    emit({ ...look, [d.key]: normalizeFit({ ...d.start, x: d.start.x + dx, y: d.start.y + dy }) })
  }
  function handlePointerUp(event) {
    if (drag.current?.id !== event.pointerId) return
    drag.current = null
  }

  const stage = (
    <div
      className="photo-box fitter__stage"
      style={{ touchAction: 'none' }}
      aria-label={`${target === 'fit' ? '옷' : '무늬'} 위치 조절 미리보기`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onLostPointerCapture={() => (drag.current = null)}
    >
      <Mannequin className="photo-box__mannequin" {...mannequin} outfit={{ [slot]: { ...item, fit: look } }} title="모습 조절 미리보기" />
    </div>
  )
  const templateSelect = (
    <label className="fitter__row">
      <span>모양</span>
      <select value={code} onChange={(e) => onChange({ outfit_template: e.target.value, fit: look })}>
        {templates.map((t) => (
          <option key={t.code} value={t.code}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  )
  const toggle = (
    <div className="fitter__seg" role="radiogroup" aria-label="조절할 것">
      {[
        ['fit', '옷 전체'],
        ['patternFit', '내부 무늬'],
      ].map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={target === value}
          disabled={value === 'patternFit' && !item.pattern_url}
          className={`fitter__seg-opt${target === value ? ' fitter__seg-opt--on' : ''}`}
          onClick={() => setTarget(value)}
        >
          {label}
        </button>
      ))}
    </div>
  )
  const controls = (
    <div className="fitter__controls">
      <b className="fitter__heading">{target === 'fit' ? '옷 전체 조절' : '옷 안쪽 무늬 조절'}</b>
      {target === 'fit' && templateSelect}
      {SLIDERS.map((s) => (
        <Slider
          key={s.key}
          {...s}
          ariaLabel={`${target === 'fit' ? '옷' : '무늬'} ${s.label}`}
          value={current[s.key]}
          show={(v) => showFit(s.key, v)}
          onChange={(v) => update({ [s.key]: v })}
        />
      ))}
      <button type="button" className="fitter__reset" onClick={() => emit({ ...look, [target]: { ...DEFAULT_FIT } })}>
        선택한 조절 초기화
      </button>
    </div>
  )
  // 어깨 · 소매 맞추기 (ChatGPT SleeveControls). 소매가 있는 틀만
  const sleevePanel = sleeves && (
    <fieldset className="fitter__sleeves">
      <legend>어깨 · 소매 맞추기</legend>
      <p className="fitter__fine">화면에서 보이는 왼쪽·오른쪽 기준입니다. 미리보기에서 옷을 입힌 채 조절하세요.</p>
      <button
        type="button"
        className="fitter__reset"
        onClick={() => emit({ ...look, fit: { ...DEFAULT_FIT }, shoulderFit: normalizeShoulderFit() })}
      >
        어깨 기준에 자동 맞추기
      </button>
      <p className="fitter__fine">기본 의상 템플릿을 캐릭터 어깨에 정렬합니다. 옷 전체 위치·크기와 소매 보정값이 초기화돼요.</p>
      <Slider
        label="어깨 너비"
        min={0.8}
        max={1.2}
        step={0.01}
        value={shoulder.shoulder}
        show={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => emit({ ...look, shoulderFit: { ...shoulder, shoulder: v } })}
      />
      <div className="fitter__sides">
        {['left', 'right'].map((side) => (
          <div key={side}>
            <b className="fitter__side-t">{side === 'left' ? '왼쪽' : '오른쪽'} 소매</b>
            {SLEEVE_SLIDERS.map((s) => (
              <Slider
                key={s.key}
                {...s}
                ariaLabel={`${side === 'left' ? '왼쪽' : '오른쪽'} 소매 ${s.label}`}
                value={shoulder[side][s.key]}
                onChange={(v) => changeSleeve(side, s.key, v)}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="fitter__sleeve-btns">
        <button type="button" className="fitter__reset" onClick={() => emit({ ...look, shoulderFit: { ...shoulder, right: { ...shoulder.left } } })}>
          왼쪽 값을 오른쪽에도 적용
        </button>
        <button
          type="button"
          className="fitter__reset"
          onClick={() => {
            const next = { ...look }
            delete next.shoulderFit
            emit(next)
          }}
        >
          어깨·소매 보정 초기화
        </button>
      </div>
      <p className="fitter__fine">무늬도 소매와 함께 변형됩니다. 크게 조절하면 무늬가 늘어나거나 접힐 수 있어요.</p>
    </fieldset>
  )
  const note = <p className="fitter__note">작은 글자나 로고는 정확하지 않을 수 있어요.</p>

  if (layout === 'panel') {
    return (
      <div className="fitter fitter--panel">
        {toggle}
        {stage}
        {controls}
        {note}
        {sleevePanel}
      </div>
    )
  }

  return (
    <div className="fitter">
      {stage}
      {note}
      {toggle}
      {controls}
      {sleevePanel}
      <Button onClick={() => emit({ fit: { ...DEFAULT_FIT }, patternFit: { ...DEFAULT_FIT } })}>모두 초기화</Button>
    </div>
  )
}

export default OutfitFitter
