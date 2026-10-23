import clearBg from '../assets/confirmed/clear-bg.png'
import rainBg from '../assets/confirmed/rain-bg.png'
import snowBg from '../assets/confirmed/snow-bg.png'
import { SLOT_LABEL, WEATHER_LABEL } from '../labels.js'
import '../styles/confirmed.css'
import Mannequin from './Mannequin.jsx'
import { WeatherIcon } from './WeatherIcon.jsx'

// 확정한 뒤 화면 (SCREEN-SPEC §5.6). 시안 style/html의 13_3(맑음), 13_4(비), 13_5(눈)를 옮겼습니다. (P-38)
// 흐림은 시안이 없어 맑음 배경을 씁니다. 배경은 시안 PNG에서 캐릭터 자리를 메운 그림이고, 그 자리에 확정한 옷을 입은 마네킹.
// 점수와 이유·코멘트는 보이지 않습니다 (PRD §7). 날씨 카드의 한마디는 날씨마다 정해 둔 문장입니다 (AI를 부르지 않음).
// 시안의 "이런 날씨에 어울리는 다른 코디" 목록은 앱에 없어 넣지 않았습니다 (사람이 정함, 2026-10-22).
// confirmed: { date, weather: { region, min_temp, max_temp, condition }, worn: 칸 → 2D 이미지 주소 }
// 디자인만 옮겼습니다. 동작은 그대로입니다: 아래 버튼(코디 일기에 보기, 즐겨찾기에 추가, 새로운 코디 추천받기)과
// 아이템 카드의 옷 이름·#키워드는 넣지 않았습니다. 옷은 그림 주소만 받고, 이동은 메뉴로 합니다. (사람이 정함)

const SCENE = {
  clear: { src: clearBg, tone: 'light', veil: 'rgba(225, 236, 246, 0.55)', card: 'rgb(249, 250, 250)' },
  cloudy: { src: clearBg, tone: 'light', veil: 'rgba(225, 236, 246, 0.55)', card: 'rgb(249, 250, 250)' },
  rain: { src: rainBg, tone: 'dark', veil: 'rgba(84, 96, 118, 0.6)', card: 'rgb(241, 243, 246)' },
  snow: { src: snowBg, tone: 'light', veil: 'rgba(222, 230, 242, 0.6)', card: 'rgb(246, 247, 249)' },
}

// 날씨 카드의 한마디 (사람이 정함, 2026-10-22)
const MESSAGE = {
  clear: ['오늘은 맑은 날씨예요.', '가볍게 걷기 좋은 날이에요.', '산뜻한 하루 보내세요!'],
  cloudy: ['오늘은 구름이 많은 날이에요.', '쌀쌀해질 수 있으니', '얇은 겉옷을 챙겨 보세요!'],
  rain: ['오늘은 비가 오는 날이에요.', '우산을 꼭 챙기고', '비에도 산뜻한 하루를 보내세요!'],
  snow: ['오늘은 눈이 오는 날이에요.', '미끄럽지 않게 조심하고', '포근한 하루를 보내세요!'],
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const ITEM_ORDER = ['outer', 'top', 'bottom', 'dress', 'shoes']

function longDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${y}년 ${m}월 ${d}일 (${WEEKDAYS[new Date(y, m - 1, d).getDay()]})`
}

function ConfirmedScreen({ confirmed, mannequin }) {
  const { date, weather, worn } = confirmed
  const scene = SCENE[weather.condition] ?? SCENE.clear
  const look = WEATHER_LABEL[weather.condition]
  const items = ITEM_ORDER.filter((slot) => worn[slot] && worn[slot] !== 'none').map((slot) => ({
    slot,
    url: worn[slot],
  }))

  return (
    <section className={`cf cf--${scene.tone}`} aria-label="확정한 뒤" style={{ '--src': `url(${scene.src})` }}>
      <div className="cf-veil" style={{ left: 150, top: 186, width: 350, height: 74, background: scene.veil }} />
      <div className="cf-veil" style={{ left: 196, top: 250, width: 220, height: 72, background: scene.veil }} />
      <h2 className="cf-title">
        <i aria-hidden="true">
          <svg viewBox="0 0 20 20">
            <path d="M4.5 10.5l3.7 3.6 7.3-8" />
          </svg>
        </i>
        코디가 확정되었어요!
      </h2>
      <p className="cf-sub">
        코디 일기에 저장했어요.
        <br />
        즐거운 하루 보내세요!
      </p>

      <Mannequin className="cf-mannequin" {...mannequin} outfit={worn} title="확정한 옷을 입은 마네킹" />

      {/* 날씨 카드 (시안 .weather) */}
      <div className="cf-weather" style={{ background: scene.card }}>
        <div className="cf-weather__date">{longDate(date)}</div>
        <div className="cf-weather__loc">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
          </svg>
          {weather.region}
        </div>
        <WeatherIcon condition={weather.condition} className="cf-weather__icon" />
        <div className="cf-weather__temp">
          {weather.min_temp}°~{weather.max_temp}°C
        </div>
        <div className="cf-weather__desc">{look.label}</div>
        <div className="cf-weather__hilo">
          최고 {weather.max_temp}° | 최저 {weather.min_temp}°
        </div>
        <p className="cf-weather__msg">
          {(MESSAGE[weather.condition] ?? MESSAGE.clear).map((line, i) => (
            <span key={line}>
              {i > 0 && <br />}
              {line}
            </span>
          ))}
        </p>
      </div>

      {/* 오늘의 코디 아이템 (시안 .items). 아래쪽 "다른 코디" 자리는 비워 둡니다. */}
      <div className="cf-items">
        <h3>오늘의 코디 아이템</h3>
        <ul className="cf-items__list" style={{ '--n': items.length }}>
          {items.map(({ slot, url }) => (
            <li key={slot} className="cf-item">
              <span className="cf-item__img">
                <img src={url} alt="" />
              </span>
              <span className="cf-item__nm">{SLOT_LABEL[slot]}</span>
              <span className="cf-item__tg">#{SLOT_LABEL[slot]}</span>
            </li>
          ))}
        </ul>
        <p className="cf-items__note">확정한 코디는 코디 일기에 날짜별로 남아요.</p>
      </div>

    </section>
  )
}

export default ConfirmedScreen
