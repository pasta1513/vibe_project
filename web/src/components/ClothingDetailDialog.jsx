import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { CATEGORY_LABEL, KEYWORD_ROWS } from '../labels.js'
import Button from './Button.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import ErrorLine from './ErrorLine.jsx'
import KeywordChips from './KeywordChips.jsx'

// 옷 상세 (SCREEN-SPEC §6.3)
const OPTIONAL_ROWS = KEYWORD_ROWS.filter((row) => !row.required)
const REQUIRED_ROWS = KEYWORD_ROWS.filter((row) => row.required)

function LockIcon() {
  return (
    <svg className="lock-icon" viewBox="0 0 16 16" role="img" aria-label="고칠 수 없음">
      <rect x="3" y="7" width="10" height="8" rx="2" fill="currentColor" />
      <path d="M5 7 V5 a3 3 0 0 1 6 0 V7" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function ClothingDetailDialog({ clothingId, keywords, onClose, onDeleted, onSaved }) {
  const [detail, setDetail] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [showOriginal, setShowOriginal] = useState(false)
  const [optional, setOptional] = useState({ material: [], season: [], pattern: [] })
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function applyDetail(res) {
    if (res.result !== 'ok') {
      setLoadError(res.error.message)
      return
    }
    setDetail(res.data)
    const kw = res.data.keywords
    setOptional({
      material: kw.material.map((k) => k.id),
      season: kw.season.map((k) => k.id),
      pattern: kw.pattern.map((k) => k.id),
    })
  }

  useEffect(() => {
    api.getClothing(clothingId).then(applyDetail)
  }, [clothingId])

  function toggle(kind, id) {
    const list = optional[kind]
    setOptional({ ...optional, [kind]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] })
  }

  async function handleSave() {
    setBusy(true)
    setActionError(null)
    const res = await api.saveOptionalKeywords(clothingId, optional)
    setBusy(false)
    if (res.result === 'ok') {
      setDetail({ ...detail, keywords: res.data })
      onSaved()
    } else {
      setActionError(res.error.message)
    }
  }

  async function handleDelete() {
    setConfirmDelete(false)
    setBusy(true)
    setActionError(null)
    const res = await api.deleteClothing(clothingId)
    setBusy(false)
    if (res.result === 'ok') onDeleted()
    else setActionError(res.error.message)
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog register" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <div className="dialog__header">
          <h2 id="detail-title" className="dialog__title">
            {detail ? CATEGORY_LABEL[detail.category] : '옷 상세'}
          </h2>
          <button type="button" className="dialog__close" aria-label="닫기" onClick={onClose}>
            ✕
          </button>
        </div>

        {loadError && <ErrorLine message={loadError} />}
        {detail && (
          <div className="register__body">
            <div className="register__photo">
              <div className="photo-box">
                <img
                  src={showOriginal ? detail.photo_url : detail.image_url}
                  alt={showOriginal ? '원래 사진' : '2D 이미지'}
                />
              </div>
              <Button onClick={() => setShowOriginal(!showOriginal)}>
                {showOriginal ? '2D 이미지 보기' : '원래 사진 보기'}
              </Button>
            </div>

            <div className="register__keywords">
              <div className="keyword-row">
                <span className="keyword-row__label">구분</span>
                <span className="locked-words">
                  <LockIcon />
                  {CATEGORY_LABEL[detail.category]}
                </span>
              </div>
              {REQUIRED_ROWS.map((row) => (
                <div key={row.kind} className="keyword-row">
                  <span className="keyword-row__label">{row.label}</span>
                  <span className="locked-words">
                    <LockIcon />
                    {detail.keywords[row.kind].map((k) => k.name).join(', ')}
                  </span>
                </div>
              ))}
              <p className="sub-text">필수 키워드를 바꾸려면 지우고 다시 등록해 주세요.</p>
              {OPTIONAL_ROWS.map((row) => (
                <div key={row.kind} className="keyword-row">
                  <span className="keyword-row__label">{row.label}</span>
                  <KeywordChips
                    label={row.label}
                    options={keywords[row.kind]}
                    selected={optional[row.kind]}
                    onToggle={(id) => toggle(row.kind, id)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {detail && (
          <div className="dialog__actions">
            {actionError && <ErrorLine message={actionError} />}
            <Button disabled={busy} onClick={() => setConfirmDelete(true)}>
              지우기
            </Button>
            <Button variant="primary" disabled={busy} onClick={handleSave}>
              저장
            </Button>
          </div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          message="정말 지울까요?"
          confirmLabel="지우기"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}

export default ClothingDetailDialog
