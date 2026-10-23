import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { CATEGORY_LABEL, KEYWORD_ROWS } from '../labels.js'
import ConfirmDialog from './ConfirmDialog.jsx'
import ErrorLine from './ErrorLine.jsx'
import KeywordChips from './KeywordChips.jsx'
import Mannequin, { GarmentIllustration } from './Mannequin.jsx'
import OutfitFitter from './OutfitFitter.jsx'
import PatternPanel from './PatternPanel.jsx'

// 옷 상세 (SCREEN-SPEC §6.3). 시안 style/html의 "포근한 옷장 앱 상세 화면" 모달을 그대로 옮겼습니다. (P-38)
// 기능은 그대로입니다: 2D·원래 사진·마네킹 보기, 모습 조절·저장, 선택 키워드 고치기, 지우기.

// 앱 기본 색 단어의 점 색 (DATA-MODEL §9). 사용자가 더한 색은 글자로 보입니다.
const COLOR_HEX = {
  검정: '#222222',
  흰색: '#ffffff',
  회색: '#9a9a9a',
  네이비: '#1e3e53',
  파랑: '#2f6fd0',
  하늘색: '#9cc9ef',
  빨강: '#d83b3b',
  분홍: '#f4a7b9',
  주황: '#f08a3c',
  노랑: '#f5d04a',
  초록: '#3f9a5a',
  카키: '#7a7a4a',
  베이지: '#e3d2b4',
  갈색: '#7e5236',
  보라: '#8a5cc2',
  아이보리: '#fbf3e1',
}
const OPTIONAL_ROWS = KEYWORD_ROWS.filter((row) => !row.required)

function LockIcon() {
  return (
    <svg className="lock-icon" viewBox="0 0 16 16" role="img" aria-label="고칠 수 없음">
      <rect x="3" y="7" width="10" height="8" rx="2" fill="currentColor" />
      <path d="M5 7 V5 a3 3 0 0 1 6 0 V7" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function ClothingDetailDialog({ clothingId, keywords, mannequin, outfitTable, onClose, onDeleted, onSaved }) {
  const [detail, setDetail] = useState(null)
  const [loadError, setLoadError] = useState(null)
  // 왼쪽에 보이는 것: 'image' 2D 이미지, 'original' 원래 사진, 'mannequin' 마네킹에 입혀 보기, 'fit' 모습 조절 (P-33),
  // 'pattern' 무늬 바꾸기 (P-44): 왼쪽 마네킹에 바꾸는 중인 무늬를 입히고 오른쪽에 무늬 칸
  const [view, setView] = useState('image')
  const [patternPreview, setPatternPreview] = useState(null) // 무늬 칸에서 바꾸는 중인 무늬 주소
  const showPreview = useCallback((url) => setPatternPreview(url), [])
  const [look, setLook] = useState(null) // 조절 중인 { outfit_template, fit }. 저장하면 detail에 반영
  const [optional, setOptional] = useState({ material: [], season: [], pattern: [] })
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editing, setEditing] = useState(false) // 시안의 [키워드 수정하기]

  function applyDetail(res) {
    if (res.result !== 'ok') {
      setLoadError(res.error.message)
      return
    }
    setDetail(res.data)
    setLook({ outfit_template: res.data.outfit_template, fit: res.data.fit })
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
      setEditing(false)
      onSaved()
    } else {
      setActionError(res.error.message)
    }
  }

  // 키워드 수정을 취소하면 저장된 선택 키워드로 되돌립니다.
  function cancelEditing() {
    const kw = detail.keywords
    setOptional({
      material: kw.material.map((k) => k.id),
      season: kw.season.map((k) => k.id),
      pattern: kw.pattern.map((k) => k.id),
    })
    setActionError(null)
    setEditing(false)
  }

  // 마네킹 모습 저장 (API-SPEC §4, P-33)
  async function handleSaveLook() {
    setBusy(true)
    setActionError(null)
    const res = await api.saveFit(clothingId, look)
    setBusy(false)
    if (res.result === 'ok') {
      setDetail({ ...detail, ...res.data })
      setLook({ outfit_template: res.data.outfit_template, fit: res.data.fit })
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

  const color = detail?.keywords.color ?? []
  const types = detail?.keywords.type ?? []
  const allTags = detail ? KEYWORD_ROWS.flatMap((row) => detail.keywords[row.kind].map((k) => k.name)) : []
  const title = detail
    ? [color[0]?.name, types[0]?.name].filter(Boolean).join(' ') || CATEGORY_LABEL[detail.category]
    : '옷 상세'
  const mannequinView = view === 'mannequin' || view === 'fit' || view === 'pattern'
  // 무늬 칸의 처음 값: 저장된 무늬 표현과 색 수. P-44 전에 등록한 옷은 자동 감지·7색
  const patternSettings = {
    mode: detail?.pattern_mode && detail.pattern_mode !== 'solid' ? detail.pattern_mode : 'auto',
    colors: detail?.pattern_colors ?? 7,
    solid: detail?.pattern_mode === 'solid',
  }

  return (
    <div className="detail-backdrop">
      <div className="detail" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <div className="detail__pic">
          {detail && view === 'fit' && outfitTable ? (
            <OutfitFitter
              mannequin={mannequin}
              item={{ ...detail, ...look }}
              templates={outfitTable.templates.filter((t) => t.category === detail.category)}
              onChange={setLook}
            />
          ) : detail && view === 'pattern' ? (
            <Mannequin
              className="detail__mannequin"
              {...mannequin}
              outfit={{ [detail.category]: { ...detail, ...look, pattern_url: patternPreview } }}
              title="무늬를 바꾸는 중인 미리보기"
            />
          ) : detail && view === 'mannequin' ? (
            <Mannequin
              className="detail__mannequin"
              {...mannequin}
              outfit={{ [detail.category]: { ...detail, ...look } }}
              title="옷을 입힌 미리보기"
            />
          ) : detail && view === 'original' ? (
            <img src={detail.photo_url} alt="원래 사진" />
          ) : (
            // [2D 일러스트]: 옷만 그린 캐릭터 의상 (사람이 정함, 2026-10-23)
            detail && (
              <GarmentIllustration
                className="detail__illust"
                item={{ ...detail, ...look }}
                mannequin={mannequin}
                title="옷만 그린 2D 일러스트"
              />
            )
          )}
          {detail && mannequinView && view !== 'pattern' && (
            <div className="detail__look">
              <button
                type="button"
                className="detail__look-btn"
                onClick={() => setView(view === 'fit' ? 'mannequin' : 'fit')}
              >
                {view === 'fit' ? '조절 닫기' : '모습 조절'}
              </button>
              <button type="button" className="detail__look-btn" onClick={() => setView('pattern')}>
                무늬 바꾸기
              </button>
              <button
                type="button"
                className="detail__look-btn detail__look-btn--save"
                disabled={busy}
                onClick={handleSaveLook}
              >
                모습 저장
              </button>
            </div>
          )}
        </div>

        {/* 시안의 [2D 일러스트 | 원본 사진] 토글. 앱에 있는 "마네킹에 입혀 보기"를 세 번째로 더했습니다. */}
        <div className="detail__toggle" role="radiogroup" aria-label="보기">
          {[
            ['image', '2D 일러스트'],
            ['original', '원본 사진'],
            ['mannequin', '마네킹'],
          ].map(([key, label]) => {
            const on = key === 'mannequin' ? mannequinView : view === key
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={on}
                className={`detail__toggle-opt${on ? ' detail__toggle-opt--on' : ''}`}
                onClick={() => setView(key)}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* 무늬 바꾸기 (P-44): 오른쪽 정보 칸을 덮는 무늬 칸. 등록 창과 같은 조절 */}
        {detail && view === 'pattern' && (
          <div className="detail__pattern">
            <h2 className="detail__pattern-t">무늬 바꾸기</h2>
            <PatternPanel
              imageUrl={detail.image_url}
              mainColor={detail.main_color}
              settings={patternSettings}
              save={(svg, s) =>
                api.saveClothingPattern(clothingId, {
                  svg: s.solid ? null : svg,
                  pattern_mode: s.solid ? 'solid' : s.mode,
                  pattern_colors: s.colors,
                })
              }
              item={{ ...detail, ...look }}
              mannequin={mannequin}
              onPreview={showPreview}
              onApplied={(data) => {
                setDetail({ ...detail, ...data })
                setView('mannequin')
                onSaved()
              }}
              onCancel={() => setView('mannequin')}
            />
          </div>
        )}

        <button type="button" className="detail__close" aria-label="닫기" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 5l14 14M19 5L5 19" />
          </svg>
        </button>

        <h2 id="detail-title" className="detail__title">
          {title}
        </h2>
        {loadError && (
          <div className="detail__error">
            <ErrorLine message={loadError} />
          </div>
        )}

        {detail && !editing && (
          <>
            <button
              type="button"
              className="detail__edit-icon"
              aria-label="키워드 수정하기"
              onClick={() => setEditing(true)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M11 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6" />
                <path d="M18 2.5l3.5 3.5L12 15.5H8.5V12z" />
              </svg>
            </button>
            <div className="detail__tags">
              {allTags.map((name) => (
                <span key={name}>#{name}</span>
              ))}
              <button type="button" className="detail__tag-add" onClick={() => setEditing(true)}>
                <b aria-hidden="true">＋</b>키워드 추가하기
              </button>
            </div>
            <div className="detail__hr" />
            <div className="detail__info" style={{ top: '292px' }}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 3c0 2 1.3 3 3 3s3-1 3-3l6 3-2 5h-3v10H8V11H5L3 6z" />
              </svg>
              카테고리
              <span className="detail__info-v">{CATEGORY_LABEL[detail.category]}</span>
            </div>
            <div className="detail__info" style={{ top: '355px' }}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.5-4-8-9-8z" />
                <circle cx="7.5" cy="11" r="1.2" />
                <circle cx="10" cy="7" r="1.2" />
                <circle cx="15" cy="7" r="1.2" />
              </svg>
              색상
              <span className="detail__info-v">
                {color.map((k) =>
                  COLOR_HEX[k.name] ? (
                    <i key={k.id} className="detail__dot" style={{ background: COLOR_HEX[k.name] }} title={k.name} />
                  ) : (
                    <span key={k.id}>{k.name}</span>
                  ),
                )}
              </span>
            </div>
            {/* 시안의 "등록일"은 서버가 보내지 않아, 같은 자리에 종류를 보입니다. */}
            <div className="detail__info" style={{ top: '418px' }}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M3 10h18M8 3v4M16 3v4" />
              </svg>
              종류
              <span className="detail__info-v">{types.map((k) => k.name).join(', ')}</span>
            </div>
          </>
        )}

        {/* 키워드 수정: 선택 키워드(소재, 계절·두께, 무늬)만 고칠 수 있습니다. (SCREEN-SPEC §6.3) */}
        {detail && editing && (
          <div className="detail__editor">
            <p className="sub-text">
              <LockIcon /> 구분·색·종류는 고칠 수 없어요. 바꾸려면 지우고 다시 등록해 주세요.
            </p>
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
        )}

        {actionError && (
          <div className="detail__error">
            <ErrorLine message={actionError} />
          </div>
        )}

        {detail && !editing && (
          <>
            <button
              type="button"
              className="detail__btn detail__btn--k"
              disabled={busy}
              onClick={() => setEditing(true)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 20l1-5L16 4l4 4L9 19z M14 6l4 4" />
              </svg>
              키워드 수정하기
            </button>
            <button
              type="button"
              className="detail__btn detail__btn--d"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 6h16M9 6V4h6v2M6 6l1 15h10l1-15M10 10v8M14 10v8" />
              </svg>
              삭제하기
            </button>
          </>
        )}
        {detail && editing && (
          <>
            <button type="button" className="detail__btn detail__btn--k" disabled={busy} onClick={cancelEditing}>
              취소
            </button>
            <button type="button" className="detail__btn detail__btn--save" disabled={busy} onClick={handleSave}>
              저장
            </button>
          </>
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
