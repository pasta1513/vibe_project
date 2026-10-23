import { useState } from 'react'
import { api } from '../api.js'
import AlertDialog from './AlertDialog.jsx'
import Button from './Button.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import ErrorLine from './ErrorLine.jsx'

// [+ 더하기]: 키워드나 태그에 새 단어를 더합니다. 설정과 옷 등록 창에서 함께 씁니다. (SCREEN-SPEC §6.2, §9)
// kind: 'color' | 'type' | 'material' | 'season' | 'pattern' | 'tag'
// category: 종류 단어일 때 속할 구분. 단어를 더하는 자리(구분 묶음, 등록 창에서 고른 구분)가 정합니다.
// onAdded(word, genderFailed): AI가 성별을 정하지 못했으면 genderFailed가 true입니다.
// showToast가 있으면 성별 실패 알림을 짧은 알림으로 띄웁니다. 없으면 부르는 쪽이 알립니다.
// label: 닫혀 있을 때 버튼 글자 (설정은 시안대로 "＋ 키워드 추가하기", P-38)

export const GENDER_FAILED = "성별을 정하지 못해 '둘 다'로 두었어요. 설정에서 고칠 수 있어요."

// 받침이 있으면 consonant, 없으면 vowel (예: '검정'이, '블랙'을)
function josa(word, consonant, vowel) {
  const last = word.charCodeAt(word.length - 1)
  if (last < 0xac00 || last > 0xd7a3) return vowel
  return (last - 0xac00) % 28 === 0 ? vowel : consonant
}

// 이름 칸이 비었거나 띄어쓰기만 있는지 (서버도 같은 규칙으로 다시 봅니다)
export function isBlankName(name) {
  return name.trim() === ''
}

function WordAdder({ kind, category, onAdded, showToast, label = '+ 더하기' }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [similar, setSimilar] = useState(null) // { existing, name }
  const [alert, setAlert] = useState(null)
  const [error, setError] = useState(null)

  function close() {
    setOpen(false)
    setName('')
    setError(null)
  }

  async function send(confirmed) {
    setBusy(true)
    setError(null)
    const res =
      kind === 'tag'
        ? await api.addTag({ name, confirmed })
        : await api.addKeyword({ kind, name, category, confirmed })
    setBusy(false)
    if (res.result === 'confirm') {
      setSimilar(res.confirm)
      return
    }
    if (res.result === 'error') {
      if (res.error.kind === 'same_name') setAlert(res.error.message)
      else setError(res.error.message)
      return
    }
    // 태그는 단어 그대로, 키워드는 { kind, keyword, gender_failed }로 받습니다.
    const word = kind === 'tag' ? res.data : res.data.keyword
    const genderFailed = res.data.gender_failed === true
    onAdded(word, genderFailed)
    if (genderFailed) showToast?.(GENDER_FAILED)
    close()
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!isBlankName(name) && !busy) send(false)
  }

  if (!open) {
    return (
      <button type="button" className="chip chip--add" onClick={() => setOpen(true)}>
        {label}
      </button>
    )
  }

  return (
    <>
      <form className="word-form" onSubmit={handleSubmit}>
        <input
          className="text-input"
          value={name}
          placeholder="이름을 입력해 주세요"
          aria-label="새 단어 이름"
          autoFocus
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" disabled={isBlankName(name) || busy}>
          {busy ? (kind === 'type' ? '성별을 정하는 중…' : '더하는 중…') : '더하기'}
        </Button>
        <Button disabled={busy} onClick={close}>
          취소
        </Button>
        {error && <ErrorLine message={error} />}
      </form>

      {similar && (
        <ConfirmDialog
          message={`'${similar.existing}'${josa(similar.existing, '이', '가')} 이미 있어요. 그래도 '${similar.name}'${josa(similar.name, '을', '를')} 더할까요?`}
          confirmLabel="더하기"
          onCancel={() => setSimilar(null)}
          onConfirm={() => {
            setSimilar(null)
            send(true)
          }}
        />
      )}
      {alert && <AlertDialog message={alert} onClose={() => setAlert(null)} />}
    </>
  )
}

export default WordAdder
