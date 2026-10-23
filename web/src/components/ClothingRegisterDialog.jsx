import { useRef, useState } from 'react'
import { api } from '../api.js'
import { loadImage, patternFromImage, toSvg } from '../vectorize.js'
import registerBg from '../assets/closet/register-bg.png'
import { CATEGORIES, KEYWORD_ROWS, sortTypesByGender } from '../labels.js'
import AlertDialog from './AlertDialog.jsx'
import BackgroundEditor from './BackgroundEditor.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'
import ErrorLine from './ErrorLine.jsx'
import KeywordChips from './KeywordChips.jsx'
import Mannequin from './Mannequin.jsx'
import OutfitFitter from './OutfitFitter.jsx'
import PatternPanel from './PatternPanel.jsx'
import WordAdder, { GENDER_FAILED } from './WordAdder.jsx'

// 옷 등록 (SCREEN-SPEC §6.2). 시안 style/html 07_4를 그대로 옮긴 넓은 등록 화면입니다. 옷장 목록 자리에 뜹니다. (P-38)
// (2026-10-23 바꿈) 왼쪽에 01 사진 업로드와 02 옷 정보 입력(키워드 버튼 줄), 오른쪽에 탭 세 개
// [배경 고치기] [2D 이미지] [캐릭터에 맞추기]. 사람이 준 시안 그림 3장을 따르고, 앱에 없는 기능(가이드 보기,
// 어깨·소매 맞추기, 무늬 가로·세로 크기 따로)은 넣지 않습니다 (사람이 정함).
// 시안의 옷 이름·브랜드·태그·설명 칸과 왼쪽 메뉴의 관리 항목은 앱에 기능이 없어 넣지 않았습니다 (사람이 정함, 2026-10-22).
// [+ 더하기]로 더한 단어는 이 창의 목록에 바로 붙고 켜진 채로 보입니다. 구분 줄에는 [+ 더하기]가 없습니다.
const EMPTY_PICK = { category: null, color: [], type: [], material: [], season: [], pattern: [] }
// 무늬 표현과 벡터 색상 수의 처음 값 (moire-closet과 같음, P-39)
const DEFAULT_PATTERN = { mode: 'auto', colors: 7, solid: false }
// 오른쪽 탭: 키, 이름, 설명(시안 문장), 아이콘 path
const TABS = [
  ['edit', '배경 고치기', '옷 사진의 배경을 제거하고 깔끔하게 다듬어주세요.', 'M4 20 14 10M13 4v3M18 9h-3M16 6l-2 2M18 14v3M16.5 15.5h3M7 4v3M5.5 5.5h3'],
  ['pattern', '2D 이미지', '옷 이미지를 2D 일러스트 스타일로 변환하고 무늬를 정리해보세요.', 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM4 16l5-5 4 4 2-2 5 5M15 9.5a1.5 1.5 0 1 0 0-.01'],
  ['fit', '캐릭터에 맞추기', '미리보기를 드래그해 위치를 옮기거나 슬라이더로 조절하세요.', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21v-1c0-4 3.5-6 8-6s8 2 8 6v1'],
]

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
  // 오른쪽 탭: 'edit' 배경 고치기 (P-34, 사진을 올리면 처음), 'pattern' 2D 이미지와 무늬 (P-39),
  // 'fit' 캐릭터에 맞추기 (D-016, P-33). 한 번 연 탭은 숨기기만 해서, 탭을 바꿔도 적용하기 전의 편집이 남습니다.
  const [view, setView] = useState('edit')
  const [opened, setOpened] = useState({ edit: true })
  // [취소]를 누르면 탭 내용을 처음(지금 적용된 상태)부터 다시 그립니다.
  const [editKey, setEditKey] = useState(0)
  const [patternKey, setPatternKey] = useState(0)
  // 적용된 무늬 표현, 벡터 색상 수, 대표 색상만 (P-39). 등록할 때 함께 보냅니다.
  const [patternSettings, setPatternSettings] = useState(DEFAULT_PATTERN)
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

  // 2D 이미지로 무늬를 만들어 임시 무늬로 저장하고, 저장된 주소를 돌려줍니다. 만들지 못하면 null (대표 색만 칠함)
  async function makePattern(data, settings) {
    if (settings.solid) {
      await api.savePattern(data.upload_id, null)
      return null
    }
    try {
      const result = patternFromImage(await loadImage(data.image_url), settings.mode, settings.colors)
      if (!result) return null
      const res = await api.savePattern(data.upload_id, toSvg(result))
      return res.result === 'ok' ? res.data.pattern_url : null
    } catch {
      return null
    }
  }

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
    setView('edit')
    setOpened({ edit: true })
    setCustom(null)
    setPatternSettings(DEFAULT_PATTERN)
    makePattern(data, DEFAULT_PATTERN).then((url) =>
      setUpload((prev) => (prev?.upload_id === data.upload_id ? { ...prev, pattern_url: url } : prev)),
    )
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
      pattern_mode: patternSettings.solid ? 'solid' : patternSettings.mode,
      pattern_colors: patternSettings.colors,
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

  function openTab(key) {
    setView(key)
    setOpened((prev) => ({ ...prev, [key]: true }))
  }

  const types = sortTypesByGender(
    keywords.type.filter((t) => t.category === pick.category),
    gender,
  )

  return (
    <div className="reg" style={{ '--src': `url(${registerBg})` }}>
      {/* 왼쪽 메뉴: 시안의 메뉴 중 앱에 있는 두 가지만 둡니다. */}
      <nav className="reg__side" aria-label="옷장 메뉴">
        <button type="button" className="reg__side-item" onClick={requestClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21v-1c0-4 3.5-6 8-6s8 2 8 6v1z" />
          </svg>
          내 옷장
        </button>
        <button type="button" className="reg__side-item reg__side-item--on" aria-current="page">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v8M8 12h8" />
          </svg>
          옷 추가하기
        </button>
      </nav>

      <section className="reg__main" role="dialog" aria-modal="true" aria-labelledby="register-title">
        <button type="button" className="reg__back" aria-label="옷장으로 돌아가기" onClick={requestClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 12H4M10 6l-6 6 6 6" />
          </svg>
        </button>
        <h2 id="register-title" className="reg__title">
          옷 등록하기
        </h2>
        <p className="reg__subtitle">새로운 옷을 등록하고 나만의 옷장을 만들어보세요.</p>

        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleFileChange} />

        {/* 01 · 사진 업로드 */}
        <div className="reg__sec" style={{ left: 17, top: 91, width: 612, height: 290 }} />
        <span className="reg__sec-t" style={{ left: 35, top: 108 }}>
          01 · 사진 업로드 <span className="reg__req">*</span>
        </span>
        <button
          type="button"
          className={`reg__drop${upload ? ' reg__drop--filled' : ''}`}
          disabled={uploading}
          onClick={() => fileInput.current.click()}
          aria-label={upload ? '사진 다시 올리기' : '사진 올리기'}
        >
          {upload ? (
            <img src={upload.photo_url} alt="올린 사진" />
          ) : (
            <>
              <svg viewBox="0 0 30 26" aria-hidden="true">
                <path d="M3 7h6l2-4h8l2 4h6v16H3z" />
                <circle cx="15" cy="14" r="5" />
              </svg>
              <b>{uploading ? '사진을 정리하는 중…' : '사진 업로드하기'}</b>
              <span>
                클릭해서 옷 사진을
                <br />
                한 장 올려 주세요.
              </span>
            </>
          )}
        </button>
        {upload && (
          <button
            type="button"
            className="reg__wbtn"
            style={{ left: 63, top: 316, width: 186, height: 41 }}
            disabled={uploading}
            onClick={() => fileInput.current.click()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 8h4l2-3h6l2 3h4v12H3z" />
              <circle cx="12" cy="13.5" r="3.5" />
            </svg>
            {uploading ? '사진을 정리하는 중…' : '사진 다시 올리기'}
          </button>
        )}
        <div className="reg__example">
          <span>업로드 예시</span>
          <div className="reg__crop" aria-hidden="true" />
        </div>
        {uploadError && (
          <div className="reg__error" style={{ left: 35, top: 386, width: 600 }}>
            <ErrorLine
              message={uploadError.message}
              onRetry={uploadError.retry && lastFile ? () => sendPhoto(lastFile) : undefined}
            />
          </div>
        )}

        {/* 02 · 옷 정보 입력: 시안의 칸 대신 키워드 버튼 줄 (사람이 정함, 2026-10-22) */}
        <div className="reg__sec" style={{ left: 17, top: 391, width: 612, height: 405 }} />
        <span className="reg__sec-t" style={{ left: 35, top: 408 }}>
          02 · 옷 정보 입력
        </span>
        <div className="reg__keywords">
          {!upload ? (
            <p className="sub-text">사진을 올리면 키워드를 고를 수 있어요.</p>
          ) : (
            <>
              {pickFailed && <p className="sub-text">키워드를 미리 고르지 못했어요. 직접 골라 주세요.</p>}
              {genderFailed && <p className="sub-text">{GENDER_FAILED}</p>}
              <div className="keyword-row">
                <span className="keyword-row__label">
                  구분<span className="required">*</span>
                </span>
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
            </>
          )}
        </div>

        {/* 등록 실패: 한 줄과 [다시 시도] (SCREEN-SPEC §2.7, T-59) */}
        {registerError && (
          <div className="reg__error" style={{ left: 17, top: 805, width: 240 }}>
            <ErrorLine message={registerError} onRetry={registering ? undefined : handleRegister} />
          </div>
        )}
        <button type="button" className="reg__cbtn reg__cbtn--cancel" onClick={requestClose}>
          취소
        </button>
        <button
          type="button"
          className="reg__cbtn reg__cbtn--save"
          disabled={!upload || registering}
          onClick={handleRegister}
        >
          {registering ? '등록하는 중…' : '옷장에 저장하기'}
        </button>

        {/* 오른쪽 탭 세 개 (2026-10-23, 시안). 사진을 올리기 전에는 눌리지 않습니다. */}
        <div className="reg__tabs" role="tablist" aria-label="사진 다듬기">
          {TABS.map(([key, label, , icon]) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`reg-tab-${key}`}
              aria-selected={Boolean(upload) && view === key}
              aria-controls={`reg-panel-${key}`}
              disabled={!upload}
              className={`reg__tab${upload && view === key ? ' reg__tab--on' : ''}`}
              onClick={() => openTab(key)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={icon} />
              </svg>
              {label}
            </button>
          ))}
        </div>
        <div className="reg__sec" style={{ left: 638, top: 81, width: 473, height: 715 }} />
        <div className="reg__panel">
          {!upload ? (
            <div className="reg__panel-empty">
              <Mannequin className="reg__preview-mannequin" {...mannequin} title="미리보기 마네킹" />
              <p className="sub-text">사진을 올리면 배경을 고치고, 2D 이미지와 캐릭터에 입힌 모습을 볼 수 있어요.</p>
            </div>
          ) : (
            TABS.map(([key, label, description]) => (
              <section
                key={key}
                id={`reg-panel-${key}`}
                role="tabpanel"
                aria-labelledby={`reg-tab-${key}`}
                hidden={view !== key}
              >
                <h3 className="reg__panel-t">{key === 'pattern' ? '2D 이미지 변환' : label}</h3>
                <p className="reg__panel-d">{description}</p>
                {opened[key] && key === 'edit' && (
                  <BackgroundEditor
                    key={`${upload.image_url}-${editKey}`}
                    upload={upload}
                    onApplied={(data) => {
                      // 고친 2D 이미지와 다시 만든 대표 색으로 바꾸고, 지금 무늬 설정으로 무늬를 다시 만듭니다. 원래 사진은 그대로입니다.
                      const next = { ...upload, ...data }
                      setUpload(next)
                      makePattern(next, patternSettings).then((url) =>
                        setUpload((prev) => (prev?.upload_id === next.upload_id ? { ...prev, pattern_url: url } : prev)),
                      )
                    }}
                    onCancel={() => setEditKey((k) => k + 1)}
                  />
                )}
                {opened[key] && key === 'pattern' && (
                  <PatternPanel
                    key={`${upload.upload_id}-${patternKey}`}
                    layout="panel"
                    imageUrl={upload.image_url}
                    mainColor={upload.main_color}
                    settings={patternSettings}
                    save={(svg) => api.savePattern(upload.upload_id, svg)}
                    item={previewItem}
                    mannequin={mannequin}
                    onApplied={({ pattern_url }, settings) => {
                      setUpload({ ...upload, pattern_url })
                      setPatternSettings(settings)
                    }}
                    onCancel={() => setPatternKey((k) => k + 1)}
                  />
                )}
                {opened[key] && key === 'fit' &&
                  (previewItem ? (
                    <OutfitFitter
                      layout="panel"
                      mannequin={mannequin}
                      item={previewItem}
                      templates={outfitTable.templates.filter((t) => t.category === pick.category)}
                      onChange={setCustom}
                    />
                  ) : (
                    <div className="reg__panel-empty">
                      <Mannequin className="reg__preview-mannequin" {...mannequin} title="미리보기 마네킹" />
                      <p className="sub-text">구분과 종류를 고르면 옷을 입혀 보여 줘요.</p>
                    </div>
                  ))}
              </section>
            ))
          )}
        </div>
      </section>

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
