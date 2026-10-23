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

export default WeatherIcon
