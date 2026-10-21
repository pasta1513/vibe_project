import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import Button from './Button.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import DatePickerDialog from './DatePickerDialog.jsx'
import DiaryCard from './DiaryCard.jsx'
import ErrorLine from './ErrorLine.jsx'

// 코디 일기 (SCREEN-SPEC §7): 방 위에 일기장이 화면 전체로 펼쳐지고, 기록이 3열 카드로 놓입니다.
function DiaryScreen({ onGoDressUp, onTryOn }) {
  const [entries, setEntries] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [deleting, setDeleting] = useState(null) // 지우기 확인 질문을 띄운 기록
  const [actionError, setActionError] = useState(null)
  const [picking, setPicking] = useState(null) // 날짜 고르기 창을 띄운 기록
  const [opening, setOpening] = useState(false)
  const [pickError, setPickError] = useState(null)

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

  return (
    <section className="diary" aria-label="코디 일기">
      {loadError && <ErrorLine message={loadError} onRetry={load} />}
      {actionError && <ErrorLine message={actionError} />}
      {entries && entries.length === 0 && (
        <div className="diary__empty">
          <p>아직 남긴 코디가 없어요.</p>
          <Button onClick={onGoDressUp}>새 옷 입기로 가기</Button>
        </div>
      )}
      {entries && entries.length > 0 && (
        <div className="diary__grid">
          {entries.map((entry) => (
            <DiaryCard
              key={entry.id}
              entry={entry}
              onTryOn={(e) => {
                setPickError(null)
                setPicking(e)
              }}
              onDelete={setDeleting}
            />
          ))}
        </div>
      )}

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
