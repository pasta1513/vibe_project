// 코드 값을 화면에 보일 한국어로 바꿉니다. (DATA-MODEL §12.1)

// 옷장 목록과 등록 창의 구분 순서 (SCREEN-SPEC §6.1, §6.2)
export const CATEGORIES = [
  { code: 'top', label: '상의' },
  { code: 'bottom', label: '하의' },
  { code: 'dress', label: '원피스' },
  { code: 'shoes', label: '신발' },
  { code: 'outer', label: '아우터' },
]

export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.code, c.label]))

export const KEYWORD_ROWS = [
  { kind: 'color', label: '색', required: true },
  { kind: 'type', label: '종류', required: true },
  { kind: 'material', label: '소재', required: false },
  { kind: 'season', label: '계절·두께', required: false },
  { kind: 'pattern', label: '무늬', required: false },
]

// 받침이 있으면 "이", 없으면 "가" (예: 신발이, 원피스가)
export function subjectParticle(word) {
  const last = word.charCodeAt(word.length - 1)
  if (last < 0xac00 || last > 0xd7a3) return '가'
  return (last - 0xac00) % 28 === 0 ? '가' : '이'
}

// 종류 단어 순서: 마네킹 성별에 맞는 단어(그 성별 + 둘 다)를 앞에, 나머지는 뒤에.
// 같은 무리 안에서는 목록 순서를 따릅니다. (DATA-MODEL §4)
export function sortTypesByGender(types, gender) {
  const fits = (t) => t.gender === 'both' || t.gender === gender
  return [...types.filter(fits), ...types.filter((t) => !fits(t))]
}

// 마네킹 칸 (DATA-MODEL §1.3). 빈 칸 경고창에 적는 순서이기도 합니다.
export const SLOT_LABEL = { top: '상의', bottom: '하의', dress: '원피스', shoes: '신발', outer: '아우터' }

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// 날짜 표기: 10월 20일(화). 연도는 적지 않습니다. (SCREEN-SPEC §2.2)
// iso: 'YYYY-MM-DD'
export function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const day = new Date(y, m - 1, d).getDay()
  return `${m}월 ${d}일(${WEEKDAYS[day]})`
}

// 이 PC의 날짜를 'YYYY-MM-DD'로. offset일 뒤의 날짜도 구합니다.
export function isoDate(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// 같은 코디인지 비교할 때 쓰는 값. 한 칸이라도 다르면 다른 코디입니다. (서버 rules.outfit_key와 같음)
// outfit: 칸 → 옷 번호 또는 옷 한 벌 정보. 아우터 "입지 않음"과 빈 칸은 같게 봅니다.
export function outfitKey(outfit) {
  const id = (v) => (v && typeof v === 'object' ? v.id : v === 'none' ? null : (v ?? null))
  return ['top', 'bottom', 'dress', 'shoes', 'outer'].map((slot) => id(outfit[slot])).join(',')
}

// 날씨 상태 (DATA-MODEL §12.1)
export const WEATHER_LABEL = {
  clear: { icon: '☀', label: '맑음' },
  cloudy: { icon: '☁', label: '흐림' },
  rain: { icon: '☂', label: '비' },
  snow: { icon: '❄', label: '눈' },
}

// 점수 별: 별 개수는 소수점을 버린 정수, 숫자는 소수점 한 자리 (PRD §6 점수)
export function scoreStars(score) {
  const filled = Math.floor(score)
  return { filled, empty: 5 - filled, text: score.toFixed(1) }
}
