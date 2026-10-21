import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { SLOT_LABEL } from '../labels.js'
import Button from './Button.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import DatePickerDialog from './DatePickerDialog.jsx'
import ErrorLine from './ErrorLine.jsx'
import Mannequin from './Mannequin.jsx'

// 즐겨찾기 (SCREEN-SPEC §8): 옷걸이(행거)에 코디가 가로 한 줄로 걸려 있습니다.
// 코디 모습과 지운 옷 표시만 보이고, 점수, 코멘트, 날씨, 태그, 날짜, 별은 보이지 않습니다.

// 코디 하나가 차지하는 폭 (카드 + 사이 간격). 끌 때 놓일 자리를 이 폭으로 계산합니다.
const SLOT_WIDTH = 220
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

function FavoriteHanger({ fav, dragging, onPointerDown, onTryOn, onRemove }) {
  const worn = Object.fromEntries(
    Object.entries(fav.outfit).map(([slot, item]) => [slot, item ? item.image_url : null]),
  )
  if (!fav.outfit.outer) worn.outer = 'none'
  return (
    <li
      className={`hanger${dragging ? ' hanger--dragging' : ''}`}
      onPointerDown={(event) => onPointerDown(event, fav.id)}
    >
      {/* 옷걸이 고리 */}
      <svg className="hanger__hook" viewBox="0 0 40 28" aria-hidden="true">
        <path d="M20 26 V14 Q20 4 28 4 Q34 4 34 10" fill="none" stroke="var(--color-prop-dark)" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <article className="hanger__card" aria-label="즐겨찾기 코디">
        {fav.deleted_slots.length > 0 && (
          <span className="diary-card__deleted">
            ⚠ {fav.deleted_slots.map((slot) => SLOT_LABEL[slot]).join(', ')}
          </span>
        )}
        <Mannequin
          className="hanger__mannequin"
          {...fav.mannequin}
          outfit={worn}
          fadedSlots={fav.deleted_slots}
          title="즐겨찾기 코디를 입은 마네킹"
        />
        <div className="hanger__actions">
          <Button onClick={() => onTryOn(fav)}>입혀 보기</Button>
          <Button onClick={() => onRemove(fav)}>빼기</Button>
        </div>
      </article>
    </li>
  )
}

function FavoritesScreen({ onTryOn }) {
  const [favorites, setFavorites] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [orderError, setOrderError] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [picking, setPicking] = useState(null)
  const [opening, setOpening] = useState(false)
  const [pickError, setPickError] = useState(null)
  const [draggingId, setDraggingId] = useState(null)

  const scroller = useRef(null)
  const drag = useRef(null) // { id, startX, started, before, pointerX }
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

  // ◀ ▶: 한 번에 4벌쯤 넘깁니다. 부드럽게 넘기기(smooth)는 브라우저에 따라 움직이지 않아 바로 넘깁니다.
  function page(direction) {
    scroller.current?.scrollBy({ left: direction * SLOT_WIDTH * 4 })
  }

  // 끄는 동안 손가락(마우스)이 있는 자리에 맞춰 놓일 자리를 정합니다.
  const placeAtPointer = useCallback(() => {
    const d = drag.current
    const box = scroller.current
    if (!d || !d.started || !box) return
    const x = d.pointerX - box.getBoundingClientRect().left + box.scrollLeft
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

  async function confirmRemove() {
    const fav = removing
    setRemoving(null)
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

  return (
    <section className="favorites" aria-label="즐겨찾기">
      {loadError && <ErrorLine message={loadError} onRetry={load} />}
      {orderError && <ErrorLine message={orderError} />}
      {actionError && <ErrorLine message={actionError} />}
      {favorites && favorites.length === 0 && (
        <p className="favorites__empty">아직 즐겨찾기가 없어요.</p>
      )}
      {favorites && favorites.length > 0 && (
        <div className="favorites__rack">
          <button type="button" className="favorites__arrow" aria-label="앞으로 넘기기" onClick={() => page(-1)}>
            ◀
          </button>
          <div className="favorites__track" ref={scroller}>
            <div className="favorites__rail" style={{ width: favorites.length * SLOT_WIDTH }} />
            <ul className="favorites__list">
              {favorites.map((fav) => (
                <FavoriteHanger
                  key={fav.id}
                  fav={fav}
                  dragging={draggingId === fav.id}
                  onPointerDown={handlePointerDown}
                  onTryOn={(f) => {
                    setPickError(null)
                    setPicking(f)
                  }}
                  onRemove={setRemoving}
                />
              ))}
            </ul>
          </div>
          <button type="button" className="favorites__arrow" aria-label="뒤로 넘기기" onClick={() => page(1)}>
            ▶
          </button>
        </div>
      )}

      {removing && (
        <ConfirmDialog
          message="정말 지울까요?"
          confirmLabel="지우기"
          danger
          onCancel={() => setRemoving(null)}
          onConfirm={confirmRemove}
        />
      )}
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
