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
