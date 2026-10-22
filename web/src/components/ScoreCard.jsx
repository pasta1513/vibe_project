// 별과 이유·코멘트 펼치기. 코디 일기 카드가 씁니다. (새 옷 입기의 점수 카드는 P-38에서 DressUpPanels.jsx로 옮김)
import { useState } from 'react'
import { SLOT_LABEL, scoreStars } from '../labels.js'

// 별과 숫자: ★★★★☆ 4.3 (SCREEN-SPEC §2.3, DESIGN §4.5)
export function Stars({ score }) {
  const { filled, empty, text } = scoreStars(score)
  return (
    <span className="stars" aria-label={`5점 만점에 ${text}점`}>
      <span className="stars__filled" aria-hidden="true">
        {'★'.repeat(filled)}
      </span>
      <span className="stars__empty" aria-hidden="true">
        {'☆'.repeat(empty)}
      </span>
      <span className="stars__number">{text}</span>
    </span>
  )
}

// 이유나 코멘트 한 줄. 누르면 옷마다 자세한 내용이 펼쳐집니다. (PRD §6 이유와 코멘트)
// result: API-SPEC §2.4의 점수 결과 { score, note_type, summary, details }
export function NoteToggle({ result }) {
  const [open, setOpen] = useState(false)
  const details = Object.entries(SLOT_LABEL).filter(([slot]) => result.details[slot])
  return (
    <>
      <button
        type="button"
        className="score-card__summary"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {result.summary} <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <ul className="score-card__details">
          {details.map(([slot, label]) => (
            <li key={slot}>
              <span className="score-card__slot">{label}</span> {result.details[slot]}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
