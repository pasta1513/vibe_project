import { useRef, useState } from 'react'
import Button from './Button.jsx'
import Mannequin from './Mannequin.jsx'

// 마네킹 모습 조절 (SCREEN-SPEC §6.2, §6.3, DESIGN §5.5, P-33).
// 등록 창과 옷 상세가 같이 씁니다. 미리보기 마네킹, 틀 고르기, 슬라이더, 끌기, [초기화]를 보입니다.
//
// item: 옷 한 벌 정보 { category, image_url, main_color, pattern_url, outfit_template, fit }
// templates: 이 옷의 구분에 속한 틀 목록 [{ code, name }]
// onChange({ outfit_template, fit }): 조절할 때마다 부름. 저장은 부르는 쪽이 합니다.

// 피팅값의 기본값과 범위 (DATA-MODEL §3). 서버도 같은 범위를 검사합니다.
export const DEFAULT_FIT = { x: 0, y: 0, sx: 1, sy: 1, rotate: 0, px: 0, py: 0, ps: 1 }
const SLIDERS = [
  { key: 'x', label: '가로 위치', min: -0.2, max: 0.2, step: 0.01, show: (v) => `${Math.round(v * 100)}%` },
  { key: 'y', label: '세로 위치', min: -0.2, max: 0.2, step: 0.01, show: (v) => `${Math.round(v * 100)}%` },
  { key: 'sx', label: '가로 크기', min: 0.8, max: 1.2, step: 0.01, show: (v) => `${Math.round(v * 100)}%` },
  { key: 'sy', label: '세로 크기', min: 0.8, max: 1.2, step: 0.01, show: (v) => `${Math.round(v * 100)}%` },
  { key: 'rotate', label: '기울기', min: -10, max: 10, step: 1, show: (v) => `${v}°` },
]
const PATTERN_SLIDERS = [
  { key: 'px', label: '무늬 가로 위치', min: -0.5, max: 0.5, step: 0.01, show: (v) => `${Math.round(v * 100)}%` },
  { key: 'py', label: '무늬 세로 위치', min: -0.5, max: 0.5, step: 0.01, show: (v) => `${Math.round(v * 100)}%` },
  { key: 'ps', label: '무늬 크기', min: 0.5, max: 2, step: 0.05, show: (v) => `${Math.round(v * 100)}%` },
]
const clamp = (v, min, max) => Math.min(max, Math.max(min, v))
const round2 = (v) => Math.round(v * 100) / 100

function OutfitFitter({ mannequin, item, templates, onChange }) {
  const fit = { ...DEFAULT_FIT, ...(item.fit ?? {}) }
  const [target, setTarget] = useState('outfit') // 끌 대상: 'outfit' 옷, 'pattern' 무늬
  const drag = useRef(null)
  const slot = item.category

  function update(next) {
    onChange({ outfit_template: item.outfit_template, fit: { ...fit, ...next } })
  }

  // 끌기: 화면 픽셀을 마네킹 좌표로 바꾸고, 틀 상자 크기에 대한 비율로 더합니다.
  function handlePointerDown(event) {
    const svg = event.currentTarget.querySelector('svg')
    const group = svg?.querySelector('[data-fit-box]')
    if (!svg || !group) return
    const [w, h] = group.getAttribute('data-fit-box').split(' ').map(Number)
    const scale = svg.getScreenCTM().a // 마네킹 좌표 1 = 화면 픽셀 scale
    drag.current = { x: event.clientX, y: event.clientY, w: w * scale, h: h * scale, start: fit }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event) {
    const d = drag.current
    if (!d) return
    const dx = (event.clientX - d.x) / d.w
    const dy = (event.clientY - d.y) / d.h
    if (target === 'outfit') {
      update({ x: round2(clamp(d.start.x + dx, -0.2, 0.2)), y: round2(clamp(d.start.y + dy, -0.2, 0.2)) })
    } else {
      update({ px: round2(clamp(d.start.px + dx, -0.5, 0.5)), py: round2(clamp(d.start.py + dy, -0.5, 0.5)) })
    }
  }

  function handlePointerUp() {
    drag.current = null
  }

  const sliders = item.pattern_url ? [...SLIDERS, ...PATTERN_SLIDERS] : SLIDERS
  return (
    <div className="fitter">
      <div
        className="photo-box fitter__stage"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <Mannequin className="photo-box__mannequin" {...mannequin} outfit={{ [slot]: { ...item, fit } }} title="모습 조절 미리보기" />
      </div>
      <p className="sub-text">작은 글자나 로고는 정확하지 않을 수 있어요.</p>

      <label className="fitter__row">
        <span>모양</span>
        <select
          value={item.outfit_template}
          onChange={(e) => onChange({ outfit_template: e.target.value, fit })}
        >
          {templates.map((t) => (
            <option key={t.code} value={t.code}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      {item.pattern_url && (
        <div className="fitter__row" role="radiogroup" aria-label="끌어서 옮길 것">
          <span>끌어서 옮기기</span>
          {[
            ['outfit', '옷'],
            ['pattern', '무늬'],
          ].map(([value, label]) => (
            <label key={value} className="fitter__choice">
              <input type="radio" name="fit-target" checked={target === value} onChange={() => setTarget(value)} />
              {label}
            </label>
          ))}
        </div>
      )}

      {sliders.map((s) => (
        <label key={s.key} className="fitter__row">
          <span>{s.label}</span>
          <input
            type="range"
            min={s.min}
            max={s.max}
            step={s.step}
            value={fit[s.key]}
            onChange={(e) => update({ [s.key]: Number(e.target.value) })}
          />
          <span className="fitter__value">{s.show(fit[s.key])}</span>
        </label>
      ))}

      <Button onClick={() => onChange({ outfit_template: item.outfit_template, fit: DEFAULT_FIT })}>초기화</Button>
    </div>
  )
}

export default OutfitFitter
