import { useState } from 'react'
import { SLOT_LABEL, formatDate, scoreStars } from '../labels.js'
import Button from './Button.jsx'

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

// 점수 카드 (SCREEN-SPEC §5.4): 날짜, 점수, 코멘트 한 줄
function ScoreCard({ date, result, onEdit }) {
  return (
    <aside className="score-card" aria-label="점수 카드">
      <h3 className="score-card__date">{formatDate(date)}</h3>
      <Stars score={result.score} />
      <NoteToggle result={result} />
      <div className="score-card__actions">
        <Button onClick={onEdit}>수정하기</Button>
        {/* 확정하기는 P-19, 즐겨찾기는 P-21에서 붙입니다. (사람이 정함, 2026-10-21) */}
        <Button variant="primary" disabled title="준비 중이에요">
          확정하기
        </Button>
        <Button disabled title="준비 중이에요">
          즐겨찾기
        </Button>
        <p className="sub-text">확정하기와 즐겨찾기는 준비 중이에요.</p>
      </div>
    </aside>
  )
}

export default ScoreCard
