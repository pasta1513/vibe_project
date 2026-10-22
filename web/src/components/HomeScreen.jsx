import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import homeBg from '../assets/home/home-bg.png'
import { WEATHER_LABEL, isoDate } from '../labels.js'
import '../styles/home.css'
import { WeatherIcon } from './DressUpPanels.jsx'
import ErrorLine from './ErrorLine.jsx'
import Mannequin from './Mannequin.jsx'

// 처음 화면 (SCREEN-SPEC §4). 시안 style/html 07을 옮겼습니다. (P-38)
// 배경은 시안 PNG에서 가운데 캐릭터 자리와 아래 "최근 코디 일기" 패널을 메운 그림이고(최근 코디 일기는 넣지 않음, 사람이 정함 2026-10-22),
// 말풍선 "오늘은 어떤 옷을 입을까?"는 배경에 그려진 것을 그대로 씁니다.
// 캐릭터 자리에는 지금 고른 모양의 마네킹이 기본 잠옷 차림으로 섭니다.
// 날씨 카드: 오늘, 저장한 지역(없으면 서울)의 날씨 (API-SPEC §4). 처음 화면을 열 때 한 번 받습니다.

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${m}. ${d} (${WEEKDAYS[new Date(y, m - 1, d).getDay()]})`
}

function HomeScreen({ mannequin }) {
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

      {/* 날씨 카드 (시안 .weather) */}
      <div className="hm-weather" aria-label="오늘 날씨">
        {weather && (
          <>
            <div className="hm-weather__city">
              {weather.region}
              <svg width="20" height="22" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 22s-7-7-7-12a7 7 0 0 1 14 0c0 5-7 12-7 12z" fill="#f0574b" />
                <circle cx="12" cy="10" r="2.6" fill="#fff" />
              </svg>
            </div>
            <WeatherIcon condition={weather.condition} className="hm-weather__icon" />
            <div className="hm-weather__info">
              <b>
                {weather.min_temp}°~{weather.max_temp}°C
              </b>
              <small>{WEATHER_LABEL[weather.condition].label}</small>
              <br />
              {shortDate(weather.date)}
              <br />
              최고 {weather.max_temp}° | 최저 {weather.min_temp}°
            </div>
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
