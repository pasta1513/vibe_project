// 방 배경: 벽, 바닥, 침대, 카펫 (DESIGN §5.3). 창문은 넣지 않습니다.
// 옷장은 메뉴에 따라 커지고 작아지므로 Wardrobe로 따로 둡니다.

const WALL = '#F1EFE8'
const FLOOR = '#B4B2A9'
const PROP = '#D3D1C7'
const PROP_DARK = '#B4B2A9'

function Room({ className }) {
  return (
    <svg className={className} viewBox="0 0 1200 700" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <rect width="1200" height="700" fill={WALL} />
      <rect y="470" width="1200" height="230" fill={FLOOR} />
      <rect y="462" width="1200" height="8" fill={PROP} />

      {/* 카펫 (마네킹이 서는 자리) */}
      <ellipse cx="600" cy="610" rx="250" ry="56" fill={PROP} />

      {/* 침대 */}
      <rect x="880" y="300" width="36" height="250" rx="12" fill={PROP_DARK} />
      <rect x="900" y="440" width="260" height="90" rx="12" fill={PROP} />
      <rect x="900" y="410" width="250" height="56" rx="16" fill={PROP_DARK} />
      <rect x="922" y="388" width="78" height="34" rx="14" fill={WALL} />
      <rect x="912" y="528" width="16" height="30" rx="4" fill={PROP_DARK} />
      <rect x="1132" y="528" width="16" height="30" rx="4" fill={PROP_DARK} />
    </svg>
  )
}

export default Room
