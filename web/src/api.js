// 서버 요청 도구. 응답의 공통 모양(API-SPEC §2.1)을 그대로 돌려줍니다.
//   { result: 'ok', data } | { result: 'confirm', confirm } | { result: 'error', error: { kind, message } }

// 실패로 볼 때까지 기다리는 시간 (API-SPEC §2.3, P-28에서 잰 시간으로 정함)
// AI를 부르는 요청은 서버가 먼저 실패를 알릴 수 있게, 서버가 기다리는 시간보다 길게 둡니다.
const DEFAULT_TIMEOUT_MS = 5000
// 사진 올리기 = 2D 이미지화 5초 + AI 키워드 미리 고르기 10초 (2D 이미지화는 P-32에서 잰 시간으로 정함)
const UPLOAD_TIMEOUT_MS = 15000
// 날씨 받기 (API-SPEC §2.3)
const WEATHER_TIMEOUT_MS = 10000
// 점수 확인하기 = 날씨 10초 + AI 점수 15초
const SCORE_TIMEOUT_MS = 25000
// 추천받기 = 날씨 10초 + AI 추천 20초
const RECOMMEND_TIMEOUT_MS = 30000
// 종류 단어 더하기 = 일반 요청 5초 + AI 성별 정하기 5초 + AI 비슷한 단어 판단 10초
const TYPE_WORD_TIMEOUT_MS = 20000
// 키워드·태그 더하기 = 일반 요청 5초 + AI 비슷한 단어 판단 10초
const WORD_TIMEOUT_MS = 15000

function fail(kind, message) {
  return { result: 'error', error: { kind, message } }
}

export async function request(method, path, body, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const isForm = body instanceof FormData
  try {
    const res = await fetch(path, {
      method,
      headers: body === undefined || isForm ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      signal: controller.signal,
    })
    let json
    try {
      json = await res.json()
    } catch {
      return fail('server_unreachable', '서버에 연결하지 못했어요.')
    }
    if (json && ['ok', 'confirm', 'error'].includes(json.result)) return json
    return fail('bad_response', '서버의 답을 읽지 못했어요.')
  } catch (err) {
    if (err.name === 'AbortError') return fail('timeout', '서버가 너무 오래 걸려요.')
    return fail('server_unreachable', '서버에 연결하지 못했어요.')
  } finally {
    clearTimeout(timer)
  }
}

export const api = {
  getSettings: () => request('GET', '/api/settings'),
  saveMannequin: (mannequin) => request('PUT', '/api/settings/mannequin', mannequin),
  saveRegion: (region) => request('PUT', '/api/settings/region', { region }),

  getKeywords: () => request('GET', '/api/keywords'),
  // body: { kind, name, category(종류 단어만), confirmed(비슷한 단어 질문에서 [더하기]) }
  addKeyword: (body) =>
    request('POST', '/api/keywords', body, {
      timeoutMs: body.kind === 'type' ? TYPE_WORD_TIMEOUT_MS : WORD_TIMEOUT_MS,
    }),
  renameKeyword: (id, name) => request('PATCH', `/api/keywords/${id}`, { name }),
  setKeywordGender: (id, gender) => request('PATCH', `/api/keywords/${id}`, { gender }),
  deleteKeyword: (id) => request('DELETE', `/api/keywords/${id}`),

  getTags: () => request('GET', '/api/tags'),
  addTag: (body) => request('POST', '/api/tags', body, { timeoutMs: WORD_TIMEOUT_MS }),
  renameTag: (id, name) => request('PATCH', `/api/tags/${id}`, { name }),
  deleteTag: (id) => request('DELETE', `/api/tags/${id}`),

  uploadPhoto: (file, previousUploadId) => {
    const form = new FormData()
    form.append('file', file)
    if (previousUploadId) form.append('previous_upload_id', previousUploadId)
    return request('POST', '/api/uploads', form, { timeoutMs: UPLOAD_TIMEOUT_MS })
  },
  discardUpload: (uploadId) => request('DELETE', `/api/uploads/${uploadId}`),

  // 날짜 'YYYY-MM-DD'. region은 사용자가 바꾼 지역이 있을 때만 보냅니다. (없으면 서버가 내 지역 → 서울)
  getWeather: (date, region) => {
    const query = new URLSearchParams({ date })
    if (region) query.set('region', region)
    return request('GET', `/api/weather?${query}`, undefined, { timeoutMs: WEATHER_TIMEOUT_MS })
  },
  // body: { outfit: { top, bottom, dress, shoes, outer }, date, region, tag_id }
  // body: { date, region, tag_id }
  recommend: (body) =>
    request('POST', '/api/recommendations', body, { timeoutMs: RECOMMEND_TIMEOUT_MS }),
  getDiary: () => request('GET', '/api/diary'),
  deleteDiary: (id) => request('DELETE', `/api/diary/${id}`),
  // 입혀 보기 → 날짜 고르기. 고른 날짜의 날씨를 함께 받습니다.
  tryOnDiary: (id, date) =>
    request('POST', `/api/diary/${id}/try-on`, { date }, { timeoutMs: WEATHER_TIMEOUT_MS }),
  // 즐겨찾기 (API-SPEC §5.4, §7)
  getFavorites: () => request('GET', '/api/favorites'),
  // body: { outfit, tag_id }
  addFavorite: (body) => request('POST', '/api/favorites', body),
  addFavoriteFromDiary: (entryId) => request('POST', `/api/favorites/from-diary/${entryId}`),
  removeFavorite: (id) => request('DELETE', `/api/favorites/${id}`),
  reorderFavorites: (ids) => request('PUT', '/api/favorites/order', { ids }),
  tryOnFavorite: (id, date) =>
    request('POST', `/api/favorites/${id}/try-on`, { date }, { timeoutMs: WEATHER_TIMEOUT_MS }),
  // 확정하기. body: { outfit, date, weather, tag_id, result, confirmed } (점수와 날씨는 화면이 보냄, D-006)
  confirmOutfit: (body) => request('POST', '/api/diary', body),
  score: (body) => request('POST', '/api/scores', body, { timeoutMs: SCORE_TIMEOUT_MS }),

  getClothes: () => request('GET', '/api/clothes'),
  getClothing: (id) => request('GET', `/api/clothes/${id}`),
  registerClothing: (body) => request('POST', '/api/clothes', body),
  saveOptionalKeywords: (id, body) => request('PATCH', `/api/clothes/${id}/keywords`, body),
  // 마네킹 모습 조절 저장 (API-SPEC §4, P-33)
  saveFit: (id, body) => request('PUT', `/api/clothes/${id}/fit`, body),
  deleteClothing: (id) => request('DELETE', `/api/clothes/${id}`),
}
