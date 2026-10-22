import { useRef, useState } from 'react'
import { api } from '../api.js'
import { CATEGORIES, KEYWORD_ROWS, sortTypesByGender } from '../labels.js'
import AlertDialog from './AlertDialog.jsx'
import BackgroundEditor from './BackgroundEditor.jsx'
import Button from './Button.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import ErrorLine from './ErrorLine.jsx'
import KeywordChips from './KeywordChips.jsx'
import Mannequin from './Mannequin.jsx'
import OutfitFitter from './OutfitFitter.jsx'
import WordAdder, { GENDER_FAILED } from './WordAdder.jsx'

// 옷 등록 창 (SCREEN-SPEC §6.2)
// [+ 더하기]로 더한 단어는 이 창의 목록에 바로 붙고 켜진 채로 보입니다. 구분 줄에는 [+ 더하기]가 없습니다.
const EMPTY_PICK = { category: null, color: [], type: [], material: [], season: [], pattern: [] }

// 서버(outfits.py)와 같은 규칙으로 의상 틀을 고릅니다: 표에서 위에 있는 틀, 맞는 단어가 없으면 구분의 기본 틀 (D-016)
function pickTemplate(table, category, typeNames) {
  const found = table.templates.find(
    (t) => t.category === category && t.types.some((name) => typeNames.includes(name)),
  )
  return found ? found.code : table.defaults[category]
}

function ClothingRegisterDialog({ keywords: loadedKeywords, mannequin, outfitTable, onClose, onRegistered }) {
  const { gender } = mannequin
  const fileInput = useRef(null)
  const [upload, setUpload] = useState(null) // { upload_id, photo_url, image_url, main_color, pattern_url }
  const [lastFile, setLastFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null) // { message, retry }
  // 왼쪽에 보이는 것: 'image' 2D 이미지, 'original' 원래 사진, 'mannequin' 마네킹에 입혀 보기 (D-016), 'fit' 모습 조절 (P-33),
  // 'edit' 배경 고치기 (P-34)
  const [view, setView] = useState('image')
  // [모습 조절]로 바꾼 틀과 피팅값. 조절하지 않았으면 null이고, 등록할 때 보내지 않습니다. 구분을 바꾸면 버립니다.
  const [custom, setCustom] = useState(null)
  const [pickFailed, setPickFailed] = useState(false)
  const [pick, setPick] = useState(EMPTY_PICK)
  const [alert, setAlert] = useState(null)
  const [confirmClose, setConfirmClose] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [registerError, setRegisterError] = useState(null)
  const [genderFailed, setGenderFailed] = useState(false)
  const [added, setAdded] = useState({}) // 이 창에서 더한 단어 (키워드 종류 → 단어 목록)
  const keywords = Object.fromEntries(
    KEYWORD_ROWS.map((row) => [row.kind, [...loadedKeywords[row.kind], ...(added[row.kind] ?? [])]]),
  )

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
    setView('image')
    setCustom(null)
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
    setCustom(null)
  }

  function handleAdded(kind, word, failed) {
    // 한 번 보인 성별 실패 알림은 다른 단어를 더해도 남겨 둡니다.
    if (failed) setGenderFailed(true)
    setAdded((prev) => ({ ...prev, [kind]: [...(prev[kind] ?? []), word] }))
    setPick((prev) => ({ ...prev, [kind]: [...prev[kind], word.id] }))
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
      ...(custom ?? {}),
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

  // 마네킹 미리보기: 고른 구분과 종류로 틀을 정하고 대표 색으로 입힙니다. 원피스는 상의·하의 칸을 함께 차지합니다.
  const typeNames = keywords.type.filter((t) => pick.type.includes(t.id)).map((t) => t.name)
  const previewItem =
    upload && outfitTable && pick.category && typeNames.length > 0
      ? {
          category: pick.category,
          image_url: upload.image_url,
          main_color: upload.main_color,
          pattern_url: upload.pattern_url,
          outfit_template: pickTemplate(outfitTable, pick.category, typeNames),
          fit: null,
          ...(custom ?? {}),
        }
      : null
  const preview = previewItem ? { [pick.category]: previewItem } : null

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
            {upload && view === 'edit' ? (
              <BackgroundEditor
                upload={upload}
                onApplied={(data) => {
                  // 고친 2D 이미지와 다시 만든 대표 색·무늬로 바꿉니다. 원래 사진은 그대로입니다.
                  setUpload({ ...upload, ...data })
                  setView('image')
                }}
                onCancel={() => setView('image')}
              />
            ) : upload ? (
              <>
                {view === 'fit' && previewItem ? (
                  <OutfitFitter
                    mannequin={mannequin}
                    item={previewItem}
                    templates={outfitTable.templates.filter((t) => t.category === pick.category)}
                    onChange={setCustom}
                  />
                ) : (
                <div className="photo-box">
                  {view === 'mannequin' || view === 'fit' ? (
                    preview ? (
                      <Mannequin className="photo-box__mannequin" {...mannequin} outfit={preview} title="옷을 입힌 미리보기" />
                    ) : (
                      <p className="sub-text">구분과 종류를 고르면 보여요.</p>
                    )
                  ) : (
                    <img
                      src={view === 'original' ? upload.photo_url : upload.image_url}
                      alt={view === 'original' ? '원래 사진' : '2D 이미지'}
                    />
                  )}
                </div>
                )}
                {view === 'mannequin' && (
                  <p className="sub-text">작은 글자나 로고는 정확하지 않을 수 있어요.</p>
                )}
                {(view === 'mannequin' || view === 'fit') && previewItem && (
                  <Button onClick={() => setView(view === 'fit' ? 'mannequin' : 'fit')}>
                    {view === 'fit' ? '조절 닫기' : '모습 조절'}
                  </Button>
                )}
                <Button onClick={() => setView(view === 'original' ? 'image' : 'original')}>
                  {view === 'original' ? '2D 이미지 보기' : '원래 사진 보기'}
                </Button>
                <Button onClick={() => setView(view === 'mannequin' || view === 'fit' ? 'image' : 'mannequin')}>
                  {view === 'mannequin' || view === 'fit' ? '2D 이미지 보기' : '마네킹에 입혀 보기'}
                </Button>
                <Button onClick={() => setView('edit')}>배경 고치기</Button>
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
              {genderFailed && <p className="sub-text">{GENDER_FAILED}</p>}
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
                    >
                      <WordAdder
                        key={row.kind === 'type' ? pick.category : row.kind}
                        kind={row.kind}
                        category={row.kind === 'type' ? pick.category : undefined}
                        onAdded={(word, failed) => handleAdded(row.kind, word, failed)}
                      />
                    </KeywordChips>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {upload && (
          <div className="dialog__actions">
            {/* 등록 실패: 한 줄과 [다시 시도] (SCREEN-SPEC §2.7, T-59) */}
            {registerError && (
              <ErrorLine message={registerError} onRetry={registering ? undefined : handleRegister} />
            )}
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
