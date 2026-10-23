import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import diaryBg from '../assets/diary/diary-bg.png'
import '../styles/diary.css'
import ConfirmDialog from './ConfirmDialog.jsx'
import DatePickerDialog from './DatePickerDialog.jsx'
import DiaryCard from './DiaryCard.jsx'
import ErrorLine from './ErrorLine.jsx'
import { outfitKey } from '../labels.js'

// 코디 일기 (SCREEN-SPEC §7): 기록이 3열 카드로 놓입니다. 시안 style/html 09를 옮겼습니다. (P-38)
function DiaryScreen({ onGoDressUp, onTryOn }) {
  const [entries, setEntries] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [deleting, setDeleting] = useState(null) // 지우기 확인 질문을 띄운 기록
  const [actionError, setActionError] = useState(null)
  const [picking, setPicking] = useState(null) // 날짜 고르기 창을 띄운 기록
  const [opening, setOpening] = useState(false)
  const [pickError, setPickError] = useState(null)
  const [month, setMonth] = useState('all') // 'all' 또는 'YYYY-MM'
  const [order, setOrder] = useState('new') // 'new' 최신순, 'old' 오래된순

  const load = useCallback(async () => {
    const res = await api.getDiary()
    if (res.result === 'ok') {
      setLoadError(null)
      setEntries(res.data)
    } else {
      setLoadError(res.error.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function confirmDelete() {
    const entry = deleting
    setDeleting(null)
    setActionError(null)
    const res = await api.deleteDiary(entry.id)
    if (res.result === 'ok') {
      setEntries((prev) => prev.filter((e) => e.id !== entry.id))
    } else {
      setActionError(res.error.message)
      // 그 기록이 이미 없으면 목록을 새로 받습니다. (API-SPEC §6)
      if (res.error.kind === 'diary_not_found') load()
    }
  }

  // 별이 바뀌면 같은 코디 구성의 다른 카드도 함께 바꿉니다. (SCREEN-SPEC §2.8, 제안)
  function changeFavorite(entry, favoriteId) {
    const key = outfitKey(entry.outfit)
    setEntries((prev) =>
      prev.map((e) => (outfitKey(e.outfit) === key ? { ...e, favorite_id: favoriteId } : e)),
    )
  }

  // 입혀 보기 → 날짜 고르기: 그 기록을 지금 마네킹 모양에 입혀 옷 고르는 단계로 엽니다. (SCREEN-SPEC §5.5)
  async function pickDate(date) {
    setOpening(true)
    setPickError(null)
    const res = await api.tryOnDiary(picking.id, date)
    setOpening(false)
    if (res.result !== 'ok') {
      setPickError(res.error.message)
      return
    }
    setPicking(null)
    onTryOn(res.data)
  }

  // 달 고르기와 정렬은 받은 기록을 화면에서 거릅니다 (서버는 그대로, 사람이 정함 2026-10-22).
  const months = entries ? [...new Set(entries.map((e) => e.date.slice(0, 7)))].sort().reverse() : []
  const shown = entries
    ? entries
        .filter((e) => month === 'all' || e.date.startsWith(month))
        .sort((a, b) => (order === 'new' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)))
    : []

  // 시안 09를 그대로 옮긴 화면입니다. (P-38)
  return (
    <section className="dy" aria-label="코디 일기" style={{ '--src': `url(${diaryBg})` }}>
      <div className="dy-main">
        <h2 className="dy-main__title">
          코디 일기 <span className="dy-main__cnt">{shown.length}</span>
        </h2>
        {entries && entries.length > 0 && (
          <>
            <select className="dy-sel" style={{ left: 945, width: 162 }} aria-label="달" value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="all">전체 기간</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {Number(m.slice(0, 4))}년 {Number(m.slice(5))}월
                </option>
              ))}
            </select>
            <select className="dy-sel" style={{ left: 1119, width: 130 }} aria-label="정렬" value={order} onChange={(e) => setOrder(e.target.value)}>
              <option value="new">최신순</option>
              <option value="old">오래된순</option>
            </select>
          </>
        )}

        <div className="dy-main__body">
          {loadError && <ErrorLine message={loadError} onRetry={load} />}
          {actionError && <ErrorLine message={actionError} />}
          {entries && entries.length === 0 && (
            <div className="dy-empty">
              <p>아직 남긴 코디가 없어요.</p>
              <button type="button" className="dy-empty__btn" onClick={onGoDressUp}>
                새 옷 입기로 가기
              </button>
            </div>
          )}
          {shown.length > 0 && (
            <div className="dy-cards">
              {shown.map((entry) => (
                <DiaryCard
                  key={entry.id}
                  entry={entry}
                  onTryOn={(e) => {
                    setPickError(null)
                    setPicking(e)
                  }}
                  onDelete={setDeleting}
                  onFavorite={changeFavorite}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {deleting && (
        <ConfirmDialog
          message="정말 지울까요?"
          confirmLabel="지우기"
          danger
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
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

export default DiaryScreen
