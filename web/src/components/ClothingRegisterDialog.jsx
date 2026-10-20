import { useRef, useState } from 'react'
import { api } from '../api.js'
import { CATEGORIES, KEYWORD_ROWS, sortTypesByGender } from '../labels.js'
import AlertDialog from './AlertDialog.jsx'
import Button from './Button.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import ErrorLine from './ErrorLine.jsx'
import KeywordChips from './KeywordChips.jsx'

// 옷 등록 창 (SCREEN-SPEC §6.2)
// [+ 더하기]는 설정의 키워드 더하기와 함께 P-16에서 붙입니다.
const EMPTY_PICK = { category: null, color: [], type: [], material: [], season: [], pattern: [] }

function ClothingRegisterDialog({ keywords, gender, onClose, onRegistered }) {
  const fileInput = useRef(null)
  const [upload, setUpload] = useState(null) // { upload_id, photo_url, image_url }
  const [lastFile, setLastFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null) // { message, retry }
  const [showOriginal, setShowOriginal] = useState(false)
  const [pickFailed, setPickFailed] = useState(false)
  const [pick, setPick] = useState(EMPTY_PICK)
  const [alert, setAlert] = useState(null)
  const [confirmClose, setConfirmClose] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [registerError, setRegisterError] = useState(null)

  async function sendPhoto(file) {
    setUploading(true)
    setUploadError(null)
    setRegisterError(null)
    setLastFile(file)
    const res = await api.uploadPhoto(file, upload?.upload_id)
    setUploading(false)
    if (res.result !== 'ok') {
      // 2D 이미지화 실패와 연결 실패는 [다시 시도], 사진 종류나 크기 문제는 다른 사진을 올림
      const retry = !['not_image', 'too_big'].includes(res.error.kind)
      setUploadError({ message: res.error.message, retry })
      return
    }
    const data = res.data
    setUpload(data)
    setShowOriginal(false)
    if (data.picked) {
      // AI가 미리 고른 구분과 키워드를 켭니다.
      const byId = Object.fromEntries(
        KEYWORD_ROWS.flatMap((row) => keywords[row.kind].map((k) => [k.id, row.kind])),
      )
      const next = { ...EMPTY_PICK, category: data.picked.category ?? null }
      for (const id of data.picked.keyword_ids) {
        const kind = byId[id]
        if (kind) next[kind] = [...next[kind], id]
      }
      setPick(next)
      setPickFailed(false)
    } else {
      setPick(EMPTY_PICK)
      setPickFailed(true)
    }
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) sendPhoto(file)
  }

  function toggleCategory(code) {
    const category = pick.category === code ? null : code
    // 구분을 바꾸면 새 구분에 맞지 않는 종류 단어는 꺼집니다.
    const allowed = new Set(keywords.type.filter((t) => t.category === category).map((t) => t.id))
    setPick({ ...pick, category, type: pick.type.filter((id) => allowed.has(id)) })
  }

  function toggleKeyword(kind, id) {
    const list = pick[kind]
    setPick({ ...pick, [kind]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] })
  }

  async function handleRegister() {
    const missing = []
    if (!pick.category) missing.push('구분')
    if (pick.color.length === 0) missing.push('색')
    if (pick.type.length === 0) missing.push('종류')
    if (missing.length > 0) {
      const particle = missing[missing.length - 1] === '종류' ? '가' : '이'
      setAlert(`${missing.join(', ')}${particle} 선택되지 않았어요.`)
      return
    }
    setRegistering(true)
    setRegisterError(null)
    const keywordIds = KEYWORD_ROWS.flatMap((row) => pick[row.kind])
    const res = await api.registerClothing({
      upload_id: upload.upload_id,
      category: pick.category,
      keyword_ids: keywordIds,
    })
    setRegistering(false)
    if (res.result === 'ok') onRegistered(res.data)
    else setRegisterError(res.error.message)
  }

  function requestClose() {
    if (upload) setConfirmClose(true)
    else onClose()
  }

  function closeAndDiscard() {
    // 올린 사진은 버립니다. 버리지 못해도 창은 닫고, 다음에 서버를 켤 때 버립니다.
    api.discardUpload(upload.upload_id)
    onClose()
  }

  const types = sortTypesByGender(
    keywords.type.filter((t) => t.category === pick.category),
    gender,
  )

  return (
    <div className="dialog-backdrop">
      <div className="dialog register" role="dialog" aria-modal="true" aria-labelledby="register-title">
        <div className="dialog__header">
          <h2 id="register-title" className="dialog__title">새 옷 등록</h2>
          <button type="button" className="dialog__close" aria-label="닫기" onClick={requestClose}>
            ✕
          </button>
        </div>

        <div className="register__body">
          <div className="register__photo">
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={handleFileChange}
            />
            {upload ? (
              <>
                <div className="photo-box">
                  <img
                    src={showOriginal ? upload.photo_url : upload.image_url}
                    alt={showOriginal ? '원래 사진' : '2D 이미지'}
                  />
                </div>
                <Button onClick={() => setShowOriginal(!showOriginal)}>
                  {showOriginal ? '2D 이미지 보기' : '원래 사진 보기'}
                </Button>
                <Button disabled={uploading} onClick={() => fileInput.current.click()}>
                  사진 다시 올리기
                </Button>
              </>
            ) : (
              <button
                type="button"
                className="photo-box photo-box--empty"
                disabled={uploading}
                onClick={() => fileInput.current.click()}
              >
                사진 올리기
              </button>
            )}
            {uploading && <p className="sub-text">사진을 정리하는 중…</p>}
            {uploadError && (
              <ErrorLine
                message={uploadError.message}
                onRetry={uploadError.retry && lastFile ? () => sendPhoto(lastFile) : undefined}
              />
            )}
          </div>

          {upload && (
            <div className="register__keywords">
              {pickFailed && (
                <p className="sub-text">키워드를 미리 고르지 못했어요. 직접 골라 주세요.</p>
              )}
              <div className="keyword-row">
                <span className="keyword-row__label">구분<span className="required">*</span></span>
                <KeywordChips
                  label="구분"
                  single
                  options={CATEGORIES.map((c) => ({ id: c.code, name: c.label }))}
                  selected={pick.category ? [pick.category] : []}
                  onToggle={toggleCategory}
                />
              </div>
              {KEYWORD_ROWS.map((row) => (
                <div key={row.kind} className="keyword-row">
                  <span className="keyword-row__label">
                    {row.label}
                    {row.required && <span className="required">*</span>}
                  </span>
                  {row.kind === 'type' && !pick.category ? (
                    <span className="sub-text">구분을 먼저 골라 주세요.</span>
                  ) : (
                    <KeywordChips
                      label={row.label}
                      options={row.kind === 'type' ? types : keywords[row.kind]}
                      selected={pick[row.kind]}
                      onToggle={(id) => toggleKeyword(row.kind, id)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {upload && (
          <div className="dialog__actions">
            {registerError && <ErrorLine message={registerError} />}
            <Button variant="primary" disabled={registering} onClick={handleRegister}>
              {registering ? '등록하는 중…' : '등록하기'}
            </Button>
          </div>
        )}
      </div>

      {alert && <AlertDialog message={alert} onClose={() => setAlert(null)} />}
      {confirmClose && (
        <ConfirmDialog
          message="등록하지 않고 닫을까요?"
          confirmLabel="닫기"
          onCancel={() => setConfirmClose(false)}
          onConfirm={closeAndDiscard}
        />
      )}
    </div>
  )
}

export default ClothingRegisterDialog
