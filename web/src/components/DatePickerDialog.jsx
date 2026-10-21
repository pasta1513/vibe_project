import { formatDate, isoDate } from '../labels.js'
import Button from './Button.jsx'

// 날짜 고르기 창 (SCREEN-SPEC §5.5): 오늘 포함 5일 중 하나를 고릅니다.
// [취소]를 누르면 창이 닫히고 원래 목록에 그대로 있습니다.
const DATES = [0, 1, 2, 3, 4].map((offset) => isoDate(offset))

function DatePickerDialog({ onPick, onCancel, busy, error }) {
  return (
    <div className="dialog-backdrop dialog-backdrop--top">
      <div className="dialog dialog--small" role="dialog" aria-modal="true" aria-labelledby="date-picker-title">
        <h2 id="date-picker-title" className="dialog__title">
          언제 입을까요?
        </h2>
        <div className="date-picker">
          {DATES.map((d) => (
            <button key={d} type="button" className="chip" disabled={busy} onClick={() => onPick(d)}>
              {formatDate(d)}
            </button>
          ))}
        </div>
        {error && <p className="sub-text">{error}</p>}
        <div className="dialog__actions">
          <Button disabled={busy} onClick={onCancel}>
            취소
          </Button>
        </div>
      </div>
    </div>
  )
}

export default DatePickerDialog
