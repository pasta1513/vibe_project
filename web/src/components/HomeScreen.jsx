import { useCallback, useEffect, useState } from 'react'
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
// 날씨 카드: 오늘, 저장한 지역(없으면 서울)의 날씨 (API-SPEC §4). 처음 화면을 열 때 한 번 받습니다.
// 기온은 최저~최고, 한마디는 날씨마다 정해 둔 문장 (AI를 부르지 않음). > 는 설정의 지역 설정을 엽니다. (사람이 정함, 2026-10-22)

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

function HomeScreen({ mannequin, onOpenRegion }) {
  const [weather, setWeather] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    const res = await api.getWeather(isoDate(0))
    if (res.result === 'ok') setWeather(res.data)
    else setError(res.error.message)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <section className="hm" aria-label="처음 화면" style={{ '--src': `url(${homeBg})` }}>
      <p className="visually-hidden">오늘은 어떤 옷을 입을까?</p>
      <Mannequin className="hm-mannequin" {...mannequin} title="지금 마네킹 모양, 기본 잠옷 차림" />

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
              {weather.region}
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
            <ErrorLine message={error} onRetry={load} />
          </div>
        )}
      </div>
    </section>
  )
}

export default HomeScreen
