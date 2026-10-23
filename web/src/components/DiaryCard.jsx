import '@fontsource/gamja-flower/400.css'
import { useState } from 'react'
import { SLOT_LABEL, isoDate, scoreStars } from '../labels.js'
import { api } from '../api.js'
import { WeatherIcon } from './WeatherIcon.jsx'
import FavoriteStar from './FavoriteStar.jsx'
import Mannequin from './Mannequin.jsx'

// 코디 일기 카드 (SCREEN-SPEC §7). 시안 style/html 09의 카드를 옮겼습니다. (P-38)
// 왼쪽 사진 칸에 그날의 코디를 입은 마네킹, 오른쪽에 날짜, 날씨와 점수, ♡/♥, 손글씨 한마디, #태그.
// ⋯ 메뉴에 [입혀 보기] [지우기] (사람이 정함, 2026-10-22). 손글씨 한마디를 누르면 옷마다 이유·코멘트가 펼쳐집니다.
// entry: API-SPEC §6 목록의 기록 하나

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// 시안의 날짜 모양: "10. 21 (화)"
function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${m}. ${d} (${WEEKDAYS[new Date(y, m - 1, d).getDay()]})`
}

function DiaryCard({ entry, onTryOn, onDelete, onFavorite }) {
  const [menu, setMenu] = useState(false)
  const [open, setOpen] = useState(false)
  const worn = Object.fromEntries(Object.entries(entry.outfit).map(([slot, item]) => [slot, item ? item.image_url : null]))
  if (!entry.outfit.outer) worn.outer = 'none'
  const isToday = entry.date === isoDate(0)
  const { filled, text } = scoreStars(entry.result.score)
  const details = Object.entries(SLOT_LABEL).filter(([slot]) => entry.result.details[slot])

  return (
    <article className={`dy-card${isToday ? ' dy-card--today' : ''}`} aria-label={`${shortDate(entry.date)} 코디${isToday ? ' (오늘)' : ''}`}>
      <div className="dy-card__photo">
        <Mannequin
          className="dy-card__mannequin"
          {...entry.mannequin}
          outfit={worn}
          fadedSlots={entry.deleted_slots}
          title="그날의 코디를 입은 마네킹"
        />
        {/* 지운 옷 표시: 왼쪽 위에 경고 아이콘과 구분 이름 (SCREEN-SPEC §2.4) */}
        {entry.deleted_slots.length > 0 && (
          <span className="dy-card__deleted">⚠ {entry.deleted_slots.map((slot) => SLOT_LABEL[slot]).join(', ')}</span>
        )}
        {isToday && <span className="dy-card__today">오늘</span>}
      </div>

      <h3 className="dy-card__date">{shortDate(entry.date)}</h3>
      <button
        type="button"
        className="dy-card__dots"
        aria-label="메뉴"
        aria-expanded={menu}
        onClick={() => setMenu(!menu)}
      >
        ···
      </button>
      {menu && (
        <div className="dy-card__menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(false)
              onTryOn(entry)
            }}
          >
            입혀 보기
          </button>
          <button
            type="button"
            role="menuitem"
            className="dy-card__menu-danger"
            onClick={() => {
              setMenu(false)
              onDelete(entry)
            }}
          >
            지우기
          </button>
        </div>
      )}

      <WeatherIcon condition={entry.weather.condition} className="dy-card__wx" />
      <span className="dy-card__score" aria-label={`5점 만점에 ${text}점`}>
        <span aria-hidden="true">
          {'★'.repeat(filled)}
          <i>{'★'.repeat(5 - filled)}</i>
        </span>{' '}
        {text}
      </span>
      {/* 지운 옷이 든 기록도 넣을 수 있습니다. (PRD §7 즐겨찾기) */}
      <span className="dy-card__heart">
        <FavoriteStar
          shape="heart"
          favoriteId={entry.favorite_id}
          add={() => api.addFavoriteFromDiary(entry.id)}
          onChange={(id) => onFavorite(entry, id)}
        />
      </span>

      <button type="button" className="dy-card__memo" aria-expanded={open} onClick={() => setOpen(!open)}>
        {entry.result.summary}
      </button>
      {open && (
        <ul className="dy-card__details" onClick={() => setOpen(false)}>
          {details.map(([slot, label]) => (
            <li key={slot}>
              <b>{label}</b> {entry.result.details[slot]}
            </li>
          ))}
        </ul>
      )}

      <div className="dy-card__tags">
        <span>#{entry.tag ? entry.tag.name : '태그 없음'}</span>
        <span>#{entry.weather.region}</span>
        <span>
          #{entry.weather.min_temp}°~{entry.weather.max_temp}°
        </span>
      </div>
    </article>
  )
}

export default DiaryCard
