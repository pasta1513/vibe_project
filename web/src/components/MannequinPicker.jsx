import { useState } from 'react'
import Button from './Button.jsx'
import ErrorLine from './ErrorLine.jsx'
import Mannequin from './Mannequin.jsx'

// 첫 실행: 마네킹 고르기 (SCREEN-SPEC §3). 닫기 버튼은 없습니다.
const ROWS = [
  { key: 'gender', label: '성별', options: [['female', '여성'], ['male', '남성']] },
  { key: 'height', label: '키', options: [['short', '작은'], ['medium', '보통'], ['tall', '큰']] },
  { key: 'body', label: '체형', options: [['slim', '마른'], ['medium', '보통'], ['chubby', '통통한']] },
]

// 아직 고르지 않은 항목은 미리보기에서만 이 값으로 그립니다.
const PREVIEW_DEFAULT = { gender: 'female', height: 'medium', body: 'medium' }

function MannequinPicker({ onStart, saving, error }) {
  const [choice, setChoice] = useState({ gender: null, height: null, body: null })
  const allChosen = ROWS.every((row) => choice[row.key])
  const preview = {
    gender: choice.gender ?? PREVIEW_DEFAULT.gender,
    height: choice.height ?? PREVIEW_DEFAULT.height,
    body: choice.body ?? PREVIEW_DEFAULT.body,
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog picker" role="dialog" aria-modal="true" aria-labelledby="picker-title">
        <h1 id="picker-title" className="dialog__title">나와 닮은 마네킹을 골라 주세요</h1>
        <div className="picker__body">
          <div className="picker__rows">
            {ROWS.map((row) => (
              <div key={row.key} className="picker__row" role="radiogroup" aria-label={row.label}>
                <span className="picker__label">{row.label}</span>
                {row.options.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={choice[row.key] === value}
                    className={`chip${choice[row.key] === value ? ' chip--selected' : ''}`}
                    onClick={() => setChoice({ ...choice, [row.key]: value })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <Mannequin className="picker__preview" {...preview} title="미리보기 마네킹" />
        </div>
        {error && <ErrorLine message={error} />}
        <div className="dialog__actions">
          <Button variant="primary" disabled={!allChosen || saving} onClick={() => onStart(choice)}>
            {saving ? '저장하는 중…' : '시작하기'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default MannequinPicker
