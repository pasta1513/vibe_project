import { useState } from 'react'
import { CATEGORIES, SLOT_LABEL, WEATHER_LABEL, formatDate, scoreStars } from '../labels.js'
import ErrorLine from './ErrorLine.jsx'
import FavoriteStar from './FavoriteStar.jsx'
import Mannequin from './Mannequin.jsx'
import { api } from '../api.js'

// 새 옷 입기의 패널들 (SCREEN-SPEC §5). 시안 style/html의 08_1(따뜻한, 옷 고르기), 08_1(파스텔, 추천),
// 12(점수 확인)를 옮겼습니다. 위치와 크기는 index.css의 .du 아래에 있습니다. (P-38)

// 시안의 순서: 상의, 하의, 원피스, 아우터, 신발 (가방·악세서리는 앱에 없어 넣지 않음, 사람이 정함 2026-10-22)
const CLOSET_ORDER = ['top', 'bottom', 'dress', 'outer', 'shoes']
const LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.code, c.label]))
const STAR_PATH = 'M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.2 1.3-6.6L2.5 9.3l6.6-.8z'

// 날씨 그림: 맑음은 시안의 해, 나머지는 같은 굵기로 그림
export function WeatherIcon({ condition, className }) {
  const sun = (
    <>
      <circle cx="42" cy="42" r="20" fill="#f6a623" />
      <g stroke="#f6a623" strokeWidth="5" strokeLinecap="round">
        <path d="M42 6v10M42 68v10M6 42h10M68 42h10M16.5 16.5l7 7M60.5 60.5l7 7M16.5 67.5l7-7M60.5 23.5l7-7" />
      </g>
    </>
  )
  const cloud = <path d="M22 58a14 14 0 0 1 2-28 18 18 0 0 1 34 4 12 12 0 0 1 4 24z" fill="#c9cdd6" />
  const shapes = {
    clear: sun,
    cloudy: cloud,
    rain: (
      <>
        {cloud}
        <g stroke="#6aa6e8" strokeWidth="4" strokeLinecap="round">
          <path d="M30 64l-4 10M44 64l-4 10M58 64l-4 10" />
        </g>
      </>
    ),
    snow: (
      <>
        {cloud}
        <g fill="#6aa6e8">
          <circle cx="30" cy="70" r="3.5" />
          <circle cx="44" cy="74" r="3.5" />
          <circle cx="58" cy="70" r="3.5" />
        </g>
      </>
    ),
  }
  return (
    <svg className={className} viewBox="0 0 84 84" aria-hidden="true">
      {shapes[condition] ?? sun}
    </svg>
  )
}

// 왼쪽 "의상 선택" (시안 .closet): 구분 칩과 그 구분의 옷
export function ClosetPanel({ clothes, outfit, onWear, tab, onTab }) {
  const items = clothes[tab] ?? []
  return (
    <section className="du-closet" aria-label="의상 선택">
      <h2>의상 선택</h2>
      <div className="du-closet__chips" role="tablist" aria-label="구분">
        {CLOSET_ORDER.map((code) => (
          <button
            key={code}
            type="button"
            role="tab"
            aria-selected={tab === code}
            className={`du-chip${tab === code ? ' du-chip--on' : ''}`}
            onClick={() => onTab(code)}
          >
            {LABEL[code]}
          </button>
        ))}
      </div>
      <div className="du-closet__grid">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`du-item${outfit[tab] === item.id ? ' du-item--worn' : ''}`}
            aria-pressed={outfit[tab] === item.id}
            onClick={() => onWear(tab, item.id)}
          >
            <img src={item.image_url} alt={`${LABEL[tab]} ${item.id}`} />
          </button>
        ))}
        {tab === 'outer' && (
          <button
            type="button"
            className={`du-item du-item--none${outfit.outer === 'none' ? ' du-item--worn' : ''}`}
            aria-pressed={outfit.outer === 'none'}
            onClick={() => onWear('outer', 'none')}
          >
            입지 않음
          </button>
        )}
        {items.length === 0 && tab !== 'outer' && <p className="du-closet__empty">아직 등록한 옷이 없어요.</p>}
      </div>
    </section>
  )
}

// 오른쪽 날씨·스타일·날짜 패널 (시안 .side). 시안의 "계절" 자리에 날짜 5일을 둡니다 (사람이 정함, 2026-10-22).
export function SidePanel({
  weather,
  onRetryWeather,
  regions,
  region,
  onRegion,
  date,
  dates,
  onDate,
  tags,
  tagId,
  onTag,
  onRecommend,
  recommending,
}) {
  const [moreTags, setMoreTags] = useState(false)
  const w = weather.data
  const look = w ? WEATHER_LABEL[w.condition] : null
  const shownTags = moreTags ? tags : tags.slice(0, 6)

  return (
    <aside className="du-side" aria-label="날씨와 스타일">
      <label className="du-side__city">
        <select aria-label="지역" value={region ?? ''} onChange={(e) => onRegion(e.target.value)}>
          {!region && <option value="">지역</option>}
          {regions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 22s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z" fill="#ee6a5a" />
          <circle cx="12" cy="10" r="2.6" fill="#fff" />
        </svg>
      </label>
      {w && w.is_default_region && <p className="du-side__notice">설정에서 내 지역을 저장해 주세요.</p>}

      <div className="du-side__weather" aria-live="polite">
        {weather.loading && <p className="sub-text">날씨를 받는 중…</p>}
        {!weather.loading && w && (
          <>
            <WeatherIcon condition={w.condition} className="du-side__icon" />
            <div className="du-side__winfo">
              <b>
                {w.min_temp}°~{w.max_temp}°C
              </b>
              <small>{look.label}</small>
              <br />
              {formatDate(date)}
              <br />
              최고 {w.max_temp}° | 최저 {w.min_temp}°
            </div>
          </>
        )}
        {!weather.loading && !w && weather.error && <ErrorLine message={weather.error} onRetry={onRetryWeather} />}
      </div>

      <div className="du-side__hr" />
      <div className="du-side__sec">
        스타일
        {tags.length > 6 && (
          <button type="button" className="du-side__more" onClick={() => setMoreTags(!moreTags)}>
            {moreTags ? '접기 ‹' : '더보기 ›'}
          </button>
        )}
      </div>
      <div className="du-side__opts" role="radiogroup" aria-label="스타일 태그">
        {shownTags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            role="radio"
            aria-checked={tagId === tag.id}
            className={`du-tag${tagId === tag.id ? ' du-tag--on' : ''}`}
            onClick={() => onTag(tagId === tag.id ? null : tag.id)}
          >
            #{tag.name}
          </button>
        ))}
      </div>

      <div className="du-side__hr" />
      <div className="du-side__sec">날짜</div>
      <div className="du-side__opts du-side__dates" role="radiogroup" aria-label="날짜">
        {dates.map((d) => {
          const [, m, day] = d.split('-').map(Number)
          const weekday = formatDate(d).slice(-2, -1)
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={date === d}
              aria-label={formatDate(d)}
              className={`du-date${date === d ? ' du-date--on' : ''}`}
              onClick={() => onDate(d)}
            >
              {m}/{day}({weekday})
            </button>
          )
        })}
      </div>

      <button type="button" className="du-side__ai" disabled={recommending} onClick={onRecommend}>
        <svg viewBox="0 0 40 30" aria-hidden="true">
          <path d="M20 6a3 3 0 1 1 3 3c-1.6 0-3 1-3 2.6L4 22c-1.5 1-1 3 1 3h30c2 0 2.5-2 1-3L20 11.6" />
        </svg>
        {recommending ? '추천을 고르는 중…' : 'AI 코디 추천받기'}
        {!recommending && <span aria-hidden="true">→</span>}
      </button>
    </aside>
  )
}

// 받침이 있으면 "을", 없으면 "를"
function objectParticle(word) {
  const last = word.charCodeAt(word.length - 1)
  if (last < 0xac00 || last > 0xd7a3) return '를'
  return (last - 0xac00) % 28 === 0 ? '를' : '을'
}

// 옷이 부족할 때 먼저 등록할 구분. 상의·하의는 원피스로도 채울 수 있다고 함께 적습니다. (제안, 2026-10-21)
// 예: "하의(또는 원피스)를", "신발을", "상의, 하의(또는 원피스), 신발을"
function missingText({ missing, dress_alternative: dressAlternative }) {
  const upper = missing.filter((slot) => slot === 'top' || slot === 'bottom').map((s) => SLOT_LABEL[s])
  const parts = []
  if (upper.length > 0) parts.push(`${upper.join(', ')}${dressAlternative ? '(또는 원피스)' : ''}`)
  if (missing.includes('shoes')) parts.push(SLOT_LABEL.shoes)
  const lastWord = missing.includes('shoes') ? SLOT_LABEL.shoes : dressAlternative ? '원피스' : upper[upper.length - 1]
  return `${parts.join(', ')}${objectParticle(lastWord)}`
}

// 아래 "AI 추천 코디" (시안 08_1 파스텔 .reco)
export function RecommendPanel({
  recommendation,
  clothingOf,
  mannequin,
  tagId,
  onTryOn,
  onConfirm,
  confirming,
  onFavorite,
  onGoCloset,
}) {
  const [open, setOpen] = useState(null) // 이유를 펼친 카드 번호
  if (recommendation.insufficient) {
    return (
      <section className="du-reco" aria-label="AI 추천 코디">
        <h3>AI 추천 코디</h3>
        <div className="du-reco__notice">
          <p>코디를 만들 옷이 부족해요. 먼저 {missingText(recommendation.insufficient)} 등록해 주세요.</p>
          <button type="button" className="du-reco__btn" onClick={onGoCloset}>
            옷장으로 가기
          </button>
        </div>
      </section>
    )
  }
  const outfits = recommendation.outfits
  return (
    <section className="du-reco" aria-label="AI 추천 코디">
      <h3>
        AI 추천 코디 <span className="du-reco__badge">{outfits.length}</span>
        {recommendation.fewer_than_three && (
          <small>
            옷이 부족해 {outfits.length}벌만 추천했어요. 옷을 더 등록하면 추천이 다양해져요.
          </small>
        )}
      </h3>
      {outfits.map((item, index) => {
        const worn = Object.fromEntries(
          Object.entries(item.outfit).map(([slot, id]) => [slot, id ? clothingOf[id] : null]),
        )
        if (!item.outfit.outer) worn.outer = 'none'
        const { filled, text } = scoreStars(item.score)
        const details = Object.entries(SLOT_LABEL).filter(([slot]) => item.details[slot])
        return (
          <article key={index} className="du-rcard" style={{ left: 33 + index * 450 }} aria-label={`추천 ${index + 1}`}>
            <span className="du-rcard__no">{index + 1}</span>
            <span className="du-rcard__fav">
              <FavoriteStar
                favoriteId={item.favorite_id}
                add={() => api.addFavorite({ outfit: item.outfit, tag_id: tagId })}
                onChange={(id) => onFavorite(item.outfit, id)}
              />
            </span>
            <Mannequin className="du-rcard__mannequin" {...mannequin} outfit={worn} title={`추천 ${index + 1} 코디`} />
            <div className="du-rcard__rate" aria-label={`5점 만점에 ${text}점`}>
              <span className="du-stars" aria-hidden="true">
                {'★'.repeat(filled)}
                <i>{'★'.repeat(5 - filled)}</i>
              </span>
              <em>{text}</em>
            </div>
            <button
              type="button"
              className="du-rcard__text"
              aria-expanded={open === index}
              onClick={() => setOpen(open === index ? null : index)}
            >
              {item.summary} <span aria-hidden="true">{open === index ? '▴' : '▾'}</span>
            </button>
            {open === index && (
              <ul className="du-rcard__details">
                {details.map(([slot, label]) => (
                  <li key={slot}>
                    <b>{label}</b> {item.details[slot]}
                  </li>
                ))}
              </ul>
            )}
            <div className="du-rcard__actions">
              <button type="button" className="du-reco__btn" onClick={() => onTryOn(index)}>
                입혀 보기
              </button>
              <button
                type="button"
                className="du-reco__btn du-reco__btn--primary"
                disabled={confirming}
                onClick={() => onConfirm(index)}
              >
                확정하기
              </button>
            </div>
          </article>
        )
      })}
    </section>
  )
}

// 점수 확인 왼쪽 "오늘의 코디" (시안 12 .today)
export function TodayPanel({ date, weather, outfit, clothingOf, tagsOf }) {
  const w = weather.data
  const look = w ? WEATHER_LABEL[w.condition] : null
  const slots = ['top', 'bottom', 'dress', 'outer', 'shoes'].filter((s) => outfit[s] && outfit[s] !== 'none')
  return (
    <aside className="du-today" aria-label="오늘의 코디">
      <h2>오늘의 코디</h2>
      <div className="du-today__d">{formatDate(date)}</div>
      {w && (
        <div className="du-today__wx">
          <div className="du-today__city">{w.region}</div>
          <WeatherIcon condition={w.condition} className="du-today__icon" />
          <div className="du-today__t">
            {w.min_temp}°~{w.max_temp}°C <small>{look.label}</small>
          </div>
          <div className="du-today__r">
            최고 {w.max_temp}° | 최저 {w.min_temp}°
          </div>
        </div>
      )}
      <ul className="du-today__items">
        {slots.map((slot) => {
          const item = clothingOf[outfit[slot]]
          const tags = tagsOf(item?.id)
          return (
            <li key={slot} className="du-today__it">
              <span className="du-today__thumb">{item && <img src={item.image_url} alt="" />}</span>
              <b>{tags.length > 0 ? tags.slice(0, 2).join(' ') : SLOT_LABEL[slot]}</b>
              <span>
                {SLOT_LABEL[slot]}
                {tags.slice(2).map((t) => ` #${t}`)}
              </span>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}

// 점수 확인 오른쪽 "AI 코디 평가 결과" (시안 12 .result). 항목별 점수는 AI가 주지 않아 넣지 않음 (사람이 정함, 2026-10-22)
export function ResultPanel({ result, mascotSrc }) {
  const { filled, text } = scoreStars(result.score)
  const details = Object.entries(SLOT_LABEL).filter(([slot]) => result.details[slot])
  return (
    <section className="du-result" aria-label="AI 코디 평가 결과">
      <h2>AI 코디 평가 결과</h2>
      <div className="du-result__stars" aria-label={`5점 만점에 ${text}점`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <svg key={i} viewBox="0 0 24 24" className={i <= filled ? 'on' : ''} aria-hidden="true">
            <path d={STAR_PATH} />
          </svg>
        ))}
      </div>
      <div className="du-result__score">
        {text}
        <small>/ 5.0</small>
      </div>
      <div className="du-result__mascot" style={{ '--src': `url(${mascotSrc})` }} aria-hidden="true" />
      <p className="du-result__say">{result.summary}</p>
      <div className="du-result__sub">AI 추가 코멘트</div>
      <ul className="du-result__cmt">
        {details.map(([slot, label]) => (
          <li key={slot}>
            <b>{label}</b> {result.details[slot]}
          </li>
        ))}
      </ul>
    </section>
  )
}

// 점수 확인 아래 버튼 (시안 12 .bottom)
export function ScoreActions({ onEdit, onConfirm, confirming, onFavorite, favoriting }) {
  return (
    <div className="du-bottom">
      <button type="button" className="du-bb du-bb--line" style={{ left: 19, width: 257 }} onClick={onEdit}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 20l1-5L16 4l4 4L9 19z M14 6l4 4" />
        </svg>
        수정하기
      </button>
      <button
        type="button"
        className="du-bb du-bb--primary"
        style={{ left: 292, width: 296 }}
        disabled={confirming}
        onClick={onConfirm}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 12.5l5 5L20 6.5" />
        </svg>
        {confirming ? '확정하는 중…' : '확정하기'}
      </button>
      <button
        type="button"
        className="du-bb du-bb--line"
        style={{ left: 604, width: 309 }}
        disabled={favoriting}
        onClick={onFavorite}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />
        </svg>
        즐겨찾기에 넣기
      </button>
    </div>
  )
}
