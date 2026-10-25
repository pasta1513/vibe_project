import { useEffect, useState } from 'react'
import { api } from '../api.js'
import homeBg from '../assets/home/home-bg.png'
import { isoDate } from '../labels.js'
import '../styles/home.css'
import { WeatherIcon } from './DressUpPanels.jsx'
import ErrorLine from './ErrorLine.jsx'
import Mannequin from './Mannequin.jsx'

// 처음 화면 (SCREEN-SPEC §4). 사람이 준 그림(2026-10-22)을 옮겼습니다. (P-38)
// 배경은 그 그림에서 가운데 캐릭터 자리를 메운 것이고, 말풍선 "오늘은 어떤 옷을 입을까?"는 그림에 있는 것을 그대로 씁니다.
// 캐릭터 자리에는 지금 고른 모양의 마네킹이 기본 잠옷 차림으로 섭니다.
// 오늘 날짜의 코디 일기가 있으면 그 옷을 입습니다. 일기를 받지 못하면 잠옷 그대로입니다. (P-46, 사람이 정함 2026-10-23)
// 날씨 카드: 오늘, 저장한 지역(없으면 서울)의 날씨 (API-SPEC §4). 처음 화면을 열 때 한 번 받습니다.
// 지역은 늘 이름으로 보냅니다(저장한 내 지역, 없으면 '서울'). 지역 없이 부르면 api.getWeather가 현재 위치를 물어
// 앱을 켜자마자 위치 권한 창이 뜨기 때문입니다. 서울 안내는 서버 표시(is_default_region)가 아니라 homeRegion이 비었는지로 정합니다. (U5)
// 기온은 최저~최고, 한마디는 날씨마다 정해 둔 문장 (AI를 부르지 않음). > 는 설정의 지역 설정을 엽니다. (사람이 정함, 2026-10-22)

const DEFAULT_REGION = '서울'

const DAY_NAME = {
  clear: '맑은 날',
  cloudy: '흐린 날',
  rain: '비 오는 날',
  snow: '눈 오는 날',
}

const MESSAGE = {
  clear: '가벼운 옷차림으로 나가 보세요.',
  cloudy: '얇은 겉옷을 챙겨 보세요.',
  rain: '우산과 방수되는 신발을 챙겨요.',
  snow: '따뜻한 니트와 코트를 챙겨요.',
}

function HomeScreen({ mannequin, homeRegion, onOpenRegion }) {
  const [weather, setWeather] = useState(null)
  const [error, setError] = useState(null)
  const [today, setToday] = useState(null)

  // [다시 시도]를 누를 때마다 올려서 날씨를 다시 받습니다.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let current = true
    api.getWeather(isoDate(0), homeRegion ?? DEFAULT_REGION).then((res) => {
      if (!current) return
      if (res.result === 'ok') setWeather(res.data)
      else setError(res.error.message)
    })
    return () => {
      current = false
    }
  }, [homeRegion, attempt])

  function retry() {
    setError(null)
    setWeather(null)
    setAttempt((n) => n + 1)
  }

  useEffect(() => {
    let alive = true
    api.getDiary().then((res) => {
      if (!alive || res.result !== 'ok') return
      setToday(res.data.find((entry) => entry.date === isoDate(0)) ?? null)
    })
    return () => {
      alive = false
    }
  }, [])

  // 코디 일기 카드와 같이 입힘. 아우터가 없으면 "입지 않음"
  let worn = null
  if (today) {
    worn = Object.fromEntries(Object.entries(today.outfit).map(([slot, item]) => [slot, item ?? null]))
    if (!today.outfit.outer) worn.outer = 'none'
  }

  return (
    <section className="hm" aria-label="처음 화면" style={{ '--src': `url(${homeBg})` }}>
      <p className="visually-hidden">오늘은 어떤 옷을 입을까?</p>
      {worn ? (
        <Mannequin
          className="hm-mannequin"
          {...mannequin}
          outfit={worn}
          fadedSlots={today.deleted_slots}
          title="지금 마네킹 모양, 오늘 코디 차림"
        />
      ) : (
        <Mannequin className="hm-mannequin" {...mannequin} title="지금 마네킹 모양, 기본 잠옷 차림" />
      )}

      {/* 날씨 카드 */}
      <div className="hm-weather" aria-label="오늘 날씨">
        <button type="button" className="hm-weather__more" aria-label="지역 설정 열기" onClick={onOpenRegion}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
        {weather && (
          <>
            <div className="hm-weather__city">
              {weather.area ?? weather.region}
              <svg width="16" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 22s-7-7-7-12a7 7 0 0 1 14 0c0 5-7 12-7 12z" fill="#f0574b" />
                <circle cx="12" cy="10" r="2.6" fill="#fff" />
              </svg>
            </div>
            <WeatherIcon condition={weather.condition} className="hm-weather__icon" />
            <div className="hm-weather__temp">
              {weather.min_temp}°~{weather.max_temp}°C
            </div>
            <div className="hm-weather__day">{DAY_NAME[weather.condition]}</div>
            <p className="hm-weather__msg">{MESSAGE[weather.condition]}</p>
          </>
        )}
        {!weather && !error && <p className="hm-weather__wait">날씨를 불러오는 중…</p>}
        {error && (
          <div className="hm-weather__error">
            <ErrorLine message={error} onRetry={retry} />
          </div>
        )}
      </div>
      {!homeRegion && weather && (
        <p className="hm-weather__notice">서울 날씨예요. 설정에서 내 지역을 저장해 주세요.</p>
      )}
    </section>
  )
}

export default HomeScreen
