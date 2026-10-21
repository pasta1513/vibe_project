import { WEATHER_LABEL, formatDate } from '../labels.js'
import Button from './Button.jsx'
import ErrorLine from './ErrorLine.jsx'

// 조건 띠: 날짜, 지역, 날씨, 스타일 태그, [추천받기] (SCREEN-SPEC §5.1)
// recommending: 추천을 기다리는 동안 "추천을 고르는 중…"이 보이고 다시 누를 수 없습니다. (SCREEN-SPEC §2.7)
// locked: 점수 확인 단계에서는 잠깁니다. 바꾸려면 [수정하기]로 돌아갑니다.
// weather: { data, loading, error } — data는 API-SPEC §2.4의 날씨 묶음
function ConditionBar({
  date,
  dates,
  onDate,
  regions,
  region,
  onRegion,
  weather,
  onRetryWeather,
  tags,
  tagId,
  onTag,
  onRecommend,
  recommending,
  locked,
}) {
  const w = weather.data
  const look = w ? WEATHER_LABEL[w.condition] : null

  return (
    <div className="condition">
      <div className="condition__bar">
        <select
          className="condition__select"
          aria-label="날짜"
          value={date}
          disabled={locked}
          onChange={(event) => onDate(event.target.value)}
        >
          {dates.map((d) => (
            <option key={d} value={d}>
              {formatDate(d)}
            </option>
          ))}
        </select>
        <span className="condition__divider" aria-hidden="true" />
        <select
          className="condition__select"
          aria-label="지역"
          value={region ?? ''}
          disabled={locked}
          onChange={(event) => onRegion(event.target.value)}
        >
          {!region && <option value="">지역</option>}
          {regions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <span className="condition__divider" aria-hidden="true" />
        <span className="condition__weather" aria-live="polite">
          {weather.loading && <span className="sub-text">날씨를 받는 중…</span>}
          {!weather.loading && w && (
            <>
              <span aria-hidden="true">{look.icon}</span> {look.label} {w.min_temp}°~{w.max_temp}°
            </>
          )}
          {!weather.loading && !w && weather.error && <span className="sub-text">날씨 없음</span>}
        </span>
        <span className="condition__divider" aria-hidden="true" />
        <select
          className="condition__select"
          aria-label="스타일 태그"
          value={tagId ?? ''}
          disabled={locked}
          onChange={(event) => onTag(event.target.value ? Number(event.target.value) : null)}
        >
          <option value="">태그 없음</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
        <Button disabled={locked || recommending} onClick={onRecommend}>
          {recommending ? '추천을 고르는 중…' : '추천받기'}
        </Button>
      </div>
      {weather.error && <ErrorLine message={weather.error} onRetry={onRetryWeather} />}
      {w && w.is_default_region && !locked && (
        <p className="condition__notice">서울 날씨예요. 설정에서 내 지역을 저장해 주세요.</p>
      )}
    </div>
  )
}

export default ConditionBar
