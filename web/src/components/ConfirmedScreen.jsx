import { WEATHER_LABEL, formatDate } from '../labels.js'
import Mannequin from './Mannequin.jsx'
import WeatherScene from './WeatherScene.jsx'

// 확정한 뒤 화면 (SCREEN-SPEC §5.6): 날씨 배경, 확정한 옷을 입은 마네킹, 위에 작게 날짜와 날씨.
// 점수와 이유·코멘트는 보이지 않습니다. 메뉴를 누르면 사라집니다.
// confirmed: { date, weather: { region, min_temp, max_temp, condition }, worn: 칸 → 옷 한 벌 정보 }
function ConfirmedScreen({ confirmed, mannequin }) {
  const { date, weather, worn } = confirmed
  const look = WEATHER_LABEL[weather.condition]
  return (
    <>
      <WeatherScene className="stage__room" condition={weather.condition} />
      <p className="confirmed__caption">
        {formatDate(date)} <span aria-hidden="true">{look.icon}</span>
        <span className="visually-hidden">{look.label}</span> {weather.region} {weather.min_temp}°~
        {weather.max_temp}°
      </p>
      <Mannequin className="stage__mannequin" {...mannequin} outfit={worn} title="확정한 옷을 입은 마네킹" />
    </>
  )
}

export default ConfirmedScreen
