// 날씨 배경 (DESIGN §2.2, §5.4): 확정한 뒤 화면에만 나옵니다. 맑음, 흐림, 비, 눈 4가지.
// 플랫 일러스트: 단색 면과 둥근 모양, 그림자와 그러데이션 없음 (DESIGN §1)

const COLORS = {
  clear: { sky: '#B5D4F4', ground: '#97C459', sun: '#FAC775' },
  cloudy: { sky: '#D3D1C7', ground: '#888780', cloud: '#F1EFE8' },
  rain: { sky: '#5F5E5A', ground: '#444441', cloud: '#888780', drop: '#85B7EB' },
  snow: { sky: '#E6F1FB', ground: '#FFFFFF', flake: '#FFFFFF', flakeLine: '#85B7EB' },
}

// 뭉게구름 하나: 둥근 면 세 개와 바닥
function Cloud({ x, y, scale = 1, fill }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} fill={fill}>
      <circle cx={-50} cy={10} r={40} />
      <circle cx={0} cy={-10} r={55} />
      <circle cx={55} cy={10} r={40} />
      <rect x={-90} y={10} width={185} height={40} rx={20} />
    </g>
  )
}

const CLOUDS = [
  { x: 260, y: 140, scale: 1 },
  { x: 640, y: 90, scale: 0.8 },
  { x: 980, y: 170, scale: 1.1 },
]

// 빗줄기와 눈송이를 놓을 자리 (늘 같은 자리에 그립니다)
const SPOTS = Array.from({ length: 36 }, (_, i) => ({
  x: 40 + ((i * 337) % 1120),
  y: 230 + ((i * 151) % 230),
}))

function WeatherScene({ condition, className }) {
  const c = COLORS[condition] ?? COLORS.clear
  return (
    <svg className={className} viewBox="0 0 1200 700" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <rect width="1200" height="700" fill={c.sky} />
      <rect y="470" width="1200" height="230" fill={c.ground} />

      {condition === 'clear' && (
        <g fill={c.sun}>
          <circle cx="980" cy="150" r="70" />
          {Array.from({ length: 8 }, (_, i) => (
            <rect
              key={i}
              x="972"
              y="40"
              width="16"
              height="34"
              rx="8"
              transform={`rotate(${i * 45} 980 150)`}
            />
          ))}
        </g>
      )}

      {condition === 'cloudy' && CLOUDS.map((cl, i) => <Cloud key={i} {...cl} fill={c.cloud} />)}

      {condition === 'rain' && (
        <>
          {CLOUDS.map((cl, i) => (
            <Cloud key={i} {...cl} fill={c.cloud} />
          ))}
          <g stroke={c.drop} strokeWidth="6" strokeLinecap="round">
            {SPOTS.map((p, i) => (
              <line key={i} x1={p.x} y1={p.y} x2={p.x - 10} y2={p.y + 34} />
            ))}
          </g>
        </>
      )}

      {condition === 'snow' && (
        <g fill={c.flake} stroke={c.flakeLine} strokeWidth="3">
          {SPOTS.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y - 150 + (i % 3) * 40} r={9 + (i % 3) * 3} />
          ))}
        </g>
      )}
    </svg>
  )
}

export default WeatherScene
