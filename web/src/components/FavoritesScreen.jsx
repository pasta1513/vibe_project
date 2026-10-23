import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import favoritesBg from '../assets/favorites/favorites-bg.png'
import favoritesEmptyBg from '../assets/favorites/favorites-empty-bg.png'
import { SLOT_LABEL } from '../labels.js'
import '../styles/favorites.css'
import DatePickerDialog from './DatePickerDialog.jsx'
import ErrorLine from './ErrorLine.jsx'
import HeartIcon from './HeartIcon.jsx'
import Mannequin from './Mannequin.jsx'

// 즐겨찾기 (SCREEN-SPEC §8). 시안 style/html 10을 옮겼습니다. (P-38)
// 옷걸이 봉에 코디 카드가 가로 한 줄로 걸려 있습니다. 코디 모습, 지운 옷 표시, ♥만 보이고
// 점수, 코멘트, 날씨, 태그, 날짜는 보이지 않습니다. 시안의 날짜와 정렬은 넣지 않았습니다 (사람이 정함, 2026-10-22).
// 카드를 누르면 입혀 보기, ♥을 누르면 묻지 않고 빼기 (사람이 정함, 2026-10-22, 2026-10-23). 끌면 순서가 바뀝니다.

// 코디 하나가 차지하는 폭 (카드 200 + 사이 간격 10). 끌 때 놓일 자리를 이 폭으로 계산합니다.
const SLOT_WIDTH = 210
// 한 번에 보이는 카드 수 (시안 10). ◀ ▶는 이만큼 넘깁니다.
const PAGE = 5
// 끌면서 끝에서 이만큼 안쪽에 들어오면 옷걸이가 저절로 넘어갑니다. (SCREEN-SPEC §8, 제안)
const EDGE = 80
const AUTO_SCROLL_STEP = 8
// 끌기로 보기 전에 움직여야 하는 거리. 이보다 적게 움직이면 그냥 누른 것으로 봅니다.
const DRAG_THRESHOLD = 6

function moveTo(list, id, index) {
  const without = list.filter((f) => f.id !== id)
  const item = list.find((f) => f.id === id)
  const at = Math.max(0, Math.min(index, without.length))
  return [...without.slice(0, at), item, ...without.slice(at)]
}

function FavoriteCard({ fav, dragging, onPointerDown, onOpen, onRemove }) {
  const worn = Object.fromEntries(
    Object.entries(fav.outfit).map(([slot, item]) => [slot, item ?? null]),
  )
  if (!fav.outfit.outer) worn.outer = 'none'
  return (
    <li
      className={`fv-slot${dragging ? ' fv-slot--dragging' : ''}`}
      onPointerDown={(event) => onPointerDown(event, fav.id)}
    >
      {/* 옷걸이 고리 (시안 그림의 고리를 앱이 카드마다 그립니다) */}
      <svg className="fv-hook" viewBox="0 0 40 50" aria-hidden="true">
        <path d="M14 14 a6 6 0 1 1 6 6 V32" fill="none" stroke="#4a3a33" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M5 49 Q20 28 35 49 Z" fill="#4a3a33" />
      </svg>
      <article
        className="fv-card"
        aria-label="즐겨찾기 코디, 눌러서 입혀 보기"
        role="button"
        tabIndex={0}
        onClick={() => onOpen(fav)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpen(fav)
          }
        }}
      >
        <Mannequin
          className="fv-card__mannequin"
          {...fav.mannequin}
          outfit={worn}
          fadedSlots={fav.deleted_slots}
          title="즐겨찾기 코디를 입은 마네킹"
        />
        {/* 지운 옷 표시 (SCREEN-SPEC §2.4) */}
        {fav.deleted_slots.length > 0 && (
          <span className="fv-card__deleted">⚠ {fav.deleted_slots.map((slot) => SLOT_LABEL[slot]).join(', ')}</span>
        )}
        <button
          type="button"
          className="fv-card__heart fav-heart fav-heart--on"
          aria-label="즐겨찾기에서 빼기"
          onClick={(event) => {
            event.stopPropagation()
            onRemove(fav)
          }}
        >
          <HeartIcon />
        </button>
      </article>
    </li>
  )
}

function FavoritesScreen({ onTryOn }) {
  const [favorites, setFavorites] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [orderError, setOrderError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [picking, setPicking] = useState(null)
  const [opening, setOpening] = useState(false)
  const [pickError, setPickError] = useState(null)
  const [draggingId, setDraggingId] = useState(null)

  const scroller = useRef(null)
  const drag = useRef(null) // { id, startX, started, before, pointerX }
  const justDragged = useRef(false) // 끌기를 끝낸 바로 뒤의 누르기는 입혀 보기로 보지 않습니다.
  const favoritesRef = useRef(null)
  favoritesRef.current = favorites

  const load = useCallback(async () => {
    const res = await api.getFavorites()
    if (res.result === 'ok') {
      setLoadError(null)
      setFavorites(res.data)
    } else {
      setLoadError(res.error.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // ◀ ▶: 한 번에 5벌씩 넘깁니다. 부드럽게 넘기기(smooth)는 브라우저에 따라 움직이지 않아 바로 넘깁니다.
  function page(direction) {
    scroller.current?.scrollBy({ left: direction * SLOT_WIDTH * PAGE })
  }

  // 끄는 동안 손가락(마우스)이 있는 자리에 맞춰 놓일 자리를 정합니다.
  const placeAtPointer = useCallback(() => {
    const d = drag.current
    const box = scroller.current
    if (!d || !d.started || !box) return
    // 앱 틀이 화면 크기에 맞춰 줄어 있으므로, 화면 픽셀을 틀 안의 픽셀로 바꿉니다. (P-38)
    const rect = box.getBoundingClientRect()
    const scale = rect.width / box.offsetWidth || 1
    const x = (d.pointerX - rect.left) / scale + box.scrollLeft
    const index = Math.floor(x / SLOT_WIDTH)
    setFavorites((prev) => {
      const now = prev.findIndex((f) => f.id === d.id)
      return now === index ? prev : moveTo(prev, d.id, index)
    })
  }, [])

  // 끝에 가까이 가면 옷걸이가 저절로 넘어갑니다.
  useEffect(() => {
    if (draggingId == null) return undefined
    const timer = setInterval(() => {
      const d = drag.current
      const box = scroller.current
      if (!d || !box) return
      const rect = box.getBoundingClientRect()
      if (d.pointerX < rect.left + EDGE) box.scrollLeft -= AUTO_SCROLL_STEP
      else if (d.pointerX > rect.right - EDGE) box.scrollLeft += AUTO_SCROLL_STEP
      else return
      placeAtPointer()
    }, 16)
    return () => clearInterval(timer)
  }, [draggingId, placeAtPointer])

  function handlePointerDown(event, id) {
    // 버튼을 누른 것은 끌기로 보지 않습니다.
    if (event.button !== 0 || event.target.closest('button')) return
    drag.current = {
      id,
      startX: event.clientX,
      pointerX: event.clientX,
      started: false,
      before: favoritesRef.current,
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  function handlePointerMove(event) {
    const d = drag.current
    if (!d) return
    d.pointerX = event.clientX
    if (!d.started) {
      if (Math.abs(event.clientX - d.startX) < DRAG_THRESHOLD) return
      d.started = true
      setDraggingId(d.id)
    }
    placeAtPointer()
  }

  // 놓으면 순서를 저장합니다. 저장하지 못하면 원래 순서로 되돌리고 한 줄로 알립니다. (API-SPEC §7, 제안)
  async function handlePointerUp() {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
    const d = drag.current
    drag.current = null
    setDraggingId(null)
    if (!d || !d.started) return
    justDragged.current = true
    setTimeout(() => {
      justDragged.current = false
    }, 0)
    const after = favoritesRef.current
    const changed = after.some((f, i) => f.id !== d.before[i].id)
    if (!changed) return
    setOrderError(null)
    const res = await api.reorderFavorites(after.map((f) => f.id))
    if (res.result !== 'ok') {
      setFavorites(d.before)
      setOrderError(`순서를 저장하지 못해 원래대로 돌려놓았어요. (${res.error.message})`)
      if (res.error.kind === 'order_mismatch') load()
    }
  }

  async function remove(fav) {
    setActionError(null)
    const res = await api.removeFavorite(fav.id)
    if (res.result === 'ok') {
      setFavorites((prev) => prev.filter((f) => f.id !== fav.id))
    } else {
      setActionError(res.error.message)
      if (res.error.kind === 'favorite_not_found') load()
    }
  }

  // 입혀 보기 → 날짜 고르기 (SCREEN-SPEC §5.5). 저장할 때의 태그를 가져옵니다.
  async function pickDate(date) {
    setOpening(true)
    setPickError(null)
    const res = await api.tryOnFavorite(picking.id, date)
    setOpening(false)
    if (res.result !== 'ok') {
      setPickError(res.error.message)
      return
    }
    setPicking(null)
    onTryOn(res.data)
  }

  function openTryOn(fav) {
    if (justDragged.current) return
    setPickError(null)
    setPicking(fav)
  }

  // 시안 10을 그대로 옮긴 화면입니다. (P-38)
  // 즐겨찾기가 없으면 사람이 준 빈 옷걸이 그림(빈 옷걸이 7개)을 배경으로 씁니다. 제목 패널은 그 그림의 패널 자리에 맞춥니다. (사람이 정함, 2026-10-22)
  const empty = favorites !== null && favorites.length === 0
  return (
    <section className="fv" aria-label="즐겨찾기" style={{ '--src': `url(${empty ? favoritesEmptyBg : favoritesBg})` }}>
      <div className={`fv-title${empty ? ' fv-title--empty' : ''}`}>
        <svg width="52" height="48" viewBox="0 0 24 22" aria-hidden="true">
          <path d="M12 20s-9-5.5-9-12a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.5-9 12-9 12z" fill="none" stroke="#e8473f" strokeWidth="2.2" />
        </svg>
        <h2>내가 좋아하는 코디</h2>
        <p>마음에 드는 코디를 저장하고, 언제든 다시 입혀볼 수 있어요.</p>
      </div>

      {empty && <p className="fv-empty">아직 즐겨찾기가 없어요.</p>}
      {favorites && favorites.length > 0 && (
        <>
          <div className="fv-track" ref={scroller}>
            <ul className="fv-list" style={{ width: favorites.length * SLOT_WIDTH }}>
              {favorites.map((fav) => (
                <FavoriteCard
                  key={fav.id}
                  fav={fav}
                  dragging={draggingId === fav.id}
                  onPointerDown={handlePointerDown}
                  onOpen={openTryOn}
                  onRemove={remove}
                />
              ))}
            </ul>
          </div>
          <button type="button" className="fv-arrow" style={{ left: 200 }} aria-label="앞으로 넘기기" onClick={() => page(-1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <button type="button" className="fv-arrow" style={{ left: 1310 }} aria-label="뒤로 넘기기" onClick={() => page(1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      <div className="fv-errors">
        {loadError && <ErrorLine message={loadError} onRetry={load} />}
        {orderError && <ErrorLine message={orderError} />}
        {actionError && <ErrorLine message={actionError} />}
      </div>

      {picking && (
        <DatePickerDialog
          busy={opening}
          error={pickError}
          onPick={pickDate}
          onCancel={() => setPicking(null)}
        />
      )}
    </section>
  )
}

export default FavoritesScreen
