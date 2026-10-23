import { useState } from 'react'
import { api } from '../api.js'
import HeartIcon from './HeartIcon.jsx'

// 카드의 즐겨찾기 하트 (SCREEN-SPEC §2.8): 추천 카드와 코디 일기 카드의 오른쪽 위.
// ♡을 누르면 넣고 ♥로 바뀝니다. 알림창은 없습니다.
// ♥을 누르면 묻지 않고 즐겨찾기에서 빠지고 ♡로 바뀝니다. (사람이 정함, 2026-10-23)
// favoriteId: 같은 코디 구성의 즐겨찾기 번호. 없으면 null
// add: 넣는 요청을 보내는 함수 (추천 카드는 코디 구성과 태그, 일기 카드는 기록 번호)
// onChange(번호 또는 null): 하트가 바뀌면 부릅니다. 같은 구성의 다른 카드도 함께 바꾸는 데 씁니다.
function FavoriteStar({ favoriteId, add, onChange }) {
  const [busy, setBusy] = useState(false)
  const on = favoriteId != null

  async function handleAdd() {
    setBusy(true)
    const res = await add()
    setBusy(false)
    if (res.result === 'ok') onChange(res.data.id)
    // 다른 곳에서 넣은 직후라 이미 있으면 알림창 없이 ♥로 바꿉니다. (API-SPEC §5.4, 제안)
    else if (res.error.kind === 'duplicate') onChange(res.error.favorite_id)
  }

  async function handleRemove() {
    setBusy(true)
    const res = await api.removeFavorite(favoriteId)
    setBusy(false)
    // 그 즐겨찾기가 이미 없어도 ♡로 바꿉니다. (API-SPEC §5.4, 제안)
    if (res.result === 'ok' || res.error.kind === 'favorite_not_found') onChange(null)
  }

  return (
    <button
      type="button"
      className={`fav-heart${on ? ' fav-heart--on' : ''}`}
      aria-label={on ? '즐겨찾기에서 빼기' : '즐겨찾기에 넣기'}
      aria-pressed={on}
      disabled={busy}
      onClick={() => (on ? handleRemove() : handleAdd())}
    >
      <HeartIcon />
    </button>
  )
}

export default FavoriteStar
