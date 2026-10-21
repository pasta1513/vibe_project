import '@fontsource/gamja-flower/400.css'
import { SLOT_LABEL, WEATHER_LABEL, formatDate, isoDate } from '../labels.js'
import Button from './Button.jsx'
import Mannequin from './Mannequin.jsx'
import { NoteToggle, Stars } from './ScoreCard.jsx'

// 코디 일기 카드 (SCREEN-SPEC §7, DESIGN §4.4): 그림일기 느낌. 종이색 바탕, 살짝 기울임.
// entry: API-SPEC §6 목록의 기록 하나

// 기울기 -1.5°~1.5°. 기록 번호로 정해서 열 때마다 바뀌지 않습니다. (DESIGN §4.4, 제안)
function tiltOf(id) {
  return (((id * 37) % 31) / 10 - 1.5).toFixed(1)
}

function DiaryCard({ entry, onTryOn, onDelete }) {
  const worn = Object.fromEntries(
    Object.entries(entry.outfit).map(([slot, item]) => [slot, item ? item.image_url : null]),
  )
  if (!entry.outfit.outer) worn.outer = 'none'
  const look = WEATHER_LABEL[entry.weather.condition]
  const isToday = entry.date === isoDate(0)
  const favorite = entry.favorite_id != null

  return (
    <article
      className={`diary-card${isToday ? ' diary-card--today' : ''}`}
      style={{ transform: `rotate(${tiltOf(entry.id)}deg)` }}
      aria-label={`${formatDate(entry.date)} 코디${isToday ? ' (오늘)' : ''}`}
    >
      {/* 지운 옷 표시: 왼쪽 위에 경고 아이콘과 구분 이름 (SCREEN-SPEC §2.4) */}
      {entry.deleted_slots.length > 0 && (
        <span className="diary-card__deleted">
          ⚠ {entry.deleted_slots.map((slot) => SLOT_LABEL[slot]).join(', ')}
        </span>
      )}
      {/* 즐겨찾기 별은 P-21에서 누를 수 있게 합니다. (사람이 정함, 2026-10-21) */}
      <button
        type="button"
        className={`rec-card__star${favorite ? ' rec-card__star--on' : ''}`}
        aria-label={favorite ? '즐겨찾기에 있음 (준비 중)' : '즐겨찾기에 넣기 (준비 중)'}
        disabled
      >
        {favorite ? '★' : '☆'}
      </button>
      <Mannequin
        className="diary-card__mannequin"
        {...entry.mannequin}
        outfit={worn}
        fadedSlots={entry.deleted_slots}
        title="그날의 코디를 입은 마네킹"
      />
      <h3 className="diary-card__date">{formatDate(entry.date)}</h3>
      <p className="diary-card__weather">
        <span aria-hidden="true">{look.icon}</span>
        <span className="visually-hidden">{look.label}</span> {entry.weather.region}{' '}
        {entry.weather.min_temp}°~{entry.weather.max_temp}°
      </p>
      <p className="diary-card__tag-score">
        <span className="diary-card__tag">{entry.tag ? entry.tag.name : '태그 없음'}</span>
        <Stars score={entry.result.score} />
      </p>
      <div className="diary-card__note">
        <NoteToggle result={entry.result} />
      </div>
      <div className="diary-card__actions">
        <Button onClick={() => onTryOn(entry)}>입혀 보기</Button>
        <Button aria-label="지우기" onClick={() => onDelete(entry)}>
          🗑
        </Button>
      </div>
    </article>
  )
}

export default DiaryCard
