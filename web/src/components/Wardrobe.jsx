// 방 한쪽의 옷장 (DESIGN §5.3)

const PROP = '#D3D1C7'
const PROP_DARK = '#B4B2A9'

function Wardrobe({ className }) {
  return (
    <svg className={className} viewBox="0 0 200 320" role="img" aria-label="옷장">
      <rect x="6" y="0" width="188" height="22" rx="8" fill={PROP_DARK} />
      <rect x="14" y="16" width="172" height="280" rx="12" fill={PROP} />
      <rect x="98" y="30" width="4" height="252" rx="2" fill={PROP_DARK} />
      <circle cx="86" cy="160" r="6" fill={PROP_DARK} />
      <circle cx="114" cy="160" r="6" fill={PROP_DARK} />
      <rect x="28" y="292" width="20" height="26" rx="4" fill={PROP_DARK} />
      <rect x="152" y="292" width="20" height="26" rx="4" fill={PROP_DARK} />
    </svg>
  )
}

export default Wardrobe
